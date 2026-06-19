package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// cronMarkerPrefix is used to tag crontab entries managed by ITDLUPanel.
const cronMarkerPrefix = "# ITDLUPanel-cron-"

// cronLogDir is where cron job output logs are stored.
const cronLogDir = "/ITDLUPanel/logs/cron"

// cronExprRegex validates standard 5-field cron expressions.
var cronExprRegex = regexp.MustCompile(`^\S+\s+\S+\s+\S+\s+\S+\s+\S+$`)

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

// CreateCronRequest holds data for creating a new cron job.
type CreateCronRequest struct {
	Name        string  `json:"name" validate:"required,min=1,max=255"`
	Type        string  `json:"type" validate:"required,oneof=shell url backup_site backup_db"`
	Schedule    string  `json:"schedule" validate:"required,cron_expr"`
	Command     string  `json:"command" validate:"required"`
	StorageType string  `json:"storage_type"`
	StorageID   *int64  `json:"storage_id"`
	KeepLocal   *bool   `json:"keep_local"`
}

// UpdateCronRequest holds data for updating an existing cron job.
type UpdateCronRequest struct {
	Name        string  `json:"name" validate:"omitempty,min=1,max=255"`
	Type        string  `json:"type" validate:"omitempty,oneof=shell url backup_site backup_db"`
	Schedule    string  `json:"schedule" validate:"omitempty,cron_expr"`
	Command     string  `json:"command" validate:"omitempty"`
	StorageType *string `json:"storage_type"`
	StorageID   *int64  `json:"storage_id"`
	KeepLocal   *bool   `json:"keep_local"`
}

// CronJob represents a scheduled cron job.
type CronJob struct {
	ID          int64      `json:"id"`
	Name        string     `json:"name"`
	Type        string     `json:"type"`
	Schedule    string     `json:"schedule"`
	Command     string     `json:"command"`
	Status      int        `json:"status"`
	StorageType string     `json:"storage_type"`
	StorageID   *int64     `json:"storage_id"`
	KeepLocal   bool       `json:"keep_local"`
	LastRun     *time.Time `json:"last_run"`
	LastStatus  *string    `json:"last_status"`
	LastOutput  *string    `json:"last_output"`
	CreatedBy   *int64     `json:"created_by"`
	CreatedAt   string     `json:"created_at"`
	UpdatedAt   string     `json:"updated_at"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// CronService manages cron jobs.
type CronService struct {
	db       *sql.DB
	notifier *NotificationService
}

// NewCronService creates a new CronService.
func NewCronService(db *sql.DB) *CronService {
	return &CronService{db: db}
}

// SetNotifier sets the notification service for event dispatching.
func (s *CronService) SetNotifier(n *NotificationService) { s.notifier = n }

// ResyncAll rebuilds crontab entries for all enabled cron jobs. Call this on
// startup or after applying fixes to ensure the crontab matches the database.
func (s *CronService) ResyncAll() error {
	rows, err := s.db.Query("SELECT id, schedule FROM crons WHERE status = 1")
	if err != nil {
		return fmt.Errorf("failed to query enabled crons: %w", err)
	}
	defer rows.Close()

	var synced int
	for rows.Next() {
		var id int64
		var schedule string
		if err := rows.Scan(&id, &schedule); err != nil {
			continue
		}
		cronCmd := s.buildCrontabCommand(id)
		if err := s.syncCrontab(id, schedule, cronCmd, true); err != nil {
			logger.Error().Err(err).Int64("id", id).Msg("failed to resync crontab entry")
			continue
		}
		synced++
	}
	logger.Info().Int("count", synced).Msg("crontab entries resynced")
	return nil
}

// Create provisions a new cron job and writes it to the system crontab.
func (s *CronService) Create(req CreateCronRequest) (*CronJob, error) {
	if !cronExprRegex.MatchString(strings.TrimSpace(req.Schedule)) {
		return nil, apperrors.New(apperrors.ErrValidation, "invalid cron expression, must be 5 fields")
	}

	keepLocal := 1
	if req.KeepLocal != nil {
		if !*req.KeepLocal {
			keepLocal = 0
		}
	}

	result, err := s.db.Exec(
		`INSERT INTO crons (name, type, schedule, command, status, storage_type, storage_id, keep_local)
		 VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
		req.Name, req.Type, req.Schedule, req.Command,
		req.StorageType, nullInt(req.StorageID), keepLocal,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create cron job")
	}

	id, _ := result.LastInsertId()

	cronCmd := s.buildCrontabCommand(id)
	if err := s.syncCrontab(id, req.Schedule, cronCmd, true); err != nil {
		_, _ = s.db.Exec("DELETE FROM crons WHERE id = ?", id)
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to write crontab entry")
	}

	logger.Info().Int64("id", id).Str("name", req.Name).Msg("cron job created")
	return s.GetByID(id)
}

