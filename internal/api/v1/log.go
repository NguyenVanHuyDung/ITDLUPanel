package v1

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// LogHandler handles log management API endpoints.
type LogHandler struct {
	logService *service.LogService
}

// NewLogHandler creates a new LogHandler.
func NewLogHandler(logService *service.LogService) *LogHandler {
	return &LogHandler{logService: logService}
}

// RegisterRoutes registers log management routes.
func (h *LogHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, permMW gin.HandlerFunc) {
	logs := rg.Group("/logs")
	logs.Use(authMW, permMW)
	{
		logs.GET("/panel", h.GetPanelLog)
		logs.GET("/website/:id/access", h.GetWebsiteAccessLog)
		logs.GET("/website/:id/error", h.GetWebsiteErrorLog)
		logs.DELETE("/website/:id/:logType", h.ClearWebsiteLog)
		logs.GET("/sites", h.ListSitesMinimal)
		logs.GET("/ssh", h.GetSSHLog)
		logs.GET("/audit", h.GetAuditLog)
		logs.DELETE("/:type", h.ClearLog)
		logs.GET("/search", h.SearchLog)
	}
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

func getLines(c *gin.Context) int {
	lines, err := strconv.Atoi(c.DefaultQuery("lines", "100"))
	if err != nil || lines < 1 {
		return 100
	}
	return lines
}

// GetPanelLog returns the last N lines of the panel log.
func (h *LogHandler) GetPanelLog(c *gin.Context) {
	data, err := h.logService.GetPanelLog(getLines(c))
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"lines": data})
}

// GetWebsiteAccessLog returns the last N lines of a website's access log.
func (h *LogHandler) GetWebsiteAccessLog(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	data, err := h.logService.GetWebsiteAccessLog(id, getLines(c))
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"lines": data})
}

// GetWebsiteErrorLog returns the last N lines of a website's error log.
func (h *LogHandler) GetWebsiteErrorLog(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	data, err := h.logService.GetWebsiteErrorLog(id, getLines(c))
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"lines": data})
}

// GetSSHLog returns the last N lines of the SSH authentication log.
func (h *LogHandler) GetSSHLog(c *gin.Context) {
	data, err := h.logService.GetSSHLog(getLines(c))
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"lines": data})
}

type auditLogQuery struct {
	Page     int `form:"page"`
	PageSize int `form:"page_size"`
}

// GetAuditLog returns a paginated list of audit log entries.
func (h *LogHandler) GetAuditLog(c *gin.Context) {
	var q auditLogQuery
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

	entries, total, err := h.logService.GetAuditLog(q.Page, q.PageSize)
	if err != nil {
		response.Error(c, err)
		return
	}

	totalPages := total / q.PageSize
	if total%q.PageSize > 0 {
		totalPages++
	}

	response.Paginated(c, entries, response.Pagination{
		Page:       q.Page,
		PerPage:    q.PageSize,
		Total:      int64(total),
		TotalPages: totalPages,
	})
}

// ClearLog truncates a log file by type.
func (h *LogHandler) ClearLog(c *gin.Context) {
	logType := c.Param("type")
	if err := h.logService.ClearLog(logType); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "log cleared successfully"})
}

// ClearWebsiteLog clears a website's access or error log.
func (h *LogHandler) ClearWebsiteLog(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		return
	}
	logType := c.Param("logType")
	if err := h.logService.ClearWebsiteLog(id, logType); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "website log cleared successfully"})
}

// ListSitesMinimal returns a minimal list of sites for the log viewer dropdown.
func (h *LogHandler) ListSitesMinimal(c *gin.Context) {
	sites, err := h.logService.ListSitesMinimal()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, sites)
}

type searchLogQuery struct {
	Path    string `form:"path"`
	Pattern string `form:"pattern"`
	Lines   int    `form:"lines"`
}

// SearchLog searches for a pattern in a log file.
func (h *LogHandler) SearchLog(c *gin.Context) {
	var q searchLogQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "query", Message: "invalid query parameters"},
		})
		return
	}

	if q.Path == "" || q.Pattern == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "path", Message: "path is required"},
			{Field: "pattern", Message: "pattern is required"},
		})
		return
	}

	if q.Lines < 1 {
		q.Lines = 100
	}

	data, err := h.logService.SearchLog(q.Path, q.Pattern, q.Lines)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"lines": data})
}
