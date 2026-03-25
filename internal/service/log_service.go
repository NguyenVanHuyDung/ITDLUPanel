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

// websiteLogDir is the base directory for website logs.
const websiteLogDir = "/ITDLU/logs"

// GetWebsiteAccessLog reads the last N lines of a website's access log.
// If date is provided (YYYY-MM-DD), reads the rotated log for that date.
func (s *LogService) GetWebsiteAccessLog(siteID int64, lines int, date string) ([]string, error) {
	domain, err := s.getSiteDomain(siteID)
	if err != nil {
		return nil, err
	}
	logPath := s.websiteLogPath(domain, "access", date)
	return readLogFile(logPath, clampLines(lines))
}

// GetWebsiteErrorLog reads the last N lines of a website's error log.
// If date is provided (YYYY-MM-DD), reads the rotated log for that date.
func (s *LogService) GetWebsiteErrorLog(siteID int64, lines int, date string) ([]string, error) {
	domain, err := s.getSiteDomain(siteID)
	if err != nil {
		return nil, err
	}
	logPath := s.websiteLogPath(domain, "error", date)
	return readLogFile(logPath, clampLines(lines))
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
		logPath = fmt.Sprintf("%s/%s.access.log", websiteLogDir, domain)
	case "error":
		logPath = fmt.Sprintf("%s/%s.error.log", websiteLogDir, domain)
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
// Scans /ITDLU/logs/ for rotated files matching {domain}.access.log.YYYY-MM-DD
func (s *LogService) ListWebsiteLogDates(siteID int64) ([]string, error) {
	domain, err := s.getSiteDomain(siteID)
	if err != nil {
		return nil, err
	}

	prefix := domain + ".access.log."
	entries, err := os.ReadDir(websiteLogDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read log directory")
	}

	var dates []string
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, prefix) && !strings.HasSuffix(name, ".gz") {
			date := strings.TrimPrefix(name, prefix)
			// Validate date format YYYY-MM-DD
			if len(date) == 10 && date[4] == '-' && date[7] == '-' {
				dates = append(dates, date)
			}
		}
	}

	// Sort descending (newest first)
	sort.Sort(sort.Reverse(sort.StringSlice(dates)))

	return dates, nil
}

// websiteLogPath returns the log file path for a domain.
// If date is empty, returns the current (today) log.
// If date is YYYY-MM-DD, returns the rotated log for that date.
func (s *LogService) websiteLogPath(domain, logType, date string) string {
	base := fmt.Sprintf("%s/%s.%s.log", websiteLogDir, domain, logType)
	if date == "" {
		return base
	}
	return base + "." + date
}

// EnsureLogDir creates /ITDLU/logs if it doesn't exist.
func (s *LogService) EnsureLogDir() error {
	return os.MkdirAll(websiteLogDir, 0755)
}

// SetupLogRotation creates a logrotate config for website logs
// that rotates daily and names files with date suffix.
func (s *LogService) SetupLogRotation() error {
	config := `/ITDLU/logs/*.access.log /ITDLU/logs/*.error.log {
    daily
    missingok
    notifempty
    dateext
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

	result, err := system.Exec(ctx, "tail", "-n", strconv.Itoa(lines), filePath)
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
