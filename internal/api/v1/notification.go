package v1

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/service"
)

// NotificationHandler handles notification API endpoints.
type NotificationHandler struct {
	svc *service.NotificationService
}

// NewNotificationHandler creates a new NotificationHandler.
func NewNotificationHandler(svc *service.NotificationService) *NotificationHandler {
	return &NotificationHandler{svc: svc}
}

// RegisterRoutes registers notification routes.
func (h *NotificationHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, adminMW gin.HandlerFunc) {
	g := rg.Group("/notifications", authMW, adminMW)
	{
		// Channels
		g.GET("/channels", h.ListChannels)
		g.POST("/channels", h.CreateChannel)
		g.PUT("/channels/:id", h.UpdateChannel)
		g.DELETE("/channels/:id", h.DeleteChannel)
		g.POST("/channels/:id/test", h.TestChannel)

		// Rules
		g.GET("/rules", h.ListRules)
		g.PUT("/rules/:channelId", h.SetRules)

		// Logs
		g.GET("/logs", h.ListLogs)
		g.DELETE("/logs", h.ClearLogs)

		// Meta
		g.GET("/event-types", h.ListEventTypes)
	}
}

// ---------- Channels ----------

func (h *NotificationHandler) ListChannels(c *gin.Context) {
	list, err := h.svc.ListChannels()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if list == nil {
		list = []service.NotificationChannel{}
	}
	c.JSON(http.StatusOK, gin.H{"data": list})
}

func (h *NotificationHandler) CreateChannel(c *gin.Context) {
	var req struct {
		Type      string `json:"type" binding:"required"`
		Name      string `json:"name" binding:"required"`
		Config    string `json:"config" binding:"required"`
		IsEnabled bool   `json:"is_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Type != "email" && req.Type != "telegram" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type must be 'email' or 'telegram'"})
		return
	}

	id, err := h.svc.CreateChannel(req.Type, req.Name, req.Config, req.IsEnabled)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"id": id}})
}

func (h *NotificationHandler) UpdateChannel(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var req struct {
		Name      string `json:"name"`
		Config    string `json:"config"`
		IsEnabled bool   `json:"is_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.UpdateChannel(id, req.Name, req.Config, req.IsEnabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (h *NotificationHandler) DeleteChannel(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.svc.DeleteChannel(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *NotificationHandler) TestChannel(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.svc.TestChannel(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "test notification sent"})
}

// ---------- Rules ----------

func (h *NotificationHandler) ListRules(c *gin.Context) {
	list, err := h.svc.ListRules()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if list == nil {
		list = []service.NotificationRule{}
	}
	c.JSON(http.StatusOK, gin.H{"data": list})
}

func (h *NotificationHandler) SetRules(c *gin.Context) {
	channelID, err := strconv.ParseInt(c.Param("channelId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channelId"})
		return
	}
	var req struct {
		EventTypes []string `json:"event_types"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.SetRules(channelID, req.EventTypes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "rules updated"})
}

// ---------- Logs ----------

func (h *NotificationHandler) ListLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	channelType := c.Query("channel_type")
	eventType := c.Query("event_type")
	status := c.Query("status")

	list, total, err := h.svc.ListLogs(page, perPage, channelType, eventType, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if list == nil {
		list = []service.NotificationLog{}
	}
	c.JSON(http.StatusOK, gin.H{
		"data":  list,
		"total": total,
		"page":  page,
	})
}

func (h *NotificationHandler) ClearLogs(c *gin.Context) {
	if err := h.svc.ClearLogs(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "logs cleared"})
}

// ---------- Meta ----------

func (h *NotificationHandler) ListEventTypes(c *gin.Context) {
	types := service.AllEventTypes()
	result := make([]gin.H, 0, len(types))
	for _, t := range types {
		result = append(result, gin.H{
			"type":     t,
			"severity": service.EventSeverity(t),
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}
