package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/shirou/gopsutil/v3/disk"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// CleanupRule represents a single docker cleanup rule.
type CleanupRule struct {
	ID           int64    `json:"id"`
	Name         string   `json:"name"`
	CleanupTypes []string `json:"cleanup_types"`
	Mode         string   `json:"mode"`
	Schedule     string   `json:"schedule,omitempty"`
	ThresholdPct *int     `json:"threshold_pct,omitempty"`
	Enabled      bool     `json:"enabled"`
	KeepLastLog  int      `json:"keep_last_log"`
	CreatedBy    *int64   `json:"created_by,omitempty"`
	CreatedAt    string   `json:"created_at"`
	UpdatedAt    string   `json:"updated_at"`
	// Denormalised from last log
	LastRunAt          *string `json:"last_run_at,omitempty"`
	LastRunStatus      *string `json:"last_run_status,omitempty"`
	LastSpaceReclaimed *int64  `json:"last_space_reclaimed,omitempty"`
}

// CleanupLog represents a single cleanup execution record.
type CleanupLog struct {
	ID             int64            `json:"id"`
	RuleID         *int64           `json:"rule_id,omitempty"`
	TriggeredBy    string           `json:"triggered_by"`
	StartedAt      string           `json:"started_at"`
	FinishedAt     *string          `json:"finished_at,omitempty"`
	SpaceReclaimed int64            `json:"space_reclaimed"`
	ItemsRemoved   map[string]int   `json:"items_removed"`
	Errors         []string         `json:"errors"`
	Status         string           `json:"status"`
}

// CleanupResult is returned by RunCleanup.
type CleanupResult struct {
	RuleID         int64          `json:"rule_id"`
	TriggeredBy    string         `json:"triggered_by"`
	StartedAt      string         `json:"started_at"`
	FinishedAt     string         `json:"finished_at"`
	Status         string         `json:"status"`
	SpaceReclaimed int64          `json:"space_reclaimed"`
	ItemsRemoved   map[string]int `json:"items_removed"`
	Errors         []string       `json:"errors"`
}

// DryRunResult lists what would be deleted without actually deleting anything.
type DryRunResult struct {
	StoppedContainers []ContainerSummaryForCleanup `json:"stopped_containers,omitempty"`
	DanglingImages    []ImageSummaryForCleanup     `json:"dangling_images,omitempty"`
	UnusedVolumes     []string                     `json:"unused_volumes,omitempty"`
	TotalReclaimable  int64                        `json:"total_reclaimable_bytes"`
}

// CleanupStats holds disk + docker resource overview for the stats endpoint.
type CleanupStats struct {
	DiskTotal      uint64 `json:"disk_total"`
	DiskUsed       uint64 `json:"disk_used"`
	DiskFree       uint64 `json:"disk_free"`
	DiskPercent    float64 `json:"disk_percent"`
	ImagesSize     int64  `json:"images_size"`
	ContainersSize int64  `json:"containers_size"`
	VolumesSize    int64  `json:"volumes_size"`
	BuildCacheSize int64  `json:"build_cache_size"`
	ImagesCount    int    `json:"images_count"`
	ContainersCount int   `json:"containers_count"`
	VolumesCount   int    `json:"volumes_count"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// DockerCleanupService manages docker auto-cleanup rules and execution.
type DockerCleanupService struct {
	db            *sql.DB
	dockerService *DockerService
	notifier      *NotificationService

	mu          sync.Mutex
	inFlight    map[int64]bool // rule_id → currently running
	schedulerMu sync.Once
	cancel      context.CancelFunc
}

// NewDockerCleanupService creates a new DockerCleanupService.
func NewDockerCleanupService(db *sql.DB, dockerService *DockerService) *DockerCleanupService {
	return &DockerCleanupService{
		db:            db,
		dockerService: dockerService,
		inFlight:      make(map[int64]bool),
	}
}

// SetNotifier wires up the notification service.
func (s *DockerCleanupService) SetNotifier(n *NotificationService) { s.notifier = n }

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

// ListRules returns all cleanup rules, enriched with the most recent log entry.
func (s *DockerCleanupService) ListRules() ([]CleanupRule, error) {
	rows, err := s.db.Query(`
		SELECT r.id, r.name, r.cleanup_types, r.mode, r.schedule,
		       r.threshold_pct, r.enabled, r.keep_last_log, r.created_by,
		       r.created_at, r.updated_at,
		       l.started_at, l.status, l.space_reclaimed
		FROM docker_cleanup_rules r
		LEFT JOIN docker_cleanup_logs l
		  ON l.id = (
		    SELECT id FROM docker_cleanup_logs
		    WHERE rule_id = r.id
		    ORDER BY started_at DESC LIMIT 1
		  )
		ORDER BY r.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRules(rows)
}

