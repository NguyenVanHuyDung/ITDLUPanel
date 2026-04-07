package migrations

import (
	"database/sql"
	"fmt"
)

// Migration012Notifications creates tables for the notification system.
type Migration012Notifications struct{}

func (m *Migration012Notifications) Version() int { return 12 }

func (m *Migration012Notifications) Up(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS notification_channels (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL,
			name TEXT NOT NULL,
			config TEXT NOT NULL DEFAULT '{}',
			is_enabled INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS notification_rules (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_type TEXT NOT NULL,
			channel_id INTEGER NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
			is_enabled INTEGER DEFAULT 1,
			UNIQUE(event_type, channel_id)
		)`,
		`CREATE TABLE IF NOT EXISTS notification_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_type TEXT NOT NULL,
			channel_type TEXT NOT NULL,
			recipient TEXT,
			subject TEXT,
			message TEXT,
			status TEXT DEFAULT 'pending',
			error TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return fmt.Errorf("migration 012 notifications: %w", err)
		}
	}
	return nil
}
