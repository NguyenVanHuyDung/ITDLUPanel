package migrations

import (
	"database/sql"
	"fmt"
	"strings"
)

// Migration007Permissions adds granular permission support and user-site assignments.
type Migration007Permissions struct{}

func (m *Migration007Permissions) Version() int { return 7 }

func (m *Migration007Permissions) Up(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	stmts := []string{
		// User-site assignment table for hosting-style scoping
		`CREATE TABLE IF NOT EXISTS user_sites (
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
			PRIMARY KEY (user_id, site_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_user_sites_user ON user_sites(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_user_sites_site ON user_sites(site_id)`,

		// Add is_system flag to roles (system roles can't be deleted)
		`ALTER TABLE roles ADD COLUMN is_system INTEGER DEFAULT 0`,

		// Mark built-in roles as system
		`UPDATE roles SET is_system = 1 WHERE name IN ('admin', 'operator', 'viewer')`,

		// Add created_at/updated_at to roles (constant defaults for SQLite)
		`ALTER TABLE roles ADD COLUMN created_at TEXT DEFAULT '2025-01-01 00:00:00'`,
		`ALTER TABLE roles ADD COLUMN updated_at TEXT DEFAULT '2025-01-01 00:00:00'`,
	}

	for _, s := range stmts {
		if _, err := tx.Exec(s); err != nil {
			if strings.Contains(err.Error(), "duplicate column") {
				continue
			}
			if strings.Contains(err.Error(), "already exists") {
				continue
			}
			return fmt.Errorf("exec %q: %w", s[:min(len(s), 60)], err)
		}
	}

	return tx.Commit()
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
