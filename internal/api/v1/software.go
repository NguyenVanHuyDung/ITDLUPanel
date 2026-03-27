package v1

import (
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
	"github.com/ITDLUPanel/panel/internal/service/installer"
)

// SoftwareHandler handles software management API endpoints.
type SoftwareHandler struct {
	softwareService *service.SoftwareService
}

// NewSoftwareHandler creates a new SoftwareHandler.
func NewSoftwareHandler(softwareService *service.SoftwareService) *SoftwareHandler {
	return &SoftwareHandler{
		softwareService: softwareService,
	}
}

// RegisterRoutes registers software management routes (all require admin role).
func (h *SoftwareHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, adminMW gin.HandlerFunc) {
	sw := rg.Group("/software")
	sw.Use(authMW, adminMW)
	{
		sw.GET("", h.list)
		sw.POST("/install", h.install)
		sw.POST("/install-stack", h.installStack)
		sw.DELETE("/:name", h.uninstall)
		sw.POST("/:name/start", h.start)
		sw.POST("/:name/stop", h.stop)
		sw.POST("/:name/restart", h.restart)
		sw.GET("/:name/status", h.status)
		sw.GET("/:name/config", h.getConfig)
		sw.PUT("/:name/config", h.updateConfig)
		sw.POST("/:name/reload", h.reload)
		sw.GET("/:name/metrics", h.metrics)
		sw.GET("/:name/error-log", h.errorLog)
		sw.GET("/:name/optimization", h.getOptimization)
		sw.PUT("/:name/optimization", h.updateOptimization)

		// phpMyAdmin Manager
		sw.GET("/phpmyadmin/manager", h.getPhpMyAdminConfig)
		sw.PUT("/phpmyadmin/manager", h.setPhpMyAdminConfig)
		sw.GET("/phpmyadmin/php-versions", h.getAvailablePHPVersions)

		// Nginx version management
		sw.GET("/nginx/available-versions", h.getNginxAvailableVersions)
	}
}

// list returns all installed software and available software.
func (h *SoftwareHandler) list(c *gin.Context) {
	installed, err := h.softwareService.ListInstalled()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list installed software"))
		return
	}

	available := h.softwareService.ListAvailable()

	response.Success(c, gin.H{
		"installed": installed,
		"available": available,
	})
}

type installRequest struct {
	Name    string `json:"name" binding:"required"`
	Version string `json:"version"`
}

// install enqueues a software installation task.
func (h *SoftwareHandler) install(c *gin.Context) {
	var req installRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body: name is required"},
		})
		return
	}

	userID, _ := c.Get("user_id")
	uid, _ := userID.(int64)

	taskID, err := h.softwareService.InstallSoftware(req.Name, req.Version, uid)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrValidation, err.Error()))
		return
	}

	c.JSON(http.StatusAccepted, response.Response{
		Code:    http.StatusAccepted,
		Message: "installation task created",
		Data: gin.H{
			"task_id": taskID,
		},
	})
}

type installStackRequest struct {
	Components []string `json:"components" binding:"required,min=1"`
}

// installStack enqueues multiple software installation tasks sequentially.
func (h *SoftwareHandler) installStack(c *gin.Context) {
	var req installStackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "components array is required"},
		})
		return
	}

	if len(req.Components) == 0 {
		response.ValidationError(c, []response.FieldError{
			{Field: "components", Message: "at least one component is required"},
		})
		return
	}

	userID, _ := c.Get("user_id")
	uid, _ := userID.(int64)

	var taskIDs []int64
	for _, comp := range req.Components {
		taskID, err := h.softwareService.InstallSoftware(comp, "", uid)
		if err != nil {
			continue
		}
		taskIDs = append(taskIDs, taskID)
	}

	c.JSON(http.StatusAccepted, response.Response{
		Code:    http.StatusAccepted,
		Message: "stack installation tasks created",
		Data: gin.H{
			"task_ids": taskIDs,
		},
	})
}
func (h *SoftwareHandler) uninstall(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "software name is required"))
		return
	}

	userID, _ := c.Get("user_id")
	uid, _ := userID.(int64)

	taskID, err := h.softwareService.UninstallSoftware(name, uid)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrValidation, err.Error()))
		return
	}

	c.JSON(http.StatusAccepted, response.Response{
		Code:    http.StatusAccepted,
		Message: "uninstallation task created",
		Data: gin.H{
			"task_id": taskID,
		},
	})
}

// start starts the service for the given software.
func (h *SoftwareHandler) start(c *gin.Context) {
	name := c.Param("name")
	if err := h.softwareService.StartService(name); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": name + " started"})
}

