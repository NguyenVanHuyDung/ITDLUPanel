package v1

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/plugin"
)

// PluginHandler handles plugin management API endpoints.
type PluginHandler struct {
	manager *plugin.Manager
}

// NewPluginHandler creates a new PluginHandler.
func NewPluginHandler(manager *plugin.Manager) *PluginHandler {
	return &PluginHandler{manager: manager}
}

// RegisterRoutes registers plugin management routes (admin only).
func (h *PluginHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, adminMW gin.HandlerFunc) {
	plugins := rg.Group("/plugins")
	plugins.Use(authMW, adminMW)
	{
		plugins.GET("", h.ListPlugins)
		plugins.GET("/store", h.ListAvailablePlugins)
		plugins.POST("/:name/install", h.InstallPlugin)
		plugins.DELETE("/:name", h.UninstallPlugin)
		plugins.PUT("/:name/status", h.UpdatePluginStatus)
		plugins.GET("/:name/config", h.GetPluginConfig)
		plugins.PUT("/:name/config", h.UpdatePluginConfig)
	}
}

// ListPlugins returns all installed plugins.
func (h *PluginHandler) ListPlugins(c *gin.Context) {
	plugins := h.manager.ListPlugins()
	response.Success(c, plugins)
}

// ListAvailablePlugins returns plugins available in the simulated store.
func (h *PluginHandler) ListAvailablePlugins(c *gin.Context) {
	plugins := h.manager.ListAvailablePlugins()
	response.Success(c, plugins)
}

// InstallPlugin installs a plugin by name.
func (h *PluginHandler) InstallPlugin(c *gin.Context) {
	name := c.Param("name")

	// Check if plugin exists in store
	available := h.manager.ListAvailablePlugins()
	var found bool
	for _, p := range available {
		if p.Name == name {
			found = true
			break
		}
	}

	if !found {
		c.JSON(http.StatusNotFound, response.Response{
			Code:    http.StatusNotFound,
			Message: "plugin not found in store",
		})
		return
	}

	// Check if already installed
	if _, exists := h.manager.GetPlugin(name); exists {
		c.JSON(http.StatusConflict, response.Response{
			Code:    http.StatusConflict,
			Message: "plugin is already installed",
		})
		return
	}

	// In a real system, this would download and register the plugin.
	// For now, return a success message indicating the install was simulated.
	response.Success(c, gin.H{
		"message": "plugin install initiated",
		"name":    name,
	})
}

// UninstallPlugin removes an installed plugin.
func (h *PluginHandler) UninstallPlugin(c *gin.Context) {
	name := c.Param("name")

	if err := h.manager.Uninstall(name); err != nil {
		c.JSON(http.StatusNotFound, response.Response{
			Code:    http.StatusNotFound,
			Message: err.Error(),
		})
		return
	}

	response.Success(c, gin.H{"message": "plugin uninstalled"})
}

type updateStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=enabled disabled"`
}

// UpdatePluginStatus enables or disables a plugin.
func (h *PluginHandler) UpdatePluginStatus(c *gin.Context) {
	name := c.Param("name")

	var req updateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "status", Message: "status must be 'enabled' or 'disabled'"},
		})
		return
	}

	var err error
	switch req.Status {
	case "enabled":
		err = h.manager.Enable(name)
	case "disabled":
		err = h.manager.Disable(name)
	}

	if err != nil {
		c.JSON(http.StatusNotFound, response.Response{
			Code:    http.StatusNotFound,
			Message: err.Error(),
		})
		return
	}

	response.Success(c, gin.H{"message": "plugin status updated", "status": req.Status})
}

// GetPluginConfig returns the configuration for a plugin.
func (h *PluginHandler) GetPluginConfig(c *gin.Context) {
	name := c.Param("name")

	cfg, err := h.manager.GetConfig(name)
	if err != nil {
		c.JSON(http.StatusNotFound, response.Response{
			Code:    http.StatusNotFound,
			Message: err.Error(),
		})
		return
	}

	response.Success(c, cfg)
}

// UpdatePluginConfig updates the configuration for a plugin.
func (h *PluginHandler) UpdatePluginConfig(c *gin.Context) {
	name := c.Param("name")

	var cfg map[string]interface{}
	if err := c.ShouldBindJSON(&cfg); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "config", Message: "invalid configuration object"},
		})
		return
	}

	if err := h.manager.SetConfig(name, cfg); err != nil {
		c.JSON(http.StatusNotFound, response.Response{
			Code:    http.StatusNotFound,
			Message: err.Error(),
		})
		return
	}

	response.Success(c, gin.H{"message": "plugin config updated"})
}
