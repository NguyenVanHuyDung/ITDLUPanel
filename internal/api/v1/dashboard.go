package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/database"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// DashboardHandler handles dashboard-related API requests.
type DashboardHandler struct {
	monitorService *service.MonitorService
}

// NewDashboardHandler creates a new DashboardHandler.
func NewDashboardHandler(monitorService *service.MonitorService) *DashboardHandler {
	return &DashboardHandler{monitorService: monitorService}
}

// RegisterRoutes registers dashboard routes on the given router group.
func (h *DashboardHandler) RegisterRoutes(rg *gin.RouterGroup) {
	dashboard := rg.Group("/dashboard")
	{
		dashboard.GET("", h.overview)
		dashboard.GET("/software", h.software)
	}
}

// overview returns the full system overview.
func (h *DashboardHandler) overview(c *gin.Context) {
	db := database.Get().GetDB()
	overview, err := h.monitorService.GetOverview(db)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, overview)
}

// software returns installed software / service statuses.
func (h *DashboardHandler) software(c *gin.Context) {
	statuses, err := h.monitorService.GetServiceStatuses()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, statuses)
}