// List returns a paginated list of cron jobs.
func (s *CronService) List(page, pageSize int) ([]*CronJob, int, error) {
	var total int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM crons").Scan(&total); err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to count cron jobs")
	}

	offset := (page - 1) * pageSize
	rows, err := s.db.Query(
		`SELECT id, name, type, schedule, command, status,
		        storage_type, storage_id, keep_local,
		        last_run, last_status, last_output, created_by, created_at, updated_at
		 FROM crons ORDER BY id DESC LIMIT ? OFFSET ?`,
		pageSize, offset,
	)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list cron jobs")
	}
	defer rows.Close()

	var crons []*CronJob
	for rows.Next() {
		c := &CronJob{}
		var lastRun sql.NullTime
		var lastStatus, lastOutput, storageType sql.NullString
		var storageID, createdBy sql.NullInt64
		var keepLocal int
		if err := rows.Scan(&c.ID, &c.Name, &c.Type, &c.Schedule, &c.Command, &c.Status,
			&storageType, &storageID, &keepLocal,
			&lastRun, &lastStatus, &lastOutput, &createdBy, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to scan cron job row")
		}
		c.StorageType = storageType.String
		if storageID.Valid {
			c.StorageID = &storageID.Int64
		}
		c.KeepLocal = keepLocal == 1
		if lastRun.Valid {
			c.LastRun = &lastRun.Time
		}
		if lastStatus.Valid {
			c.LastStatus = &lastStatus.String
		}
		if lastOutput.Valid {
			c.LastOutput = &lastOutput.String
		}
		if createdBy.Valid {
			c.CreatedBy = &createdBy.Int64
		}
		crons = append(crons, c)
	}

	return crons, total, nil
}

// GetByID returns a cron job by its ID.
func (s *CronService) GetByID(id int64) (*CronJob, error) {
	c := &CronJob{}
	var lastRun sql.NullTime
	var lastStatus, lastOutput, storageType sql.NullString
	var storageID, createdBy sql.NullInt64
	var keepLocal int
	err := s.db.QueryRow(
		`SELECT id, name, type, schedule, command, status,
		        storage_type, storage_id, keep_local,
		        last_run, last_status, last_output, created_by, created_at, updated_at
		 FROM crons WHERE id = ?`, id,
	).Scan(&c.ID, &c.Name, &c.Type, &c.Schedule, &c.Command, &c.Status,
		&storageType, &storageID, &keepLocal,
		&lastRun, &lastStatus, &lastOutput, &createdBy, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, apperrors.New(apperrors.ErrNotFound, "cron job not found")
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get cron job")
	}
	c.StorageType = storageType.String
	if storageID.Valid {
		c.StorageID = &storageID.Int64
	}
	c.KeepLocal = keepLocal == 1
	if lastRun.Valid {
		c.LastRun = &lastRun.Time
	}
	if lastStatus.Valid {
		c.LastStatus = &lastStatus.String
	}
	if lastOutput.Valid {
		c.LastOutput = &lastOutput.String
	}
	if createdBy.Valid {
		c.CreatedBy = &createdBy.Int64
	}
	return c, nil
}

