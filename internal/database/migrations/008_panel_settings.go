package migrations

import (
	"database/sql"
	"fmt"
	"strings"
)

// Migration008PanelSettings adds panel_name and timezone settings.
type Migration008PanelSettings struct{}

func (m *Migration008PanelSettings) Version() int { return 8 }

func (m *Migration008PanelSettings) Up(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	newSettings := []struct {
		key, value, description string
	}{
		{"panel_name", "ITDLUPanel", "Panel display name"},
		{"timezone", "UTC", "Server timezone"},
	}

	for _, s := range newSettings {
		_, err := tx.Exec(
			"INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)",
			s.key, s.value, s.description,
		)
		if err != nil {
			if strings.Contains(err.Error(), "already exists") {
				continue
			}
			return fmt.Errorf("insert setting %s: %w", s.key, err)
		}
	}

	return tx.Commit()
}
