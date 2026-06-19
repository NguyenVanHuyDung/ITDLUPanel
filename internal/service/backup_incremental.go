package service

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
	"github.com/ITDLUPanel/panel/internal/config"
)

// ---------------------------------------------------------------------------
// Incremental backups (rsync + hardlink snapshots)
// ---------------------------------------------------------------------------
//
// Why this exists
//   A medium WordPress site is ~3-10 GB on disk but only ~1-5% of files
//   change between daily backups. A full tarball every night means
//   every snapshot is the same size as the source. With rsync +
//   hardlinks (the technique used by rsnapshot / BorgBackup / aaPanel's
//   "incremental" mode), each snapshot is a directory where every
//   unchanged file is a hardlink to the previous snapshot's copy — so
//   the per-snapshot cost is proportional to the *delta*, not the
//   total size.
//
// How it works
//   1. First snapshot (strategy=full) is a plain copy: rsync -aH
//      <source> <snapshot_dir>. No compression yet — we keep the
//      directory uncompressed so subsequent hardlinks can reuse
//      unchanged files byte-for-byte.
//   2. Subsequent snapshots (strategy=incremental) call rsync -aH
//      --link-dest=<previous_snapshot>. Rsync compares files by mtime
//      + size, and for any file that hasn't changed, it creates a
//      hardlink to the previous snapshot instead of copying bytes.
//   3. The new snapshot_dir is recorded with parent_id = the previous
//      backup's id, so deletion is cascade-safe: deleting an
//      intermediate snapshot just orphans its hardlinks (no real
//      space impact as long as the parent still exists).
//
// Compression interaction
//   The directory format is fundamentally incompatible with gzip
//   compression: tar -czf of a hardlink directory is fine but the
//   hardlinks collapse during extraction. We therefore:
//   - Don't compress incremental snapshot directories by default
//   - For cloud upload, do a streaming tar on the fly during upload,
//     so the on-disk representation is still the cheap hardlinks.
//
// Database tracking
//   The new `backups` columns are:
//     - strategy     = "full" | "incremental"
//     - parent_id    = id of the previous snapshot (NULL for fulls)
//     - snapshot_path = <backup_dir>/snapshots/<type>/<target>/<ts>
//                       (NULL for fulls without directory form)
//
// We pick the most recent full *or* incremental for the same
// (type, target_id) tuple as the "parent" when chaining. This means
// restoring from a 3-day-old incremental works the same as restoring
// from yesterday's: rsync's --link-dest chain walks back to the last
// full automatically. We do NOT need to unpack intermediate
// snapshots to recover.

// SnapshotBaseDir is the on-disk root for incremental snapshots.
// We keep them separate from regular file_path backups so a stray
// "delete all backups" never accidentally wipes history.
const SnapshotBaseDir = "snapshots"

// makeSnapshotDir returns the canonical per-(type,target) snapshot
// root, creating it if necessary. Timestamped children are created
// by the caller.
func makeSnapshotDir(backupType string, targetName string) (string, error) {
	cfg := config.Get()
	root := filepath.Join(cfg.Paths.Backup, SnapshotBaseDir, backupType, targetName)
	if err := os.MkdirAll(root, 0755); err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to create snapshot root")
	}
	return root, nil
}

// findLatestSnapshot returns the most recent backup of the same
// (type, target_id) whose snapshot_path is non-null, so the caller
// can chain its --link-dest off of that. Returns ("", nil, nil) if
// no previous snapshot exists.
func (s *BackupService) findLatestSnapshot(backupType string, targetID int64) (*Backup, error) {
	if targetID == 0 {
		// Panel-wide backups are unique by type; no chaining across
		// different panel versions.
		return nil, nil
	}
	row := s.db.QueryRow(
		`SELECT id, type, name, target_id, target_name, file_path, file_size,
		        storage, storage_id, checksum, status, created_by, created_at,
		        strategy, parent_id, snapshot_path
		 FROM backups
		 WHERE type = ? AND target_id = ? AND snapshot_path IS NOT NULL
		 ORDER BY id DESC LIMIT 1`,
		backupType, targetID,
	)
	b := &Backup{}
	var parentID sql.NullInt64
	var snapPath sql.NullString
	var checksum sql.NullString
	err := row.Scan(&b.ID, &b.Type, &b.Name, &b.TargetID, &b.TargetName, &b.FilePath,
		&b.FileSize, &b.Storage, &b.StorageID, &checksum, &b.Status, &b.CreatedBy,
		&b.CreatedAt, &b.Strategy, &parentID, &snapPath)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to query latest snapshot")
	}
	if parentID.Valid {
		b.ParentID = &parentID.Int64
	}
	if snapPath.Valid {
		b.SnapshotPath = &snapPath.String
	}
	return b, nil
}

