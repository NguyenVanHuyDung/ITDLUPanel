package v1

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/config"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/pkg/validator"
	"github.com/ITDLUPanel/panel/internal/service"
)

// DatabaseHandler handles database management API endpoints.
type DatabaseHandler struct {
	dbService           *service.DatabaseService
	userResourceService *service.UserResourceService
}

// NewDatabaseHandler creates a new DatabaseHandler.
func NewDatabaseHandler(dbService *service.DatabaseService, userResourceService *service.UserResourceService) *DatabaseHandler {
	return &DatabaseHandler{dbService: dbService, userResourceService: userResourceService}
}

// requireAccess checks if a non-admin user has access to a database resource.
func (h *DatabaseHandler) requireAccess(c *gin.Context, dbID int64) bool {
	role, _ := c.Get("role")
	if role == "admin" {
		return true
	}
	userID, _ := c.Get("user_id")
	uid, _ := userID.(int64)
	hasAccess, err := h.userResourceService.HasAccess(uid, "database", dbID)
	if err != nil || !hasAccess {
		c.JSON(http.StatusForbidden, response.Response{
			Code:    http.StatusForbidden,
			Message: "access denied to this resource",
		})
		return false
	}
	return true
}

// getAllowedDBIDs returns nil for admins (no filter) or the list of allowed IDs for non-admins.
func (h *DatabaseHandler) getAllowedDBIDs(c *gin.Context) []int64 {
	role, _ := c.Get("role")
	if role == "admin" {
		return nil
	}
	userID, _ := c.Get("user_id")
	uid, _ := userID.(int64)
	ids, _ := h.userResourceService.ListResourceIDs(uid, "database")
	if ids == nil {
		ids = []int64{}
	}
	return ids
}

// RegisterRoutes registers database management routes.
func (h *DatabaseHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	db := rg.Group("/databases")
	db.Use(authMW)
	{
		db.GET("", rbac("databases.read"), h.List)
		db.POST("", rbac("databases.create"), h.Create)
		db.GET("/:id", rbac("databases.read"), h.Get)
		db.DELETE("/:id", rbac("databases.delete"), h.Delete)
		db.PUT("/:id/password", rbac("databases.edit"), h.ChangePassword)
		db.POST("/:id/backup", rbac("databases.backup"), h.Backup)
		db.POST("/:id/restore", rbac("databases.backup"), h.Restore)
		db.POST("/:id/import", rbac("databases.edit"), h.Import)
		db.PUT("/:id/access", rbac("databases.edit"), h.SetAccess)
		db.GET("/version", rbac("databases.read"), h.GetVersion)
		db.POST("/service", rbac("databases.edit"), h.ServiceAction)
		db.GET("/:id/size", rbac("databases.read"), h.GetSize)
		db.PUT("/:id/quota", rbac("databases.edit"), h.SetQuota)
	}
}

// ---------------------------------------------------------------------------
// List / CRUD
// ---------------------------------------------------------------------------

type listDBQuery struct {
	Page    int `form:"page"`
	PerPage int `form:"per_page"`
}

// List returns a paginated list of databases.
func (h *DatabaseHandler) List(c *gin.Context) {
	var q listDBQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		q.Page = 1
		q.PerPage = 20
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PerPage < 1 || q.PerPage > 100 {
		q.PerPage = 20
	}

	databases, total, err := h.dbService.List(q.Page, q.PerPage, h.getAllowedDBIDs(c))
	if err != nil {
		response.Error(c, err)
		return
	}

	totalPages := total / q.PerPage
	if total%q.PerPage > 0 {
		totalPages++
	}

	response.Paginated(c, databases, response.Pagination{
		Page:       q.Page,
		PerPage:    q.PerPage,
		Total:      int64(total),
		TotalPages: totalPages,
	})
}

// Create provisions a new database.
func (h *DatabaseHandler) Create(c *gin.Context) {
	var req service.CreateDBRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	db, err := h.dbService.Create(req)
	if err != nil {
		response.Error(c, err)
		return
	}

	// Auto-assign newly created database to non-admin user
	role, _ := c.Get("role")
	if role != "admin" {
		userID, _ := c.Get("user_id")
		uid, _ := userID.(int64)
		_ = h.userResourceService.Assign(uid, "database", db.ID)
	}

	response.Created(c, db)
}

// Get returns details for a single database.
func (h *DatabaseHandler) Get(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if !h.requireAccess(c, id) {
		return
	}

	db, err := h.dbService.GetByID(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, db)
}

