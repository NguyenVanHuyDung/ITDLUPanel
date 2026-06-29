package v1

import (
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
	"github.com/ITDLUPanel/panel/internal/service/installer"
	"github.com/ITDLUPanel/panel/internal/system"
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
		sw.GET("/webserver-check", h.getInstalledWebServer)
	sw.GET("/php-versions", h.getAvailablePHPVersions)
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

		// pgAdmin Manager
		sw.GET("/pgadmin/manager", h.getPgAdminConfig)
		sw.PUT("/pgadmin/manager", h.setPgAdminConfig)

		// Nginx version management
		sw.GET("/nginx/available-versions", h.getNginxAvailableVersions)

		// MariaDB/MySQL management
		sw.GET("/mysql/slow-log", h.getMariaDBSlowLog)
		sw.GET("/mysql/binary-logs", h.getMariaDBBinaryLogs)
		sw.GET("/mysql/memory-protection", h.getMariaDBMemoryProtection)
		sw.PUT("/mysql/memory-protection", h.setMariaDBMemoryProtection)
		sw.GET("/mysql/ram-plans", h.getMariaDBRAMPlans)
		sw.GET("/mysql/root-password", h.getMariaDBRootPasswordStatus)
		sw.POST("/mysql/root-password", h.setMariaDBRootPassword)

		// PostgreSQL management
		sw.GET("/postgresql/connections", h.getPostgreSQLConnections)
		sw.GET("/postgresql/databases", h.getPostgreSQLDatabases)

		// MongoDB management
		sw.GET("/mongodb/databases", h.getMongoDBDatabases)
		sw.POST("/mongodb/databases", h.createMongoDBDatabase)
		sw.DELETE("/mongodb/databases/:dbname", h.dropMongoDBDatabase)
		sw.GET("/mongodb/databases/:dbname/collections", h.getMongoDBCollections)
		sw.POST("/mongodb/databases/:dbname/collections", h.createMongoDBCollection)
		sw.DELETE("/mongodb/databases/:dbname/collections/:collname", h.dropMongoDBCollection)
		sw.GET("/mongodb/stats", h.getMongoDBStats)
		sw.GET("/mongodb/users", h.getMongoDBUsers)
		sw.POST("/mongodb/users", h.createMongoDBUser)
		sw.DELETE("/mongodb/users/:dbname/:username", h.dropMongoDBUser)

		// PHP management
		sw.GET("/php/:version/extensions", h.getPHPExtensions)
		sw.POST("/php/:version/extensions/install", h.installPHPExtension)
		sw.POST("/php/:version/extensions/uninstall", h.uninstallPHPExtension)
		sw.GET("/php/:version/config", h.getPHPConfig)
		sw.PUT("/php/:version/config", h.setPHPConfig)
		sw.GET("/php/:version/opcache", h.getPHPOPcache)
		sw.PUT("/php/:version/opcache", h.setPHPOPcache)
		sw.GET("/php/:version/config-file", h.getPHPConfigFile)
		sw.PUT("/php/:version/config-file", h.setPHPConfigFile)
		sw.GET("/php/:version/error-log", h.getPHPErrorLog)
		sw.GET("/php/:version/fpm-config", h.getPHPFPMConfig)
		sw.PUT("/php/:version/fpm-config", h.setPHPFPMConfig)
		sw.GET("/php/:version/disable-functions", h.getPHPDisableFunctions)
		sw.PUT("/php/:version/disable-functions", h.setPHPDisableFunctions)
		sw.GET("/php/:version/fpm-status", h.getPHPFPMStatus)
		sw.GET("/php/:version/slow-log", h.getPHPSlowLog)
		sw.PUT("/php/:version/slow-log-config", h.setPHPSlowLogConfig)
		sw.GET("/php/:version/phpinfo", h.getPHPInfo)

		// Envoy Proxy management
		sw.GET("/envoy/config", h.getEnvoyConfig)
		sw.PUT("/envoy/config", h.updateEnvoyConfig)
		sw.POST("/envoy/validate", h.validateEnvoyConfig)
		sw.GET("/envoy/server-info", h.getEnvoyServerInfo)
		sw.GET("/envoy/clusters", h.getEnvoyClusters)
		sw.POST("/envoy/clusters", h.addEnvoyCluster)
		sw.DELETE("/envoy/clusters/:name", h.deleteEnvoyCluster)
		sw.GET("/envoy/listeners", h.getEnvoyListeners)
		sw.POST("/envoy/listeners", h.addEnvoyListener)
		sw.DELETE("/envoy/listeners/:port", h.deleteEnvoyListener)
		sw.GET("/envoy/stats", h.getEnvoyStats)
		sw.GET("/envoy/error-log", h.getEnvoyErrorLog)
	}
}