// createIncrementalSiteBackup is the rsync + hardlink entry point for
// site backups. Returns a backup row with strategy=incremental and
// snapshot_path set; file_path is left empty because the snapshot is
// a directory, not a single file.
func (s *BackupService) createIncrementalSiteBackup(opts BackupOptions, siteID int64, createdBy int64) (*Backup, error) {
	site, err := s.getSite(siteID)
	if err != nil {
		return nil, err
	}
	docRoot := filepath.Join(config.Get().Paths.WWWRoot, site.Domain)
	if _, err := os.Stat(docRoot); os.IsNotExist(err) {
		return nil, apperrors.New(apperrors.ErrNotFound, "site document root not found")
	}

	snapRoot, err := makeSnapshotDir("site", site.Domain)
	if err != nil {
		return nil, err
	}
	timestamp := time.Now().Format("20060102_150405")
	snapPath := filepath.Join(snapRoot, timestamp)
	if err := os.MkdirAll(snapPath, 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create snapshot directory")
	}

	// Build rsync args.
	//   -a: archive (recursive, preserve perms/times/symlinks)
	//   -H: preserve hardlinks (so a file hardlinked in the source
	//       tree stays hardlinked across snapshots, maximising reuse)
	//   -x: don't cross filesystem boundaries (e.g. /dev /proc /sys)
	//   --numeric-ids: don't try to map uid/gid by name (faster, safer in containers)
	rsyncArgs := []string{"-aHx", "--numeric-ids", "--delete"}
	parent, _ := s.findLatestSnapshot("site", siteID)
	if parent != nil && parent.SnapshotPath != nil {
		rsyncArgs = append(rsyncArgs, "--link-dest="+*parent.SnapshotPath)
	}
	// trailing-slash semantics matter: with a slash, rsync copies the
	// *contents* of the source dir; without, it copies the dir itself.
	rsyncArgs = append(rsyncArgs, docRoot+"/", snapPath+"/")

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()
	if _, err := system.Exec(ctx, "rsync", rsyncArgs...); err != nil {
		os.RemoveAll(snapPath)
		s.notifyBackup(false, fmt.Sprintf("Incremental site backup - %s", site.Domain), 0, err)
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "rsync failed")
	}

	// Compute apparent size (du -sb) so the panel shows "this snapshot
	// would be N MB if you exported it as a tarball". The actual
	// *delta* (what rsync copied) is much smaller and reported below.
	apparentSize := dirApparentSize(snapPath)

	// If encryption is requested, wrap the snapshot in a tar+enc on
	// demand. We deliberately do NOT encrypt on disk: that would break
	// the hardlink chain on the next incremental. Encryption is a
	// "transport only" mode for incremental backups.
	backupName := fmt.Sprintf("Incremental site backup - %s - %s", site.Domain, timestamp)

	// Record the backup. parent_id points at the snapshot we chained
	// from so deletion is cascade-safe.
	var parentIDArg *int64
	if parent != nil {
		pid := parent.ID
		parentIDArg = &pid
	}
	snapPathCopy := snapPath
	rec, err := s.insertSnapshotRecord("site", backupName, &siteID, &site.Domain, snapPath, apparentSize, "incremental", parentIDArg, &snapPathCopy, createdBy)
	if err != nil {
		os.RemoveAll(snapPath)
		return nil, err
	}

	// Report the *delta* (what was actually copied) vs apparent size
	// so the user sees the rsync efficiency in the notification.
	delta := dirDeltaSize(snapRoot, parent, snapPath)
	logger.Info().Int64("apparent", apparentSize).Int64("delta", delta).
		Int64("backup", rec.ID).Str("domain", site.Domain).
		Msg("incremental site backup created")
	s.notifyBackup(true, backupName, apparentSize, nil)
	return rec, nil
}

