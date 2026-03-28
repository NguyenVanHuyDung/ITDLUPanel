package migrations

import (
	"database/sql"
	"fmt"
	"strings"
)

// Migration005DiskQuota adds disk quota columns to sites and databases.
type Migration005DiskQuota struct{}

// Version returns the migration version number.
func (m *Migration005DiskQuota) Version() int {
	return 5
}

// Up applies the migration.
func (m *Migration005DiskQuota) Up(db *sql.DB) error {
	stmts := []string{
		"ALTER TABLE sites ADD COLUMN disk_quota INTEGER DEFAULT 0",
		"ALTER TABLE sites ADD COLUMN disk_usage INTEGER DEFAULT 0",
		"ALTER TABLE databases ADD COLUMN disk_quota INTEGER DEFAULT 0",
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			if !strings.Contains(err.Error(), "duplicate column") {
				return fmt.Errorf("failed to execute migration: %w", err)
			}
		}
	}
	return nil
}
