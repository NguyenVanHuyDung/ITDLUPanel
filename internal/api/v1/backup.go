package v1

import (
	"path/filepath"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// BackupHandler handles backup management API endpoints.
type BackupHandler struct {
	backupService *service.BackupService
}

// NewBackupHandler creates a new BackupHandler.
func NewBackupHandler(backupService *service.BackupService) *BackupHandler {
	return &BackupHandler{backupService: backupService}
}

// RegisterRoutes registers backup management routes.
func (h *BackupHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	backups := rg.Group("/backups")
	backups.Use(authMW)
	{
		backups.GET("", rbac("backup.read"), h.List)
		backups.POST("", rbac("backup.create"), h.Create)
		backups.GET("/site-counts", rbac("backup.read"), h.SiteBackupCounts)
		backups.GET("/database-counts", rbac("backup.read"), h.DatabaseBackupCounts)
		backups.GET("/uploads/:upload_id", rbac("backup.read"), h.GetUpload)
		backups.DELETE("/uploads/:upload_id", rbac("backup.delete"), h.CancelUpload)
		backups.GET("/:id", rbac("backup.read"), h.Get)
		backups.DELETE("/:id", rbac("backup.delete"), h.Delete)
		backups.POST("/:id/restore", rbac("backup.restore"), h.Restore)
		backups.GET("/:id/download", rbac("backup.read"), h.Download)
		backups.POST("/:id/upload", rbac("backup.create"), h.StartUpload)
		backups.GET("/:id/uploads", rbac("backup.read"), h.ListUploads)
	}
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type listBackupsQuery struct {
	Page     int    `form:"page"`
	PageSize int    `form:"page_size"`
	Type     string `form:"type"`
	TargetID int64  `form:"target_id"`
}

// List returns a paginated list of backups.
func (h *BackupHandler) List(c *gin.Context) {
	var q listBackupsQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		q.Page = 1
		q.PageSize = 20
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 || q.PageSize > 100 {
		q.PageSize = 20
	}

	backups, total, err := h.backupService.List(q.Page, q.PageSize, q.Type, q.TargetID)
	if err != nil {
		response.Error(c, err)
		return
	}

	totalPages := total / q.PageSize
	if total%q.PageSize > 0 {
		totalPages++
	}

	response.Paginated(c, backups, response.Pagination{
		Page:       q.Page,
		PerPage:    q.PageSize,
		Total:      int64(total),
		TotalPages: totalPages,
	})
}

type createBackupRequest struct {
	Type      string `json:"type" validate:"required,oneof=site database panel"`
	TargetID  int64  `json:"target_id"`
	Storage   string `json:"storage"`
	StorageID *int64 `json:"storage_id"`
}

// Create creates a new backup.
func (h *BackupHandler) Create(c *gin.Context) {
	var req createBackupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if req.Type != "panel" && req.TargetID < 1 {
		response.ValidationError(c, []response.FieldError{
			{Field: "target_id", Message: "target_id is required for this backup type"},
		})
		return
	}

	// Extract created_by from auth context.
	createdBy, _ := c.Get("user_id")
	userID, _ := createdBy.(int64)

	var (
		backup *service.Backup
		err    error
	)

	switch req.Type {
	case "site":
		backup, err = h.backupService.CreateSiteBackup(req.TargetID, userID)
	case "database":
		backup, err = h.backupService.CreateDatabaseBackup(req.TargetID, userID)
	case "panel":
		backup, err = h.backupService.CreatePanelBackup(userID)
	}

	if err != nil {
		response.Error(c, err)
		return
	}

	// After backup created, enqueue an async upload to remote storage.
	// We intentionally do NOT block the HTTP response on the upload:
	// a multi-GB Google Drive transfer can take several minutes, and
	// the caller can poll /backups/{id}/uploads for progress.
	if req.Storage != "" && req.StorageID != nil && backup != nil {
		switch req.Storage {
		case "ftp":
			// FTP transfers are usually quick on the LAN; keep them
			// synchronous so errors surface immediately.
			if err := h.backupService.UploadBackupToFTP(backup.ID, *req.StorageID); err != nil {
				logger.Warn().Err(err).Msg("failed to upload backup to FTP storage")
			}
		case "google_drive", "s3", "onedrive":
			if err := h.backupService.UploadBackupToCloud(backup.ID, *req.StorageID, req.Storage); err != nil {
				logger.Warn().Err(err).Str("storage", req.Storage).Msg("failed to enqueue cloud upload")
			}
		}
		backup, _ = h.backupService.GetByID(backup.ID)
	}

	response.Created(c, backup)
}

// Get returns details of a single backup.
func (h *BackupHandler) Get(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	backup, err := h.backupService.GetByID(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, backup)
}

// Delete removes a backup file and its record.
func (h *BackupHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if err := h.backupService.Delete(id); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "backup deleted successfully"})
}

// Restore applies a backup.
func (h *BackupHandler) Restore(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if err := h.backupService.Restore(id); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "backup restored successfully"})
}

// Download serves the backup file for download.
func (h *BackupHandler) Download(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	filePath, err := h.backupService.GetDownloadPath(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	c.FileAttachment(filePath, filepath.Base(filePath))
}

// SiteBackupCounts returns a map of site_id → backup count.
func (h *BackupHandler) SiteBackupCounts(c *gin.Context) {
	counts, err := h.backupService.SiteBackupCounts()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, counts)
}

// DatabaseBackupCounts returns a map of database_id → backup count.
func (h *BackupHandler) DatabaseBackupCounts(c *gin.Context) {
	counts, err := h.backupService.DatabaseBackupCounts()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, counts)
}

type startUploadRequest struct {
	StorageID int64 `json:"storage_id" validate:"required"`
}

// StartUpload enqueues an async upload of an existing backup to the
// specified cloud storage. The function returns the backup_uploads row
// immediately so the caller can poll progress via ListUploads/GetUpload.
func (h *BackupHandler) StartUpload(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req startUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}
	if req.StorageID <= 0 {
		response.ValidationError(c, []response.FieldError{
			{Field: "storage_id", Message: "storage_id is required"},
		})
		return
	}

	upload, err := h.backupService.StartCloudUpload(id, req.StorageID)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, upload)
}

// ListUploads returns all upload attempts for a backup.
func (h *BackupHandler) ListUploads(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	uploads, err := h.backupService.ListUploads(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	if uploads == nil {
		uploads = []*service.BackupUpload{}
	}
	response.Success(c, uploads)
}

// GetUpload returns the status of a single upload (for polling).
func (h *BackupHandler) GetUpload(c *gin.Context) {
	id, err := parseID(c, "upload_id")
	if err != nil {
		return
	}
	upload, err := h.backupService.GetUpload(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, upload)
}

// CancelUpload cancels a pending or in-flight upload.
func (h *BackupHandler) CancelUpload(c *gin.Context) {
	id, err := parseID(c, "upload_id")
	if err != nil {
		return
	}
	if err := h.backupService.CancelUpload(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "upload cancelled"})
}