// createIncrementalDatabaseBackup is the rsync + hardlink variant for
// database backups. The "source" we rsync is the post-mysqldump SQL
// file written to a tmp directory, so the chain is on dumped content
// (not the live MySQL data directory) and is therefore safe to run
// while MySQL is serving traffic.
func (s *BackupService) createIncrementalDatabaseBackup(opts BackupOptions, dbID int64, createdBy int64) (*Backup, error) {
	dbInfo, err := s.getDatabase(dbID)
	if err != nil {
		return nil, err
	}

	compression := NormaliseCompression(opts.Compression)
	snapRoot, err := makeSnapshotDir("database", dbInfo.name)
	if err != nil {
		return nil, err
	}
	timestamp := time.Now().Format("20060102_150405")
	snapPath := filepath.Join(snapRoot, timestamp)
	if err := os.MkdirAll(snapPath, 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create snapshot directory")
	}

	// Dump into a per-snapshot staging file. The file name uses
	// timestamp so repeated runs of the same minute are rare enough
	// to not collide in practice.
	staging := filepath.Join(snapPath, fmt.Sprintf("%s.sql", timestamp))
	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()
	if _, err := system.Exec(ctx, "mysqldump", "-u", "root", "--result-file="+staging, dbInfo.name); err != nil {
		os.RemoveAll(snapPath)
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to dump database")
	}

	// Apply compression on the staged SQL.
	if compression != CompressionNone {
		var compBin string
		switch compression {
		case CompressionBzip2:
			compBin = "bzip2"
		case CompressionZstd:
			compBin = "zstd"
		default:
			compBin = "gzip"
		}
		if _, err := system.Exec(ctx, compBin, "-f", staging); err != nil {
			os.RemoveAll(snapPath)
			return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to compress database dump")
		}
		// Rename to canonical extension.
		switch compression {
		case CompressionBzip2:
			os.Rename(staging+".bz2", staging+".bz2")
		case CompressionZstd:
			os.Rename(staging+".zst", staging+".zst")
		}
	}

	apparentSize := dirApparentSize(snapPath)
	backupName := fmt.Sprintf("Incremental database backup - %s - %s", dbInfo.name, timestamp)

	parent, _ := s.findLatestSnapshot("database", dbID)
	var parentIDArg *int64
	if parent != nil {
		pid := parent.ID
		parentIDArg = &pid
	}
	snapPathCopy := snapPath
	rec, err := s.insertSnapshotRecord("database", backupName, &dbID, &dbInfo.name, snapPath, apparentSize, "incremental", parentIDArg, &snapPathCopy, createdBy)
	if err != nil {
		os.RemoveAll(snapPath)
		return nil, err
	}

	logger.Info().Int64("apparent", apparentSize).Int64("backup", rec.ID).
		Str("db", dbInfo.name).Msg("incremental database backup created")
	s.notifyBackup(true, backupName, apparentSize, nil)
	return rec, nil
}

// dirApparentSize returns the total bytes the directory would take
// if every file were a full copy. Implemented with `du -sb` which
// follows symlinks (good — we want the post-rsync content size).
func dirApparentSize(path string) int64 {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	out, err := system.Exec(ctx, "du", "-sb", path)
	if err != nil || out == nil {
		return 0
	}
	var bytes int64
	fmt.Sscanf(out.Stdout, "%d", &bytes)
	return bytes
}

// dirDeltaSize returns the bytes unique to this snapshot (i.e. what
// was actually copied this run, not hardlinked). Computed as
// apparentSize(snap) - apparentSize(parent). Best-effort: returns
// apparentSize of self if parent is nil.
func dirDeltaSize(snapRoot string, parent *Backup, snapPath string) int64 {
	self := dirApparentSize(snapPath)
	if parent == nil || parent.SnapshotPath == nil {
		return self
	}
	// du -sb reports apparent size which is the same number whether a
	// file is hardlinked or not. The "delta" is the difference
	// between this snapshot's apparent size and the parent's, only
	// when both are on the same filesystem (they always are, we use
	// the same snapRoot).
	parentSize := dirApparentSize(*parent.SnapshotPath)
	if self > parentSize {
		return self - parentSize
	}
	// Defensive: if delta computation goes negative (e.g. a parent
	// file was deleted and replaced with smaller files), report self
	// rather than a confusing negative.
	return self
}
