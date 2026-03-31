package v1

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/pkg/validator"
	"github.com/ITDLUPanel/panel/internal/service"
)

// FTPHandler handles FTP account management API endpoints.
type FTPHandler struct {
	ftpService *service.FTPService
}

// NewFTPHandler creates a new FTPHandler.
func NewFTPHandler(ftpService *service.FTPService) *FTPHandler {
	return &FTPHandler{ftpService: ftpService}
}

// RegisterRoutes registers FTP management routes.
func (h *FTPHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	ftp := rg.Group("/ftp")
	ftp.Use(authMW)
	{
		ftp.GET("", rbac("ftp.read"), h.List)
		ftp.POST("", rbac("ftp.create"), h.Create)
		ftp.GET("/:id", rbac("ftp.read"), h.Get)
		ftp.PUT("/:id", rbac("ftp.edit"), h.Update)
		ftp.DELETE("/:id", rbac("ftp.delete"), h.Delete)
		ftp.PUT("/:id/password", rbac("ftp.edit"), h.ChangePassword)
		ftp.PUT("/:id/status", rbac("ftp.edit"), h.SetStatus)
		// Batch operations
		ftp.POST("/batch/delete", rbac("ftp.delete"), h.BatchDelete)
		ftp.POST("/batch/status", rbac("ftp.edit"), h.BatchSetStatus)
		ftp.POST("/batch/path", rbac("ftp.edit"), h.BatchUpdatePath)
	}
}

// ---------------------------------------------------------------------------
// List / CRUD
// ---------------------------------------------------------------------------

type listFTPQuery struct {
	Page    int `form:"page"`
	PerPage int `form:"per_page"`
}

// List returns a paginated list of FTP accounts.
func (h *FTPHandler) List(c *gin.Context) {
	var q listFTPQuery
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

	accounts, total, err := h.ftpService.List(q.Page, q.PerPage)
	if err != nil {
		response.Error(c, err)
		return
	}

	totalPages := total / q.PerPage
	if total%q.PerPage > 0 {
		totalPages++
	}

	response.Paginated(c, accounts, response.Pagination{
		Page:       q.Page,
		PerPage:    q.PerPage,
		Total:      int64(total),
		TotalPages: totalPages,
	})
}

// Create provisions a new FTP account.
func (h *FTPHandler) Create(c *gin.Context) {
	var req service.CreateFTPRequest
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

	account, err := h.ftpService.Create(req)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, account)
}

// Get returns details for a single FTP account.
func (h *FTPHandler) Get(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	account, err := h.ftpService.GetByID(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, account)
}

// Update modifies an FTP account.
func (h *FTPHandler) Update(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req service.UpdateFTPRequest
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

	if err := h.ftpService.Update(id, req); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "FTP account updated successfully"})
}

// Delete removes an FTP account.
func (h *FTPHandler) Delete(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if err := h.ftpService.Delete(id); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "FTP account deleted successfully"})
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

type changeFTPPasswordRequest struct {
	Password string `json:"password" validate:"required,min=6"`
}

// ChangePassword updates the FTP user password.
func (h *FTPHandler) ChangePassword(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req changeFTPPasswordRequest
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

	if err := h.ftpService.ChangePassword(id, req.Password); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "FTP password changed successfully"})
}

type setFTPStatusRequest struct {
	Enabled bool `json:"enabled"`
}

// SetStatus enables or disables an FTP account.
func (h *FTPHandler) SetStatus(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req setFTPStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if err := h.ftpService.SetStatus(id, req.Enabled); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "FTP account status updated successfully"})
}

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

type ftpBatchIDsRequest struct {
	IDs []int64 `json:"ids" validate:"required,min=1"`
}

type ftpBatchStatusRequest struct {
	IDs     []int64 `json:"ids" validate:"required,min=1"`
	Enabled bool    `json:"enabled"`
}

type ftpBatchPathRequest struct {
	IDs  []int64 `json:"ids" validate:"required,min=1"`
	Path string  `json:"path" validate:"required"`
}

// BatchDelete removes multiple FTP accounts at once.
func (h *FTPHandler) BatchDelete(c *gin.Context) {
	var req ftpBatchIDsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	success, failed := 0, 0
	for _, id := range req.IDs {
		if err := h.ftpService.Delete(id); err != nil {
			failed++
		} else {
			success++
		}
	}

	response.Success(c, gin.H{
		"message": fmt.Sprintf("Deleted %d account(s), %d failed", success, failed),
		"success": success,
		"failed":  failed,
	})
}

// BatchSetStatus enables or disables multiple FTP accounts at once.
func (h *FTPHandler) BatchSetStatus(c *gin.Context) {
	var req ftpBatchStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	success, failed := 0, 0
	for _, id := range req.IDs {
		if err := h.ftpService.SetStatus(id, req.Enabled); err != nil {
			failed++
		} else {
			success++
		}
	}

	response.Success(c, gin.H{
		"message": fmt.Sprintf("Updated %d account(s), %d failed", success, failed),
		"success": success,
		"failed":  failed,
	})
}

// BatchUpdatePath updates the home directory for multiple FTP accounts at once.
func (h *FTPHandler) BatchUpdatePath(c *gin.Context) {
	var req ftpBatchPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	success, failed := 0, 0
	for _, id := range req.IDs {
		if err := h.ftpService.Update(id, service.UpdateFTPRequest{Path: req.Path}); err != nil {
			failed++
		} else {
			success++
		}
	}

	response.Success(c, gin.H{
		"message": fmt.Sprintf("Updated %d account(s), %d failed", success, failed),
		"success": success,
		"failed":  failed,
	})
}
