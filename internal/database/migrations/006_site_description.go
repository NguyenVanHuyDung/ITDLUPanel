package migrations

import (
	"database/sql"
	"fmt"
	"strings"
)

type Migration006SiteDescription struct{}

func (m *Migration006SiteDescription) Version() int {
	return 6
}

func (m *Migration006SiteDescription) Up(db *sql.DB) error {
	stmts := []string{
		"ALTER TABLE sites ADD COLUMN description TEXT DEFAULT ''",
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
