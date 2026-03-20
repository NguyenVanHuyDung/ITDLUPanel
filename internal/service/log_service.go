package service

import (
	"context"
	"database/sql"
	"fmt"
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
	panelLogPath    = "/ITDLUPanel/logs/panel.log"
	logDefaultLines = 100
	logMaxLines     = 5000
	logCmdTimeout   = 30 * time.Second
)

// LogService provides log reading and management operations.
type LogService struct {
	db *sql.DB
}

// NewLogService creates a new LogService.
func NewLogService(db *sql.DB) *LogService {
	return &LogService{db: db}
}

// ---------------------------------------------------------------------------
// Read logs
// ---------------------------------------------------------------------------

// GetPanelLog reads the last N lines of the panel log file.
func (s *LogService) GetPanelLog(lines int) ([]string, error) {
	return readLogFile(panelLogPath, clampLines(lines))
}

// GetWebsiteAccessLog reads the last N lines of a website's access log.
func (s *LogService) GetWebsiteAccessLog(siteID int64, lines int) ([]string, error) {
	domain, err := s.getSiteDomain(siteID)
	if err != nil {
		return nil, err
	}
	logPath := fmt.Sprintf("/var/log/nginx/%s-access.log", domain)
	return readLogFile(logPath, clampLines(lines))
}

// GetWebsiteErrorLog reads the last N lines of a website's error log.
func (s *LogService) GetWebsiteErrorLog(siteID int64, lines int) ([]string, error) {
	domain, err := s.getSiteDomain(siteID)
	if err != nil {
		return nil, err
	}
	logPath := fmt.Sprintf("/var/log/nginx/%s-error.log", domain)
	return readLogFile(logPath, clampLines(lines))
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
		logPath = panelLogPath
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