// GetRule returns a single rule by ID.
func (s *DockerCleanupService) GetRule(id int64) (*CleanupRule, error) {
	rows, err := s.db.Query(`
		SELECT r.id, r.name, r.cleanup_types, r.mode, r.schedule,
		       r.threshold_pct, r.enabled, r.keep_last_log, r.created_by,
		       r.created_at, r.updated_at,
		       l.started_at, l.status, l.space_reclaimed
		FROM docker_cleanup_rules r
		LEFT JOIN docker_cleanup_logs l
		  ON l.id = (
		    SELECT id FROM docker_cleanup_logs
		    WHERE rule_id = r.id
		    ORDER BY started_at DESC LIMIT 1
		  )
		WHERE r.id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	rules, err := scanRules(rows)
	if err != nil {
		return nil, err
	}
	if len(rules) == 0 {
		return nil, nil
	}
	return &rules[0], nil
}

// CreateRule inserts a new rule and returns it.
func (s *DockerCleanupService) CreateRule(name string, cleanupTypes []string, mode string,
	schedule string, thresholdPct *int, enabled bool, keepLastLog int, createdBy *int64) (*CleanupRule, error) {

	typesJSON, _ := json.Marshal(cleanupTypes)
	now := time.Now().UTC().Format(time.RFC3339)

	res, err := s.db.Exec(`
		INSERT INTO docker_cleanup_rules
		  (name, cleanup_types, mode, schedule, threshold_pct, enabled, keep_last_log, created_by, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		name, string(typesJSON), mode, nullStr(schedule), thresholdPct,
		boolToInt(enabled), keepLastLog, createdBy, now, now)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.GetRule(id)
}

// UpdateRule modifies an existing rule.
func (s *DockerCleanupService) UpdateRule(id int64, name string, cleanupTypes []string, mode string,
	schedule string, thresholdPct *int, enabled bool, keepLastLog int) (*CleanupRule, error) {

	typesJSON, _ := json.Marshal(cleanupTypes)
	_, err := s.db.Exec(`
		UPDATE docker_cleanup_rules
		SET name=?, cleanup_types=?, mode=?, schedule=?, threshold_pct=?,
		    enabled=?, keep_last_log=?, updated_at=?
		WHERE id=?`,
		name, string(typesJSON), mode, nullStr(schedule), thresholdPct,
		boolToInt(enabled), keepLastLog, time.Now().UTC().Format(time.RFC3339), id)
	if err != nil {
		return nil, err
	}
	return s.GetRule(id)
}

// DeleteRule removes a rule and all its logs.
func (s *DockerCleanupService) DeleteRule(id int64) error {
	_, err := s.db.Exec(`DELETE FROM docker_cleanup_rules WHERE id=?`, id)
	return err
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

// RunCleanup executes a cleanup rule immediately and records the result.
func (s *DockerCleanupService) RunCleanup(ruleID int64, triggeredBy string) (*CleanupResult, error) {
	// prevent concurrent execution of same rule
	s.mu.Lock()
	if s.inFlight[ruleID] {
		s.mu.Unlock()
		return nil, fmt.Errorf("cleanup rule %d is already running", ruleID)
	}
	s.inFlight[ruleID] = true
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.inFlight, ruleID)
		s.mu.Unlock()
	}()

	rule, err := s.GetRule(ruleID)
	if err != nil || rule == nil {
		return nil, fmt.Errorf("rule %d not found", ruleID)
	}

	startedAt := time.Now().UTC()
	startedAtStr := startedAt.Format(time.RFC3339)

	// Insert running log entry
	logRes, err := s.db.Exec(`
		INSERT INTO docker_cleanup_logs (rule_id, triggered_by, started_at, status)
		VALUES (?, ?, ?, 'running')`, ruleID, triggeredBy, startedAtStr)
	if err != nil {
		return nil, fmt.Errorf("insert cleanup log: %w", err)
	}
	logID, _ := logRes.LastInsertId()

	items := make(map[string]int)
	var errs []string
	var totalSpace int64

	for _, ct := range rule.CleanupTypes {
		switch ct {
		case "stopped_containers":
			n, space, e := s.dockerService.PruneContainers()
			if e != nil {
				errs = append(errs, fmt.Sprintf("stopped_containers: %v", e))
			} else {
				items["containers"] += n
				totalSpace += space
			}
		case "dangling_images":
			space, e := s.dockerService.PruneImages()
			if e != nil {
				errs = append(errs, fmt.Sprintf("dangling_images: %v", e))
			} else {
				totalSpace += space
			}
		case "unused_volumes":
			space, e := s.dockerService.PruneVolumes()
			if e != nil {
				errs = append(errs, fmt.Sprintf("unused_volumes: %v", e))
			} else {
				totalSpace += space
			}
		case "unused_networks":
			removed, e := s.dockerService.PruneNetworks()
			if e != nil {
				errs = append(errs, fmt.Sprintf("unused_networks: %v", e))
			} else {
				items["networks"] += len(removed)
			}
		case "build_cache":
			space, e := s.dockerService.PruneBuildCache()
			if e != nil {
				errs = append(errs, fmt.Sprintf("build_cache: %v", e))
			} else {
				totalSpace += space
			}
		}
	}

	status := "success"
	if len(errs) > 0 && len(items) == 0 && totalSpace == 0 {
		status = "failed"
	}

	finishedAt := time.Now().UTC().Format(time.RFC3339)
	itemsJSON, _ := json.Marshal(items)
	errsJSON, _ := json.Marshal(errs)

	// Update log entry
	_, _ = s.db.Exec(`
		UPDATE docker_cleanup_logs
		SET finished_at=?, space_reclaimed=?, items_removed=?, errors=?, status=?
		WHERE id=?`,
		finishedAt, totalSpace, string(itemsJSON), string(errsJSON), status, logID)

	// Prune old logs if keep_last_log is set
	if rule.KeepLastLog > 0 {
		_, _ = s.db.Exec(`
			DELETE FROM docker_cleanup_logs
			WHERE rule_id=? AND id NOT IN (
			  SELECT id FROM docker_cleanup_logs
			  WHERE rule_id=? ORDER BY started_at DESC LIMIT ?
			)`, ruleID, ruleID, rule.KeepLastLog)
	}

	result := &CleanupResult{
		RuleID:         ruleID,
		TriggeredBy:    triggeredBy,
		StartedAt:      startedAtStr,
		FinishedAt:     finishedAt,
		Status:         status,
		SpaceReclaimed: totalSpace,
		ItemsRemoved:   items,
		Errors:         errs,
	}

	if s.notifier != nil {
		s.notifier.Notify(NotificationEvent{
			Type:   "cleanup_completed",
			Title:  fmt.Sprintf("Docker Cleanup: %s", rule.Name),
			Detail: fmt.Sprintf("Status: %s | Space freed: %s | Triggered: %s", status, formatBytes(totalSpace), triggeredBy),
		})
	}

	return result, nil
}