// getInstalledWebServer returns the currently installed web server name.
func (h *SoftwareHandler) getInstalledWebServer(c *gin.Context) {
	name, _ := h.softwareService.GetInstalledWebServer()
	response.Success(c, gin.H{"installed_webserver": name})
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

	response.Accepted(c, gin.H{"task_id": taskID})
}

type installStackRequest struct {
	Components []string `json:"components" binding:"required,min=1"`
}

// installStack enqueues a single sequential task that installs all missing components.
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

	taskID, err := h.softwareService.InstallStack(req.Components, uid)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrValidation, err.Error()))
		return
	}

	response.Accepted(c, gin.H{"task_id": taskID})
}
func (h *SoftwareHandler) uninstall(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "software name is required"))
		return
	}

	version := c.Query("version")

	userID, _ := c.Get("user_id")
	uid, _ := userID.(int64)

	taskID, err := h.softwareService.UninstallSoftware(name, version, uid)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrValidation, err.Error()))
		return
	}

	response.Accepted(c, gin.H{"task_id": taskID})
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

// getOptimization returns tunable parameters for the specified web server.
func (h *SoftwareHandler) getOptimization(c *gin.Context) {
	name := c.Param("name")
	switch name {
	case "nginx":
		opt, err := h.softwareService.GetNginxOptimization()
		if err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get nginx optimization"))
			return
		}
		response.Success(c, opt)
	case "apache":
		opt, err := h.softwareService.GetApacheOptimization()
		if err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get apache optimization"))
			return
		}
		response.Success(c, opt)
	case "openlitespeed":
		opt, err := h.softwareService.GetOLSOptimization()
		if err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get openlitespeed optimization"))
			return
		}
		response.Success(c, opt)
	case "mysql":
		opt, err := h.softwareService.GetMariaDBOptimization()
		if err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get mysql optimization"))
			return
		}
		response.Success(c, opt)
	case "postgresql":
		opt, err := h.softwareService.GetPostgreSQLOptimization()
		if err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get postgresql optimization"))
			return
		}
		response.Success(c, opt)
	default:
		response.Error(c, apperrors.New(apperrors.ErrValidation, "optimization not supported for "+name))
	}
}

