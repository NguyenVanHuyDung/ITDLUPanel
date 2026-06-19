package service

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/config"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Backup represents a backup record from the backups table.
type Backup struct {
	ID           int64   `json:"id"`
	Type         string  `json:"type"`
	Name         string  `json:"name"`
	TargetID     *int64  `json:"target_id"`
	TargetName   *string `json:"target_name"`
	FilePath     string  `json:"file_path"`
	FileSize     int64   `json:"file_size"`
	Storage      string  `json:"storage"`
	StorageID    *int64  `json:"storage_id"`
	Checksum     *string `json:"checksum"`
	Status       string  `json:"status"`
	CreatedBy    *int64  `json:"created_by"`
	CreatedAt    string  `json:"created_at"`
	Strategy     string  `json:"strategy"`
	ParentID     *int64  `json:"parent_id"`
	SnapshotPath *string `json:"snapshot_path"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const backupCmdTimeout = 5 * time.Minute

// BackupService manages backup creation, listing, deletion, and restore.
type BackupService struct {
	db                  *sql.DB
	ftpStorageService   *FTPStorageService
	cloudStorageService *CloudStorageService
	uploadService       *BackupUploadService
	notifier            *NotificationService
}

// NewBackupService creates a new BackupService.
func NewBackupService(db *sql.DB, ftpStorageService *FTPStorageService, cloudStorageService *CloudStorageService) *BackupService {
	return &BackupService{db: db, ftpStorageService: ftpStorageService, cloudStorageService: cloudStorageService}
}

// SetUploadService wires the async upload service so Create can enqueue
// background uploads.
func (s *BackupService) SetUploadService(u *BackupUploadService) { s.uploadService = u }

// SetNotifier sets the notification service for event dispatching.
func (s *BackupService) SetNotifier(n *NotificationService) { s.notifier = n }

// ---------------------------------------------------------------------------
// Cloud upload (delegated to BackupUploadService)
// ---------------------------------------------------------------------------

// StartCloudUpload enqueues an async upload of an existing backup to a
// cloud storage. Convenience wrapper around BackupUploadService.
func (s *BackupService) StartCloudUpload(backupID, storageID int64) (*BackupUpload, error) {
	if s.uploadService == nil {
		return nil, apperrors.New(apperrors.ErrInternal, "upload service not available")
	}
	return s.uploadService.StartUpload(backupID, storageID)
}

// ListUploads returns all upload attempts for a backup.
func (s *BackupService) ListUploads(backupID int64) ([]*BackupUpload, error) {
	if s.uploadService == nil {
		return nil, apperrors.New(apperrors.ErrInternal, "upload service not available")
	}
	return s.uploadService.ListByBackup(backupID)
}

// GetUpload returns a single upload by id.
func (s *BackupService) GetUpload(uploadID int64) (*BackupUpload, error) {
	if s.uploadService == nil {
		return nil, apperrors.New(apperrors.ErrInternal, "upload service not available")
	}
	return s.uploadService.GetByID(uploadID)
}

// CancelUpload marks an upload as cancelled.
func (s *BackupService) CancelUpload(uploadID int64) error {
	if s.uploadService == nil {
		return apperrors.New(apperrors.ErrInternal, "upload service not available")
	}
	return s.uploadService.Cancel(uploadID)
}

func (s *BackupService) notifyBackup(ok bool, name string, size int64, err error) {
	if s.notifier == nil {
		return
	}
	if ok {
		s.notifier.Notify(NotificationEvent{Type: EventBackupCompleted, Title: name, Detail: fmt.Sprintf("Size: %s", formatBytes(size))})
	} else {
		detail := ""
		if err != nil {
			detail = err.Error()
		}
		s.notifier.Notify(NotificationEvent{Type: EventBackupFailed, Title: name, Detail: detail})
	}
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

// ---------------------------------------------------------------------------
// Create backups
// ---------------------------------------------------------------------------

// CreateSiteBackup archives a website's document root into a tarball.
func (s *BackupService) CreateSiteBackup(siteID int64, createdBy int64) (*Backup, error) {
	return s.CreateSiteBackupWithOpts(BackupOptions{}, siteID, createdBy)
}

// BackupOptions tweaks backup creation behaviour. The zero value gives
// the same behaviour as before the option struct existed.
type BackupOptions struct {
	Compression string // "" or "gzip" → gzip; "bzip2" → bzip2; "zstd" → zstd; "none" → no compression
	EncryptPass string // "" → no encryption; otherwise AES-256-GCM passphrase
	Strategy    string // "full" (default) or "incremental" — incremental uses rsync+hardlinks
}

// CreateSiteBackupWithOpts is the same as CreateSiteBackup but takes a
// BackupOptions struct (currently Compression + optional encryption).
//
// When opts.Strategy == "incremental" we route to the rsync+hardlink
// path which stores a directory snapshot, not a single tarball.
func (s *BackupService) CreateSiteBackupWithOpts(opts BackupOptions, siteID int64, createdBy int64) (*Backup, error) {
	if opts.Strategy == "incremental" {
		return s.createIncrementalSiteBackup(opts, siteID, createdBy)
	}

	site, err := s.getSite(siteID)
	if err != nil {
		return nil, err
	}

	cfg := config.Get()
	backupDir := filepath.Join(cfg.Paths.Backup, "site")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create backup directory")
	}

	compression := NormaliseCompression(opts.Compression)
	ext := compressionExt(compression)
	timestamp := time.Now().Format("20060102_150405")
	fileName := fmt.Sprintf("%s_%s.tar%s", site.Domain, timestamp, ext)
	backupPath := filepath.Join(backupDir, fileName)

	docRoot := filepath.Join(cfg.Paths.WWWRoot, site.Domain)
	if _, err := os.Stat(docRoot); os.IsNotExist(err) {
		return nil, apperrors.New(apperrors.ErrNotFound, "site document root not found")
	}

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	tarArgs := compressArgs(compression)
	tarArgs = append(tarArgs, backupPath, "-C", cfg.Paths.WWWRoot, site.Domain)
	if _, err := system.Exec(ctx, "tar", tarArgs...); err != nil {
		s.notifyBackup(false, fmt.Sprintf("Site backup - %s", site.Domain), 0, err)
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create site backup")
	}

	finalPath := backupPath
	if opts.EncryptPass != "" {
		encPath := backupPath + ".enc"
		if _, err := encryptFile(backupPath, encPath, opts.EncryptPass); err != nil {
			os.Remove(backupPath)
			return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to encrypt site backup")
		}
		os.Remove(backupPath)
		finalPath = encPath
	}

	fileSize := fileSize(finalPath)
	backupName := fmt.Sprintf("Site backup - %s", site.Domain)

	rec, err := s.insertRecord("site", backupName, &siteID, &site.Domain, finalPath, fileSize, createdBy)
	if err != nil {
		return nil, err
	}
	s.notifyBackup(true, backupName, fileSize, nil)
	return rec, nil
}

// CreateDatabaseBackup creates a mysqldump of the specified database.
func (s *BackupService) CreateDatabaseBackup(dbID int64, createdBy int64) (*Backup, error) {
	return s.CreateDatabaseBackupWithOpts(BackupOptions{}, dbID, createdBy)
}

// CreateDatabaseBackupWithOpts is the same as CreateDatabaseBackup but
// takes a BackupOptions struct.
//
// When opts.Strategy == "incremental" we route to the rsync+hardlink
// path which stores a directory snapshot.
func (s *BackupService) CreateDatabaseBackupWithOpts(opts BackupOptions, dbID int64, createdBy int64) (*Backup, error) {
	if opts.Strategy == "incremental" {
		return s.createIncrementalDatabaseBackup(opts, dbID, createdBy)
	}

	dbInfo, err := s.getDatabase(dbID)
	if err != nil {
		return nil, err
	}

	cfg := config.Get()
	backupDir := filepath.Join(cfg.Paths.Backup, "database")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create backup directory")
	}

	compression := NormaliseCompression(opts.Compression)
	timestamp := time.Now().Format("20060102_150405")
	sqlFile := filepath.Join(backupDir, fmt.Sprintf("%s_%s.sql", dbInfo.name, timestamp))

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	// Dump database to file.
	if _, err := system.Exec(ctx, "mysqldump", "-u", "root", "--result-file="+sqlFile, dbInfo.name); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to dump database")
	}

	// Compress (or skip if compression=none).
	var finalFile string
	if compression == CompressionNone {
		finalFile = sqlFile
	} else {
		var compBin string
		switch compression {
		case CompressionBzip2:
			compBin = "bzip2"
		case CompressionZstd:
			compBin = "zstd"
		default:
			compBin = "gzip"
		}
		// All three compressors accept the source file path and write
		// `<source>.<ext>` next to it (bzip2, zstd) or replace it
		// (gzip -f). We move/replace to the canonical extension
		// expected by the rest of the pipeline.
		if _, err := system.Exec(ctx, compBin, "-f", sqlFile); err != nil {
			os.Remove(sqlFile)
			return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to compress database backup")
		}
		// After gzip -f, the .sql file is gone and replaced with .sql.gz.
		// After bzip2/zstd, the .sql file stays and a .sql.bz2/.sql.zst
		// is created next to it. Normalise to one extension so the
		// filename we record matches what's actually on disk.
		switch compression {
		case CompressionBzip2:
			os.Rename(sqlFile+".bz2", sqlFile+".bz2")
		case CompressionZstd:
			os.Rename(sqlFile+".zst", sqlFile+".zst")
		}
		// Pick whichever file actually exists.
		for _, ext := range []string{".gz", ".bz2", ".zst"} {
			cand := sqlFile + ext
			if _, err := os.Stat(cand); err == nil {
				finalFile = cand
				break
			}
		}
		if finalFile == "" {
			return nil, apperrors.New(apperrors.ErrInternal, "compressor did not produce expected output")
		}
	}

	finalPath := finalFile
	if opts.EncryptPass != "" {
		encPath := finalFile + ".enc"
		if _, err := encryptFile(finalFile, encPath, opts.EncryptPass); err != nil {
			os.Remove(finalFile)
			return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to encrypt database backup")
		}
		os.Remove(finalFile)
		finalPath = encPath
	}

	size := fileSize(finalPath)
	backupName := fmt.Sprintf("Database backup - %s", dbInfo.name)

	rec, err := s.insertRecord("database", backupName, &dbID, &dbInfo.name, finalPath, size, createdBy)
	if err != nil {
		return nil, err
	}
	s.notifyBackup(true, backupName, size, nil)
	return rec, nil
}

// CreatePanelBackup archives the panel config directory and SQLite database.
func (s *BackupService) CreatePanelBackup(createdBy int64) (*Backup, error) {
	return s.CreatePanelBackupWithOpts(BackupOptions{}, createdBy)
}

// CreatePanelBackupWithOpts is the same as CreatePanelBackup but takes a
// BackupOptions struct (currently Compression).
func (s *BackupService) CreatePanelBackupWithOpts(opts BackupOptions, createdBy int64) (*Backup, error) {
	cfg := config.Get()
	backupDir := filepath.Join(cfg.Paths.Backup, "panel")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create backup directory")
	}

	compression := NormaliseCompression(opts.Compression)
	timestamp := time.Now().Format("20060102_150405")
	ext := compressionExt(compression)
	fileName := fmt.Sprintf("panel_%s.tar%s", timestamp, ext)
	backupPath := filepath.Join(backupDir, fileName)

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	// Archive panel config, data, and server directory (software configs/data).
	// -h follows symlinks so actual config files are archived.
	tarArgs := compressArgs(compression)
	tarArgs = append(tarArgs, backupPath, "-h", "-C", cfg.Paths.Base, "config", "data")
	// Include server dir if it exists (contains software configs via symlinks)
	serverDir := filepath.Join(cfg.Paths.Base, "server")
	if _, err := os.Stat(serverDir); err == nil {
		tarArgs = append(tarArgs, "server")
	}
	if _, err := system.Exec(ctx, "tar", tarArgs...); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create panel backup")
	}

	size := fileSize(backupPath)
	backupName := fmt.Sprintf("Panel backup - %s", timestamp)

	rec, err := s.insertRecord("panel", backupName, nil, nil, backupPath, size, createdBy)
	if err != nil {
		return nil, err
	}
	s.notifyBackup(true, backupName, size, nil)
	return rec, nil
}

// ---------------------------------------------------------------------------
// List / Get
// ---------------------------------------------------------------------------

// List returns a paginated list of backups, optionally filtered by type and target_id.
func (s *BackupService) List(page, pageSize int, backupType string, targetID int64) ([]*Backup, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	where := ""
	args := []any{}
	if backupType != "" {
		where = " WHERE type = ?"
		args = append(args, backupType)
	}
	if targetID > 0 {
		if where == "" {
			where = " WHERE target_id = ?"
		} else {
			where += " AND target_id = ?"
		}
		args = append(args, targetID)
	}

	var total int
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	if err := s.db.QueryRow("SELECT COUNT(*) FROM backups"+where, countArgs...).Scan(&total); err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to count backups")
	}

	offset := (page - 1) * pageSize
	query := `SELECT id, type, name, target_id, target_name, file_path, file_size,
	                 storage, storage_id, checksum, status, created_by, created_at,
	                 strategy, parent_id, snapshot_path
	          FROM backups` + where + ` ORDER BY id DESC LIMIT ? OFFSET ?`
	args = append(args, pageSize, offset)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list backups")
	}
	defer rows.Close()

	var backups []*Backup
	for rows.Next() {
		b := &Backup{}
		var parentID, storageID, createdBy sql.NullInt64
		var targetName, checksum, snapshotPath sql.NullString
		if err := rows.Scan(&b.ID, &b.Type, &b.Name, &b.TargetID, &targetName,
			&b.FilePath, &b.FileSize, &b.Storage, &storageID, &checksum, &b.Status,
			&createdBy, &b.CreatedAt, &b.Strategy, &parentID, &snapshotPath); err != nil {
			return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to scan backup row")
		}
		if targetName.Valid {
			tn := targetName.String
			b.TargetName = &tn
		}
		if storageID.Valid {
			sid := storageID.Int64
			b.StorageID = &sid
		}
		if checksum.Valid {
			c := checksum.String
			b.Checksum = &c
		}
		if createdBy.Valid {
			uid := createdBy.Int64
			b.CreatedBy = &uid
		}
		if parentID.Valid {
			pid := parentID.Int64
			b.ParentID = &pid
		}
		if snapshotPath.Valid {
			sp := snapshotPath.String
			b.SnapshotPath = &sp
		}
		backups = append(backups, b)
	}

	return backups, total, nil
}

// SiteBackupCounts returns a map of site_id → backup count for type='site'.
func (s *BackupService) SiteBackupCounts() (map[int64]int, error) {
	rows, err := s.db.Query(
		"SELECT target_id, COUNT(*) FROM backups WHERE type = 'site' AND target_id IS NOT NULL GROUP BY target_id",
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to count site backups")
	}
	defer rows.Close()

	counts := make(map[int64]int)
	for rows.Next() {
		var id int64
		var cnt int
		if err := rows.Scan(&id, &cnt); err != nil {
			continue
		}
		counts[id] = cnt
	}
	return counts, nil
}

// DatabaseBackupCounts returns a map of database_id → backup count for type='database'.
func (s *BackupService) DatabaseBackupCounts() (map[int64]int, error) {
	rows, err := s.db.Query(
		"SELECT target_id, COUNT(*) FROM backups WHERE type = 'database' AND target_id IS NOT NULL GROUP BY target_id",
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to count database backups")
	}
	defer rows.Close()

	counts := make(map[int64]int)
	for rows.Next() {
		var id int64
		var cnt int
		if err := rows.Scan(&id, &cnt); err != nil {
			continue
		}
		counts[id] = cnt
	}
	return counts, nil
}
func (s *BackupService) GetByID(id int64) (*Backup, error) {
	b := &Backup{}
	var parentID, storageID, createdBy sql.NullInt64
	var targetName, checksum, snapshotPath sql.NullString
	err := s.db.QueryRow(
		`SELECT id, type, name, target_id, target_name, file_path, file_size,
		        storage, storage_id, checksum, status, created_by, created_at,
		        strategy, parent_id, snapshot_path
		 FROM backups WHERE id = ?`, id,
	).Scan(&b.ID, &b.Type, &b.Name, &b.TargetID, &targetName,
		&b.FilePath, &b.FileSize, &b.Storage, &storageID, &checksum, &b.Status,
		&createdBy, &b.CreatedAt, &b.Strategy, &parentID, &snapshotPath)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, apperrors.New(apperrors.ErrNotFound, "backup not found")
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get backup")
	}
	if targetName.Valid {
		tn := targetName.String
		b.TargetName = &tn
	}
	if storageID.Valid {
		sid := storageID.Int64
		b.StorageID = &sid
	}
	if checksum.Valid {
		c := checksum.String
		b.Checksum = &c
	}
	if createdBy.Valid {
		uid := createdBy.Int64
		b.CreatedBy = &uid
	}
	if parentID.Valid {
		pid := parentID.Int64
		b.ParentID = &pid
	}
	if snapshotPath.Valid {
		sp := snapshotPath.String
		b.SnapshotPath = &sp
	}
	return b, nil
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

// Delete removes the backup file and its database record.
func (s *BackupService) Delete(id int64) error {
	b, err := s.GetByID(id)
	if err != nil {
		return err
	}

	// Delete local file if exists
	if b.FilePath != "" {
		os.Remove(b.FilePath)
	}

	// Delete the snapshot directory for incremental backups. We
	// unlink the directory itself (rm -rf) — hardlinks living inside
	// that directory keep the on-disk data alive as long as some
	// other snapshot references them, so the cascade is safe.
	if b.SnapshotPath != nil && *b.SnapshotPath != "" && *b.SnapshotPath != b.FilePath {
		if err := os.RemoveAll(*b.SnapshotPath); err != nil {
			logger.Warn().Err(err).Str("path", *b.SnapshotPath).Msg("failed to remove snapshot directory")
		}
	}

	// Delete from FTP storage if applicable
	if b.Storage == "ftp" && b.StorageID != nil && s.ftpStorageService != nil {
		remoteFileName := filepath.Base(b.FilePath)
		if err := s.ftpStorageService.DeleteFile(*b.StorageID, remoteFileName); err != nil {
			logger.Warn().Err(err).Int64("id", id).Msg("failed to delete backup from FTP storage")
		}
	}

	// Delete from cloud storage if applicable
	if (b.Storage == "s3" || b.Storage == "google_drive" || b.Storage == "onedrive") && b.StorageID != nil && s.cloudStorageService != nil {
		remoteFileName := filepath.Base(b.FilePath)
		if err := s.cloudStorageService.DeleteFile(*b.StorageID, remoteFileName, ""); err != nil {
			logger.Warn().Err(err).Int64("id", id).Str("storage", b.Storage).Msg("failed to delete backup from cloud storage")
		}
	}

	if _, err := s.db.Exec("DELETE FROM backups WHERE id = ?", id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete backup record")
	}

	logger.Info().Int64("id", id).Str("type", b.Type).Msg("backup deleted")
	return nil
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

// Restore applies a backup based on its type. If the backup is
// encrypted, use RestoreWithPass instead so the passphrase is provided.
func (s *BackupService) Restore(id int64) error {
	return s.RestoreWithPass(id, "")
}

// RestoreWithPass applies a backup, transparently decrypting the file
// if it's an encrypted backup. Empty passphrase means "don't decrypt";
// if the file is encrypted and no passphrase is provided, the
// underlying decompressor will fail with a clear error.
func (s *BackupService) RestoreWithPass(id int64, passphrase string) error {
	b, err := s.GetByID(id)
	if err != nil {
		return err
	}

	// If file not found locally and stored on FTP, download first
	if _, err := os.Stat(b.FilePath); os.IsNotExist(err) {
		if b.Storage == "ftp" && b.StorageID != nil && s.ftpStorageService != nil {
			cfg := config.Get()
			tmpDir := filepath.Join(cfg.Paths.Backup, "tmp")
			os.MkdirAll(tmpDir, 0755)
			localPath := filepath.Join(tmpDir, filepath.Base(b.FilePath))

			remoteFileName := filepath.Base(b.FilePath)
			if err := s.ftpStorageService.DownloadFile(*b.StorageID, remoteFileName, localPath); err != nil {
				return err
			}
			b.FilePath = localPath
		} else if (b.Storage == "s3" || b.Storage == "google_drive" || b.Storage == "onedrive") && b.StorageID != nil && s.cloudStorageService != nil {
			cfg := config.Get()
			tmpDir := filepath.Join(cfg.Paths.Backup, "tmp")
			os.MkdirAll(tmpDir, 0755)
			localPath := filepath.Join(tmpDir, filepath.Base(b.FilePath))

			remoteFileName := filepath.Base(b.FilePath)
			if err := s.cloudStorageService.DownloadFile(*b.StorageID, remoteFileName, localPath, ""); err != nil {
				return err
			}
			b.FilePath = localPath
		} else {
			return apperrors.New(apperrors.ErrNotFound, "backup file not found on disk")
		}
	}

	// If the file is encrypted, decrypt to a tmp path first.
	if isEncryptedBackup(b.FilePath) {
		if passphrase == "" {
			return apperrors.New(apperrors.ErrValidation,
				"backup is encrypted — provide the decryption passphrase")
		}
		cfg := config.Get()
		tmpDir := filepath.Join(cfg.Paths.Backup, "tmp")
		_ = os.MkdirAll(tmpDir, 0755)
		decPath := filepath.Join(tmpDir, "dec_"+filepath.Base(b.FilePath[:len(b.FilePath)-4]))
		if _, err := decryptFile(b.FilePath, decPath, passphrase); err != nil {
			return apperrors.Wrap(err, apperrors.ErrValidation, "decrypt failed")
		}
		defer os.Remove(decPath)
		b.FilePath = decPath
	}

	// Incremental snapshots: instead of restoring from a tarball,
	// stream the on-disk directory through tar so the destination
	// doc root ends up with the same content as a fresh rsync. The
	// hardlink chain is invisible to the destination.
	if b.Strategy == "incremental" && b.SnapshotPath != nil {
		return s.restoreSiteFromSnapshot(b)
	}

	// Incremental database snapshots: pick the SQL file out of the
	// snapshot dir (post-mysqldump, possibly compressed) and pipe it
	// into the mysql client. The compressExtFor() helper normalises
	// to .gz/.bz2/.zst; an uncompressed snapshot is just .sql.
	if b.Strategy == "incremental" && b.SnapshotPath != nil {
		return s.restoreDatabaseFromSnapshot(b)
	}

	switch b.Type {
	case "site":
		return s.restoreSite(b)
	case "database":
		return s.restoreDatabase(b)
	case "panel":
		return s.restorePanel(b)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported backup type: "+b.Type)
	}
}

// restoreDatabaseFromSnapshot restores a database from a snapshot
// directory by finding the SQL dump inside (post-compression) and
// piping it into the mysql client. The "snapshot" directory holds
// exactly one <name>.sql[.gz|.bz2|.zst] file written by
// createIncrementalDatabaseBackup.
func (s *BackupService) restoreDatabaseFromSnapshot(b *Backup) error {
	if b.TargetName == nil || *b.TargetName == "" {
		return apperrors.New(apperrors.ErrInternal, "missing target name for database snapshot restore")
	}
	if b.SnapshotPath == nil {
		return apperrors.New(apperrors.ErrInternal, "incremental backup missing snapshot_path")
	}

	// Find the dump file: try the common compressions in order.
	var dumpFile string
	dbName := ""
	if b.TargetName != nil {
		dbName = *b.TargetName
	}
	for _, ext := range []string{"", ".gz", ".bz2", ".zst"} {
		cand := filepath.Join(*b.SnapshotPath, dbName+".sql"+ext)
		if _, err := os.Stat(cand); err == nil {
			dumpFile = cand
			break
		}
	}
	if dumpFile == "" {
		// Fallback: take whatever .sql* file exists.
		matches, _ := filepath.Glob(filepath.Join(*b.SnapshotPath, "*.sql*"))
		if len(matches) == 0 {
			return apperrors.New(apperrors.ErrNotFound, "no SQL dump found in snapshot directory")
		}
		dumpFile = matches[0]
	}

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	// If the file is compressed, decompress into a temp SQL first.
	plain := dumpFile
	if filepath.Ext(dumpFile) != "" && filepath.Ext(dumpFile) != ".sql" {
		var decompBin string
		switch filepath.Ext(dumpFile) {
		case ".bz2":
			decompBin = "bzip2"
		case ".zst":
			decompBin = "zstd"
		default:
			decompBin = "gunzip"
		}
		tmpDir, _ := os.MkdirTemp("", "db-restore-*")
		plain = filepath.Join(tmpDir, dbName+".sql")
		defer os.RemoveAll(tmpDir)
		// Use ExecShell so the > redirect works. We split the
		// command into 3 tokens for the parser.
		cmd := fmt.Sprintf("%s -c %q > %s", decompBin, dumpFile, plain)
		if _, err := system.ExecShell(ctx, cmd); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "decompress failed")
		}
	}

	// Pipe SQL to mysql. Use shell with < redirect since
	// system.Exec uses os/exec which doesn't honour shell redirects.
	cmd := fmt.Sprintf("mysql -u root %s < %s", *b.TargetName, plain)
	if _, err := system.ExecShell(ctx, cmd); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "mysql import failed")
	}

	logger.Info().Int64("id", b.ID).Str("db", *b.TargetName).Str("dump", dumpFile).
		Msg("database restored from incremental snapshot")
	return nil
}

// restoreSiteFromSnapshot extracts an incremental site backup's
// snapshot directory into the document root, then deletes any files
// in the doc root that aren't in the snapshot (so a restore of a
// 3-day-old snapshot doesn't leave stale files behind — the
// "rsync --delete" behaviour).
//
// We use rsync again for the restore path because it's the same
// code path as a remote rsync, which means:
//   - permissions, symlinks, hardlinks are preserved
//   - large files don't get loaded into memory
//   - we get the same on-disk content as if we'd copied the dir
func (s *BackupService) restoreSiteFromSnapshot(b *Backup) error {
	if b.TargetName == nil || *b.TargetName == "" {
		return apperrors.New(apperrors.ErrInternal, "missing target name for snapshot restore")
	}
	if b.SnapshotPath == nil {
		return apperrors.New(apperrors.ErrInternal, "incremental backup missing snapshot_path")
	}
	if _, err := os.Stat(*b.SnapshotPath); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrNotFound, "snapshot directory no longer on disk")
	}

	cfg := config.Get()
	docRoot := filepath.Join(cfg.Paths.WWWRoot, *b.TargetName)
	if err := os.MkdirAll(docRoot, 0755); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create document root")
	}

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()
	rsyncArgs := []string{"-aHx", "--numeric-ids", "--delete",
		filepath.Join(*b.SnapshotPath) + "/", docRoot + "/"}
	if _, err := system.Exec(ctx, "rsync", rsyncArgs...); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "snapshot restore failed")
	}

	logger.Info().Int64("id", b.ID).Str("domain", *b.TargetName).Str("path", *b.SnapshotPath).
		Msg("site restored from incremental snapshot")
	return nil
}

func (s *BackupService) restoreSite(b *Backup) error {
	if b.TargetName == nil || *b.TargetName == "" {
		return apperrors.New(apperrors.ErrInternal, "missing target name for site restore")
	}

	cfg := config.Get()
	docRoot := filepath.Join(cfg.Paths.WWWRoot, *b.TargetName)
	if err := os.MkdirAll(docRoot, 0755); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create document root")
	}

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	if _, err := system.Exec(ctx, "tar", "xzf", b.FilePath, "-C", docRoot); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to restore site backup")
	}

	// After a full tar extract, files added since the backup aren't
	// removed (tar only overwrites matching paths). Clean the doc
	// root of any file not present in the tar to make "restore" mean
	// "exact previous state", which is what users expect.
	if b.Strategy != "incremental" {
		cleanDocRootExtras(docRoot, b.FilePath)
	}

	logger.Info().Int64("id", b.ID).Str("domain", *b.TargetName).Msg("site restored from backup")
	return nil
}

func (s *BackupService) restoreDatabase(b *Backup) error {
	if b.TargetID == nil {
		return apperrors.New(apperrors.ErrInternal, "missing target ID for database restore")
	}

	dbInfo, err := s.getDatabase(*b.TargetID)
	if err != nil {
		return err
	}

	// Decompress .gz to a temporary .sql file.
	sqlFile := strings.TrimSuffix(b.FilePath, ".gz")

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	if _, err := system.Exec(ctx, "gunzip", "-k", "-f", b.FilePath); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to decompress database backup")
	}
	defer os.Remove(sqlFile)

	sourceCmd := fmt.Sprintf("SOURCE %s", sqlFile)
	if _, err := system.Exec(ctx, "mysql", "-u", "root", dbInfo.name, "-e", sourceCmd); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to restore database backup")
	}

	logger.Info().Int64("id", b.ID).Str("database", dbInfo.name).Msg("database restored from backup")
	return nil
}

func (s *BackupService) restorePanel(b *Backup) error {
	cfg := config.Get()

	ctx, cancel := context.WithTimeout(context.Background(), backupCmdTimeout)
	defer cancel()

	if _, err := system.Exec(ctx, "tar", "xzf", b.FilePath, "-C", cfg.Paths.Base); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to restore panel backup")
	}

	logger.Info().Int64("id", b.ID).Msg("panel restored from backup — software symlinks may need re-creation on next install")
	return nil
}

// cleanDocRootExtras removes files in docRoot that aren't part of the
// tar at tarPath. Implemented by listing the tar's entries first
// (offline, no extraction) then walking the doc root and unlinking
// anything not in that list. Errors are logged but never fail the
// restore — partial cleanup is better than a failed restore.
func cleanDocRootExtras(docRoot, tarPath string) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// tar -tf lists all entries (one per line). Cheap for typical
	// site sizes (a few thousand entries).
	out, err := system.Exec(ctx, "tar", "-tf", tarPath)
	if err != nil || out == nil {
		logger.Warn().Err(err).Str("tar", tarPath).Msg("cleanDocRootExtras: tar list failed, skipping")
		return
	}
	expected := make(map[string]bool)
	for _, line := range strings.Split(out.Stdout, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			expected[line] = true
		}
	}

	// Walk the doc root. Any file/dir not in `expected` is removed.
	// We use os.RemoveAll for directories so we get a single syscall
	// per top-level extra. Symlinks are followed-on-remove to clean
	// whatever they pointed to.
	filepath.Walk(docRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if path == docRoot {
			return nil
		}
		rel, _ := filepath.Rel(docRoot, path)
		if expected[rel] || expected[rel+"/"] {
			return nil
		}
		if err := os.RemoveAll(path); err != nil {
			logger.Warn().Err(err).Str("path", path).Msg("cleanDocRootExtras: failed to remove")
		}
		return nil
	})
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

// GetDownloadPath returns the file path for downloading a backup.
func (s *BackupService) GetDownloadPath(id int64) (string, error) {
	b, err := s.GetByID(id)
	if err != nil {
		return "", err
	}

	// If file exists locally, return it
	if _, err := os.Stat(b.FilePath); err == nil {
		return b.FilePath, nil
	}

	// If stored on FTP, download to temp first
	if b.Storage == "ftp" && b.StorageID != nil && s.ftpStorageService != nil {
		cfg := config.Get()
		tmpDir := filepath.Join(cfg.Paths.Backup, "tmp")
		os.MkdirAll(tmpDir, 0755)
		localPath := filepath.Join(tmpDir, filepath.Base(b.FilePath))

		remoteFileName := filepath.Base(b.FilePath)
		if err := s.ftpStorageService.DownloadFile(*b.StorageID, remoteFileName, localPath); err != nil {
			return "", err
		}
		return localPath, nil
	}

	// If stored on cloud storage, download to temp first
	if (b.Storage == "s3" || b.Storage == "google_drive" || b.Storage == "onedrive") && b.StorageID != nil && s.cloudStorageService != nil {
		cfg := config.Get()
		tmpDir := filepath.Join(cfg.Paths.Backup, "tmp")
		os.MkdirAll(tmpDir, 0755)
		localPath := filepath.Join(tmpDir, filepath.Base(b.FilePath))

		remoteFileName := filepath.Base(b.FilePath)
		if err := s.cloudStorageService.DownloadFile(*b.StorageID, remoteFileName, localPath, ""); err != nil {
			return "", err
		}
		return localPath, nil
	}

	return "", apperrors.New(apperrors.ErrNotFound, "backup file not found")
}

// remoteBackupPath returns the remote file path with organized folder structure:
// itdlupanel_backup/{type}/{filename}
func remoteBackupPath(backupType, fileName string) string {
	return path.Join("itdlupanel_backup", backupType, fileName)
}

// UploadBackupToFTP uploads an existing backup to an FTP storage.
//
// Kept synchronous because FTP transfers are usually quick on the same
// network and we want to surface errors immediately. For long-running
// transfers a future enhancement can wrap this in the same async
// queue used by cloud uploads.
func (s *BackupService) UploadBackupToFTP(backupID, storageID int64) error {
	if s.ftpStorageService == nil {
		return apperrors.New(apperrors.ErrInternal, "FTP storage service not available")
	}

	b, err := s.GetByID(backupID)
	if err != nil {
		return err
	}

	if _, err := os.Stat(b.FilePath); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrNotFound, "backup file not found on disk")
	}

	remoteFileName := remoteBackupPath(b.Type, filepath.Base(b.FilePath))
	if err := s.ftpStorageService.UploadFile(storageID, b.FilePath, remoteFileName); err != nil {
		return err
	}

	// Update backup record with FTP storage info (local copy is kept)
	_, err = s.db.Exec(
		"UPDATE backups SET storage = 'local+ftp', storage_id = ? WHERE id = ?",
		storageID, backupID,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update backup storage info")
	}

	logger.Info().Int64("backup_id", backupID).Int64("storage_id", storageID).Msg("backup uploaded to FTP storage")
	return nil
}

// UploadBackupToCloud enqueues an async upload of an existing backup to
// a cloud storage (Google Drive / S3 / OneDrive). It returns the
// backup_uploads row id so the caller can poll progress.
//
// Replaces the previous synchronous implementation that blocked the
// HTTP request for the entire duration of a multi-GB upload.
func (s *BackupService) UploadBackupToCloud(backupID, storageID int64, storageType string) error {
	if s.uploadService == nil {
		return apperrors.New(apperrors.ErrInternal, "upload service not available")
	}
	_, err := s.uploadService.StartUpload(backupID, storageID)
	return err
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

// CleanOldBackups removes backups older than the specified number of days.
func (s *BackupService) CleanOldBackups(keepDays int) error {
	cutoff := time.Now().AddDate(0, 0, -keepDays).Format("2006-01-02 15:04:05")

	rows, err := s.db.Query("SELECT id, file_path FROM backups WHERE created_at < ?", cutoff)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to query old backups")
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		var filePath string
		if err := rows.Scan(&id, &filePath); err != nil {
			continue
		}
		os.Remove(filePath)
		ids = append(ids, id)
	}

	for _, id := range ids {
		s.db.Exec("DELETE FROM backups WHERE id = ?", id)
	}

	logger.Info().Int("removed", len(ids)).Int("keep_days", keepDays).Msg("old backups cleaned")
	return nil
}

// ---------------------------------------------------------------------------
// Compression
// ---------------------------------------------------------------------------

// BackupCompression controls the compression algorithm used when
// archiving a site or compressing a database dump. The default
// preserves the existing behaviour so older backups keep working.
//
//   - "gzip" (default): smallest toolchain, compatible with every
//     decompressor on Earth. ~3x compression on typical PHP sites.
//   - "bzip2": better ratio than gzip, slower. Useful for archival.
//   - "zstd": best speed/ratio tradeoff in 2026. Requires `zstd`
//     binary on PATH (installed by default on most distros).
//   - "none": no compression. Use when the source is already compressed
//     (e.g. already-gzipped logs, JPEG/TAR media).
const (
	CompressionGzip = "gzip"
	CompressionBzip2 = "bzip2"
	CompressionZstd  = "zstd"
	CompressionNone  = "none"
)

var supportedCompressions = map[string]bool{
	CompressionGzip: true, CompressionBzip2: true, CompressionZstd: true, CompressionNone: true,
}

// NormaliseCompression returns a canonical compression name, defaulting
// to gzip for empty / unknown values. Exported so the API layer can
// validate user input once and pass the canonical name down.
func NormaliseCompression(c string) string {
	if supportedCompressions[c] {
		return c
	}
	return CompressionGzip
}

// compressArgs returns the args to pass to `tar` so the resulting
// archive uses the requested algorithm. For "none" we leave the file
// uncompressed.
func compressArgs(c string) []string {
	switch c {
	case CompressionBzip2:
		return []string{"cjf"}
	case CompressionZstd:
		return []string{"--zstd", "-cf"}
	case CompressionNone:
		return []string{"cf"}
	default:
		return []string{"czf"}
	}
}

// compressSingleFileArgs returns the args to pass to the standalone
// compressor for a single file (used by database dumps).
func compressSingleFileArgs(c string) []string {
	switch c {
	case CompressionBzip2:
		return []string{"-kfj"}
	case CompressionZstd:
		return []string{"-kf", "--rm", "-zstd", "-q"}
	case CompressionNone:
		// No-op: caller should skip the compress step entirely.
		return nil
	default:
		return []string{"-kf"}
	}
}

// decompressArgs mirrors compressSingleFileArgs for restore. It is the
// inverse mapping: gzip -> gunzip, bzip2 -> bunzip2, zstd -> unzstd.
func decompressArgs(c string) []string {
	switch c {
	case CompressionBzip2:
		return []string{"-kfj"}
	case CompressionZstd:
		return []string{"-kf", "--rm", "-zstd", "-q", "-d"}
	case CompressionNone:
		return nil
	default:
		return []string{"-kf"}
	}
}



type siteInfo struct {
	Domain string
}

type dbInfo struct {
	name string
}

func (s *BackupService) getSite(siteID int64) (*siteInfo, error) {
	var domain string
	err := s.db.QueryRow("SELECT domain FROM sites WHERE id = ?", siteID).Scan(&domain)
	if err == sql.ErrNoRows {
		return nil, apperrors.New(apperrors.ErrNotFound, "site not found")
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get site")
	}
	return &siteInfo{Domain: domain}, nil
}

func (s *BackupService) getDatabase(dbID int64) (*dbInfo, error) {
	var name string
	err := s.db.QueryRow("SELECT name FROM databases WHERE id = ?", dbID).Scan(&name)
	if err == sql.ErrNoRows {
		return nil, apperrors.New(apperrors.ErrNotFound, "database not found")
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get database")
	}
	return &dbInfo{name: name}, nil
}

func (s *BackupService) insertRecord(
	backupType, name string,
	targetID *int64, targetName *string,
	filePath string, size int64,
	createdBy int64,
) (*Backup, error) {
	result, err := s.db.Exec(
		`INSERT INTO backups (type, name, target_id, target_name, file_path, file_size, storage, status, created_by, strategy)
		 VALUES (?, ?, ?, ?, ?, ?, 'local', 'completed', ?, 'full')`,
		backupType, name, targetID, targetName, filePath, size, createdBy,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to store backup record")
	}

	id, _ := result.LastInsertId()
	logger.Info().Int64("id", id).Str("type", backupType).Str("name", name).Msg("backup created")

	return s.GetByID(id)
}

// insertSnapshotRecord is the incremental-backup equivalent of
// insertRecord: it writes a row whose strategy='incremental' and
// snapshot_path is set, with file_path left empty (the snapshot is a
// directory, not a single file). parent_id chains back to the
// previous snapshot for cascade-safe deletion.
//
// The (file_path) column is NOT NULL in older schema; we satisfy it
// with the same value as snapshot_path so the column isn't
// misleadingly empty. Downloads of an incremental backup produce a
// tarball on the fly; see StreamSnapshotAsTar.
func (s *BackupService) insertSnapshotRecord(
	backupType, name string,
	targetID *int64, targetName *string,
	snapPath string, size int64,
	strategy string, parentID *int64,
	snapshotPath *string,
	createdBy int64,
) (*Backup, error) {
	result, err := s.db.Exec(
		`INSERT INTO backups (type, name, target_id, target_name, file_path, file_size, storage, status, created_by, strategy, parent_id, snapshot_path)
		 VALUES (?, ?, ?, ?, ?, ?, 'local', 'completed', ?, ?, ?, ?)`,
		backupType, name, targetID, targetName, snapPath, size, createdBy,
		strategy, parentID, snapshotPath,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to store snapshot record")
	}

	id, _ := result.LastInsertId()
	logger.Info().Int64("id", id).Str("type", backupType).Str("name", name).
		Str("strategy", strategy).Msg("snapshot backup created")
	return s.GetByID(id)
}

// ---------------------------------------------------------------------------
// Bulk backup
// ---------------------------------------------------------------------------

type siteBasic struct {
	ID     int64
	Domain string
}

type dbBasic struct {
	ID   int64
	Name string
}

// ListAllSites returns all sites (id + domain).
func (s *BackupService) ListAllSites() ([]siteBasic, error) {
	rows, err := s.db.Query("SELECT id, domain FROM sites ORDER BY id")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list sites")
	}
	defer rows.Close()
	var sites []siteBasic
	for rows.Next() {
		var sb siteBasic
		if err := rows.Scan(&sb.ID, &sb.Domain); err != nil {
			continue
		}
		sites = append(sites, sb)
	}
	return sites, nil
}

// ListAllDatabases returns all databases (id + name).
func (s *BackupService) ListAllDatabases() ([]dbBasic, error) {
	rows, err := s.db.Query("SELECT id, name FROM databases ORDER BY id")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list databases")
	}
	defer rows.Close()
	var dbs []dbBasic
	for rows.Next() {
		var db dbBasic
		if err := rows.Scan(&db.ID, &db.Name); err != nil {
			continue
		}
		dbs = append(dbs, db)
	}
	return dbs, nil
}

// GetSiteByDomain looks up a site by domain name.
func (s *BackupService) GetSiteByDomain(domain string) (int64, error) {
	var id int64
	err := s.db.QueryRow("SELECT id FROM sites WHERE domain = ?", domain).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, apperrors.New(apperrors.ErrNotFound, "site not found: "+domain)
	}
	if err != nil {
		return 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to lookup site by domain")
	}
	return id, nil
}

// GetDatabaseByName looks up a database by name.
func (s *BackupService) GetDatabaseByName(name string) (int64, error) {
	var id int64
	err := s.db.QueryRow("SELECT id FROM databases WHERE name = ?", name).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, apperrors.New(apperrors.ErrNotFound, "database not found: "+name)
	}
	if err != nil {
		return 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to lookup database by name")
	}
	return id, nil
}

// CreateAllSitesBackup backs up every site.
func (s *BackupService) CreateAllSitesBackup(createdBy int64) ([]*Backup, error) {
	sites, err := s.ListAllSites()
	if err != nil {
		return nil, err
	}
	var results []*Backup
	for _, site := range sites {
		b, err := s.CreateSiteBackup(site.ID, createdBy)
		if err != nil {
			logger.Warn().Int64("site_id", site.ID).Str("domain", site.Domain).Err(err).Msg("failed to backup site, skipping")
			continue
		}
		results = append(results, b)
	}
	return results, nil
}

// CreateAllDatabasesBackup backs up every database.
func (s *BackupService) CreateAllDatabasesBackup(createdBy int64) ([]*Backup, error) {
	dbs, err := s.ListAllDatabases()
	if err != nil {
		return nil, err
	}
	var results []*Backup
	for _, db := range dbs {
		b, err := s.CreateDatabaseBackup(db.ID, createdBy)
		if err != nil {
			logger.Warn().Int64("db_id", db.ID).Str("name", db.Name).Err(err).Msg("failed to backup database, skipping")
			continue
		}
		results = append(results, b)
	}
	return results, nil
}

// EnforceRetention keeps only the newest maxKeep backups for a given type
// and optional target. Older backups are deleted from disk and DB.
func (s *BackupService) EnforceRetention(backupType string, targetID *int64, maxKeep int) error {
	if maxKeep <= 0 {
		return nil
	}

	var rows *sql.Rows
	var err error
	if targetID != nil {
		rows, err = s.db.Query(
			`SELECT id, file_path FROM backups
			 WHERE type = ? AND target_id = ?
			 ORDER BY created_at DESC`,
			backupType, *targetID,
		)
	} else {
		rows, err = s.db.Query(
			`SELECT id, file_path FROM backups
			 WHERE type = ? AND target_id IS NULL
			 ORDER BY created_at DESC`,
			backupType,
		)
	}
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to query backups for retention")
	}
	defer rows.Close()

	var idx int
	var toDelete []struct {
		id       int64
		filePath string
	}
	for rows.Next() {
		var id int64
		var filePath string
		if err := rows.Scan(&id, &filePath); err != nil {
			continue
		}
		idx++
		if idx > maxKeep {
			toDelete = append(toDelete, struct {
				id       int64
				filePath string
			}{id, filePath})
		}
	}

	for _, item := range toDelete {
		if item.filePath != "" {
			os.Remove(item.filePath)
		}
		s.db.Exec("DELETE FROM backups WHERE id = ?", item.id)
	}

	if len(toDelete) > 0 {
		logger.Info().
			Str("type", backupType).
			Int("max_keep", maxKeep).
			Int("deleted", len(toDelete)).
			Msg("backup retention enforced")
	}

	return nil
}

func fileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}

// compressionExt returns the file extension for a given compression
// algorithm. The leading dot is included (e.g. ".gz").
func compressionExt(c string) string {
	switch c {
	case CompressionBzip2:
		return ".tar.bz2"
	case CompressionZstd:
		return ".tar.zst"
	case CompressionNone:
		return ".tar"
	default:
		return ".tar.gz"
	}
}

// compressExtFor returns the single-file extension (.gz / .bz2 / .zst).
func compressExtFor(c string) string {
	switch c {
	case CompressionBzip2:
		return ".bz2"
	case CompressionZstd:
		return ".zst"
	case CompressionNone:
		return ""
	default:
		return ".gz"
	}
}