// DryRun inspects what would be removed for the given cleanup types without deleting anything.
func (s *DockerCleanupService) DryRun(types []string) (*DryRunResult, error) {
	result := &DryRunResult{}

	for _, ct := range types {
		switch ct {
		case "stopped_containers":
			items, err := s.dockerService.ListStoppedContainers()
			if err != nil {
				return nil, err
			}
			result.StoppedContainers = items
		case "dangling_images":
			items, err := s.dockerService.ListDanglingImages()
			if err != nil {
				return nil, err
			}
			for _, img := range items {
				result.TotalReclaimable += img.Size
			}
			result.DanglingImages = items
		case "unused_volumes":
			names, err := s.dockerService.ListUnusedVolumeNames()
			if err != nil {
				return nil, err
			}
			result.UnusedVolumes = names
		}
	}
	return result, nil
}

// GetStats returns Docker disk usage + host filesystem stats.
func (s *DockerCleanupService) GetStats() (*CleanupStats, error) {
	du, err := s.dockerService.GetSystemDiskUsage()
	if err != nil {
		return nil, err
	}
	hostDisk, _ := disk.Usage("/")

	stats := &CleanupStats{
		ImagesSize:      du.ImagesSize,
		ContainersSize:  du.ContainersSize,
		VolumesSize:     du.VolumesSize,
		BuildCacheSize:  du.BuildCacheSize,
		ImagesCount:     du.ImagesCount,
		ContainersCount: du.ContainersCount,
		VolumesCount:    du.VolumesCount,
	}
	if hostDisk != nil {
		stats.DiskTotal = hostDisk.Total
		stats.DiskUsed = hostDisk.Used
		stats.DiskFree = hostDisk.Free
		stats.DiskPercent = hostDisk.UsedPercent
	}
	return stats, nil
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

// GetLogs returns cleanup logs optionally filtered by ruleID (0 = all).
func (s *DockerCleanupService) GetLogs(ruleID int64, page, limit int) ([]CleanupLog, int, error) {
	if limit <= 0 {
		limit = 50
	}
	offset := (page - 1) * limit

	var countRow *sql.Row
	var rows *sql.Rows
	var err error

	if ruleID > 0 {
		countRow = s.db.QueryRow(`SELECT COUNT(*) FROM docker_cleanup_logs WHERE rule_id=?`, ruleID)
		rows, err = s.db.Query(`
			SELECT id, rule_id, triggered_by, started_at, finished_at,
			       space_reclaimed, items_removed, errors, status
			FROM docker_cleanup_logs WHERE rule_id=?
			ORDER BY started_at DESC LIMIT ? OFFSET ?`, ruleID, limit, offset)
	} else {
		countRow = s.db.QueryRow(`SELECT COUNT(*) FROM docker_cleanup_logs`)
		rows, err = s.db.Query(`
			SELECT id, rule_id, triggered_by, started_at, finished_at,
			       space_reclaimed, items_removed, errors, status
			FROM docker_cleanup_logs
			ORDER BY started_at DESC LIMIT ? OFFSET ?`, limit, offset)
	}

	var total int
	_ = countRow.Scan(&total)

	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	logs, err := scanLogs(rows)
	return logs, total, err
}

// ClearLogs deletes all logs for a rule.
func (s *DockerCleanupService) ClearLogs(ruleID int64) error {
	_, err := s.db.Exec(`DELETE FROM docker_cleanup_logs WHERE rule_id=?`, ruleID)
	return err
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

// StartScheduler starts the background scheduler goroutine (idempotent).
// Must be called after SetNotifier.
func (s *DockerCleanupService) StartScheduler() {
	s.schedulerMu.Do(func() {
		ctx, cancel := context.WithCancel(context.Background())
		s.cancel = cancel
		go s.schedulerLoop(ctx)
	})
}

// StopScheduler stops the background scheduler.
func (s *DockerCleanupService) StopScheduler() {
	if s.cancel != nil {
		s.cancel()
	}
}

func (s *DockerCleanupService) schedulerLoop(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	thresholdTicker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	defer thresholdTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case t := <-ticker.C:
			s.runScheduledRules(t)
		case <-thresholdTicker.C:
			s.runThresholdRules()
		}
	}
}

