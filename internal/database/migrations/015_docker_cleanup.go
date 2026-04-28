package migrations

import (
	"database/sql"
	"fmt"
)

// Migration015DockerCleanup creates tables for Docker auto-cleanup rules and logs.
type Migration015DockerCleanup struct{}

func (m *Migration015DockerCleanup) Version() int { return 15 }

func (m *Migration015DockerCleanup) Up(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS docker_cleanup_rules (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			name          TEXT    NOT NULL,
			cleanup_types TEXT    NOT NULL DEFAULT '[]',
			mode          TEXT    NOT NULL DEFAULT 'manual',
			schedule      TEXT,
			threshold_pct INTEGER,
			enabled       INTEGER NOT NULL DEFAULT 1,
			keep_last_log INTEGER NOT NULL DEFAULT 10,
			created_by    INTEGER REFERENCES users(id),
			created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS docker_cleanup_logs (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			rule_id         INTEGER REFERENCES docker_cleanup_rules(id) ON DELETE SET NULL,
			triggered_by    TEXT    NOT NULL DEFAULT 'manual',
			started_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			finished_at     DATETIME,
			space_reclaimed INTEGER NOT NULL DEFAULT 0,
			items_removed   TEXT    NOT NULL DEFAULT '{}',
			errors          TEXT    NOT NULL DEFAULT '[]',
			status          TEXT    NOT NULL DEFAULT 'running'
		)`,
		`CREATE INDEX IF NOT EXISTS idx_cleanup_logs_rule_id ON docker_cleanup_logs(rule_id)`,
		`CREATE INDEX IF NOT EXISTS idx_cleanup_logs_started ON docker_cleanup_logs(started_at DESC)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return fmt.Errorf("migration 015 docker cleanup: %w", err)
		}
	}
	return nil
}
