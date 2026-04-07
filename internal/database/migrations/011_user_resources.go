package migrations

import (
	"database/sql"
	"fmt"
)

// Migration011UserResources creates the user_resources table for row-level security.
type Migration011UserResources struct{}

func (m *Migration011UserResources) Version() int { return 11 }

func (m *Migration011UserResources) Up(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS user_resources (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		resource_type TEXT NOT NULL,
		resource_id INTEGER NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, resource_type, resource_id)
	)`)
	if err != nil {
		return fmt.Errorf("create user_resources table: %w", err)
	}

	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_user_resources_user ON user_resources(user_id, resource_type)`)
	if err != nil {
		return fmt.Errorf("create user_resources index: %w", err)
	}

	return nil
}