func (s *DockerCleanupService) runScheduledRules(now time.Time) {
	rules, err := s.ListRules()
	if err != nil {
		return
	}
	for _, rule := range rules {
		if !rule.Enabled || rule.Mode != "schedule" || rule.Schedule == "" {
			continue
		}
		if matchCron(rule.Schedule, now) {
			go func(r CleanupRule) {
				if _, err := s.RunCleanup(r.ID, "schedule"); err != nil {
					logger.Warn().Err(err).Int64("rule_id", r.ID).Msg("scheduled cleanup failed")
				}
			}(rule)
		}
	}
}

func (s *DockerCleanupService) runThresholdRules() {
	stats, err := s.GetStats()
	if err != nil {
		return
	}
	usagePct := int(stats.DiskPercent)

	rules, err := s.ListRules()
	if err != nil {
		return
	}
	for _, rule := range rules {
		if !rule.Enabled || rule.Mode != "threshold" || rule.ThresholdPct == nil {
			continue
		}
		if usagePct >= *rule.ThresholdPct {
			go func(r CleanupRule) {
				if _, err := s.RunCleanup(r.ID, "threshold"); err != nil {
					logger.Warn().Err(err).Int64("rule_id", r.ID).Msg("threshold cleanup failed")
				}
			}(rule)
		}
	}
}

