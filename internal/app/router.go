package app

import (
	"database/sql"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	panel "github.com/ITDLUPanel/panel"
	v1 "github.com/ITDLUPanel/panel/internal/api/v1"
	"github.com/ITDLUPanel/panel/internal/api/ws"
	"github.com/ITDLUPanel/panel/internal/service"
	"github.com/ITDLUPanel/panel/internal/plugin"
	"github.com/ITDLUPanel/panel/internal/service/installer"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/task"
	"github.com/ITDLUPanel/panel/internal/websocket"
)

// SetupRouter creates the Gin engine with all middleware and routes registered.
func SetupRouter(db *sql.DB, logDir string) *gin.Engine {
	// Respect GIN_MODE env var; default to debug.
	if mode := os.Getenv("GIN_MODE"); mode != "" {
		gin.SetMode(mode)
	}

	engine := gin.New()

	// Middleware chain.
	engine.Use(
		RecoveryMiddleware(),
		LoggerMiddleware(),
		SecurityHeadersMiddleware(),
		CORSMiddleware(),
		CompressionMiddleware(),
		LanguageMiddleware(),
	)

	// Initialise RBAC permission cache
	InitPermissionCache(db)

	// ---------------------------------------------------------------
	// API v1
	// ---------------------------------------------------------------
	apiV1 := engine.Group("/api/v1")

	// Rate limiting on all API routes
	apiV1.Use(RateLimitMiddleware(300, 1*time.Minute))

	// Audit logging for state-changing operations
	apiV1.Use(AuditMiddleware(db))

	// CSRF protection
	apiV1.Use(CSRFMiddleware())

	{
		// Health check — no authentication required.
		apiV1.GET("/health", healthHandler)

		// -------------------------------------------------------
		// Middleware
		// -------------------------------------------------------
		authMW := AuthMiddleware()
		adminMW := RBACMiddleware("*")

		// Convenience group that already carries the auth middleware
		// (used by handlers whose RegisterRoutes only accept *gin.RouterGroup).
		authGroup := apiV1.Group("", authMW)

		// -------------------------------------------------------
		// WebSocket hub (shared across WS endpoints and task queue)
		// -------------------------------------------------------
		wsHub := websocket.NewHub()
		go wsHub.Run()

		// -------------------------------------------------------
		// Task queue for background operations
		// -------------------------------------------------------
		taskQueue := task.NewQueue(db, wsHub, 4)
		taskQueue.Start()

		// -------------------------------------------------------
		// Core services
		// -------------------------------------------------------
		authService := service.NewAuthService(db)
		userService := service.NewUserService(db)
		totpService := service.NewTOTPService(db)
		monitorService := service.NewMonitorService()
		metricsCollector := service.NewMetricsCollector(db, monitorService)
		metricsCollector.Start()
		siteService := service.NewSiteService(db)
		sslService := service.NewSSLService(db)
		databaseService := service.NewDatabaseService(db)
		ftpService := service.NewFTPService(db)
		fileService := service.NewFileService()
		cronService := service.NewCronService(db)
		cronService.ResyncAll()
		firewallService := service.NewFirewallService(db)
		securityService := service.NewSecurityService()
		dockerService := service.NewDockerService()
		// Ensure website log directory and logrotate config exist
		// (initialized after geoService below)
		ftpStorageService := service.NewFTPStorageService(db)
		cloudStorageService := service.NewCloudStorageService(db)
		backupService := service.NewBackupService(db, ftpStorageService, cloudStorageService)
		terminalService := service.NewTerminalService()
		userResourceService := service.NewUserResourceService(db)
		installerRegistry := installer.DefaultRegistry()
		softwareService := service.NewSoftwareService(db, taskQueue, installerRegistry, firewallService)
		softwareService.SetOnNginxVersionChanged(func() {
			if err := siteService.RegenerateAllVhosts(); err != nil {
				logger.Warn().Err(err).Msg("failed to regenerate vhosts after nginx version switch")
			}
		})

		// -------------------------------------------------------
		// Auth & User (public / admin)
		// -------------------------------------------------------
		authHandler := v1.NewAuthHandler(authService, totpService, GetUserPermissions)
		authHandler.RegisterRoutes(apiV1, authMW)

		userHandler := v1.NewUserHandler(userService, userResourceService)
		userHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// -------------------------------------------------------
		// Role management (admin only)
		// -------------------------------------------------------
		roleService := service.NewRoleService(db)
		roleHandler := v1.NewRoleHandler(roleService)
		roleHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// -------------------------------------------------------
		// Dashboard & Monitor (all authenticated users)
		// -------------------------------------------------------
		dashboardHandler := v1.NewDashboardHandler(monitorService)
		dashboardHandler.RegisterRoutes(authGroup)

		monitorHandler := v1.NewMonitorHandler(monitorService, metricsCollector)
		monitorHandler.RegisterRoutes(authGroup)

		// -------------------------------------------------------
		// Task management (all authenticated users)
		// -------------------------------------------------------
		taskHandler := v1.NewTaskHandler(taskQueue)
		taskHandler.RegisterRoutes(authGroup)

		// -------------------------------------------------------
		// Software management (admin only)
		// -------------------------------------------------------
		softwareHandler := v1.NewSoftwareHandler(softwareService)
		softwareHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// -------------------------------------------------------
		// Site management
		// -------------------------------------------------------
		statsService := service.NewSiteStatisticsService(db)
		siteHandler := v1.NewSiteHandler(siteService, statsService, userResourceService)
		siteHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// SSL management (admin)
		// -------------------------------------------------------
		sslHandler := v1.NewSSLHandler(sslService)
		sslHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// -------------------------------------------------------
		// Database management
		// -------------------------------------------------------
		databaseHandler := v1.NewDatabaseHandler(databaseService, userResourceService)
		databaseHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// Redis management
		// -------------------------------------------------------
		redisService := service.NewRedisService()
		redisHandler := v1.NewRedisHandler(redisService)
		redisHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// FTP management
		// -------------------------------------------------------
		ftpHandler := v1.NewFTPHandler(ftpService, userResourceService)
		ftpHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// File management
		// -------------------------------------------------------
		fileHandler := v1.NewFileHandler(fileService)
		fileHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// Cron management
		// -------------------------------------------------------
		cronHandler := v1.NewCronHandler(cronService)
		cronHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// Security & Firewall (admin)
		// -------------------------------------------------------
		securityHandler := v1.NewSecurityHandler(firewallService, securityService)
		securityHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// Docker management
		// -------------------------------------------------------
		dockerHandler := v1.NewDockerHandler(dockerService)
		dockerHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// Docker Compose management
		// -------------------------------------------------------
		composeService := service.NewDockerComposeService()
		composeHandler := v1.NewDockerComposeHandler(composeService)
		composeHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// GeoIP service (shared across log and other handlers)
		// -------------------------------------------------------
		geoService := service.NewGeoService()

		// -------------------------------------------------------
		// Log management
		// -------------------------------------------------------
		logService := service.NewLogService(db, filepath.Join(logDir, "panel.log"))
		service.SetGeoService(geoService) // Wire geo service into log service
		logHandler := v1.NewLogHandler(logService, geoService)
		logHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// Backup management
		// -------------------------------------------------------
		backupHandler := v1.NewBackupHandler(backupService)
		backupHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// FTP Storage management
		// -------------------------------------------------------
		ftpStorageHandler := v1.NewFTPStorageHandler(ftpStorageService)
		ftpStorageHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// Cloud Storage management
		// -------------------------------------------------------
		cloudStorageHandler := v1.NewCloudStorageHandler(cloudStorageService)
		cloudStorageHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// Plugin management (admin)
		// -------------------------------------------------------
		pluginManager := plugin.NewManager(db)
		pluginHandler := v1.NewPluginHandler(pluginManager)
		pluginHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// -------------------------------------------------------
		// Settings management (admin)
		// -------------------------------------------------------
		settingsService := service.NewSettingsService(db)
		settingsService.ApplyTimezone()
		settingsHandler := v1.NewSettingsHandler(settingsService)
		settingsHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// -------------------------------------------------------
		// Notification management (admin)
		// -------------------------------------------------------
		notificationService := service.NewNotificationService(db, wsHub)
		notificationHandler := v1.NewNotificationHandler(notificationService)
		notificationHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// Wire notification hooks into event-producing services
		cronService.SetNotifier(notificationService)
		backupService.SetNotifier(notificationService)
		sslService.SetNotifier(notificationService)
		softwareService.SetNotifier(notificationService)
		siteService.SetNotifier(notificationService)
		authService.SetNotifier(notificationService)
		metricsCollector.SetNotifier(notificationService)

		// -------------------------------------------------------
		// Docker Cleanup management
		// -------------------------------------------------------
		dockerCleanupService := service.NewDockerCleanupService(db, dockerService)
		dockerCleanupService.SetNotifier(notificationService)
		dockerCleanupService.StartScheduler()
		dockerCleanupHandler := v1.NewDockerCleanupHandler(dockerCleanupService)
		dockerCleanupHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// WebSocket endpoints (terminal handles its own JWT auth via query param)
		// -------------------------------------------------------
		apiV1.GET("/terminal", ws.HandleTerminal(terminalService, CheckPermission))
		authGroup.GET("/monitor/realtime", ws.HandleMonitorWS(wsHub, monitorService))
	}

	// ---------------------------------------------------------------
	// SPA static files & fallback
	// ---------------------------------------------------------------
	setupSPAHandler(engine)

	return engine
}

