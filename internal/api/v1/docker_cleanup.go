package v1

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// DockerCleanupHandler handles Docker auto-cleanup API requests.
type DockerCleanupHandler struct {
	svc *service.DockerCleanupService
}

// NewDockerCleanupHandler creates a new DockerCleanupHandler.
func NewDockerCleanupHandler(svc *service.DockerCleanupService) *DockerCleanupHandler {
	return &DockerCleanupHandler{svc: svc}
}

// RegisterRoutes registers cleanup routes under /docker/cleanup.
func (h *DockerCleanupHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	g := rg.Group("/docker/cleanup")
	g.Use(authMW)
	{
		g.POST("/rules", rbac("docker.cleanup"), h.createRule)
		g.GET("/rules", rbac("docker.cleanup"), h.listRules)
		g.GET("/rules/:id", rbac("docker.cleanup"), h.getRule)
		g.PUT("/rules/:id", rbac("docker.cleanup"), h.updateRule)
		g.DELETE("/rules/:id", rbac("docker.cleanup"), h.deleteRule)
		g.POST("/rules/:id/run", rbac("docker.cleanup"), h.runCleanup)

		g.GET("/logs", rbac("docker.cleanup"), h.getLogs)
		g.GET("/logs/:rule_id", rbac("docker.cleanup"), h.getLogsForRule)
		g.DELETE("/logs/:rule_id", rbac("docker.cleanup"), h.clearLogs)

		g.GET("/stats", rbac("docker.cleanup"), h.getStats)
		g.POST("/dry-run", rbac("docker.cleanup"), h.dryRun)
	}
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

type createRuleRequest struct {
	Name         string   `json:"name" binding:"required"`
	CleanupTypes []string `json:"cleanup_types" binding:"required,min=1"`
	Mode         string   `json:"mode" binding:"required,oneof=manual schedule threshold"`
	Schedule     string   `json:"schedule"`
	ThresholdPct *int     `json:"threshold_pct"`
	Enabled      *bool    `json:"enabled"`
	KeepLastLog  *int     `json:"keep_last_log"`
}

func (h *DockerCleanupHandler) createRule(c *gin.Context) {
	var req createRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, apperrors.New(apperrors.ErrValidation, err.Error()))
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	keepLastLog := 10
	if req.KeepLastLog != nil {
		keepLastLog = *req.KeepLastLog
	}
	userID := getUserID(c)
	rule, err := h.svc.CreateRule(req.Name, req.CleanupTypes, req.Mode,
		req.Schedule, req.ThresholdPct, enabled, keepLastLog, userID)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, rule)
}

func (h *DockerCleanupHandler) listRules(c *gin.Context) {
	rules, err := h.svc.ListRules()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	if rules == nil {
		rules = []service.CleanupRule{}
	}
	response.Success(c, rules)
}

func (h *DockerCleanupHandler) getRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	rule, err := h.svc.GetRule(id)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	if rule == nil {
		response.Error(c, apperrors.New(apperrors.ErrNotFound, "rule not found"))
		return
	}
	response.Success(c, rule)
}

func (h *DockerCleanupHandler) updateRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	var req createRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, apperrors.New(apperrors.ErrValidation, err.Error()))
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	keepLastLog := 10
	if req.KeepLastLog != nil {
		keepLastLog = *req.KeepLastLog
	}
	rule, err := h.svc.UpdateRule(id, req.Name, req.CleanupTypes, req.Mode,
		req.Schedule, req.ThresholdPct, enabled, keepLastLog)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, rule)
}

func (h *DockerCleanupHandler) deleteRule(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	if err := h.svc.DeleteRule(id); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"deleted": true})
}

func (h *DockerCleanupHandler) runCleanup(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	result, err := h.svc.RunCleanup(id, "manual")
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, result)
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

func (h *DockerCleanupHandler) getLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("per_page", "50"))
	logs, total, err := h.svc.GetLogs(0, page, limit)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	if logs == nil {
		logs = []service.CleanupLog{}
	}
	c.JSON(http.StatusOK, gin.H{
		"code":    http.StatusOK,
		"message": "success",
		"data":    logs,
		"total":   total,
		"page":    page,
		"per_page": limit,
	})
}

func (h *DockerCleanupHandler) getLogsForRule(c *gin.Context) {
	ruleID, err := parseID(c, "rule_id")
	if err != nil {
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("per_page", "50"))
	logs, total, err := h.svc.GetLogs(ruleID, page, limit)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	if logs == nil {
		logs = []service.CleanupLog{}
	}
	c.JSON(http.StatusOK, gin.H{
		"code":    http.StatusOK,
		"message": "success",
		"data":    logs,
		"total":   total,
	})
}

func (h *DockerCleanupHandler) clearLogs(c *gin.Context) {
	ruleID, err := parseID(c, "rule_id")
	if err != nil {
		return
	}
	if err := h.svc.ClearLogs(ruleID); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"cleared": true})
}

// ---------------------------------------------------------------------------
// Stats & Dry-run
// ---------------------------------------------------------------------------

func (h *DockerCleanupHandler) getStats(c *gin.Context) {
	stats, err := h.svc.GetStats()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, stats)
}

type dryRunRequest struct {
	Types []string `json:"types" binding:"required,min=1"`
}

func (h *DockerCleanupHandler) dryRun(c *gin.Context) {
	var req dryRunRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, apperrors.New(apperrors.ErrValidation, err.Error()))
		return
	}
	result, err := h.svc.DryRun(req.Types)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, result)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func getUserID(c *gin.Context) *int64 {
	if v, exists := c.Get("user_id"); exists {
		if id, ok := v.(int64); ok {
			return &id
		}
	}
	return nil
}
