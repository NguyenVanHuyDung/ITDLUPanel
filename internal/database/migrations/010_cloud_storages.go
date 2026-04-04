package migrations

import (
	"database/sql"
	"fmt"
)

// Migration010CloudStorages creates the cloud_storages table.
type Migration010CloudStorages struct{}

func (m *Migration010CloudStorages) Version() int { return 10 }

func (m *Migration010CloudStorages) Up(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS cloud_storages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		type TEXT NOT NULL,
		config TEXT NOT NULL DEFAULT '{}',
		is_default INTEGER DEFAULT 0,
		is_active INTEGER DEFAULT 1,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("create cloud_storages table: %w", err)
	}
	return nil
}
