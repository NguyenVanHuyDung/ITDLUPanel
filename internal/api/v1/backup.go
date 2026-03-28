package v1

import (
	"path/filepath"

	"github.com/gin-gonic/gin"

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
func (h *BackupHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, permMW gin.HandlerFunc) {
	backups := rg.Group("/backups")
	backups.Use(authMW, permMW)
	{
		backups.GET("", h.List)
		backups.POST("", h.Create)
		backups.GET("/site-counts", h.SiteBackupCounts)
		backups.GET("/database-counts", h.DatabaseBackupCounts)
		backups.GET("/:id", h.Get)
		backups.DELETE("/:id", h.Delete)
		backups.POST("/:id/restore", h.Restore)
		backups.GET("/:id/download", h.Download)
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
	Type     string `json:"type" validate:"required,oneof=site database panel"`
	TargetID int64  `json:"target_id"`
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