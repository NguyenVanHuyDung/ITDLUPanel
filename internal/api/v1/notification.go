package v1

import (
	"encoding/json"
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
		g.POST("/channels/:id/test/:eventType", h.TestEvent)

		// Rules
		g.GET("/rules", h.ListRules)
		g.PUT("/rules", h.BulkUpsertRules)
		g.PUT("/rules/:channelId", h.SetRules)

		// Templates
		g.GET("/templates/defaults/:eventType", h.GetDefaultTemplates)
		g.GET("/templates/:channelId/:eventType", h.GetRuleTemplate)
		g.PUT("/templates/:channelId/:eventType", h.SaveRuleTemplate)
		g.POST("/templates/preview", h.PreviewTemplate)

		// Logs
		g.GET("/logs", h.ListLogs)
		g.DELETE("/logs", h.ClearLogs)

		// Meta
		g.GET("/event-types", h.ListEventTypes)
		g.GET("/event-types/critical", h.ListCriticalEventTypes)
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
		Type      string                 `json:"type" binding:"required"`
		Name      string                 `json:"name" binding:"required"`
		Config    map[string]interface{} `json:"config" binding:"required"`
		IsEnabled bool                   `json:"is_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Type != "email" && req.Type != "telegram" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type must be 'email' or 'telegram'"})
		return
	}

	cfgJSON, _ := json.Marshal(req.Config)
	id, err := h.svc.CreateChannel(req.Type, req.Name, string(cfgJSON), req.IsEnabled)
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
		Name      string                 `json:"name"`
		Config    map[string]interface{} `json:"config"`
		IsEnabled bool                   `json:"is_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfgStr := ""
	if req.Config != nil {
		b, _ := json.Marshal(req.Config)
		cfgStr = string(b)
	}
	if err := h.svc.UpdateChannel(id, req.Name, cfgStr, req.IsEnabled); err != nil {
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
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "test notification sent"})
}

func (h *NotificationHandler) TestEvent(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	eventType := c.Param("eventType")
	if eventType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "eventType required"})
		return
	}
	if err := h.svc.TestEvent(id, eventType); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "test event sent", "event_type": eventType})
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

func (h *NotificationHandler) BulkUpsertRules(c *gin.Context) {
	var req struct {
		Rules []struct {
			ChannelID     int64  `json:"channel_id"`
			EventType     string `json:"event_type"`
			IsEnabled     bool   `json:"is_enabled"`
			CustomSubject string `json:"custom_subject"`
			CustomBody    string `json:"custom_body"`
		} `json:"rules"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.BulkUpsertRules(req.Rules); err != nil {
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

func (h *NotificationHandler) ListCriticalEventTypes(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": service.CriticalEventTypes()})
}

// ---------- Templates ----------

func (h *NotificationHandler) GetDefaultTemplates(c *gin.Context) {
	eventType := c.Param("eventType")
	data := h.svc.DefaultTemplates(eventType)
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *NotificationHandler) GetRuleTemplate(c *gin.Context) {
	channelID, err := strconv.ParseInt(c.Param("channelId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channelId"})
		return
	}
	eventType := c.Param("eventType")
	subj, body, err := h.svc.GetRuleTemplate(channelID, eventType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defaults := h.svc.DefaultTemplates(eventType)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"custom_subject":  subj,
		"custom_body":     body,
		"default_subject": defaults["default_subject"],
		"default_body":    defaults["default_body"],
		"variables":       defaults["variables"],
	}})
}

func (h *NotificationHandler) SaveRuleTemplate(c *gin.Context) {
	channelID, err := strconv.ParseInt(c.Param("channelId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channelId"})
		return
	}
	eventType := c.Param("eventType")

	var body struct {
		CustomSubject string `json:"custom_subject"`
		CustomBody    string `json:"custom_body"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.svc.SaveRuleTemplate(channelID, eventType, body.CustomSubject, body.CustomBody); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "template saved"})
}

func (h *NotificationHandler) PreviewTemplate(c *gin.Context) {
	var body struct {
		Template  string `json:"template"`
		EventType string `json:"event_type"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.svc.PreviewTemplate(body.Template, body.EventType)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "template error: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}