// updateOptimization updates tunable parameters for the specified web server.
func (h *SoftwareHandler) updateOptimization(c *gin.Context) {
	name := c.Param("name")
	switch name {
	case "nginx":
		var opt service.NginxOptimization
		if err := c.ShouldBindJSON(&opt); err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrValidation, "invalid request"))
			return
		}
		if err := h.softwareService.UpdateNginxOptimization(&opt); err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to update nginx optimization"))
			return
		}
		response.Success(c, gin.H{"message": "nginx optimization updated"})
	case "apache":
		var opt service.ApacheOptimization
		if err := c.ShouldBindJSON(&opt); err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrValidation, "invalid request"))
			return
		}
		if err := h.softwareService.UpdateApacheOptimization(&opt); err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to update apache optimization"))
			return
		}
		response.Success(c, gin.H{"message": "apache optimization updated"})
	case "openlitespeed":
		var opt service.OLSOptimization
		if err := c.ShouldBindJSON(&opt); err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrValidation, "invalid request"))
			return
		}
		if err := h.softwareService.UpdateOLSOptimization(&opt); err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to update openlitespeed optimization"))
			return
		}
		response.Success(c, gin.H{"message": "openlitespeed optimization updated"})
	case "mysql":
		var opt service.MariaDBOptimization
		if err := c.ShouldBindJSON(&opt); err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrValidation, "invalid request"))
			return
		}
		if err := h.softwareService.UpdateMariaDBOptimization(&opt); err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to update mysql optimization"))
			return
		}
		response.Success(c, gin.H{"message": "mysql optimization updated"})
	case "postgresql":
		var opt service.PostgreSQLOptimization
		if err := c.ShouldBindJSON(&opt); err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrValidation, "invalid request"))
			return
		}
		if err := h.softwareService.UpdatePostgreSQLOptimization(&opt); err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to update postgresql optimization"))
			return
		}
		response.Success(c, gin.H{"message": "postgresql optimization updated"})
	default:
		response.Error(c, apperrors.New(apperrors.ErrValidation, "optimization not supported for "+name))
	}
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

// getPgAdminConfig returns the current pgAdmin manager configuration.
func (h *SoftwareHandler) getPgAdminConfig(c *gin.Context) {
	cfg, err := h.softwareService.GetPgAdminConfig()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, cfg)
}

// setPgAdminConfig updates the pgAdmin manager configuration.
func (h *SoftwareHandler) setPgAdminConfig(c *gin.Context) {
	var cfg service.PgAdminConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid pgAdmin configuration"},
		})
		return
	}
	if err := h.softwareService.SetPgAdminConfig(&cfg); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": "pgAdmin configuration updated"})
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

// validPHPVersion checks whether a PHP version string is known to the installer.
// It derives the set dynamically so new versions added to the PHP installer are
// automatically accepted without updating a second list.
func validPHPVersion(version string) bool {
	for _, v := range installer.PHPInstallerVersions() {
		if v == version {
			return true
		}
	}
	return false
}

// getPHPExtensions returns available extensions with install status.
func (h *SoftwareHandler) getPHPExtensions(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}

	inst, ok := h.softwareService.GetInstaller("php")
	if !ok {
		response.Error(c, apperrors.New(apperrors.ErrNotFound, "PHP installer not found"))
		return
	}

	phpInst := inst.(*installer.PHPInstaller)
	exts, err := phpInst.GetPHPExtensions(version)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, exts)
}

// installPHPExtension installs PHP extensions for a version.
func (h *SoftwareHandler) installPHPExtension(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}

	var req struct {
		Extensions []string `json:"extensions" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "extensions", Message: "extensions array is required"},
		})
		return
	}

	userID, _ := c.Get("user_id")
	uid, _ := userID.(int64)

	taskID, err := h.softwareService.InstallExtension("php", version, req.Extensions, uid)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}

	response.Accepted(c, gin.H{"task_id": taskID})
}

// uninstallPHPExtension removes PHP extensions for a version.
func (h *SoftwareHandler) uninstallPHPExtension(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}

	var req struct {
		Extensions []string `json:"extensions" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "extensions", Message: "extensions array is required"},
		})
		return
	}

	userID, _ := c.Get("user_id")
	uid, _ := userID.(int64)

	taskID, err := h.softwareService.UninstallExtension("php", version, req.Extensions, uid)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}

	response.Accepted(c, gin.H{"task_id": taskID})
}

// getPHPConfig returns PHP config settings for a version.
func (h *SoftwareHandler) getPHPConfig(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}

	cfg, err := h.softwareService.GetPHPConfig(version)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, cfg)
}