// Update modifies an existing cron job.
func (s *CronService) Update(id int64, req UpdateCronRequest) error {
	cron, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if req.Name != "" {
		cron.Name = req.Name
	}
	if req.Type != "" {
		cron.Type = req.Type
	}
	if req.Schedule != "" {
		if !cronExprRegex.MatchString(strings.TrimSpace(req.Schedule)) {
			return apperrors.New(apperrors.ErrValidation, "invalid cron expression, must be 5 fields")
		}
		cron.Schedule = req.Schedule
	}
	if req.Command != "" {
		cron.Command = req.Command
	}
	if req.StorageType != nil {
		cron.StorageType = *req.StorageType
	}
	if req.StorageID != nil {
		cron.StorageID = req.StorageID
	}
	if req.KeepLocal != nil {
		cron.KeepLocal = *req.KeepLocal
	}

	keepLocal := 0
	if cron.KeepLocal {
		keepLocal = 1
	}
	_, err = s.db.Exec(
		`UPDATE crons
		 SET name = ?, type = ?, schedule = ?, command = ?,
		     storage_type = ?, storage_id = ?, keep_local = ?,
		     updated_at = CURRENT_TIMESTAMP
		 WHERE id = ?`,
		cron.Name, cron.Type, cron.Schedule, cron.Command,
		cron.StorageType, nullInt(cron.StorageID), keepLocal,
		id,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update cron job")
	}

	// Re-sync crontab if the cron is enabled.
	if cron.Status == 1 {
		cronCmd := s.buildCrontabCommand(id)
		if err := s.syncCrontab(id, cron.Schedule, cronCmd, true); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update crontab entry")
		}
	}

	logger.Info().Int64("id", id).Str("name", cron.Name).Msg("cron job updated")
	return nil
}

// Delete removes a cron job and its crontab entry.
func (s *CronService) Delete(id int64) error {
	_, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if err := s.removeCrontabEntry(id); err != nil {
		logger.Error().Err(err).Int64("id", id).Msg("failed to remove crontab entry")
	}

	if _, err := s.db.Exec("DELETE FROM crons WHERE id = ?", id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete cron job")
	}

	logger.Info().Int64("id", id).Msg("cron job deleted")
	return nil
}

// SetStatus enables or disables a cron job.
func (s *CronService) SetStatus(id int64, enabled bool) error {
	cron, err := s.GetByID(id)
	if err != nil {
		return err
	}

	status := 0
	if enabled {
		status = 1
	}

	_, err = s.db.Exec("UPDATE crons SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", status, id)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update cron job status")
	}

	if enabled {
		cronCmd := s.buildCrontabCommand(id)
		if err := s.syncCrontab(id, cron.Schedule, cronCmd, true); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to enable crontab entry")
		}
	} else {
		if err := s.removeCrontabEntry(id); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to disable crontab entry")
		}
	}

	logger.Info().Int64("id", id).Bool("enabled", enabled).Msg("cron job status changed")
	return nil
}

// GetLog reads the execution log for a cron job.
func (s *CronService) GetLog(id int64) (string, error) {
	_, err := s.GetByID(id)
	if err != nil {
		return "", err
	}

	logPath := fmt.Sprintf("%s/%d.log", cronLogDir, id)
	data, err := os.ReadFile(logPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to read cron log")
	}

	return string(data), nil
}

// RunNow executes a cron job immediately in the background and returns the output.
func (s *CronService) RunNow(id int64) (string, error) {
	job, err := s.GetByID(id)
	if err != nil {
		return "", err
	}

	logFile := fmt.Sprintf("%s/%d.log", cronLogDir, id)
	_ = os.MkdirAll(cronLogDir, 0755)

	startTime := time.Now()
	header := fmt.Sprintf("\n[%s] === Run: %s ===\n[%s] Command: %s\n",
		startTime.Format("2006-01-02 15:04:05"), job.Name,
		startTime.Format("2006-01-02 15:04:05"), job.Command)
	appendToFile(logFile, header)

	// Build the raw command (without crontab wrapping)
	rawCmd := s.rawCommand(job.Type, job.Command)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	res, execErr := system.Exec(ctx, "bash", "-c", rawCmd)

	now := time.Now()
	statusStr := "0"
	if execErr == nil {
		statusStr = "1"
	}

	output := ""
	if res != nil {
		output = res.Stdout + res.Stderr
	}

	// Update last_run in database
	_, _ = s.db.Exec(
		"UPDATE crons SET last_run = ?, last_status = ?, last_output = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		now, statusStr, truncateOutput(output, 4096), id,
	)

	// Write execution result to log
	elapsed := time.Since(startTime).Round(time.Millisecond)
	var footer string
	if execErr != nil {
		footer = fmt.Sprintf("[%s] Status: FAILED (%s) Duration: %s\n", now.Format("2006-01-02 15:04:05"), execErr.Error(), elapsed)
	} else {
		footer = fmt.Sprintf("[%s] Status: OK Duration: %s\n", now.Format("2006-01-02 15:04:05"), elapsed)
	}
	if output != "" {
		footer += fmt.Sprintf("[%s] Output: %s\n", now.Format("2006-01-02 15:04:05"), output)
	}
	appendToFile(logFile, footer)

	if execErr != nil {
		if s.notifier != nil {
			s.notifier.Notify(NotificationEvent{Type: EventCronFailed, Title: fmt.Sprintf("Cron Failed: %s", job.Name), Detail: truncateOutput(output, 500)})
		}
		return output, apperrors.Wrap(execErr, apperrors.ErrInternal, "command execution failed")
	}
	if s.notifier != nil {
		s.notifier.Notify(NotificationEvent{Type: EventCronSuccess, Title: fmt.Sprintf("Cron OK: %s", job.Name), Detail: fmt.Sprintf("Duration: %s", elapsed)})
	}
	return output, nil
}