// Delete removes a database.
func (h *DatabaseHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if !h.requireAccess(c, id) {
		return
	}

	if err := h.dbService.Delete(id); err != nil {
		response.Error(c, err)
		return
	}

	_ = h.userResourceService.RemoveAllForResource("database", id)

	response.Success(c, gin.H{"message": "database deleted successfully"})
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

type changeDBPasswordRequest struct {
	Password string `json:"password" validate:"required,min=6"`
}

// ChangePassword updates the database user password.
func (h *DatabaseHandler) ChangePassword(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if !h.requireAccess(c, id) {
		return
	}

	var req changeDBPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	if err := h.dbService.ChangePassword(id, req.Password); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "password changed successfully"})
}

// Backup creates a database dump.
func (h *DatabaseHandler) Backup(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if !h.requireAccess(c, id) {
		return
	}

	path, err := h.dbService.Backup(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"path": path})
}

type restoreDBRequest struct {
	FilePath string `json:"file_path" validate:"required"`
}

// Restore imports a SQL dump into the database.
func (h *DatabaseHandler) Restore(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if !h.requireAccess(c, id) {
		return
	}

	var req restoreDBRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	if err := h.dbService.Restore(id, req.FilePath); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "database restored successfully"})
}

// GetSize returns the actual database size from MySQL.
func (h *DatabaseHandler) GetSize(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if !h.requireAccess(c, id) {
		return
	}

	size, err := h.dbService.GetSize(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"size": size})
}

// GetVersion returns the running MySQL/MariaDB engine version.
func (h *DatabaseHandler) GetVersion(c *gin.Context) {
	ver, err := h.dbService.GetVersion()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"version": ver})
}

// ServiceAction performs start/stop/restart/reload on the MySQL/MariaDB service.
func (h *DatabaseHandler) ServiceAction(c *gin.Context) {
	var req struct {
		Action string `json:"action" validate:"required,oneof=start stop restart reload"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid action"))
		return
	}
	if err := h.dbService.ServiceAction(req.Action); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"action": req.Action, "status": "ok"})
}

type setAccessRequest struct {
	Host string `json:"host" validate:"required"`
}

// SetAccess changes the remote access permission for a database user.
func (h *DatabaseHandler) SetAccess(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if !h.requireAccess(c, id) {
		return
	}

	var req setAccessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	if err := h.dbService.SetRemoteAccess(id, req.Host); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "access permission updated"})
}

// Import uploads a SQL file and imports it into the database.
func (h *DatabaseHandler) Import(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if !h.requireAccess(c, id) {
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "file", Message: "SQL file is required"},
		})
		return
	}
	defer file.Close()

	name := header.Filename
	ext := strings.ToLower(filepath.Ext(name))
	if ext == ".gz" {
		ext = strings.ToLower(filepath.Ext(strings.TrimSuffix(name, ".gz"))) + ".gz"
	}
	if ext != ".sql" && ext != ".sql.gz" {
		response.ValidationError(c, []response.FieldError{
			{Field: "file", Message: "Only .sql and .sql.gz files are supported"},
		})
		return
	}

	// Save to a temporary location in the backup directory
	cfg := config.Get()
	backupDir := filepath.Join(cfg.Paths.Backup, "database")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		response.Error(c, fmt.Errorf("failed to create backup directory: %w", err))
		return
	}

	destPath := filepath.Join(backupDir, fmt.Sprintf("import_%d_%s", id, name))
	out, err := os.Create(destPath)
	if err != nil {
		response.Error(c, fmt.Errorf("failed to save uploaded file: %w", err))
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		os.Remove(destPath)
		response.Error(c, fmt.Errorf("failed to write uploaded file: %w", err))
		return
	}
	out.Close()

	if err := h.dbService.ImportSQL(id, destPath); err != nil {
		os.Remove(destPath)
		response.Error(c, err)
		return
	}

	// Clean up the uploaded file after import
	os.Remove(destPath)
	response.Success(c, gin.H{"message": "SQL file imported successfully"})
}

// ---------------------------------------------------------------------------
// Disk Quota
// ---------------------------------------------------------------------------

type setDBQuotaRequest struct {
	DiskQuota int64 `json:"disk_quota" validate:"min=0"`
}

// SetQuota sets the disk quota for a database.
func (h *DatabaseHandler) SetQuota(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if !h.requireAccess(c, id) {
		return
	}

	var req setDBQuotaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "invalid request body"}})
		return
	}

	if err := h.dbService.SetDiskQuota(id, req.DiskQuota); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "disk quota updated"})
}