// setPHPConfig updates PHP config settings for a version.
func (h *SoftwareHandler) setPHPConfig(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}

	var cfg service.PHPConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid PHP configuration"},
		})
		return
	}

	if err := h.softwareService.SetPHPConfig(version, cfg); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": "PHP configuration updated"})
}

// getPHPOPcache returns PHP OPcache config settings for a version.
func (h *SoftwareHandler) getPHPOPcache(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}

	cfg, err := h.softwareService.GetPHPOPcache(version)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, cfg)
}

// setPHPOPcache updates PHP OPcache config settings for a version.
func (h *SoftwareHandler) setPHPOPcache(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}

	var cfg service.PHPOPcacheConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid OPcache configuration"},
		})
		return
	}

	if err := h.softwareService.SetPHPOPcache(version, cfg); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": "PHP OPcache configuration updated"})
}

// getPHPConfigFile returns the raw php.ini content for a PHP version.
func (h *SoftwareHandler) getPHPConfigFile(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}
	content, err := h.softwareService.GetPHPConfigFile(version)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"content": content, "path": fmt.Sprintf("/etc/php/%s/fpm/php.ini", version)})
}

// setPHPConfigFile saves raw php.ini content for a PHP version.
func (h *SoftwareHandler) setPHPConfigFile(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}
	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "content", Message: "content is required"}})
		return
	}
	if err := h.softwareService.SetPHPConfigFile(version, req.Content); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": "php.ini saved"})
}

// getPHPErrorLog returns the last N lines of PHP-FPM error log for a version.
func (h *SoftwareHandler) getPHPErrorLog(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}
	lines := 100
	if l := c.Query("lines"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 1000 {
			lines = n
		}
	}
	content, logPath, err := h.softwareService.GetPHPErrorLog(version, lines)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"content": content, "log_path": logPath, "lines": lines})
}

// getPHPFPMConfig returns FPM pool configuration for a PHP version.
func (h *SoftwareHandler) getPHPFPMConfig(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}
	cfg, err := h.softwareService.GetPHPFPMConfig(version)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, cfg)
}

// setPHPFPMConfig updates FPM pool configuration for a PHP version.
func (h *SoftwareHandler) setPHPFPMConfig(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}
	var cfg service.PHPFPMConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "invalid FPM configuration"}})
		return
	}
	if err := h.softwareService.SetPHPFPMConfig(version, cfg); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": "FPM configuration updated"})
}

// getPHPDisableFunctions returns the disable_functions list for a PHP version.
func (h *SoftwareHandler) getPHPDisableFunctions(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}
	functions, err := h.softwareService.GetPHPDisableFunctions(version)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"functions": functions})
}

// setPHPDisableFunctions updates the disable_functions list for a PHP version.
func (h *SoftwareHandler) setPHPDisableFunctions(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}
	var req struct {
		Functions []string `json:"functions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "functions", Message: "functions array is required"}})
		return
	}
	if err := h.softwareService.SetPHPDisableFunctions(version, req.Functions); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": "disable_functions updated"})
}

// getPHPFPMStatus returns FPM process statistics for a PHP version.
func (h *SoftwareHandler) getPHPFPMStatus(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}
	status, err := h.softwareService.GetPHPFPMStatus(version)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, status)
}

// getPHPSlowLog returns the PHP-FPM slow log content.
func (h *SoftwareHandler) getPHPSlowLog(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}
	lines := 100
	if l := c.Query("lines"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 1000 {
			lines = n
		}
	}
	content, logPath, err := h.softwareService.GetPHPSlowLog(version, lines)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}

	// Also read current config
	fpmCfg, _ := h.softwareService.GetPHPFPMConfig(version)
	timeout := ""
	enabled := false
	if fpmCfg != nil {
		timeout = fpmCfg.RequestSlowlogTimeout
		enabled = timeout != "" && timeout != "0"
	}

	response.Success(c, gin.H{
		"content":  content,
		"log_path": logPath,
		"lines":    lines,
		"enabled":  enabled,
		"timeout":  timeout,
	})
}

// setPHPSlowLogConfig enables/disables the slow log and sets timeout.
func (h *SoftwareHandler) setPHPSlowLogConfig(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}
	var req struct {
		Enabled bool   `json:"enabled"`
		Timeout string `json:"timeout"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "body", Message: "invalid request body"}})
		return
	}
	if err := h.softwareService.SetPHPSlowLogConfig(version, req.Enabled, req.Timeout); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"message": "slow log configuration updated"})
}

