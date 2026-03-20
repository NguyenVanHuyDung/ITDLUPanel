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

		// Create services
		authService := service.NewAuthService(db)
		userService := service.NewUserService(db)
		totpService := service.NewTOTPService(db)

		// Create handlers
		authHandler := v1.NewAuthHandler(authService, totpService)
		userHandler := v1.NewUserHandler(userService)

		// Auth middleware
		authMW := AuthMiddleware()
		adminMW := RBACMiddleware("*")

		// Register routes
		authHandler.RegisterRoutes(apiV1, authMW)
		userHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// Task queue for background operations
		taskQueue := task.NewQueue(db, nil, 4)
		taskQueue.Start()

		// Software management (admin only)
		installerRegistry := installer.DefaultRegistry()
		softwareService := service.NewSoftwareService(db, taskQueue, installerRegistry)
		softwareHandler := v1.NewSoftwareHandler(softwareService)
		softwareHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// Future module routes will be registered here:
		// RegisterSystemRoutes(apiV1)
		// RegisterSiteRoutes(apiV1)
		// RegisterDatabaseRoutes(apiV1)
		// RegisterFTPRoutes(apiV1)
		// RegisterCronRoutes(apiV1)
		// RegisterFirewallRoutes(apiV1)
		// RegisterFileRoutes(apiV1)
		// RegisterDockerRoutes(apiV1)
		// RegisterPluginRoutes(apiV1)
		// RegisterBackupRoutes(apiV1)
		// RegisterSettingsRoutes(apiV1)
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