func appendToFile(path, content string) {
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	f.WriteString(content)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// rawCommand returns the executable command for a cron type (without crontab wrapping).
func (s *CronService) rawCommand(cronType, command string) string {
	switch cronType {
	case "url":
		u, err := url.Parse(command)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			logger.Warn().Str("url", command).Msg("invalid URL for cron job, skipping")
			return "echo 'invalid cron URL'"
		}
		escaped := strings.ReplaceAll(command, "'", `'\''`)
		return fmt.Sprintf("curl -fsS '%s'", escaped)
	default:
		return command
	}
}

// buildCrontabCommand constructs the crontab command line that delegates to
// the panel binary's "cron-run" subcommand. This approach avoids crontab %
// escaping issues and properly updates last_run/last_status in the database.
//
// For backup_* crons the command is `panel backup …` (not `cron-run`),
// which triggers a real backup, optionally uploads to the configured
// storage, enforces retention, then exits. For shell/url crons the
// command is `panel cron-run -id=N` so RunNow() can stream output to
// the log and dispatch notifications.
func (s *CronService) buildCrontabCommand(id int64) string {
	exe, err := os.Executable()
	if err != nil {
		exe = "/root/ITDLUPanel/bin/itdlupanel"
	}

	job, err := s.GetByID(id)
	if err != nil {
		// Fall back to the generic cron-run path so we never delete
		// a crontab entry by accident.
		return fmt.Sprintf("%s cron-run -id=%d -config=%s",
			exe, id, resolveConfigPath())
	}

	switch job.Type {
	case "backup_site", "backup_db":
		// `command` is a JSON-ish mini-spec the frontend writes
		// (e.g. `{"target":"example.com","all":false,"max_keep":5}`).
		// We translate it into real `panel backup` flags here so the
		// cron entry is self-contained and survives CLI refactors.
		parts := parseBackupCommand(job.Command)
		args := []string{"backup", "-config=" + resolveConfigPath(), "-type=" + backupTypeFor(job.Type)}
		if parts.All {
			args = append(args, "-all")
		} else if parts.Target != "" {
			args = append(args, "-target="+parts.Target)
		}
		if parts.MaxKeep > 0 {
			args = append(args, fmt.Sprintf("-max-keep=%d", parts.MaxKeep))
		}
		if parts.Strategy == "incremental" {
			args = append(args, "-strategy=incremental")
		}
		if job.StorageType != "" && job.StorageID != nil {
			args = append(args, fmt.Sprintf("-storage=%s", job.StorageType))
			args = append(args, fmt.Sprintf("-storage-id=%d", *job.StorageID))
		}
		if !job.KeepLocal {
			args = append(args, "-no-keep-local")
		}
		return fmt.Sprintf("%s %s", exe, strings.Join(args, " "))
	default:
		return fmt.Sprintf("%s cron-run -id=%d -config=%s",
			exe, id, resolveConfigPath())
	}
}

// backupTypeFor converts a cron type into the CLI's -type flag value.
func backupTypeFor(cronType string) string {
	if cronType == "backup_db" {
		return "database"
	}
	return "site"
}

// backupCommandSpec is the mini-spec the frontend writes into
// crons.command for backup_* jobs. Keeping it a tiny struct (rather
// than free-form text) lets us validate it once at cron-create time.
type backupCommandSpec struct {
	Target   string `json:"target"`
	All      bool   `json:"all"`
	MaxKeep  int    `json:"max_keep"`
	Strategy string `json:"strategy"` // "full" or "incremental"
}

