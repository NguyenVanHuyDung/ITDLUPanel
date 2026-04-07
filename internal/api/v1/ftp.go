package v1

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/pkg/validator"
	"github.com/ITDLUPanel/panel/internal/service"
)

// FTPHandler handles FTP account management API endpoints.
type FTPHandler struct {
	ftpService          *service.FTPService
	userResourceService *service.UserResourceService
}

// NewFTPHandler creates a new FTPHandler.
func NewFTPHandler(ftpService *service.FTPService, userResourceService *service.UserResourceService) *FTPHandler {
	return &FTPHandler{ftpService: ftpService, userResourceService: userResourceService}
}

// requireAccess checks if a non-admin user has access to an FTP resource.
func (h *FTPHandler) requireAccess(c *gin.Context, ftpID int64) bool {
	role, _ := c.Get("role")
	if role == "admin" {
		return true
	}
	userID, _ := c.Get("user_id")
	uid, _ := userID.(int64)
	hasAccess, err := h.userResourceService.HasAccess(uid, "ftp", ftpID)
	if err != nil || !hasAccess {
		c.JSON(http.StatusForbidden, response.Response{
			Code:    http.StatusForbidden,
			Message: "access denied to this resource",
		})
		return false
	}
	return true
}

// getAllowedFTPIDs returns nil for admins (no filter) or the list of allowed IDs for non-admins.
func (h *FTPHandler) getAllowedFTPIDs(c *gin.Context) []int64 {
	role, _ := c.Get("role")
	if role == "admin" {
		return nil
	}
	userID, _ := c.Get("user_id")
	uid, _ := userID.(int64)
	ids, _ := h.userResourceService.ListResourceIDs(uid, "ftp")
	if ids == nil {
		ids = []int64{}
	}
	return ids
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

	accounts, total, err := h.ftpService.List(q.Page, q.PerPage, h.getAllowedFTPIDs(c))
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

	// Auto-assign newly created FTP account to non-admin user
	role, _ := c.Get("role")
	if role != "admin" {
		userID, _ := c.Get("user_id")
		uid, _ := userID.(int64)
		_ = h.userResourceService.Assign(uid, "ftp", account.ID)
	}

	response.Created(c, account)
}

// Get returns details for a single FTP account.
func (h *FTPHandler) Get(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if !h.requireAccess(c, id) {
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

	if !h.requireAccess(c, id) {
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

	if !h.requireAccess(c, id) {
		return
	}

	if err := h.ftpService.Delete(id); err != nil {
		response.Error(c, err)
		return
	}

	_ = h.userResourceService.RemoveAllForResource("ftp", id)

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

	if !h.requireAccess(c, id) {
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

	if !h.requireAccess(c, id) {
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

// filterAllowedIDs filters a list of IDs to only those the current user can access.
func (h *FTPHandler) filterAllowedIDs(c *gin.Context, ids []int64) []int64 {
	role, _ := c.Get("role")
	if role == "admin" {
		return ids
	}
	userID, _ := c.Get("user_id")
	uid, _ := userID.(int64)
	var allowed []int64
	for _, id := range ids {
		has, _ := h.userResourceService.HasAccess(uid, "ftp", id)
		if has {
			allowed = append(allowed, id)
		}
	}
	return allowed
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

	req.IDs = h.filterAllowedIDs(c, req.IDs)
	success, failed := 0, 0
	for _, id := range req.IDs {
		if err := h.ftpService.Delete(id); err != nil {
			failed++
		} else {
			_ = h.userResourceService.RemoveAllForResource("ftp", id)
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
	for _, id := range h.filterAllowedIDs(c, req.IDs) {
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
	for _, id := range h.filterAllowedIDs(c, req.IDs) {
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