// getPHPInfo returns phpinfo output for a PHP version.
func (h *SoftwareHandler) getPHPInfo(c *gin.Context) {
	version := c.Param("version")
	if !validPHPVersion(version) {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid PHP version: "+version))
		return
	}
	info, err := h.softwareService.GetPHPInfo(version)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"info": info, "version": version})
}

// ---------------------------------------------------------------------------
// MariaDB / MySQL management handlers
// ---------------------------------------------------------------------------

func (h *SoftwareHandler) getMariaDBSlowLog(c *gin.Context) {
	lines := 100
	if l := c.Query("lines"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			lines = n
		}
	}
	content, path, err := h.softwareService.GetMariaDBSlowLog(lines)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"content": content, "path": path})
}

func (h *SoftwareHandler) getMariaDBBinaryLogs(c *gin.Context) {
	logs, err := h.softwareService.GetMariaDBBinaryLogs()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
		return
	}
	response.Success(c, gin.H{"logs": logs})
}

func (h *SoftwareHandler) getMariaDBMemoryProtection(c *gin.Context) {
	info, err := h.softwareService.GetMariaDBMemoryProtection()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get memory protection"))
		return
	}
	response.Success(c, info)
}

func (h *SoftwareHandler) setMariaDBMemoryProtection(c *gin.Context) {
	var req struct {
		MemoryMax string `json:"memory_max"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrValidation, "invalid request"))
		return
	}
	if err := h.softwareService.SetMariaDBMemoryProtection(req.MemoryMax); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to set memory protection"))
		return
	}
	response.Success(c, gin.H{"message": "memory protection updated"})
}

func (h *SoftwareHandler) getMariaDBRAMPlans(c *gin.Context) {
	// Get total RAM from /proc/meminfo
	res, err := system.ExecWithTimeout(5*time.Second, "grep", "MemTotal", "/proc/meminfo")
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get total RAM"))
		return
	}
	var totalKB int64
	fields := strings.Fields(strings.TrimSpace(res.Stdout))
	if len(fields) >= 2 {
		fmt.Sscanf(fields[1], "%d", &totalKB)
	}
	totalBytes := totalKB * 1024
	plans := h.softwareService.GetMariaDBRAMPlan(totalBytes)
	response.Success(c, gin.H{"plans": plans, "total_ram_mb": totalKB / 1024})
}

// ─── PostgreSQL Management ──────────────────────────────────────────────────

func (h *SoftwareHandler) getPostgreSQLConnections(c *gin.Context) {
	connections, err := h.softwareService.GetPostgreSQLConnections()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get postgresql connections"))
		return
	}
	response.Success(c, connections)
}

func (h *SoftwareHandler) getPostgreSQLDatabases(c *gin.Context) {
	databases, err := h.softwareService.GetPostgreSQLDatabases()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get postgresql databases"))
		return
	}
	response.Success(c, databases)
}

// --------------- MongoDB API Handlers ---------------

func (h *SoftwareHandler) getMongoDBDatabases(c *gin.Context) {
	databases, err := h.softwareService.GetMongoDBDatabases()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get MongoDB databases"))
		return
	}
	response.Success(c, databases)
}

func (h *SoftwareHandler) createMongoDBDatabase(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "name is required"))
		return
	}
	if err := h.softwareService.CreateMongoDBDatabase(req.Name); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create MongoDB database"))
		return
	}
	response.Success(c, gin.H{"message": "database created"})
}

func (h *SoftwareHandler) dropMongoDBDatabase(c *gin.Context) {
	dbName := c.Param("dbname")
	if dbName == "" {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "database name is required"))
		return
	}
	if err := h.softwareService.DropMongoDBDatabase(dbName); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to drop MongoDB database"))
		return
	}
	response.Success(c, gin.H{"message": "database dropped"})
}

func (h *SoftwareHandler) getMongoDBCollections(c *gin.Context) {
	dbName := c.Param("dbname")
	collections, err := h.softwareService.GetMongoDBCollections(dbName)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get collections"))
		return
	}
	response.Success(c, collections)
}

func (h *SoftwareHandler) createMongoDBCollection(c *gin.Context) {
	dbName := c.Param("dbname")
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "collection name is required"))
		return
	}
	if err := h.softwareService.CreateMongoDBCollection(dbName, req.Name); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create collection"))
		return
	}
	response.Success(c, gin.H{"message": "collection created"})
}

func (h *SoftwareHandler) dropMongoDBCollection(c *gin.Context) {
	dbName := c.Param("dbname")
	collName := c.Param("collname")
	if err := h.softwareService.DropMongoDBCollection(dbName, collName); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to drop collection"))
		return
	}
	response.Success(c, gin.H{"message": "collection dropped"})
}

func (h *SoftwareHandler) getMongoDBStats(c *gin.Context) {
	stats, err := h.softwareService.GetMongoDBStats()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get MongoDB stats"))
		return
	}
	response.Success(c, stats)
}

func (h *SoftwareHandler) getMongoDBUsers(c *gin.Context) {
	users, err := h.softwareService.GetMongoDBUsers()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get MongoDB users"))
		return
	}
	response.Success(c, users)
}

func (h *SoftwareHandler) createMongoDBUser(c *gin.Context) {
	var req struct {
		Database string   `json:"database" binding:"required"`
		Username string   `json:"username" binding:"required"`
		Password string   `json:"password" binding:"required"`
		Roles    []string `json:"roles"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "database, username and password are required"))
		return
	}
	if len(req.Roles) == 0 {
		req.Roles = []string{"readWrite"}
	}
	if err := h.softwareService.CreateMongoDBUser(req.Database, req.Username, req.Password, req.Roles); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create MongoDB user"))
		return
	}
	response.Success(c, gin.H{"message": "user created"})
}

