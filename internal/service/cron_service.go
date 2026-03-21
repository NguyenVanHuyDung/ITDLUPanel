package service

import (
	"context"
	"database/sql"
	"fmt"
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
	Name     string `json:"name" validate:"required,min=1,max=255"`
	Type     string `json:"type" validate:"required,oneof=shell url backup_site backup_db"`
	Schedule string `json:"schedule" validate:"required,cron_expr"`
	Command  string `json:"command" validate:"required"`
}

// UpdateCronRequest holds data for updating an existing cron job.
type UpdateCronRequest struct {
	Name     string `json:"name" validate:"omitempty,min=1,max=255"`
	Type     string `json:"type" validate:"omitempty,oneof=shell url backup_site backup_db"`
	Schedule string `json:"schedule" validate:"omitempty,cron_expr"`
	Command  string `json:"command" validate:"omitempty"`
}

// CronJob represents a scheduled cron job.
type CronJob struct {
	ID         int64      `json:"id"`
	Name       string     `json:"name"`
	Type       string     `json:"type"`
	Schedule   string     `json:"schedule"`
	Command    string     `json:"command"`
	Status     int        `json:"status"`
	LastRun    *time.Time `json:"last_run"`
	LastStatus *string    `json:"last_status"`
	LastOutput *string    `json:"last_output"`
	CreatedBy  *int64     `json:"created_by"`
	CreatedAt  string     `json:"created_at"`
	UpdatedAt  string     `json:"updated_at"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// CronService manages cron jobs.
type CronService struct {
	db *sql.DB
}

// NewCronService creates a new CronService.
func NewCronService(db *sql.DB) *CronService {
	return &CronService{db: db}
}

// Create provisions a new cron job and writes it to the system crontab.
func (s *CronService) Create(req CreateCronRequest) (*CronJob, error) {
	if !cronExprRegex.MatchString(strings.TrimSpace(req.Schedule)) {
		return nil, apperrors.New(apperrors.ErrValidation, "invalid cron expression, must be 5 fields")
	}

	command := s.buildCommand(req.Type, req.Command, 0)

	result, err := s.db.Exec(
		`INSERT INTO crons (name, type, schedule, command, status) VALUES (?, ?, ?, ?, 1)`,
		req.Name, req.Type, req.Schedule, req.Command,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create cron job")
	}

	id, _ := result.LastInsertId()

	// Rebuild the command with the actual ID for log redirection.
	command = s.buildCommand(req.Type, req.Command, id)
	if err := s.syncCrontab(id, req.Schedule, command, true); err != nil {
		// Rollback the database record on crontab failure.
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
		`SELECT id, name, type, schedule, command, status, last_run, last_status, last_output, created_by, created_at, updated_at
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
		var lastStatus, lastOutput sql.NullString
		var createdBy sql.NullInt64
		if err := rows.Scan(&c.ID, &c.Name, &c.Type, &c.Schedule, &c.Command, &c.Status,
			&lastRun, &lastStatus, &lastOutput, &createdBy, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to scan cron job row")
		}
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
	var lastStatus, lastOutput sql.NullString
	var createdBy sql.NullInt64
	err := s.db.QueryRow(
		`SELECT id, name, type, schedule, command, status, last_run, last_status, last_output, created_by, created_at, updated_at
		 FROM crons WHERE id = ?`, id,
	).Scan(&c.ID, &c.Name, &c.Type, &c.Schedule, &c.Command, &c.Status,
		&lastRun, &lastStatus, &lastOutput, &createdBy, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, apperrors.New(apperrors.ErrNotFound, "cron job not found")
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get cron job")
	}
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

	_, err = s.db.Exec(
		`UPDATE crons SET name = ?, type = ?, schedule = ?, command = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		cron.Name, cron.Type, cron.Schedule, cron.Command, id,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update cron job")
	}

	// Re-sync crontab if the cron is enabled.
	if cron.Status == 1 {
		command := s.buildCommand(cron.Type, cron.Command, id)
		if err := s.syncCrontab(id, cron.Schedule, command, true); err != nil {
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
		command := s.buildCommand(cron.Type, cron.Command, id)
		if err := s.syncCrontab(id, cron.Schedule, command, true); err != nil {
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

	fullCmd := s.buildCommand(job.Type, job.Command, id)
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	res, err := system.Exec(ctx, "bash", "-c", fullCmd)

	// Update last_run
	now := time.Now()
	status := 0
	if err == nil {
		status = 1
	}
	s.db.Exec("UPDATE cron_jobs SET last_run = ?, last_status = ? WHERE id = ?", now, status, id)

	output := ""
	if res != nil {
		output = res.Stdout + res.Stderr
	}
	if err != nil {
		return output, apperrors.Wrap(err, apperrors.ErrInternal, "command execution failed")
	}
	return output, nil
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// buildCommand constructs the full cron command with log redirection.
func (s *CronService) buildCommand(cronType, command string, id int64) string {
	logFile := fmt.Sprintf("%s/%d.log", cronLogDir, id)

	var cmd string
	switch cronType {
	case "url":
		cmd = fmt.Sprintf("curl -fsS %s > /dev/null 2>&1", command)
	default:
		cmd = command
	}

	return fmt.Sprintf("%s >> %s 2>&1", cmd, logFile)
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

	newCrontab := strings.Join(newLines, "\n")
	// Ensure the crontab ends with a newline.
	newCrontab = strings.TrimRight(newCrontab, "\n") + "\n"

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