// stop stops the service for the given software.
func (h *SoftwareHandler) stop(c *gin.Context) {
	name := c.Param("name")
	if err := h.softwareService.StopService(name); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": name + " stopped"})
}

// restart restarts the service for the given software.
func (h *SoftwareHandler) restart(c *gin.Context) {
	name := c.Param("name")
	if err := h.softwareService.RestartService(name); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": name + " restarted"})
}

// status returns the service status for the given software.
func (h *SoftwareHandler) status(c *gin.Context) {
	name := c.Param("name")
	status, err := h.softwareService.GetServiceStatus(name)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrNotFound, err.Error()))
		return
	}
	response.Success(c, status)
}

// getConfig reads the main configuration file.
func (h *SoftwareHandler) getConfig(c *gin.Context) {
	name := c.Param("name")
	content, err := h.softwareService.GetConfig(name)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrNotFound, err.Error()))
		return
	}
	response.Success(c, gin.H{
		"name":    name,
		"content": content,
	})
}

type softwareConfigRequest struct {
	Content string `json:"content" binding:"required"`
}

// updateConfig writes new content to the configuration file.
func (h *SoftwareHandler) updateConfig(c *gin.Context) {
	name := c.Param("name")

	var req softwareConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// Also accept raw body as content
		body, readErr := io.ReadAll(c.Request.Body)
		if readErr != nil || len(body) == 0 {
			response.ValidationError(c, []response.FieldError{
				{Field: "content", Message: "configuration content is required"},
			})
			return
		}
		req.Content = string(body)
	}

	if err := h.softwareService.UpdateConfig(name, req.Content); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}

	response.Success(c, gin.H{"message": name + " configuration updated"})
}

// reload gracefully reloads the service.
func (h *SoftwareHandler) reload(c *gin.Context) {
	name := c.Param("name")
	if err := h.softwareService.ReloadService(name); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": name + " reloaded"})
}

// metrics returns nginx load status metrics.
func (h *SoftwareHandler) metrics(c *gin.Context) {
	name := c.Param("name")
	if name != "nginx" {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "metrics only supported for nginx"))
		return
	}
	m, err := h.softwareService.GetNginxMetrics()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, m)
}

// errorLog returns the last N lines of a software's error log.
func (h *SoftwareHandler) errorLog(c *gin.Context) {
	name := c.Param("name")
	lines := 100
	if l := c.Query("lines"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			lines = n
		}
	}
	content, logPath, err := h.softwareService.GetErrorLog(name, lines)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{
		"content":  content,
		"log_path": logPath,
		"lines":    lines,
	})
}

// getOptimization returns tunable nginx parameters.
func (h *SoftwareHandler) getOptimization(c *gin.Context) {
	name := c.Param("name")
	if name != "nginx" {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "optimization only supported for nginx"))
		return
	}
	opt, err := h.softwareService.GetNginxOptimization()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, opt)
}

// updateOptimization updates tunable nginx parameters.
func (h *SoftwareHandler) updateOptimization(c *gin.Context) {
	name := c.Param("name")
	if name != "nginx" {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "optimization only supported for nginx"))
		return
	}
	var opt service.NginxOptimization
	if err := c.ShouldBindJSON(&opt); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid optimization parameters"},
		})
		return
	}
	if err := h.softwareService.UpdateNginxOptimization(&opt); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": "nginx optimization updated"})
}

// getPhpMyAdminConfig returns the current phpMyAdmin manager configuration.
func (h *SoftwareHandler) getPhpMyAdminConfig(c *gin.Context) {
	cfg, err := h.softwareService.GetPhpMyAdminConfig()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, cfg)
}

// setPhpMyAdminConfig updates the phpMyAdmin manager configuration.
func (h *SoftwareHandler) setPhpMyAdminConfig(c *gin.Context) {
	var cfg service.PhpMyAdminConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid phpMyAdmin configuration"},
		})
		return
	}
	if err := h.softwareService.SetPhpMyAdminConfig(&cfg); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": "phpMyAdmin configuration updated"})
}

// getAvailablePHPVersions returns installed PHP versions with active FPM.
func (h *SoftwareHandler) getAvailablePHPVersions(c *gin.Context) {
	versions, err := h.softwareService.GetAvailablePHPVersions()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, versions)
}

// getNginxAvailableVersions returns available nginx versions from official repos.
func (h *SoftwareHandler) getNginxAvailableVersions(c *gin.Context) {
	versions, err := installer.GetAvailableNginxVersions(c.Request.Context())
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, versions)
}
