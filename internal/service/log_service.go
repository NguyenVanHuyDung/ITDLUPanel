package service

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// AuditEntry represents a row from the audit_logs table.
type AuditEntry struct {
	ID         int64  `json:"id"`
	UserID     int64  `json:"user_id"`
	Username   string `json:"username"`
	Action     string `json:"action"`
	Resource   string `json:"resource"`
	ResourceID string `json:"resource_id"`
	Detail     string `json:"detail"`
	IP         string `json:"ip"`
	UserAgent  string `json:"user_agent"`
	CreatedAt  string `json:"created_at"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// WebsiteLogResult contains log lines and total line count for the queried period.
type WebsiteLogResult struct {
	Lines      []string `json:"lines"`
	TotalLines int      `json:"total_lines"`
}

const (
	logDefaultLines = 100
	logMaxLines     = 5000
	logCmdTimeout   = 30 * time.Second
)

// LogService provides log reading and management operations.
type LogService struct {
	db           *sql.DB
	panelLogPath string
}

// NewLogService creates a new LogService.
func NewLogService(db *sql.DB, panelLogPath string) *LogService {
	if panelLogPath == "" {
		panelLogPath = "/ITDLUPanel/logs/panel.log"
	}
	return &LogService{db: db, panelLogPath: panelLogPath}
}

// ---------------------------------------------------------------------------
// Read logs
// ---------------------------------------------------------------------------

// GetPanelLog reads the last N lines of the panel log file.
func (s *LogService) GetPanelLog(lines int) ([]string, error) {
	return readLogFile(s.panelLogPath, clampLines(lines))
}

// websiteLogBase is the base directory for per-site website log directories.
// Each site stores logs at /ITDLUPanel/logs/<domain>/access.log, error.log.
const websiteLogBase = "/ITDLUPanel/logs"

// websiteLogDir returns the per-site log directory: /ITDLUPanel/logs/<domain>
func websiteLogDir(domain string) string {
	return websiteLogBase + "/" + domain
}

// GetWebsiteAccessLog reads the last N lines of a website's access log.
// Supports single date or date range (start_date, end_date in YYYY-MM-DD).
func (s *LogService) GetWebsiteAccessLog(siteID int64, lines int, date, startDate, endDate string) (*WebsiteLogResult, error) {
	domain, err := s.getSiteDomain(siteID)
	if err != nil {
		return nil, err
	}
	if startDate != "" && endDate != "" {
		return s.readWebsiteLogRange(domain, "access", startDate, endDate, clampLines(lines))
	}
	logPath := s.websiteLogPath(domain, "access", date)
	return readLogFileWithCount(logPath, clampLines(lines))
}

// GetWebsiteErrorLog reads the last N lines of a website's error log.
// Supports single date or date range (start_date, end_date in YYYY-MM-DD).
func (s *LogService) GetWebsiteErrorLog(siteID int64, lines int, date, startDate, endDate string) (*WebsiteLogResult, error) {
	domain, err := s.getSiteDomain(siteID)
	if err != nil {
		return nil, err
	}
	if startDate != "" && endDate != "" {
		return s.readWebsiteLogRange(domain, "error", startDate, endDate, clampLines(lines))
	}
	logPath := s.websiteLogPath(domain, "error", date)
	return readLogFileWithCount(logPath, clampLines(lines))
}

// readWebsiteLogRange reads and merges logs across a date range, returning the last N lines.
func (s *LogService) readWebsiteLogRange(domain, logType, startDate, endDate string, lines int) (*WebsiteLogResult, error) {
	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrValidation, "invalid start_date format")
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrValidation, "invalid end_date format")
	}
	if end.Before(start) {
		start, end = end, start
	}

	today := time.Now().Format("2006-01-02")
	var paths []string
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		ds := d.Format("2006-01-02")
		var datePart string
		if ds == today {
			datePart = ""
		} else {
			datePart = ds
		}
		p := s.websiteLogPath(domain, logType, datePart)
		if _, err := os.Stat(p); err == nil {
			paths = append(paths, p)
		}
	}

	if len(paths) == 0 {
		return &WebsiteLogResult{Lines: []string{}, TotalLines: 0}, nil
	}
	if len(paths) == 1 {
		return readLogFileWithCount(paths[0], lines)
	}

	// Count total lines across all files
	totalLines := countLinesMulti(paths)

	// Build a shell command that cats/zcats all files and pipes to tail
	var parts []string
	for _, p := range paths {
		if strings.HasSuffix(p, ".gz") {
			parts = append(parts, fmt.Sprintf("zcat '%s'", p))
		} else {
			parts = append(parts, fmt.Sprintf("cat '%s'", p))
		}
	}
	cmd := fmt.Sprintf("{ %s; } | tail -n %d", strings.Join(parts, "; "), lines)

	ctx, cancel := context.WithTimeout(context.Background(), logCmdTimeout)
	defer cancel()
	result, err := system.Exec(ctx, "bash", "-c", cmd)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read log range")
	}
	output := strings.TrimSpace(result.Stdout)
	if output == "" {
		return &WebsiteLogResult{Lines: []string{}, TotalLines: totalLines}, nil
	}
	logLines := strings.Split(output, "\n")
	return &WebsiteLogResult{Lines: logLines, TotalLines: totalLines}, nil
}

// ClearWebsiteLog clears a website's access or error log.
func (s *LogService) ClearWebsiteLog(siteID int64, logType string) error {
	domain, err := s.getSiteDomain(siteID)
	if err != nil {
		return err
	}
	var logPath string
	switch logType {
	case "access":
		logPath = fmt.Sprintf("%s/access.log", websiteLogDir(domain))
	case "error":
		logPath = fmt.Sprintf("%s/error.log", websiteLogDir(domain))
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported website log type: "+logType)
	}

	ctx, cancel := context.WithTimeout(context.Background(), logCmdTimeout)
	defer cancel()

	if _, err := system.Exec(ctx, "truncate", "-s", "0", logPath); err != nil {
		logger.Error().Err(err).Str("path", logPath).Msg("failed to clear website log")
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to clear website log file")
	}

	logger.Info().Str("domain", domain).Str("type", logType).Msg("website log cleared")
	return nil
}

// ListSitesMinimal returns a minimal list of sites (id, domain) for dropdowns.
func (s *LogService) ListSitesMinimal() ([]map[string]interface{}, error) {
	rows, err := s.db.Query("SELECT id, domain FROM sites ORDER BY domain")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list sites")
	}
	defer rows.Close()
	var sites []map[string]interface{}
	for rows.Next() {
		var id int64
		var domain string
		if err := rows.Scan(&id, &domain); err != nil {
			continue
		}
		sites = append(sites, map[string]interface{}{"id": id, "domain": domain})
	}
	return sites, nil
}

// ListWebsiteLogDates returns available log dates for a website.
// Scans /ITDLUPanel/logs/<domain>/ for rotated files matching access.log.YYYY-MM-DD[.gz].
func (s *LogService) ListWebsiteLogDates(siteID int64) ([]string, error) {
	domain, err := s.getSiteDomain(siteID)
	if err != nil {
		return nil, err
	}

	siteDir := websiteLogDir(domain)
	entries, err := os.ReadDir(siteDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read log directory")
	}

	const prefix = "access.log."
	seen := make(map[string]bool)

	// Include today if the active log file is non-empty
	activeLog := siteDir + "/access.log"
	if fi, err := os.Stat(activeLog); err == nil && fi.Size() > 0 {
		seen[time.Now().Format("2006-01-02")] = true
	}

	for _, e := range entries {
		name := e.Name()
		if !strings.HasPrefix(name, prefix) {
			continue
		}
		date := strings.TrimPrefix(name, prefix)
		date = strings.TrimSuffix(date, ".gz")
		if len(date) == 10 && date[4] == '-' && date[7] == '-' {
			seen[date] = true
		}
	}

	dates := make([]string, 0, len(seen))
	for d := range seen {
		dates = append(dates, d)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(dates)))

	return dates, nil
}

// websiteLogPath returns the log file path for a domain.
// Path format: /ITDLUPanel/logs/<domain>/<logType>.log[.date][.gz]
func (s *LogService) websiteLogPath(domain, logType, date string) string {
	base := fmt.Sprintf("%s/%s.log", websiteLogDir(domain), logType)
	if date == "" || date == time.Now().Format("2006-01-02") {
		return base
	}
	plain := base + "." + date
	if _, err := os.Stat(plain); err == nil {
		return plain
	}
	gz := plain + ".gz"
	if _, err := os.Stat(gz); err == nil {
		return gz
	}
	return plain
}

// EnsureLogDir creates /ITDLUPanel/logs if it doesn't exist.
func (s *LogService) EnsureLogDir() error {
	return os.MkdirAll(websiteLogBase, 0755)
}

// EnsureSiteLogDir creates the per-site log directory: /ITDLUPanel/logs/<domain>/
func (s *LogService) EnsureSiteLogDir(domain string) error {
	return os.MkdirAll(websiteLogDir(domain), 0755)
}

// SetupLogRotation creates a logrotate config for website logs
// that rotates daily and names files with date suffix.
func (s *LogService) SetupLogRotation() error {
	config := `/ITDLUPanel/logs/*/access.log /ITDLUPanel/logs/*/error.log {
    daily
    missingok
    notifempty
    dateext
    dateyesterday
    dateformat .%Y-%m-%d
    rotate 90
    compress
    delaycompress
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid) 2>/dev/null || true
    endscript
}
`
	if err := os.MkdirAll("/etc/logrotate.d", 0755); err != nil {
		return err
	}
	return os.WriteFile("/etc/logrotate.d/itdlu-websites", []byte(config), 0644)
}

// GetSSHLog reads the last N lines of the SSH authentication log.
func (s *LogService) GetSSHLog(lines int) ([]string, error) {
	lines = clampLines(lines)
	// Try Ubuntu path first, fall back to RHEL.
	result, err := readLogFile("/var/log/auth.log", lines)
	if err != nil {
		return readLogFile("/var/log/secure", lines)
	}
	return result, nil
}

// GetAuditLog returns a paginated list of audit log entries.
func (s *LogService) GetAuditLog(page, pageSize int) ([]*AuditEntry, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	var total int
	err := s.db.QueryRow("SELECT COUNT(*) FROM audit_logs").Scan(&total)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to count audit logs")
	}

	offset := (page - 1) * pageSize
	rows, err := s.db.Query(
		`SELECT id, COALESCE(user_id,0), COALESCE(username,''), action, resource,
		        COALESCE(resource_id,''), COALESCE(detail,''), COALESCE(ip,''),
		        COALESCE(user_agent,''), created_at
		 FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
		pageSize, offset,
	)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to query audit logs")
	}
	defer rows.Close()

	var entries []*AuditEntry
	for rows.Next() {
		e := &AuditEntry{}
		if err := rows.Scan(&e.ID, &e.UserID, &e.Username, &e.Action, &e.Resource,
			&e.ResourceID, &e.Detail, &e.IP, &e.UserAgent, &e.CreatedAt); err != nil {
			return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to scan audit log")
		}
		entries = append(entries, e)
	}

	return entries, total, nil
}

