package migrations

import (
	"database/sql"
	"fmt"
)

// Migration020IncrementalBackups extends the `backups` table to support
// rsync + hardlink-based incremental backups (the technique used by
// rsnapshot and aaPanel's "incremental" mode).
//
// New columns:
//   - strategy: "full" (default) or "incremental". A full backup is
//     a self-contained tarball; an incremental backup is a directory
//     of files where unchanged files are hardlinks to the previous
//     full backup, and only changed files consume real disk space.
//   - parent_id: when strategy=incremental, points to the most recent
//     full or incremental backup of the same target. NULL for fulls.
//   - snapshot_path: for incremental backups, the directory holding
//     the snapshot on disk. NULL for fulls (which live in file_path).
//
// Hardlinks work across the same filesystem only. We keep all
// snapshots under `<backup_dir>/snapshots/<type>/<target>/` so the
// rename is always intra-filesystem.
type Migration020IncrementalBackups struct{}

func (m *Migration020IncrementalBackups) Version() int { return 20 }

func (m *Migration020IncrementalBackups) Up(db *sql.DB) error {
	stmts := []string{
		`ALTER TABLE backups ADD COLUMN strategy       TEXT NOT NULL DEFAULT 'full'`,
		`ALTER TABLE backups ADD COLUMN parent_id      INTEGER REFERENCES backups(id) ON DELETE SET NULL`,
		`ALTER TABLE backups ADD COLUMN snapshot_path  TEXT`,
		`CREATE INDEX IF NOT EXISTS idx_backups_parent ON backups(parent_id)`,
		`CREATE INDEX IF NOT EXISTS idx_backups_target_strategy ON backups(type, target_id, strategy)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return fmt.Errorf("migration 020 incremental backups: %w", err)
		}
	}
	return nil
}
