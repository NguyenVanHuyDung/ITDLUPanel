package service

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/websocket"
)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Supported event types.
const (
	EventCronSuccess          = "cron_success"
	EventCronFailed           = "cron_failed"
	EventSSLExpiryWarning     = "ssl_expiry_warning"
	EventSSLExpired           = "ssl_expired"
	EventBackupCompleted      = "backup_completed"
	EventBackupFailed         = "backup_failed"
	EventSoftwareInstalled    = "software_installed"
	EventSoftwareInstallFail  = "software_install_failed"
	EventSiteCreated          = "site_created"
	EventSiteDeleted          = "site_deleted"
	EventCPUHigh              = "cpu_high"
	EventMemoryHigh           = "memory_high"
	EventDiskHigh             = "disk_high"
	EventServiceDown          = "service_down"
	EventLoginFailed          = "login_failed"
)

// AllEventTypes returns all known event types for UI display.
func AllEventTypes() []string {
	return []string{
		EventCronSuccess, EventCronFailed,
		EventSSLExpiryWarning, EventSSLExpired,
		EventBackupCompleted, EventBackupFailed,
		EventSoftwareInstalled, EventSoftwareInstallFail,
		EventSiteCreated, EventSiteDeleted,
		EventCPUHigh, EventMemoryHigh, EventDiskHigh, EventServiceDown,
		EventLoginFailed,
	}
}

