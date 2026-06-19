package migrations

import (
	"database/sql"
	"fmt"
)

// Migration018BackupUploads adds the backup_uploads table that powers the
// async + resumable cloud upload pipeline.
//
// One row per upload attempt. The combination of (backup_id, storage_id)
// is unique so a retry creates a fresh row instead of overwriting history.
//
// Why a separate table:
//   - The existing backups table is updated to "local+<type>" on success,
//     but we also need a per-attempt audit trail (who retried, when,
//     where it failed mid-flight, how much data was transferred).
//   - Storing the Google Drive resumable session_uri lets us pick up
//     a crashed upload from the last successful chunk instead of
//     starting from byte 0.
type Migration018BackupUploads struct{}

func (m *Migration018BackupUploads) Version() int { return 18 }

func (m *Migration018BackupUploads) Up(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS backup_uploads (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			backup_id       INTEGER NOT NULL,
			storage_id      INTEGER NOT NULL,
			storage_type    TEXT    NOT NULL,
			status          TEXT    NOT NULL DEFAULT 'pending',
			bytes_uploaded  INTEGER NOT NULL DEFAULT 0,
			bytes_total     INTEGER NOT NULL DEFAULT 0,
			progress_pct    REAL    NOT NULL DEFAULT 0,
			error_message   TEXT,
			remote_url      TEXT,
			remote_file_id  TEXT,
			started_at      DATETIME,
			completed_at    DATETIME,
			created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(backup_id, storage_id),
			FOREIGN KEY (backup_id)  REFERENCES backups(id)         ON DELETE CASCADE,
			FOREIGN KEY (storage_id) REFERENCES cloud_storages(id)  ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_backup_uploads_backup  ON backup_uploads(backup_id)`,
		`CREATE INDEX IF NOT EXISTS idx_backup_uploads_status  ON backup_uploads(status)`,
		`CREATE INDEX IF NOT EXISTS idx_backup_uploads_created ON backup_uploads(created_at DESC)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return fmt.Errorf("migration 018 backup uploads: %w", err)
		}
	}
	return nil
}