// parseBackupCommand parses the JSON-ish spec stored in crons.command
// for backup jobs. Empty / invalid input yields an empty struct, which
// the CLI interprets as "no target, no all" — i.e. the cron will exit
// with a usage error, which is the right behaviour.
func parseBackupCommand(raw string) backupCommandSpec {
	if raw == "" {
		return backupCommandSpec{}
	}
	var s backupCommandSpec
	_ = json.Unmarshal([]byte(raw), &s)
	return s
}

// resolveConfigPath returns an absolute config file path for crontab use.
func resolveConfigPath() string {
	candidates := []string{
		"/root/ITDLUPanel/config/panel.json",
		"/ITDLUPanel/server/config/panel.json",
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return "/root/ITDLUPanel/config/panel.json"
}

// truncateOutput limits output to maxLen bytes to avoid bloating the database.
func truncateOutput(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "\n... (truncated)"
}

// ensureCronTZ prepends CRON_TZ=<system timezone> to the crontab if not present.
// This guarantees cron interprets schedules in the correct timezone even if the
// cron daemon was started before the system TZ was configured.
func ensureCronTZ(crontab string) string {
	if strings.Contains(crontab, "CRON_TZ=") {
		return crontab
	}
	tz := "Asia/Ho_Chi_Minh"
	if data, err := os.ReadFile("/etc/timezone"); err == nil {
		if t := strings.TrimSpace(string(data)); t != "" {
			tz = t
		}
	}
	return fmt.Sprintf("CRON_TZ=%s\n%s", tz, crontab)
}

// syncCrontab adds or updates a crontab entry for the given cron job ID.
func (s *CronService) syncCrontab(id int64, schedule, command string, add bool) error {
	_ = os.MkdirAll(cronLogDir, 0755)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Read current crontab (ignore error if empty).
	result, _ := system.Exec(ctx, "crontab", "-l")
	currentCrontab := ""
	if result != nil {
		currentCrontab = result.Stdout
	}

	marker := fmt.Sprintf("%s%d", cronMarkerPrefix, id)
	lines := strings.Split(currentCrontab, "\n")
	var newLines []string

	// Remove existing entry for this ID.
	skipNext := false
	for _, line := range lines {
		if strings.TrimSpace(line) == marker {
			skipNext = true
			continue
		}
		if skipNext {
			skipNext = false
			continue
		}
		newLines = append(newLines, line)
	}

	// Add new entry if requested.
	if add {
		newLines = append(newLines, marker)
		newLines = append(newLines, fmt.Sprintf("%s %s", schedule, command))
	}

	// Collapse consecutive blank lines to keep crontab tidy.
	var cleaned []string
	prevBlank := false
	for _, line := range newLines {
		if strings.TrimSpace(line) == "" {
			if prevBlank {
				continue
			}
			prevBlank = true
		} else {
			prevBlank = false
		}
		cleaned = append(cleaned, line)
	}

	newCrontab := strings.Join(cleaned, "\n")
	// Ensure the crontab ends with a newline.
	newCrontab = strings.TrimRight(newCrontab, "\n") + "\n"

	// Ensure CRON_TZ is set at the top so cron uses the system timezone.
	newCrontab = ensureCronTZ(newCrontab)

	// Write the new crontab via stdin to `crontab -`.
	ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel2()

	result, err := system.Exec(ctx2, "/bin/bash", "-c",
		fmt.Sprintf("echo %s | crontab -", cronShellQuote(newCrontab)))
	if err != nil {
		return fmt.Errorf("failed to write crontab: %w (stderr: %s)", err, result.Stderr)
	}

	return nil
}

// removeCrontabEntry removes a crontab entry by cron job ID.
func (s *CronService) removeCrontabEntry(id int64) error {
	return s.syncCrontab(id, "", "", false)
}

// cronShellQuote wraps a string in single quotes for safe shell usage.
func cronShellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

// nullString returns sql.NullString for empty values so the column is
// stored as NULL rather than the empty string.
func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

// nullInt returns sql.NullInt64 only when v is non-nil. We keep 0 in the
// DB when the caller explicitly set it because column-not-set semantics
// differ from "set to 0" in cron storage contexts.
func nullInt(v *int64) sql.NullInt64 {
	if v == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *v, Valid: true}
}
