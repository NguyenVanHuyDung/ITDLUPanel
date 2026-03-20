package app

import (
	"database/sql"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	panel "github.com/ITDLUPanel/panel"
	v1 "github.com/ITDLUPanel/panel/internal/api/v1"
	"github.com/ITDLUPanel/panel/internal/api/ws"
	"github.com/ITDLUPanel/panel/internal/service"
	"github.com/ITDLUPanel/panel/internal/plugin"
	"github.com/ITDLUPanel/panel/internal/service/installer"
	"github.com/ITDLUPanel/panel/internal/task"
	"github.com/ITDLUPanel/panel/internal/websocket"
)

// SetupRouter creates the Gin engine with all middleware and routes registered.
func SetupRouter(db *sql.DB) *gin.Engine {
	// Respect GIN_MODE env var; default to debug.
	if mode := os.Getenv("GIN_MODE"); mode != "" {
		gin.SetMode(mode)
	}

	engine := gin.New()

	// Middleware chain.
	engine.Use(
		RecoveryMiddleware(),
		LoggerMiddleware(),
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
	apiV1.Use(RateLimitMiddleware(60, 1*time.Minute))

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
		siteService := service.NewSiteService(db)
		sslService := service.NewSSLService(db)
		databaseService := service.NewDatabaseService(db)
		ftpService := service.NewFTPService(db)
		fileService := service.NewFileService()
		cronService := service.NewCronService(db)
		firewallService := service.NewFirewallService(db)
		securityService := service.NewSecurityService()
		dockerService := service.NewDockerService()
		logService := service.NewLogService(db)
		backupService := service.NewBackupService(db)
		terminalService := service.NewTerminalService()
		installerRegistry := installer.DefaultRegistry()
		softwareService := service.NewSoftwareService(db, taskQueue, installerRegistry)

		// -------------------------------------------------------
		// Auth & User (public / admin)
		// -------------------------------------------------------
		authHandler := v1.NewAuthHandler(authService, totpService)
		authHandler.RegisterRoutes(apiV1, authMW)

		userHandler := v1.NewUserHandler(userService)
		userHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// -------------------------------------------------------
		// Dashboard & Monitor (all authenticated users)
		// -------------------------------------------------------
		dashboardHandler := v1.NewDashboardHandler(monitorService)
		dashboardHandler.RegisterRoutes(authGroup)

		monitorHandler := v1.NewMonitorHandler(monitorService)
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
		siteHandler := v1.NewSiteHandler(siteService)
		siteHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware("sites.*"))

		// -------------------------------------------------------
		// SSL management (admin)
		// -------------------------------------------------------
		sslHandler := v1.NewSSLHandler(sslService)
		sslHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// -------------------------------------------------------
		// Database management
		// -------------------------------------------------------
		databaseHandler := v1.NewDatabaseHandler(databaseService)
		databaseHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware("databases.*"))

		// -------------------------------------------------------
		// FTP management
		// -------------------------------------------------------
		ftpHandler := v1.NewFTPHandler(ftpService)
		ftpHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware("ftp.*"))

		// -------------------------------------------------------
		// File management
		// -------------------------------------------------------
		fileHandler := v1.NewFileHandler(fileService)
		fileHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware("files.*"))

		// -------------------------------------------------------
		// Cron management
		// -------------------------------------------------------
		cronHandler := v1.NewCronHandler(cronService)
		cronHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware("cron.*"))

		// -------------------------------------------------------
		// Security & Firewall (admin)
		// -------------------------------------------------------
		securityHandler := v1.NewSecurityHandler(firewallService, securityService)
		securityHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// -------------------------------------------------------
		// Docker management
		// -------------------------------------------------------
		dockerHandler := v1.NewDockerHandler(dockerService)
		dockerHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware("docker.*"))

		// -------------------------------------------------------
		// Log management
		// -------------------------------------------------------
		logHandler := v1.NewLogHandler(logService)
		logHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware("logs.*"))

		// -------------------------------------------------------
		// Backup management
		// -------------------------------------------------------
		backupHandler := v1.NewBackupHandler(backupService)
		backupHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware("backup.*"))

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
		settingsHandler := v1.NewSettingsHandler(settingsService)
		settingsHandler.RegisterRoutes(apiV1, authMW, adminMW)

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
		c.Request.URL.Path = "/"
		fileServer.ServeHTTP(c.Writer, c.Request)
	})
}