// healthHandler returns a simple health check response.
func healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"version": "0.1.0",
	})
}

// setupSPAHandler serves the embedded frontend SPA assets and provides a
// fallback to index.html for client-side routing. API routes that don't match
// receive a JSON 404 instead.
func setupSPAHandler(engine *gin.Engine) {
	// The embed.FS has files under "web/dist/…", so we strip that prefix.
	distFS, err := fs.Sub(panel.WebDistFS, "web/dist")
	if err != nil {
		panic("failed to create sub filesystem for web/dist: " + err.Error())
	}

	fileServer := http.FileServer(http.FS(distFS))

	engine.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		// Unmatched API routes return a JSON 404.
		if strings.HasPrefix(path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{
				"code":    http.StatusNotFound,
				"message": "API endpoint not found",
			})
			return
		}

		// Try to serve the exact static file first.
		if path != "/" {
			// Check if the file exists in the embedded FS.
			cleanPath := strings.TrimPrefix(path, "/")
			if f, err := distFS.Open(cleanPath); err == nil {
				f.Close()
				fileServer.ServeHTTP(c.Writer, c.Request)
				return
			}
		}

		// SPA fallback: serve index.html for all other routes.
		// Prevent caching so browser always gets the latest build.
		c.Header("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
		c.Header("Pragma", "no-cache")
		c.Header("Expires", "0")
		c.Header("X-Build-Time", time.Now().Format(time.RFC3339))
		c.Request.URL.Path = "/"
		fileServer.ServeHTTP(c.Writer, c.Request)
	})
}
