package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/pkg/validator"
	"github.com/ITDLUPanel/panel/internal/service"
)

// DatabaseHandler handles database management API endpoints.
type DatabaseHandler struct {
	dbService *service.DatabaseService
}

// NewDatabaseHandler creates a new DatabaseHandler.
func NewDatabaseHandler(dbService *service.DatabaseService) *DatabaseHandler {
	return &DatabaseHandler{dbService: dbService}
}

// RegisterRoutes registers database management routes.
func (h *DatabaseHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, permMW gin.HandlerFunc) {
	db := rg.Group("/databases")
	db.Use(authMW, permMW)
	{
		db.GET("", h.List)
		db.POST("", h.Create)
		db.GET("/:id", h.Get)
		db.DELETE("/:id", h.Delete)
		db.PUT("/:id/password", h.ChangePassword)
		db.POST("/:id/backup", h.Backup)
		db.POST("/:id/restore", h.Restore)
		db.GET("/:id/size", h.GetSize)
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

	databases, total, err := h.dbService.List(q.Page, q.PerPage)
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

	response.Created(c, db)
}

// Get returns details for a single database.
func (h *DatabaseHandler) Get(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
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

	if err := h.dbService.Delete(id); err != nil {
		response.Error(c, err)
		return
	}

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

	size, err := h.dbService.GetSize(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"size": size})
}
