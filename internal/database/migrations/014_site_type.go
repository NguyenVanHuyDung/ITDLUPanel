package migrations

import (
	"database/sql"
	"fmt"
	"strings"
)

type Migration014SiteType struct{}

func (m *Migration014SiteType) Version() int {
	return 14
}

func (m *Migration014SiteType) Up(db *sql.DB) error {
	stmts := []string{
		"ALTER TABLE sites ADD COLUMN site_type TEXT DEFAULT 'php'",
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
