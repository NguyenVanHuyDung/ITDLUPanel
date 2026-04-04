package migrations

import (
	"database/sql"
	"fmt"
	"strings"
)

// Migration009FTPStorage creates the ftp_storages table and adds storage_id to backups.
type Migration009FTPStorage struct{}

func (m *Migration009FTPStorage) Version() int { return 9 }

func (m *Migration009FTPStorage) Up(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	_, err = tx.Exec(`CREATE TABLE IF NOT EXISTS ftp_storages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		host TEXT NOT NULL,
		port INTEGER DEFAULT 21,
		username TEXT NOT NULL,
		password TEXT NOT NULL,
		remote_path TEXT DEFAULT '/',
		is_default INTEGER DEFAULT 0,
		is_active INTEGER DEFAULT 1,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("create ftp_storages table: %w", err)
	}

	// Add storage_id column to backups table
	_, err = tx.Exec(`ALTER TABLE backups ADD COLUMN storage_id INTEGER REFERENCES ftp_storages(id)`)
	if err != nil {
		if !strings.Contains(err.Error(), "duplicate column") && !strings.Contains(err.Error(), "already exists") {
			return fmt.Errorf("alter backups table: %w", err)
		}
	}

	return tx.Commit()
}