func (h *SoftwareHandler) dropMongoDBUser(c *gin.Context) {
	dbName := c.Param("dbname")
	username := c.Param("username")
	if err := h.softwareService.DropMongoDBUser(dbName, username); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to drop MongoDB user"))
		return
	}
	response.Success(c, gin.H{"message": "user dropped"})
}

// ─── Envoy Proxy Management ───────────────────────────────────────────────────

func (h *SoftwareHandler) getEnvoyConfig(c *gin.Context) {
	content, err := h.softwareService.GetEnvoyConfig()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read envoy config"))
		return
	}
	response.Success(c, gin.H{
		"content": content,
		"path":    "/etc/envoy/envoy.yaml",
	})
}

func (h *SoftwareHandler) updateEnvoyConfig(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		body, readErr := io.ReadAll(c.Request.Body)
		if readErr != nil || len(body) == 0 {
			response.ValidationError(c, []response.FieldError{
				{Field: "content", Message: "configuration content is required"},
			})
			return
		}
		req.Content = string(body)
	}

	if err := h.softwareService.UpdateEnvoyConfig(req.Content); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to update envoy config"))
		return
	}
	response.Success(c, gin.H{"message": "envoy configuration updated and service reloaded"})
}

func (h *SoftwareHandler) validateEnvoyConfig(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil || len(body) == 0 {
		response.ValidationError(c, []response.FieldError{
			{Field: "content", Message: "configuration content is required"},
		})
		return
	}
	if err := h.softwareService.ValidateEnvoyConfig(string(body)); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrValidation, err.Error()))
		return
	}
	response.Success(c, gin.H{"valid": true, "message": "configuration is valid"})
}

