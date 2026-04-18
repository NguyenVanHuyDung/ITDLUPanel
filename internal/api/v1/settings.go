package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// SettingsHandler handles panel settings API endpoints.
type SettingsHandler struct {
	settingsService *service.SettingsService
}

// NewSettingsHandler creates a new SettingsHandler.
func NewSettingsHandler(settingsService *service.SettingsService) *SettingsHandler {
	return &SettingsHandler{settingsService: settingsService}
}

// RegisterRoutes registers settings management routes (admin only).
func (h *SettingsHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, adminMW gin.HandlerFunc) {
	settings := rg.Group("/settings")
	settings.Use(authMW, adminMW)
	{
		settings.GET("", h.GetAll)
		settings.PUT("", h.UpdateSettings)
		settings.PUT("/panel-port", h.ChangePanelPort)
		settings.PUT("/panel-ssl", h.ConfigurePanelSSL)
		settings.GET("/panel-info", h.GetPanelInfo)
		settings.GET("/server-info", h.GetServerInfo)
		settings.PUT("/admin-path", h.SetAdminPath)
		settings.PUT("/language", h.SetLanguage)
		settings.PUT("/panel-name", h.SetPanelName)
		settings.PUT("/timezone", h.SetTimezone)
		settings.PUT("/session-timeout", h.SetSessionTimeout)
		settings.GET("/timezones", h.GetTimezones)
	}
}

// GetAll returns all panel settings.
func (h *SettingsHandler) GetAll(c *gin.Context) {
	settings, err := h.settingsService.GetAll()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, settings)
}

type updateSettingsRequest map[string]string

// UpdateSettings updates multiple settings at once.
func (h *SettingsHandler) UpdateSettings(c *gin.Context) {
	var req updateSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "request body must be a JSON object of key-value pairs"},
		})
		return
	}

	if len(req) == 0 {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "at least one setting is required"},
		})
		return
	}

	if err := h.settingsService.SetMultiple(req); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "settings updated"})
}

type changePanelPortRequest struct {
	Port int `json:"port" binding:"required,min=1,max=65535"`
}

// ChangePanelPort changes the panel HTTP port.
func (h *SettingsHandler) ChangePanelPort(c *gin.Context) {
	var req changePanelPortRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "port", Message: "port must be between 1 and 65535"},
		})
		return
	}

	if err := h.settingsService.ChangePanelPort(req.Port); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "panel port updated", "port": req.Port})
}

type configurePanelSSLRequest struct {
	Enable bool `json:"enable"`
}

// ConfigurePanelSSL enables or disables panel SSL.
func (h *SettingsHandler) ConfigurePanelSSL(c *gin.Context) {
	var req configurePanelSSLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "enable", Message: "enable must be a boolean"},
		})
		return
	}

	if err := h.settingsService.ConfigurePanelSSL(req.Enable); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "panel SSL updated", "ssl_enabled": req.Enable})
}

// GetPanelInfo returns runtime panel information.
func (h *SettingsHandler) GetPanelInfo(c *gin.Context) {
	info, err := h.settingsService.GetPanelInfo()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, info)
}

type setAdminPathRequest struct {
	Path string `json:"path" binding:"required"`
}

// SetAdminPath updates the panel admin URL path.
func (h *SettingsHandler) SetAdminPath(c *gin.Context) {
	var req setAdminPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "path", Message: "path is required"},
		})
		return
	}

	if err := h.settingsService.SetAdminPath(req.Path); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "admin path updated", "path": req.Path})
}

type setLanguageRequest struct {
	Lang string `json:"language" binding:"required"`
}

// SetLanguage updates the panel language.
func (h *SettingsHandler) SetLanguage(c *gin.Context) {
	var req setLanguageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "language", Message: "language is required"},
		})
		return
	}

	if err := h.settingsService.SetLanguage(req.Lang); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"message":  "language updated",
		"language": req.Lang,
	})
}

// GetServerInfo returns server network and system information.
func (h *SettingsHandler) GetServerInfo(c *gin.Context) {
	info, err := h.settingsService.GetServerInfo()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, info)
}

type setPanelNameRequest struct {
	Name string `json:"name" binding:"required"`
}

// SetPanelName updates the panel display name.
func (h *SettingsHandler) SetPanelName(c *gin.Context) {
	var req setPanelNameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "name", Message: "name is required"},
		})
		return
	}

	sanitized, err := h.settingsService.SetPanelName(req.Name)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "panel name updated", "name": sanitized})
}

type setTimezoneRequest struct {
	Timezone string `json:"timezone" binding:"required"`
}

// SetTimezone updates the server timezone setting.
func (h *SettingsHandler) SetTimezone(c *gin.Context) {
	var req setTimezoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "timezone", Message: "timezone is required"},
		})
		return
	}

	if err := h.settingsService.SetTimezone(req.Timezone); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "timezone updated", "timezone": req.Timezone})
}

type setSessionTimeoutRequest struct {
	Timeout int `json:"timeout" binding:"required,min=300,max=604800"`
}

// SetSessionTimeout updates the session timeout.
func (h *SettingsHandler) SetSessionTimeout(c *gin.Context) {
	var req setSessionTimeoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "timeout", Message: "timeout must be between 300 and 604800 seconds"},
		})
		return
	}

	if err := h.settingsService.SetSessionTimeout(req.Timeout); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "session timeout updated", "timeout": req.Timeout})
}

// GetTimezones returns available timezone options.
func (h *SettingsHandler) GetTimezones(c *gin.Context) {
	zones := h.settingsService.GetTimezones()
	response.Success(c, zones)
}

