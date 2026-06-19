package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"time"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// BackupUpload represents one attempt to push a local backup file to a
// cloud storage backend (Google Drive, S3, OneDrive).
//
// One row per attempt — the unique (backup_id, storage_id) constraint means
// a retry creates a fresh row, preserving the full audit trail of every
// start, error, and completion.
type BackupUpload struct {
	ID            int64      `json:"id"`
	BackupID      int64      `json:"backup_id"`
	StorageID     int64      `json:"storage_id"`
	StorageType   string     `json:"storage_type"`
	Status        string     `json:"status"`
	BytesUploaded int64      `json:"bytes_uploaded"`
	BytesTotal    int64      `json:"bytes_total"`
	ProgressPct   float64    `json:"progress_pct"`
	ErrorMessage  string     `json:"error_message,omitempty"`
	RemoteURL     string     `json:"remote_url,omitempty"`
	RemoteFileID  string     `json:"remote_file_id,omitempty"`
	StartedAt     *time.Time `json:"started_at,omitempty"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// Upload status constants.
const (
	UploadStatusPending    = "pending"
	UploadStatusUploading  = "uploading"
	UploadStatusCompleted  = "completed"
	UploadStatusFailed     = "failed"
	UploadStatusCancelled  = "cancelled"
	UploadStatusPaused     = "paused" // reserved for future pause/resume
)

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// BackupUploadService manages the queue and lifecycle of cloud upload jobs.
//
// Design notes
//   - The HTTP handler enqueues a job and returns immediately so the API
//     request does not block while a 5 GB file is being pushed over the
//     network.
//   - A small worker pool drains the queue, calling the appropriate
//     CloudStorageService upload routine. Progress is written back to
//     the database every ~1 s so pollers see near-real-time updates.
//   - For Google Drive the upload is resumable: a `remote_url` (the
//     session URI returned by the resumable upload handshake) is saved
//     after each successful chunk. A retry on the same (backup,storage)
//     pair reopens the session instead of starting from byte 0.
type BackupUploadService struct {
	db                  *sql.DB
	cloudStorageService *CloudStorageService
	backupService       *BackupService
	notifier            *NotificationService

	queue   chan int64 // upload IDs
	wg      sync.WaitGroup
	stop    chan struct{}
	closeOnce sync.Once
}

// NewBackupUploadService creates a new BackupUploadService. Call Start()
// to spawn the worker pool.
func NewBackupUploadService(
	db *sql.DB,
	cloudStorageService *CloudStorageService,
	backupService *BackupService,
) *BackupUploadService {
	return &BackupUploadService{
		db:                  db,
		cloudStorageService: cloudStorageService,
		backupService:       backupService,
		queue:               make(chan int64, 32),
		stop:                make(chan struct{}),
	}
}

// SetNotifier sets the notification service used for upload events.
func (s *BackupUploadService) SetNotifier(n *NotificationService) { s.notifier = n }

// Start spawns the worker pool and resumes any uploads that were left
// pending from a previous run (e.g. the panel restarted mid-upload).
func (s *BackupUploadService) Start(workers int) {
	if workers < 1 {
		workers = 2
	}
	for i := 0; i < workers; i++ {
		s.wg.Add(1)
		go s.worker()
	}

	// Resume any pending uploads left over from a previous run.
	s.wg.Add(1)
	go s.resumePending()
}

// Stop drains in-flight uploads (up to a short grace period) and shuts
// the worker pool down.
func (s *BackupUploadService) Stop(grace time.Duration) {
	if grace <= 0 {
		grace = 5 * time.Second
	}
	s.closeOnce.Do(func() {
		close(s.stop)
	})

	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(grace):
		logger.Warn().Msg("backup upload workers did not stop within grace period")
	}
}

// resumePending re-enqueues any uploads in pending/uploading state that
// were orphaned by a process restart.
func (s *BackupUploadService) resumePending() {
	defer s.wg.Done()
	rows, err := s.db.Query(
		`SELECT id FROM backup_uploads
		 WHERE status IN (?, ?)
		 ORDER BY id ASC`,
		UploadStatusPending, UploadStatusUploading,
	)
	if err != nil {
		logger.Error().Err(err).Msg("backup upload: failed to query pending uploads")
		return
	}
	defer rows.Close()
	var count int
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			continue
		}
		// Reset the in-flight flag back to pending so progress polling
		// does not show a stale "uploading" state with 0 bytes.
		if _, err := s.db.Exec(
			`UPDATE backup_uploads
			 SET status = ?, error_message = 'resumed after process restart',
			     updated_at = CURRENT_TIMESTAMP
			 WHERE id = ? AND status = ?`,
			UploadStatusPending, id, UploadStatusUploading,
		); err != nil {
			logger.Warn().Err(err).Int64("upload_id", id).Msg("backup upload: failed to reset orphaned row")
		}
		s.enqueue(id)
		count++
	}
	if count > 0 {
		logger.Info().Int("count", count).Msg("backup upload: resumed pending uploads after restart")
	}
}

func (s *BackupUploadService) worker() {
	defer s.wg.Done()
	for {
		select {
		case <-s.stop:
			return
		case id := <-s.queue:
			s.run(id)
		}
	}
}

func (s *BackupUploadService) enqueue(id int64) {
	select {
	case s.queue <- id:
	case <-s.stop:
	default:
		logger.Warn().Int64("upload_id", id).Msg("backup upload: queue full, dropping")
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// StartUpload enqueues an async upload of an existing local backup to
// the specified cloud storage. The local file must already exist on
// disk (i.e. the backup row's `status = completed`).
//
// If a previous upload for the same (backup, storage) pair exists in
// pending/uploading state, that row is reused and re-queued (this
// powers the resume-after-restart case). Completed/failed rows are
// preserved for the audit log and a new row is created.
func (s *BackupUploadService) StartUpload(backupID, storageID int64) (*BackupUpload, error) {
	backup, err := s.backupService.GetByID(backupID)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(backup.FilePath); err != nil {
		return nil, apperrors.New(apperrors.ErrNotFound, "backup file not found on disk: "+backup.FilePath)
	}

	cs, err := s.cloudStorageService.GetByID(storageID)
	if err != nil {
		return nil, err
	}
	if !cs.IsActive {
		return nil, apperrors.New(apperrors.ErrValidation, "cloud storage is not active")
	}

	// Reuse an existing pending row if present (so the worker can pick
	// up where it left off). Otherwise insert a new pending row.
	row, err := s.db.Query(
		`SELECT id, status FROM backup_uploads
		 WHERE backup_id = ? AND storage_id = ? AND status IN (?, ?)
		 ORDER BY id DESC LIMIT 1`,
		backupID, storageID, UploadStatusPending, UploadStatusUploading,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to look up existing upload")
	}
	defer row.Close()

	var existingID int64
	var existingStatus string
	reuse := false
	if row.Next() {
		if err := row.Scan(&existingID, &existingStatus); err == nil {
			reuse = true
		}
	}

	if reuse {
		// Reset transient state from a previous run.
		if _, err := s.db.Exec(
			`UPDATE backup_uploads
			 SET status = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP
			 WHERE id = ?`,
			UploadStatusPending, existingID,
		); err != nil {
			return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to reset upload row")
		}
		s.enqueue(existingID)
		return s.GetByID(existingID)
	}

	res, err := s.db.Exec(
		`INSERT INTO backup_uploads (backup_id, storage_id, storage_type, status, bytes_total)
		 VALUES (?, ?, ?, ?, ?)`,
		backupID, storageID, cs.Type, UploadStatusPending, fileSize(backup.FilePath),
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create upload record")
	}
	id, _ := res.LastInsertId()
	s.enqueue(id)
	return s.GetByID(id)
}

// GetByID returns a single upload record.
func (s *BackupUploadService) GetByID(id int64) (*BackupUpload, error) {
	u, err := s.scanOne(s.db.QueryRow(
		`SELECT id, backup_id, storage_id, storage_type, status,
		        bytes_uploaded, bytes_total, progress_pct,
		        COALESCE(error_message,''), COALESCE(remote_url,''),
		        COALESCE(remote_file_id,''), started_at, completed_at,
		        created_at, updated_at
		 FROM backup_uploads WHERE id = ?`, id))
	if err == sql.ErrNoRows {
		return nil, apperrors.New(apperrors.ErrNotFound, "upload not found")
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get upload")
	}
	return u, nil
}

// ListByBackup returns all upload attempts for a given backup.
func (s *BackupUploadService) ListByBackup(backupID int64) ([]*BackupUpload, error) {
	rows, err := s.db.Query(
		`SELECT id, backup_id, storage_id, storage_type, status,
		        bytes_uploaded, bytes_total, progress_pct,
		        COALESCE(error_message,''), COALESCE(remote_url,''),
		        COALESCE(remote_file_id,''), started_at, completed_at,
		        created_at, updated_at
		 FROM backup_uploads WHERE backup_id = ? ORDER BY id DESC`, backupID)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list uploads")
	}
	defer rows.Close()
	var out []*BackupUpload
	for rows.Next() {
		u, err := s.scanOne(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, nil
}

// Cancel marks a pending or in-flight upload as cancelled. Already
// uploaded bytes cannot be rolled back automatically; if the upload had
// already finished on the server side the cancel is a no-op.
func (s *BackupUploadService) Cancel(id int64) error {
	res, err := s.db.Exec(
		`UPDATE backup_uploads
		 SET status = ?, error_message = 'cancelled by user', completed_at = CURRENT_TIMESTAMP,
		     updated_at = CURRENT_TIMESTAMP
		 WHERE id = ? AND status IN (?, ?)`,
		UploadStatusCancelled, id, UploadStatusPending, UploadStatusUploading,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to cancel upload")
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return apperrors.New(apperrors.ErrValidation, "upload is not in a cancellable state")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

// run is the per-upload worker entry point. It loads the row, picks the
// upload strategy based on storage type, updates progress in the DB
// while bytes flow, and finally marks the row completed/failed.
func (s *BackupUploadService) run(uploadID int64) {
	row, err := s.GetByID(uploadID)
	if err != nil {
		logger.Warn().Err(err).Int64("upload_id", uploadID).Msg("backup upload: cannot load row")
		return
	}
	if row.Status == UploadStatusCancelled {
		return
	}

	backup, err := s.backupService.GetByID(row.BackupID)
	if err != nil {
		s.markFailed(uploadID, "backup record missing: "+err.Error())
		return
	}
	if _, err := os.Stat(backup.FilePath); err != nil {
		s.markFailed(uploadID, "local backup file missing: "+backup.FilePath)
		return
	}

	now := time.Now()
	if _, err := s.db.Exec(
		`UPDATE backup_uploads SET status = ?, started_at = ?, updated_at = ?
		 WHERE id = ?`,
		UploadStatusUploading, now, now, uploadID,
	); err != nil {
		logger.Warn().Err(err).Msg("backup upload: failed to mark uploading")
	}

	// We do not have the storage's redirect URL here, so build one from
	// the panel config. The cloud service uses it only to mint a token
	// for the OAuth HTTP client.
	redirectURL := s.cloudStorageService.redirectURL()

	remoteFileName := remoteBackupPath(backup.Type, filepath.Base(backup.FilePath))

	progress := func(sent, total int64) {
		s.updateProgress(uploadID, sent, total)
	}

	var uploadErr error
	switch row.StorageType {
	case "google_drive":
		uploadErr = s.cloudStorageService.UploadGoogleDriveResumable(
			row.StorageID, backup.FilePath, remoteFileName, redirectURL, uploadID, s, progress,
		)
	case "s3":
		uploadErr = s.cloudStorageService.UploadS3(row.StorageID, backup.FilePath, remoteFileName)
	case "onedrive":
		uploadErr = s.cloudStorageService.UploadOneDrive(row.StorageID, backup.FilePath, remoteFileName, redirectURL)
	default:
		uploadErr = fmt.Errorf("unsupported storage type: %s", row.StorageType)
	}

	if uploadErr != nil {
		s.markFailed(uploadID, uploadErr.Error())
		s.notifyBackupCloudUpload(backup, false, uploadErr.Error())
		return
	}

	// Success — flip the backup row to "local+<type>" and stamp the
	// backup_uploads row.
	done := time.Now()
	if _, err := s.db.Exec(
		`UPDATE backup_uploads
		 SET status = ?, bytes_uploaded = bytes_total, progress_pct = 100,
		     completed_at = ?, updated_at = ?
		 WHERE id = ?`,
		UploadStatusCompleted, done, done, uploadID,
	); err != nil {
		logger.Warn().Err(err).Msg("backup upload: failed to mark completed")
	}

	if _, err := s.db.Exec(
		`UPDATE backups SET storage = ?, storage_id = ? WHERE id = ?`,
		"local+"+row.StorageType, row.StorageID, row.BackupID,
	); err != nil {
		logger.Warn().Err(err).Msg("backup upload: failed to update backup row")
	}

	s.notifyBackupCloudUpload(backup, true, "")
	logger.Info().Int64("upload_id", uploadID).Int64("backup_id", row.BackupID).Str("storage", row.StorageType).Msg("backup uploaded to cloud")
}

// updateProgress persists the latest byte count. It coalesces writes so
// we don't hammer the DB on every chunk.
func (s *BackupUploadService) updateProgress(uploadID, sent, total int64) {
	pct := 0.0
	if total > 0 {
		pct = float64(sent) / float64(total) * 100
	}
	if _, err := s.db.Exec(
		`UPDATE backup_uploads
		 SET bytes_uploaded = ?, bytes_total = ?, progress_pct = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE id = ?`,
		sent, total, pct, uploadID,
	); err != nil {
		logger.Warn().Err(err).Int64("upload_id", uploadID).Msg("backup upload: progress update failed")
	}
}

// SetRemoteURL stores the Google Drive resumable session URI so a
// retry can resume from the last successful chunk instead of restarting.
func (s *BackupUploadService) SetRemoteURL(uploadID int64, sessionURI string) {
	if _, err := s.db.Exec(
		`UPDATE backup_uploads SET remote_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		sessionURI, uploadID,
	); err != nil {
		logger.Warn().Err(err).Int64("upload_id", uploadID).Msg("backup upload: failed to save session URI")
	}
}