// ---------------------------------------------------------------------------
// Cron helpers
// ---------------------------------------------------------------------------

// matchCron checks whether a 5-field cron expression matches the given time.
// Supports * and comma-separated values. Does NOT support ranges or step values.
func matchCron(expr string, t time.Time) bool {
	fields := strings.Fields(expr)
	if len(fields) != 5 {
		return false
	}
	return matchField(fields[0], t.Minute()) &&
		matchField(fields[1], t.Hour()) &&
		matchField(fields[2], t.Day()) &&
		matchField(fields[3], int(t.Month())) &&
		matchField(fields[4], int(t.Weekday()))
}

func matchField(field string, val int) bool {
	if field == "*" {
		return true
	}
	for _, part := range strings.Split(field, ",") {
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err == nil && n == val {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// DB scan helpers
// ---------------------------------------------------------------------------

func scanRules(rows *sql.Rows) ([]CleanupRule, error) {
	var rules []CleanupRule
	for rows.Next() {
		var r CleanupRule
		var typesJSON string
		var scheduleNull, createdByNull sql.NullString
		var thresholdNull sql.NullInt64
		var enabledInt int
		var lastRunAt, lastRunStatus sql.NullString
		var lastSpace sql.NullInt64

		err := rows.Scan(
			&r.ID, &r.Name, &typesJSON, &r.Mode, &scheduleNull,
			&thresholdNull, &enabledInt, &r.KeepLastLog, &createdByNull,
			&r.CreatedAt, &r.UpdatedAt,
			&lastRunAt, &lastRunStatus, &lastSpace,
		)
		if err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(typesJSON), &r.CleanupTypes)
		r.Enabled = enabledInt == 1
		if scheduleNull.Valid {
			r.Schedule = scheduleNull.String
		}
		if thresholdNull.Valid {
			v := int(thresholdNull.Int64)
			r.ThresholdPct = &v
		}
		if createdByNull.Valid {
			v, _ := strconv.ParseInt(createdByNull.String, 10, 64)
			r.CreatedBy = &v
		}
		if lastRunAt.Valid {
			r.LastRunAt = &lastRunAt.String
		}
		if lastRunStatus.Valid {
			r.LastRunStatus = &lastRunStatus.String
		}
		if lastSpace.Valid {
			r.LastSpaceReclaimed = &lastSpace.Int64
		}
		rules = append(rules, r)
	}
	return rules, rows.Err()
}

func scanLogs(rows *sql.Rows) ([]CleanupLog, error) {
	var logs []CleanupLog
	for rows.Next() {
		var l CleanupLog
		var ruleIDNull sql.NullInt64
		var finishedNull sql.NullString
		var itemsJSON, errsJSON string

		err := rows.Scan(
			&l.ID, &ruleIDNull, &l.TriggeredBy, &l.StartedAt, &finishedNull,
			&l.SpaceReclaimed, &itemsJSON, &errsJSON, &l.Status,
		)
		if err != nil {
			return nil, err
		}
		if ruleIDNull.Valid {
			l.RuleID = &ruleIDNull.Int64
		}
		if finishedNull.Valid {
			l.FinishedAt = &finishedNull.String
		}
		_ = json.Unmarshal([]byte(itemsJSON), &l.ItemsRemoved)
		_ = json.Unmarshal([]byte(errsJSON), &l.Errors)
		if l.ItemsRemoved == nil {
			l.ItemsRemoved = map[string]int{}
		}
		if l.Errors == nil {
			l.Errors = []string{}
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
