package migrations

import (
	"database/sql"
	"fmt"
)

// Migration019CronStorage extends the `crons` table so backup cron jobs
// (type = backup_site / backup_db) can target a cloud storage the same
// way aaPanel does — i.e. "Backup to: Google Drive" is a cron field,
// not an API parameter.
//
// Three new columns are added, all optional so the existing shell and
// URL crons are unaffected:
//   - storage_type: 'google_drive' | 's3' | 'onedrive' | 'ftp' | '' (local only)
//   - storage_id:   FK to cloud_storages (or ftp_storages — kept as a
//     plain int for now; the cron service resolves the right table by
//     storage_type at execution time)
//   - keep_local:   0/1 — when 1, the local backup file is kept after
//     cloud upload completes (matches aaPanel's "Keep Local Backup"
//     checkbox)
type Migration019CronStorage struct{}

func (m *Migration019CronStorage) Version() int { return 19 }

func (m *Migration019CronStorage) Up(db *sql.DB) error {
	stmts := []string{
		`ALTER TABLE crons ADD COLUMN storage_type TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE crons ADD COLUMN storage_id   INTEGER`,
		`ALTER TABLE crons ADD COLUMN keep_local   INTEGER NOT NULL DEFAULT 1`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return fmt.Errorf("migration 019 cron storage: %w", err)
		}
	}
	return nil
}