func (h *SoftwareHandler) getEnvoyServerInfo(c *gin.Context) {
	info, err := h.softwareService.GetEnvoyServerInfo()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get envoy server info"))
		return
	}
	response.Success(c, info)
}

func (h *SoftwareHandler) getEnvoyClusters(c *gin.Context) {
	clusters, err := h.softwareService.GetEnvoyClusters()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get envoy clusters"))
		return
	}
	response.Success(c, gin.H{"clusters": clusters})
}

func (h *SoftwareHandler) getEnvoyListeners(c *gin.Context) {
	listeners, err := h.softwareService.GetEnvoyListeners()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get envoy listeners"))
		return
	}
	response.Success(c, gin.H{"listeners": listeners})
}

func (h *SoftwareHandler) getEnvoyStats(c *gin.Context) {
	onlyGauge := c.Query("usedonly") == "true"
	stats, err := h.softwareService.GetEnvoyStats(onlyGauge)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get envoy stats"))
		return
	}
	response.Success(c, stats)
}

func (h *SoftwareHandler) getEnvoyErrorLog(c *gin.Context) {
	lines := 100
	if l := c.Query("lines"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			lines = n
		}
	}
	content, path, err := h.softwareService.GetEnvoyErrorLog(lines)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read envoy error log"))
		return
	}
	response.Success(c, gin.H{"content": content, "path": path, "lines": lines})
}

// addEnvoyClusterRequest represents the request body for adding an envoy cluster.
type addEnvoyClusterRequest struct {
	Name           string   `json:"name" binding:"required"`
	Type           string   `json:"type" binding:"required"`
	LbPolicy       string   `json:"lb_policy"`
	ConnectTimeout string   `json:"connect_timeout"`
	Hosts          []string `json:"hosts"` // e.g. ["127.0.0.1:8080", "127.0.0.1:8081"]
}

func (h *SoftwareHandler) addEnvoyCluster(c *gin.Context) {
	var req addEnvoyClusterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request: name, type and hosts are required"},
		})
		return
	}

	lbPolicy := req.LbPolicy
	if lbPolicy == "" {
		lbPolicy = "ROUND_ROBIN"
	}
	connectTimeout := req.ConnectTimeout
	if connectTimeout == "" {
		connectTimeout = "5s"
	}

	cluster := service.EnvoyCluster{
		Name:           req.Name,
		Type:           req.Type,
		LbPolicy:       lbPolicy,
		ConnectTimeout: connectTimeout,
	}

	// Build endpoints from hosts
	if len(req.Hosts) > 0 {
		endpoints := make([]service.EnvoyLbEndpoint, 0, len(req.Hosts))
		for _, host := range req.Hosts {
			parts := strings.Split(host, ":")
			addr := "127.0.0.1"
			port := 8080
			if len(parts) >= 1 {
				addr = parts[0]
			}
			if len(parts) >= 2 {
				if p, err := strconv.Atoi(parts[1]); err == nil {
					port = p
				}
			}
			endpoints = append(endpoints, service.EnvoyLbEndpoint{
				LbEndpoints: []service.EnvoyEndpoint{
					{
						Endpoint: &service.EnvoyEndpointAddress{
							SocketAddress: &service.EnvoySocketAddress{
								Address:   addr,
								PortValue: port,
							},
						},
					},
				},
			})
		}

		if cluster.Type == "STATIC" || cluster.Type == "STRICT_DNS" {
			cluster.LoadAssignment = &service.EnvoyLoadAssignment{
				ClusterName: req.Name,
				Endpoints:   endpoints,
			}
		}
	}

	if err := h.softwareService.AddEnvoyCluster(cluster); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to add envoy cluster"))
		return
	}
	response.Success(c, gin.H{"message": fmt.Sprintf("cluster %s added", req.Name)})
}

