package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/database"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// OptimizationHandler handles optimization-related API requests
type OptimizationHandler struct {
	optService *service.OptimizationService
	optEngine  *service.OptimizationEngine
}

// NewOptimizationHandler creates a new OptimizationHandler
func NewOptimizationHandler(optService *service.OptimizationService) *OptimizationHandler {
	return &OptimizationHandler{
		optService: optService,
		optEngine:  service.NewOptimizationEngine(optService),
	}
}

// RegisterRoutes registers optimization routes on the given router group
func (h *OptimizationHandler) RegisterRoutes(rg *gin.RouterGroup, rbacFactory ...func(string) gin.HandlerFunc) {
	opt := rg.Group("/optimization")

	var factory func(string) gin.HandlerFunc
	if len(rbacFactory) > 0 {
		factory = rbacFactory[0]
	}

	apply := func(perm string) gin.HandlerFunc {
		if factory != nil {
			return factory(perm)
		}
		return func(c *gin.Context) { c.Next() }
	}

	// Mode management
	opt.GET("/mode", apply("optimization.read"), h.getMode)
	opt.PUT("/mode", apply("optimization.manage"), h.setMode)

	// Manual config
	opt.GET("/config/manual", apply("optimization.read"), h.getManualConfig)
	opt.PUT("/config/manual", apply("optimization.manage"), h.updateManualConfig)
	opt.GET("/config/presets", apply("optimization.read"), h.getPresets)
	opt.POST("/config/preset", apply("optimization.manage"), h.applyPreset)

	// Adaptive settings
	opt.GET("/config/adaptive", apply("optimization.read"), h.getAdaptiveSettings)
	opt.PUT("/config/adaptive", apply("optimization.manage"), h.updateAdaptiveSettings)

	// Status & Metrics
	opt.GET("/status", apply("optimization.read"), h.getStatus)
	opt.GET("/metrics", apply("optimization.read"), h.getMetrics)

	// History
	opt.GET("/history", apply("optimization.read"), h.getHistory)

	// Actions
	opt.POST("/apply", apply("optimization.manage"), h.applyConfig)
	opt.POST("/reset", apply("optimization.manage"), h.resetConfig)
}

// getMode returns the current optimization mode
func (h *OptimizationHandler) getMode(c *gin.Context) {
	mode, err := h.optService.GetMode()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"mode": mode})
}

// setMode changes the optimization mode
func (h *OptimizationHandler) setMode(c *gin.Context) {
	var req struct {
		Mode string `json:"mode" binding:"required,oneof=manual adaptive"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "mode", Message: "mode must be 'manual' or 'adaptive'"},
		})
		return
	}

	if err := h.optService.SetMode(service.ConfigMode(req.Mode)); err != nil {
		response.Error(c, err)
		return
	}

	// Apply the new mode configuration
	if err := h.optEngine.ApplyConfig(); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"mode": req.Mode, "applied": true})
}

// getManualConfig returns the current manual configuration
func (h *OptimizationHandler) getManualConfig(c *gin.Context) {
	cfg, err := h.optService.GetManualConfig()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, cfg)
}

// updateManualConfig updates the manual configuration
func (h *OptimizationHandler) updateManualConfig(c *gin.Context) {
	var cfg service.ManualConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid configuration payload"},
		})
		return
	}

	if err := h.optService.UpdateManualConfig(&cfg); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, cfg)
}

// getPresets returns all available presets
func (h *OptimizationHandler) getPresets(c *gin.Context) {
	presets := h.optService.GetPresets()
	response.Success(c, gin.H{"presets": presets})
}

// applyPreset applies a configuration preset
func (h *OptimizationHandler) applyPreset(c *gin.Context) {
	var req struct {
		PresetID string `json:"preset_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "preset_id", Message: "preset_id is required"},
		})
		return
	}

	if err := h.optService.ApplyPreset(req.PresetID); err != nil {
		response.Error(c, err)
		return
	}

	// Apply the configuration
	if err := h.optEngine.ApplyConfig(); err != nil {
		response.Error(c, err)
		return
	}

	cfg, _ := h.optService.GetManualConfig()

	response.Success(c, gin.H{
		"preset_id": req.PresetID,
		"applied":   true,
		"config":    cfg,
	})
}

// getAdaptiveSettings returns the adaptive optimization settings
func (h *OptimizationHandler) getAdaptiveSettings(c *gin.Context) {
	cfg, err := h.optService.GetAdaptiveSettings()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, cfg)
}

// updateAdaptiveSettings updates the adaptive optimization settings
func (h *OptimizationHandler) updateAdaptiveSettings(c *gin.Context) {
	var cfg service.AdaptiveSettings
	if err := c.ShouldBindJSON(&cfg); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid settings payload"},
		})
		return
	}

	if err := h.optService.UpdateAdaptiveSettings(&cfg); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, cfg)
}

// getStatus returns the current optimization status
func (h *OptimizationHandler) getStatus(c *gin.Context) {
	status, err := h.optService.GetStatus()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, status)
}

// getMetrics returns current MariaDB and Nginx metrics
func (h *OptimizationHandler) getMetrics(c *gin.Context) {
	mariaMetrics, _ := h.optService.CollectMariaDBMetrics()
	nginxMetrics, _ := h.optService.CollectNginxMetrics()

	response.Success(c, gin.H{
		"mariadb": mariaMetrics,
		"nginx":   nginxMetrics,
	})
}

// getHistory returns optimization history
func (h *OptimizationHandler) getHistory(c *gin.Context) {
	history, err := h.optService.GetHistory(50)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"history": history})
}

// applyConfig applies the current configuration
func (h *OptimizationHandler) applyConfig(c *gin.Context) {
	if err := h.optEngine.ApplyConfig(); err != nil {
		response.Error(c, err)
		return
	}

	mode, _ := h.optService.GetMode()
	response.Success(c, gin.H{
		"applied": true,
		"mode":    mode,
	})
}

// resetConfig resets configuration to defaults
func (h *OptimizationHandler) resetConfig(c *gin.Context) {
	var req struct {
		Type string `json:"type" binding:"required,oneof=mariadb nginx all"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "type", Message: "type must be 'mariadb', 'nginx', or 'all'"},
		})
		return
	}

	// For now, just set to manual mode and use medium preset as default
	if err := h.optService.ApplyPreset("medium"); err != nil {
		response.Error(c, err)
		return
	}

	if err := h.optEngine.ApplyConfig(); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"reset": true,
		"type":  req.Type,
	})
}

// GetOptimizationHandler initializes and returns the optimization handler
func GetOptimizationHandler() *OptimizationHandler {
	db := database.Get().GetDB()
	optService := service.NewOptimizationService(db)
	return NewOptimizationHandler(optService)
}