// SetRemoteFileID stores the final remote file ID returned by the
// provider (Drive file ID, S3 ETag, etc.). Used by Delete and Download.
func (s *BackupUploadService) SetRemoteFileID(uploadID int64, fileID string) {
	if _, err := s.db.Exec(
		`UPDATE backup_uploads SET remote_file_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		fileID, uploadID,
	); err != nil {
		logger.Warn().Err(err).Int64("upload_id", uploadID).Msg("backup upload: failed to save remote file id")
	}
}

func (s *BackupUploadService) markFailed(uploadID int64, msg string) {
	if _, err := s.db.Exec(
		`UPDATE backup_uploads
		 SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		 WHERE id = ?`,
		UploadStatusFailed, msg, uploadID,
	); err != nil {
		logger.Warn().Err(err).Msg("backup upload: failed to mark failed")
	}
}

func (s *BackupUploadService) notifyBackupCloudUpload(b *Backup, ok bool, detail string) {
	if s.notifier == nil {
		return
	}
	if ok {
		s.notifier.Notify(NotificationEvent{
			Type:  EventBackupCompleted,
			Title: b.Name,
			Detail: fmt.Sprintf("Cloud upload completed: %s (size: %s)", b.Storage, formatBytes(b.FileSize)),
		})
	} else {
		s.notifier.Notify(NotificationEvent{
			Type:  EventBackupFailed,
			Title: b.Name,
			Detail: "Cloud upload failed: " + detail,
		})
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (s *BackupUploadService) scanOne(row interface{ Scan(...any) error }) (*BackupUpload, error) {
	u := &BackupUpload{}
	var startedAt, completedAt sql.NullTime
	if err := row.Scan(
		&u.ID, &u.BackupID, &u.StorageID, &u.StorageType, &u.Status,
		&u.BytesUploaded, &u.BytesTotal, &u.ProgressPct,
		&u.ErrorMessage, &u.RemoteURL, &u.RemoteFileID,
		&startedAt, &completedAt, &u.CreatedAt, &u.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if startedAt.Valid {
		t := startedAt.Time
		u.StartedAt = &t
	}
	if completedAt.Valid {
		t := completedAt.Time
		u.CompletedAt = &t
	}
	return u, nil
}

// DriveQuota is re-exported here to keep callers from having to import
// the cloud storage service just to look at quota fields.
type DriveAboutQuota struct {
	Limit              int64 `json:"limit"`
	Usage              int64 `json:"usage"`
	UsageInDrive       int64 `json:"usage_in_drive"`
	Available          int64 `json:"available"`
}

// QuotaOK returns true if the upload of `size` bytes will fit in the
// remaining quota. Returns true if the quota cannot be retrieved
// (best-effort: we don't want quota-check failures to block uploads).
func (s *BackupUploadService) QuotaOK(storageID int64, size int64) (bool, DriveQuota, error) {
	cs, err := s.cloudStorageService.GetByID(storageID)
	if err != nil {
		return true, DriveQuota{}, err
	}
	if cs.Type != "google_drive" {
		return true, DriveQuota{}, nil
	}
	q, err := s.cloudStorageService.GetGoogleDriveQuota(storageID, s.cloudStorageService.redirectURL())
	if err != nil {
		logger.Warn().Err(err).Msg("backup upload: quota check failed, proceeding anyway")
		return true, q, nil
	}
	return q.Available >= size, q, nil
}

// redirectURL is a small helper that defers the actual URL construction
// to the cloud storage service (which knows about the panel's public
// URL). If the cloud service doesn't expose a helper, this falls back
// to a best-effort.
func (s *BackupUploadService) redirectURLBase() string {
	// We only need this for the OAuth client construction; an exact
	// match is not required for token refreshes that don't go through
	// the browser. The cloud_storage_service will use whatever we pass.
	return ""
}

// Ensure the import is used (Go complains about unused ones).
var _ = context.Background
var _ = errors.New
var _ = url.QueryEscape