// ---------------------------------------------------------------------------
// Clear logs
// ---------------------------------------------------------------------------

// ClearLog truncates a log file by type.
func (s *LogService) ClearLog(logType string) error {
	var logPath string
	switch logType {
	case "panel":
		logPath = s.panelLogPath
	case "ssh":
		logPath = "/var/log/auth.log"
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported log type: "+logType)
	}

	ctx, cancel := context.WithTimeout(context.Background(), logCmdTimeout)
	defer cancel()

	if _, err := system.Exec(ctx, "truncate", "-s", "0", logPath); err != nil {
		logger.Error().Err(err).Str("path", logPath).Msg("failed to clear log")
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to clear log file")
	}

	logger.Info().Str("type", logType).Msg("log cleared")
	return nil
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// SearchLog searches for a pattern in a log file and returns matching lines.
func (s *LogService) SearchLog(logPath string, pattern string, lines int) ([]string, error) {
	if logPath == "" || pattern == "" {
		return nil, apperrors.New(apperrors.ErrValidation, "log path and pattern are required")
	}
	if strings.Contains(logPath, "..") {
		return nil, apperrors.New(apperrors.ErrValidation, "invalid log path")
	}

	lines = clampLines(lines)

	ctx, cancel := context.WithTimeout(context.Background(), logCmdTimeout)
	defer cancel()

	result, err := system.Exec(ctx, "grep", "-i", "-m", strconv.Itoa(lines), pattern, logPath)
	if err != nil {
		// grep exits with 1 when no matches are found.
		if result != nil && result.ExitCode == 1 {
			return []string{}, nil
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to search log")
	}

	output := strings.TrimSpace(result.Stdout)
	if output == "" {
		return []string{}, nil
	}
	return strings.Split(output, "\n"), nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func clampLines(n int) int {
	if n < 1 {
		return logDefaultLines
	}
	if n > logMaxLines {
		return logMaxLines
	}
	return n
}

func (s *LogService) getSiteDomain(siteID int64) (string, error) {
	var domain string
	err := s.db.QueryRow("SELECT domain FROM sites WHERE id = ?", siteID).Scan(&domain)
	if err == sql.ErrNoRows {
		return "", apperrors.New(apperrors.ErrNotFound, "site not found")
	}
	if err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to get site domain")
	}
	return domain, nil
}

func readLogFile(filePath string, lines int) ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), logCmdTimeout)
	defer cancel()

	var result *system.ExecResult
	var err error

	if strings.HasSuffix(filePath, ".gz") {
		result, err = system.Exec(ctx, "bash", "-c",
			fmt.Sprintf("zcat %s | tail -n %d", filePath, lines))
	} else {
		result, err = system.Exec(ctx, "tail", "-n", strconv.Itoa(lines), filePath)
	}

	if err != nil {
		logger.Error().Err(err).Str("path", filePath).Msg("failed to read log file")
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read log file")
	}

	output := strings.TrimSpace(result.Stdout)
	if output == "" {
		return []string{}, nil
	}
	return strings.Split(output, "\n"), nil
}