// EventSeverity maps event types to their default severity.
func EventSeverity(eventType string) string {
	switch eventType {
	case EventCronSuccess, EventBackupCompleted, EventSoftwareInstalled, EventSiteCreated:
		return "success"
	case EventSSLExpiryWarning, EventCPUHigh, EventMemoryHigh, EventSiteDeleted, EventLoginFailed:
		return "warning"
	case EventCronFailed, EventBackupFailed, EventSoftwareInstallFail:
		return "error"
	case EventSSLExpired, EventDiskHigh, EventServiceDown:
		return "critical"
	default:
		return "info"
	}
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// NotificationChannel represents a configured notification channel.
type NotificationChannel struct {
	ID        int64  `json:"id"`
	Type      string `json:"type"`
	Name      string `json:"name"`
	Config    string `json:"config"`
	IsEnabled bool   `json:"is_enabled"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// NotificationRule maps an event type to a channel.
type NotificationRule struct {
	ID        int64  `json:"id"`
	EventType string `json:"event_type"`
	ChannelID int64  `json:"channel_id"`
	IsEnabled bool   `json:"is_enabled"`
}

// NotificationLog records a sent notification.
type NotificationLog struct {
	ID          int64  `json:"id"`
	EventType   string `json:"event_type"`
	ChannelType string `json:"channel_type"`
	Recipient   string `json:"recipient"`
	Subject     string `json:"subject"`
	Message     string `json:"message"`
	Status      string `json:"status"`
	Error       string `json:"error"`
	CreatedAt   string `json:"created_at"`
}

// NotificationEvent is the payload passed to Notify().
type NotificationEvent struct {
	Type    string `json:"type"`
	Title   string `json:"title"`
	Detail  string `json:"detail"`
	Severity string `json:"severity,omitempty"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// NotificationService orchestrates sending notifications across channels.
type NotificationService struct {
	db       *sql.DB
	hub      *websocket.Hub
	email    *EmailService
	telegram *TelegramService

	// Rate limiter: event_type → last sent time.
	rateMu   sync.Mutex
	rateMap  map[string]time.Time
	rateWait time.Duration
}

// NewNotificationService creates a new NotificationService.
func NewNotificationService(db *sql.DB, hub *websocket.Hub) *NotificationService {
	return &NotificationService{
		db:       db,
		hub:      hub,
		email:    NewEmailService(),
		telegram: NewTelegramService(),
		rateMap:  make(map[string]time.Time),
		rateWait: 5 * time.Minute,
	}
}

// ---------------------------------------------------------------------------
// Public: Notify (main entry point)
// ---------------------------------------------------------------------------

// Notify dispatches a notification event to all configured channels.
// It runs asynchronously and never blocks the caller.
func (s *NotificationService) Notify(evt NotificationEvent) {
	if evt.Severity == "" {
		evt.Severity = EventSeverity(evt.Type)
	}

	// Always broadcast to WebSocket for real-time in-app notifications.
	if s.hub != nil {
		s.hub.BroadcastJSON(websocket.NewEvent(websocket.EventNotification, map[string]interface{}{
			"event_type": evt.Type,
			"title":      evt.Title,
			"detail":     evt.Detail,
			"severity":   evt.Severity,
			"timestamp":  time.Now().Format(time.RFC3339),
		}))
	}

	go s.dispatchAsync(evt)
}

func (s *NotificationService) dispatchAsync(evt NotificationEvent) {
	// Rate limiting per event type.
	s.rateMu.Lock()
	if last, ok := s.rateMap[evt.Type]; ok && time.Since(last) < s.rateWait {
		s.rateMu.Unlock()
		return
	}
	s.rateMap[evt.Type] = time.Now()
	s.rateMu.Unlock()

	// Query rules for this event type.
	rows, err := s.db.Query(`
		SELECT nc.id, nc.type, nc.name, nc.config
		FROM notification_rules nr
		JOIN notification_channels nc ON nr.channel_id = nc.id
		WHERE nr.event_type = ? AND nr.is_enabled = 1 AND nc.is_enabled = 1`,
		evt.Type)
	if err != nil {
		logger.Error().Err(err).Str("event", evt.Type).Msg("notification: query rules failed")
		return
	}
	defer rows.Close()

	panelURL := s.panelURL()

	for rows.Next() {
		var ch NotificationChannel
		if err := rows.Scan(&ch.ID, &ch.Type, &ch.Name, &ch.Config); err != nil {
			logger.Error().Err(err).Msg("notification: scan channel failed")
			continue
		}

		switch ch.Type {
		case "email":
			s.sendEmail(ch, evt, panelURL)
		case "telegram":
			s.sendTelegram(ch, evt)
		}
	}
}

func (s *NotificationService) sendEmail(ch NotificationChannel, evt NotificationEvent, panelURL string) {
	cfg, err := s.email.ParseConfig(ch.Config)
	if err != nil {
		s.logNotification(evt.Type, "email", "", evt.Title, "", "failed", err.Error())
		return
	}

	subject := fmt.Sprintf("[%s] %s", strings.ToUpper(evt.Severity), evt.Title)
	body := s.email.FormatEventEmail(evt.Type, evt.Severity, evt.Title, evt.Detail, panelURL)

	recipient := cfg.ToAddr
	if recipient == "" {
		recipient = cfg.Username
	}
	if err := s.email.Send(cfg, recipient, subject, body); err != nil {
		logger.Error().Err(err).Str("channel", ch.Name).Msg("notification: email send failed")
		s.logNotification(evt.Type, "email", recipient, subject, "", "failed", err.Error())
		return
	}
	s.logNotification(evt.Type, "email", recipient, subject, "", "sent", "")
}

func (s *NotificationService) sendTelegram(ch NotificationChannel, evt NotificationEvent) {
	cfg, err := s.telegram.ParseConfig(ch.Config)
	if err != nil {
		s.logNotification(evt.Type, "telegram", "", evt.Title, "", "failed", err.Error())
		return
	}

	msg := s.telegram.FormatEventMessage(evt.Type, evt.Severity, evt.Title, evt.Detail)
	if err := s.telegram.Send(cfg, msg); err != nil {
		logger.Error().Err(err).Str("channel", ch.Name).Msg("notification: telegram send failed")
		s.logNotification(evt.Type, "telegram", cfg.ChatID, evt.Title, msg, "failed", err.Error())
		return
	}
	s.logNotification(evt.Type, "telegram", cfg.ChatID, evt.Title, msg, "sent", "")
}

func (s *NotificationService) logNotification(eventType, channelType, recipient, subject, message, status, errMsg string) {
	_, err := s.db.Exec(`INSERT INTO notification_logs (event_type, channel_type, recipient, subject, message, status, error)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		eventType, channelType, recipient, subject, message, status, errMsg)
	if err != nil {
		logger.Error().Err(err).Msg("notification: failed to write log")
	}
}

func (s *NotificationService) panelURL() string {
	cfg := config.Get()
	scheme := "http"
	if cfg.Server.SSL {
		scheme = "https"
	}
	port := cfg.Server.Port
	host := cfg.Server.Host
	if host == "0.0.0.0" || host == "" {
		host = "localhost"
	}
	return fmt.Sprintf("%s://%s:%d", scheme, host, port)
}

// ---------------------------------------------------------------------------
// CRUD: Channels
// ---------------------------------------------------------------------------

// ListChannels returns all notification channels.
func (s *NotificationService) ListChannels() ([]NotificationChannel, error) {
	rows, err := s.db.Query(`SELECT id, type, name, config, is_enabled, created_at, updated_at FROM notification_channels ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []NotificationChannel
	for rows.Next() {
		var ch NotificationChannel
		var enabled int
		if err := rows.Scan(&ch.ID, &ch.Type, &ch.Name, &ch.Config, &enabled, &ch.CreatedAt, &ch.UpdatedAt); err != nil {
			return nil, err
		}
		ch.IsEnabled = enabled == 1
		ch.Config = maskSensitiveConfig(ch.Type, ch.Config)
		list = append(list, ch)
	}
	return list, nil
}

// GetChannel returns a single notification channel.
func (s *NotificationService) GetChannel(id int64) (*NotificationChannel, error) {
	var ch NotificationChannel
	var enabled int
	err := s.db.QueryRow(`SELECT id, type, name, config, is_enabled, created_at, updated_at FROM notification_channels WHERE id = ?`, id).
		Scan(&ch.ID, &ch.Type, &ch.Name, &ch.Config, &enabled, &ch.CreatedAt, &ch.UpdatedAt)
	if err != nil {
		return nil, err
	}
	ch.IsEnabled = enabled == 1
	return &ch, nil
}

// GetChannelRaw returns a channel with unmasked config (internal use).
func (s *NotificationService) GetChannelRaw(id int64) (*NotificationChannel, error) {
	var ch NotificationChannel
	var enabled int
	err := s.db.QueryRow(`SELECT id, type, name, config, is_enabled, created_at, updated_at FROM notification_channels WHERE id = ?`, id).
		Scan(&ch.ID, &ch.Type, &ch.Name, &ch.Config, &enabled, &ch.CreatedAt, &ch.UpdatedAt)
	if err != nil {
		return nil, err
	}
	ch.IsEnabled = enabled == 1
	return &ch, nil
}

// CriticalEventTypes returns event types that should be auto-enabled for new channels.
// These are the most important events that system admins should be alerted about.
func CriticalEventTypes() []string {
	return []string{
		EventCronFailed,
		EventSSLExpiryWarning,
		EventSSLExpired,
		EventBackupFailed,
		EventSoftwareInstallFail,
		EventDiskHigh,
		EventServiceDown,
		EventLoginFailed,
	}
}

// CreateChannel adds a new notification channel and auto-creates rules for critical events.
func (s *NotificationService) CreateChannel(chType, name, cfg string, enabled bool) (int64, error) {
	en := 0
	if enabled {
		en = 1
	}
	res, err := s.db.Exec(`INSERT INTO notification_channels (type, name, config, is_enabled) VALUES (?, ?, ?, ?)`,
		chType, name, cfg, en)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}

	// Auto-enable critical event rules for the new channel.
	if err := s.SetRules(id, CriticalEventTypes()); err != nil {
		logger.Warn().Err(err).Int64("channel", id).Msg("notification: failed to auto-create critical rules")
	}

	return id, nil
}

// UpdateChannel updates an existing notification channel.
func (s *NotificationService) UpdateChannel(id int64, name, cfg string, enabled bool) error {
	en := 0
	if enabled {
		en = 1
	}

	// If config is empty or has masked values, keep existing.
	if cfg == "" || strings.Contains(cfg, "***") {
		_, err := s.db.Exec(`UPDATE notification_channels SET name = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
			name, en, id)
		return err
	}
	_, err := s.db.Exec(`UPDATE notification_channels SET name = ?, config = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		name, cfg, en, id)
	return err
}

// DeleteChannel removes a notification channel and its rules.
func (s *NotificationService) DeleteChannel(id int64) error {
	_, err := s.db.Exec(`DELETE FROM notification_channels WHERE id = ?`, id)
	return err
}

// TestChannel sends a test notification via the specified channel.
func (s *NotificationService) TestChannel(id int64) error {
	ch, err := s.GetChannelRaw(id)
	if err != nil {
		return fmt.Errorf("channel not found: %w", err)
	}
	switch ch.Type {
	case "email":
		cfg, err := s.email.ParseConfig(ch.Config)
		if err != nil {
			return err
		}
		return s.email.TestConnection(cfg)
	case "telegram":
		cfg, err := s.telegram.ParseConfig(ch.Config)
		if err != nil {
			return err
		}
		return s.telegram.TestConnection(cfg)
	default:
		return fmt.Errorf("unknown channel type: %s", ch.Type)
	}
}

// TestEvent sends a sample notification for a specific event type through a channel.
func (s *NotificationService) TestEvent(channelID int64, eventType string) error {
	ch, err := s.GetChannelRaw(channelID)
	if err != nil {
		return fmt.Errorf("channel not found: %w", err)
	}

	sample := sampleEventData(eventType)
	severity := EventSeverity(eventType)

	switch ch.Type {
	case "email":
		cfg, err := s.email.ParseConfig(ch.Config)
		if err != nil {
			return err
		}
		to := cfg.ToAddr
		if to == "" {
			to = cfg.Username
		}
		subject := fmt.Sprintf("[%s] %s — %s", strings.ToUpper(severity), sample.title, "ITDLUPanel")
		body := s.email.FormatEventEmail(eventType, severity, sample.title, sample.detail, "")
		return s.email.Send(cfg, to, subject, body)

	case "telegram":
		cfg, err := s.telegram.ParseConfig(ch.Config)
		if err != nil {
			return err
		}
		text := s.telegram.FormatEventMessage(eventType, severity, sample.title, sample.detail)
		return s.telegram.Send(cfg, text)

	default:
		return fmt.Errorf("unknown channel type: %s", ch.Type)
	}
}

type sampleEvent struct {
	title  string
	detail string
}

func sampleEventData(eventType string) sampleEvent {
	samples := map[string]sampleEvent{
		"cron_success": {
			title:  "Cron Job Completed: Daily Backup",
			detail: "Task: Daily database backup\nDuration: 12.3s\nOutput: Backup created successfully (245 MB)",
		},
		"cron_failed": {
			title:  "Cron Job Failed: Cleanup Script",
			detail: "Task: /usr/local/bin/cleanup.sh\nExit Code: 1\nError: Permission denied: /var/log/app.log",
		},
		"ssl_expiry_warning": {
			title:  "SSL Certificate Expiring: example.com",
			detail: "Domain: example.com\nExpires: 2025-02-15 00:00:00 UTC\nDays Remaining: 7\nIssuer: Let's Encrypt Authority X3",
		},
		"ssl_expired": {
			title:  "SSL Certificate Expired: example.com",
			detail: "Domain: example.com\nExpired: 2025-01-30 00:00:00 UTC\nIssuer: Let's Encrypt Authority X3\nAction: Immediate renewal required",
		},
		"backup_completed": {
			title:  "Backup Completed: Full Server Backup",
			detail: "Type: Full backup\nSize: 1.24 GB\nDuration: 3m 42s\nDestination: /backup/server/2025-01-30.tar.gz",
		},
		"backup_failed": {
			title:  "Backup Failed: Database Backup",
			detail: "Type: Database backup\nError: Insufficient disk space\nRequired: 500 MB\nAvailable: 128 MB",
		},
		"software_installed": {
			title:  "Software Installed: Nginx 1.24.0",
			detail: "Package: nginx\nVersion: 1.24.0\nDuration: 45s\nStatus: Running",
		},
		"software_install_failed": {
			title:  "Software Install Failed: Redis",
			detail: "Package: redis-server\nError: Package dependency conflict\nDetails: libssl1.1 version mismatch",
		},
		"site_created": {
			title:  "Website Created: mysite.example.com",
			detail: "Domain: mysite.example.com\nPHP Version: 8.2\nDocument Root: /www/wwwroot/mysite.example.com",
		},
		"site_deleted": {
			title:  "Website Deleted: old-site.example.com",
			detail: "Domain: old-site.example.com\nBackup: Created before deletion\nFiles removed: 1,247",
		},
		"cpu_high": {
			title:  "High CPU Usage Alert: 95%",
			detail: "Current Usage: 95.2%\nThreshold: 90%\nTop Process: mysqld (PID: 1234) — 78.3%\nDuration: 5 minutes",
		},
		"memory_high": {
			title:  "High Memory Usage Alert: 92%",
			detail: "Used: 7.4 GB / 8 GB\nThreshold: 85%\nTop Process: java (PID: 5678) — 3.2 GB\nSwap: 1.2 GB / 2 GB",
		},
		"disk_high": {
			title:  "Disk Space Critical: /dev/sda1 at 96%",
			detail: "Partition: /dev/sda1 mounted at /\nUsed: 48 GB / 50 GB\nThreshold: 90%\nLargest Directory: /var/log (12 GB)",
		},
		"service_down": {
			title:  "Service Down: MySQL",
			detail: "Service: mysql\nStatus: inactive (dead)\nLast Active: 2 minutes ago\nAutomatic restart: Attempted, failed",
		},
		"login_failed": {
			title:  "Failed Login Attempt Detected",
			detail: "Username: admin\nIP Address: 203.0.113.42\nLocation: Unknown\nAttempts: 3 in last 5 minutes",
		},
	}

	if s, ok := samples[eventType]; ok {
		return s
	}
	return sampleEvent{
		title:  "Test Event: " + eventType,
		detail: "This is a sample notification for event type: " + eventType,
	}
}

// ---------------------------------------------------------------------------
// CRUD: Rules
// ---------------------------------------------------------------------------

// ListRules returns all notification rules.
func (s *NotificationService) ListRules() ([]NotificationRule, error) {
	rows, err := s.db.Query(`SELECT id, event_type, channel_id, is_enabled FROM notification_rules ORDER BY event_type, channel_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []NotificationRule
	for rows.Next() {
		var r NotificationRule
		var enabled int
		if err := rows.Scan(&r.ID, &r.EventType, &r.ChannelID, &enabled); err != nil {
			return nil, err
		}
		r.IsEnabled = enabled == 1
		list = append(list, r)
	}
	return list, nil
}

// SetRules replaces all rules for a channel with the provided set.
func (s *NotificationService) SetRules(channelID int64, eventTypes []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Remove existing rules for this channel.
	if _, err := tx.Exec(`DELETE FROM notification_rules WHERE channel_id = ?`, channelID); err != nil {
		return err
	}

	// Insert new rules.
	stmt, err := tx.Prepare(`INSERT INTO notification_rules (event_type, channel_id, is_enabled) VALUES (?, ?, 1)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, et := range eventTypes {
		if _, err := stmt.Exec(et, channelID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// UpdateRule toggles a single rule.
func (s *NotificationService) UpdateRule(id int64, enabled bool) error {
	en := 0
	if enabled {
		en = 1
	}
	_, err := s.db.Exec(`UPDATE notification_rules SET is_enabled = ? WHERE id = ?`, en, id)
	return err
}

// BulkUpsertRules creates or updates multiple rules at once.
// Each entry specifies a channel_id, event_type, and is_enabled flag.
func (s *NotificationService) BulkUpsertRules(rules []struct {
	ChannelID int64  `json:"channel_id"`
	EventType string `json:"event_type"`
	IsEnabled bool   `json:"is_enabled"`
}) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, r := range rules {
		en := 0
		if r.IsEnabled {
			en = 1
		}
		// Upsert: try update first, if no rows affected, insert.
		res, err := tx.Exec(`UPDATE notification_rules SET is_enabled = ? WHERE channel_id = ? AND event_type = ?`,
			en, r.ChannelID, r.EventType)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			_, err = tx.Exec(`INSERT INTO notification_rules (event_type, channel_id, is_enabled) VALUES (?, ?, ?)`,
				r.EventType, r.ChannelID, en)
			if err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

// ---------------------------------------------------------------------------
// CRUD: Logs
// ---------------------------------------------------------------------------

// ListLogs returns notification logs with pagination.
func (s *NotificationService) ListLogs(page, perPage int, channelType, eventType, status string) ([]NotificationLog, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}

	where := "1=1"
	args := []interface{}{}
	if channelType != "" {
		where += " AND channel_type = ?"
		args = append(args, channelType)
	}
	if eventType != "" {
		where += " AND event_type = ?"
		args = append(args, eventType)
	}
	if status != "" {
		where += " AND status = ?"
		args = append(args, status)
	}

	var total int
	err := s.db.QueryRow("SELECT COUNT(*) FROM notification_logs WHERE "+where, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	query := fmt.Sprintf("SELECT id, event_type, channel_type, COALESCE(recipient,''), COALESCE(subject,''), COALESCE(message,''), status, COALESCE(error,''), created_at FROM notification_logs WHERE %s ORDER BY id DESC LIMIT ? OFFSET ?", where)
	args = append(args, perPage, (page-1)*perPage)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var list []NotificationLog
	for rows.Next() {
		var l NotificationLog
		if err := rows.Scan(&l.ID, &l.EventType, &l.ChannelType, &l.Recipient, &l.Subject, &l.Message, &l.Status, &l.Error, &l.CreatedAt); err != nil {
			return nil, 0, err
		}
		list = append(list, l)
	}
	return list, total, nil
}

// ClearLogs deletes all notification logs.
func (s *NotificationService) ClearLogs() error {
	_, err := s.db.Exec("DELETE FROM notification_logs")
	return err
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func maskSensitiveConfig(chType, raw string) string {
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return raw
	}

	sensitiveKeys := []string{"password", "bot_token", "secret", "access_token", "refresh_token", "client_secret"}
	for _, key := range sensitiveKeys {
		if _, ok := m[key]; ok {
			if v, ok := m[key].(string); ok && v != "" {
				m[key] = "***"
			}
		}
	}

	out, _ := json.Marshal(m)
	return string(out)
}
