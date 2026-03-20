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
		settings.PUT("/admin-path", h.SetAdminPath)
		settings.PUT("/language", h.SetLanguage)
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
	Lang string `json:"lang" binding:"required"`
}

// SetLanguage updates the panel language.
func (h *SettingsHandler) SetLanguage(c *gin.Context) {
	var req setLanguageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "lang", Message: "lang is required"},
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