// readLogFileWithCount reads the last N lines and also counts total lines in the file.
func readLogFileWithCount(filePath string, lines int) (*WebsiteLogResult, error) {
	logLines, err := readLogFile(filePath, lines)
	if err != nil {
		return nil, err
	}
	totalLines := countLines(filePath)
	return &WebsiteLogResult{Lines: logLines, TotalLines: totalLines}, nil
}

// countLines counts total lines in a single log file.
func countLines(filePath string) int {
	ctx, cancel := context.WithTimeout(context.Background(), logCmdTimeout)
	defer cancel()
	var cmd string
	if strings.HasSuffix(filePath, ".gz") {
		cmd = fmt.Sprintf("zcat '%s' | wc -l", filePath)
	} else {
		cmd = fmt.Sprintf("wc -l < '%s'", filePath)
	}
	result, err := system.Exec(ctx, "bash", "-c", cmd)
	if err != nil {
		return 0
	}
	n, _ := strconv.Atoi(strings.TrimSpace(result.Stdout))
	return n
}

// countLinesMulti counts total lines across multiple log files.
func countLinesMulti(paths []string) int {
	var parts []string
	for _, p := range paths {
		if strings.HasSuffix(p, ".gz") {
			parts = append(parts, fmt.Sprintf("zcat '%s'", p))
		} else {
			parts = append(parts, fmt.Sprintf("cat '%s'", p))
		}
	}
	cmd := fmt.Sprintf("{ %s; } | wc -l", strings.Join(parts, "; "))
	ctx, cancel := context.WithTimeout(context.Background(), logCmdTimeout)
	defer cancel()
	result, err := system.Exec(ctx, "bash", "-c", cmd)
	if err != nil {
		return 0
	}
	n, _ := strconv.Atoi(strings.TrimSpace(result.Stdout))
	return n
}
