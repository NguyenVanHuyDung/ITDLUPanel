package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/pkg/validator"
	"github.com/ITDLUPanel/panel/internal/service"
)

// CronHandler handles cron job management API endpoints.
type CronHandler struct {
	cronService *service.CronService
}

// NewCronHandler creates a new CronHandler.
func NewCronHandler(cronService *service.CronService) *CronHandler {
	return &CronHandler{cronService: cronService}
}

// RegisterRoutes registers all cron job routes.
func (h *CronHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	crons := rg.Group("/crons")
	crons.Use(authMW)
	{
		crons.GET("", rbac("cron.read"), h.ListCrons)
		crons.POST("", rbac("cron.create"), h.CreateCron)
		crons.GET("/:id", rbac("cron.read"), h.GetCron)
		crons.PUT("/:id", rbac("cron.edit"), h.UpdateCron)
		crons.DELETE("/:id", rbac("cron.delete"), h.DeleteCron)
		crons.PUT("/:id/status", rbac("cron.edit"), h.SetStatus)
		crons.GET("/:id/log", rbac("cron.read"), h.GetLog)
		crons.POST("/:id/run", rbac("cron.edit"), h.RunNow)
	}
}

// ---------------------------------------------------------------------------
// List & CRUD
// ---------------------------------------------------------------------------

type listCronsQuery struct {
	Page    int `form:"page"`
	PerPage int `form:"per_page"`
}

// ListCrons returns a paginated list of cron jobs.
func (h *CronHandler) ListCrons(c *gin.Context) {
	var q listCronsQuery
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

	crons, total, err := h.cronService.List(q.Page, q.PerPage)
	if err != nil {
		response.Error(c, err)
		return
	}

	totalPages := total / q.PerPage
	if total%q.PerPage > 0 {
		totalPages++
	}

	response.Paginated(c, crons, response.Pagination{
		Page:       q.Page,
		PerPage:    q.PerPage,
		Total:      int64(total),
		TotalPages: totalPages,
	})
}

// CreateCron creates a new cron job.
func (h *CronHandler) CreateCron(c *gin.Context) {
	var req service.CreateCronRequest
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

	cron, err := h.cronService.Create(req)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, cron)
}

// GetCron returns a single cron job by ID.
func (h *CronHandler) GetCron(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	cron, err := h.cronService.GetByID(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, cron)
}

// UpdateCron modifies an existing cron job.
func (h *CronHandler) UpdateCron(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req service.UpdateCronRequest
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

	if err := h.cronService.Update(id, req); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "cron job updated successfully"})
}

// DeleteCron removes a cron job.
func (h *CronHandler) DeleteCron(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	if err := h.cronService.Delete(id); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "cron job deleted successfully"})
}

// ---------------------------------------------------------------------------
// Status & Log
// ---------------------------------------------------------------------------

type setStatusRequest struct {
	Enabled bool `json:"enabled"`
}

// SetStatus enables or disables a cron job.
func (h *CronHandler) SetStatus(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	var req setStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if err := h.cronService.SetStatus(id, req.Enabled); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "cron job status updated successfully"})
}

// GetLog returns the execution log of a cron job.
func (h *CronHandler) GetLog(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	log, err := h.cronService.GetLog(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"content": log})
}

// RunNow executes a cron job immediately and returns the output.
func (h *CronHandler) RunNow(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}

	output, err := h.cronService.RunNow(id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"output": output})
}