func (h *SoftwareHandler) deleteEnvoyCluster(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "cluster name is required"))
		return
	}
	if err := h.softwareService.RemoveEnvoyCluster(name); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to remove envoy cluster"))
		return
	}
	response.Success(c, gin.H{"message": fmt.Sprintf("cluster %s removed", name)})
}

// addEnvoyListenerRequest represents the request body for adding an envoy listener.
type addEnvoyListenerRequest struct {
	Name   string `json:"name" binding:"required"`
	Port   int    `json:"port" binding:"required"`
	Protocol string `json:"protocol"` // HTTP, HTTPS, TCP
}

func (h *SoftwareHandler) addEnvoyListener(c *gin.Context) {
	var req addEnvoyListenerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request: name and port are required"},
		})
		return
	}

	if req.Port <= 0 || req.Port > 65535 {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid port number"))
		return
	}

	protocol := req.Protocol
	if protocol == "" {
		protocol = "HTTP"
	}

	// Build a basic HTTP listener filter chain
	filters := []service.EnvoyFilter{
		{
			Name: "envoy.filters.network.http_connection_manager",
			TypedConfig: map[string]interface{}{
				"@type": "type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager",
				"codec_type": "AUTO",
				"stat_prefix": fmt.Sprintf("ingress_%s", req.Name),
				"route_config": map[string]interface{}{
					"name": fmt.Sprintf("route_%s", req.Name),
					"virtual_hosts": []map[string]interface{}{
						{
							"name": fmt.Sprintf("service_%s", req.Name),
							"domains": []string{"*"},
							"routes": []map[string]interface{}{
								{
									"match": map[string]interface{}{
										"prefix": "/",
									},
									"route": map[string]interface{}{
										"cluster": "original_destination",
									},
								},
							},
						},
					},
				},
				"http_filters": []map[string]interface{}{
					{
						"name": "envoy.filters.http.router",
						"typed_config": map[string]interface{}{
							"@type": "type.googleapis.com/envoy.extensions.filters.http.router.v3.Router",
						},
					},
				},
			},
		},
	}

	listener := service.EnvoyListener{
		Name: req.Name,
		Address: &service.EnvoyAddress{
			SocketAddress: &service.EnvoySocketAddress{
				Address:   "0.0.0.0",
				PortValue: req.Port,
			},
		},
		FilterChains: []service.EnvoyFilterChain{
			{Filters: filters},
		},
	}

	if err := h.softwareService.AddEnvoyListener(listener); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to add envoy listener"))
		return
	}
	response.Success(c, gin.H{"message": fmt.Sprintf("listener on port %d added", req.Port)})
}

func (h *SoftwareHandler) deleteEnvoyListener(c *gin.Context) {
	portStr := c.Param("port")
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "valid port number is required"))
		return
	}
	if err := h.softwareService.RemoveEnvoyListener(port); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to remove envoy listener"))
		return
	}
	response.Success(c, gin.H{"message": fmt.Sprintf("listener on port %d removed", port)})
}

// getMariaDBRootPasswordStatus returns whether root password is set and last changed date.
func (h *SoftwareHandler) getMariaDBRootPasswordStatus(c *gin.Context) {
	info, err := h.softwareService.GetMariaDBRootPasswordStatus()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get root password status"))
		return
	}
	response.Success(c, info)
}

// setMariaDBRootPassword changes the MariaDB root password.
func (h *SoftwareHandler) setMariaDBRootPassword(c *gin.Context) {
	var req struct {
		Password string `json:"password" binding:"required,min=8"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "password", Message: "password is required and must be at least 8 characters"},
		})
		return
	}
	if err := h.softwareService.SetMariaDBRootPassword(req.Password); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to set root password"))
		return
	}
	response.Success(c, gin.H{"message": "MariaDB root password updated successfully"})
}
