package app

import (
	"bytes"
	"database/sql"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	panel "github.com/ITDLUPanel/panel"
	v1 "github.com/ITDLUPanel/panel/internal/api/v1"
	"github.com/ITDLUPanel/panel/internal/api/ws"
	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/plugin"
	"github.com/ITDLUPanel/panel/internal/service"
	"github.com/ITDLUPanel/panel/internal/service/installer"
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
		// Async + resumable cloud upload pipeline. The service starts a
		// worker pool and a reaper goroutine that picks up uploads left
		// pending by a previous run.
		backupUploadService := service.NewBackupUploadService(db, cloudStorageService, backupService)
		backupUploadService.Start(2)
		backupService.SetUploadService(backupUploadService)
		registerBackupUploadShutdown(backupUploadService)
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
		monitorHandler.RegisterRoutes(authGroup, RBACMiddleware)

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
		// WAF management
		// -------------------------------------------------------
		wafHandler := v1.NewWAFHandler(db)
		wafHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)

		// -------------------------------------------------------
		// Docker management
		// -------------------------------------------------------
		dockerHandler := v1.NewDockerHandler(dockerService, userResourceService)
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
		// System lifecycle (admin): panel restart, server reboot/shutdown
		// -------------------------------------------------------
		systemHandler := v1.NewSystemHandler()
		systemHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// -------------------------------------------------------
		// Notification management (admin)
		// -------------------------------------------------------
		notificationService := service.NewNotificationService(db, wsHub)
		notificationHandler := v1.NewNotificationHandler(notificationService)
		notificationHandler.RegisterRoutes(apiV1, authMW, adminMW)

		// Wire notification hooks into event-producing services
		cronService.SetNotifier(notificationService)
		backupService.SetNotifier(notificationService)
		backupUploadService.SetNotifier(notificationService)
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
	settingsService = service.NewSettingsService(db)
	setupSPAHandler(engine)

	return engine
}

// settingsService is set in SetupRouter before setupSPAHandler is
// called. The SPA fallback handler uses it to inject the configured
// panel name into the served index.html so the browser tab title
// matches the user's setting on the very first paint (no FOUT).
var settingsService *service.SettingsService

// panelNameCache avoids hitting the settings store on every page load.
// The cache is invalidated automatically after 5 s.
var (
	panelNameCacheMu    sync.Mutex
	panelNameCacheValue string
	panelNameCacheAt    time.Time
)

// resolvePanelName returns the currently configured panel name, falling
// back to the value baked into the config file if no DB override exists.
func resolvePanelName() string {
	panelNameCacheMu.Lock()
	defer panelNameCacheMu.Unlock()

	if time.Since(panelNameCacheAt) < 1*time.Second && panelNameCacheValue != "" {
		return panelNameCacheValue
	}

	name := ""
	if settingsService != nil {
		if v, err := settingsService.Get("panel_name"); err == nil {
			name = v
		}
	}
	if name == "" && config.Get() != nil {
		name = config.Get().Panel.Name
	}
	if name == "" {
		name = "ITDLUPanel"
	}
	panelNameCacheValue = name
	panelNameCacheAt = time.Now()
	return name
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

	// Wrap the file server so JS/CSS chunks get short-lived cache headers
	// while the index.html and other small entries stay no-cache. Vite
	// hashes chunks by content so they can be safely cached for a year,
	// but emitting Cache-Control avoids stale-bundle bugs after a hot
	// reload where the browser still holds the previous chunk.
	cacheWrappedFileServer := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		fileServer.ServeHTTP(w, r)
	})

	// Cache the raw index.html bytes in memory. The file is small (~1 KB)
	// and immutable per build, but we still re-read it on every request so
	// re-deploys pick up the new bundle without a process restart.
	var indexHTML []byte

	// loadIndexHTML returns the bytes of dist/index.html, memoised for
	// fast serving.
	loadIndexHTML := func() []byte {
		if len(indexHTML) > 0 {
			return indexHTML
		}
		f, err := distFS.Open("index.html")
		if err != nil {
			return nil
		}
		defer f.Close()
		stat, err := f.Stat()
		if err != nil {
			return nil
		}
		buf := make([]byte, stat.Size())
		if _, err := io.ReadFull(f, buf); err != nil {
			return nil
		}
		indexHTML = buf
		return buf
	}

	// serveIndexWithPanelName serves dist/index.html with the configured
	// panel name injected into <title> and <meta name="application-name">.
	// This prevents the flash-of-wrong-title that would otherwise occur
	// when a user has renamed the panel.
	serveIndexWithPanelName := func(c *gin.Context) {
		html := loadIndexHTML()
		if html == nil {
			// Fallback to the default file server if we can't read the
			// file (shouldn't happen in normal operation).
			c.Request.URL.Path = "/"
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}
		name := resolvePanelName()
		// Sanitise: strip any HTML/JS-injection characters from the
		// configured name before splicing it into the document.
		cleanName := panelNameSafe(name)
		// Replace the default <title> placeholder with the configured name.
		body := injectPanelNameIntoIndex(html, cleanName)
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.Header("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
		c.Header("Pragma", "no-cache")
		c.Header("Expires", "0")
		c.Header("X-Build-Time", time.Now().Format(time.RFC3339))
		c.Header("X-Panel-Name", cleanName)
		c.Status(http.StatusOK)
		_, _ = c.Writer.Write(body)
	}

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
				cacheWrappedFileServer.ServeHTTP(c.Writer, c.Request)
				return
			}
		}

		// SPA fallback: serve index.html (with the configured panel
		// name injected) for all other routes.
		serveIndexWithPanelName(c)
	})
}

// injectPanelNameIntoIndex replaces the default <title>ITDLUPanel</title>
// and adds a <meta name="application-name"> tag with the configured
// panel name.
func injectPanelNameIntoIndex(html []byte, name string) []byte {
	// Replace <title>ITDLUPanel</title> (the default baked into
	// web/index.html). If the build doesn't contain that exact string
	// (e.g. a customised index.html), fall back to replacing any
	// <title>…</title> with the configured name.
	titlePlaceholder := []byte("<title>ITDLUPanel</title>")
	titleReplacement := []byte("<title>" + name + "</title>")
	if bytes.Contains(html, titlePlaceholder) {
		html = bytes.Replace(html, titlePlaceholder, titleReplacement, 1)
	} else {
		const openTag = "<title>"
		const closeTag = "</title>"
		start := bytes.Index(html, []byte(openTag))
		if start >= 0 {
			rest := html[start+len(openTag):]
			end := bytes.Index(rest, []byte(closeTag))
			if end >= 0 {
				absEnd := start + len(openTag) + end
				html = append(html[:start],
					append([]byte(openTag+name+closeTag), html[absEnd+len(closeTag):]...)...)
			}
		}
	}

	// Inject a <meta name="application-name"> right after the viewport
	// meta so mobile browsers also pick up the configured name. Skip
	// if the meta is already present.
	if bytes.Contains(html, []byte(`name="application-name"`)) {
		return html
	}
	appMeta := []byte(`<meta name="application-name" content="` + name + `">`)
	viewport := []byte(`<meta name="viewport"`)
	idx := bytes.Index(html, viewport)
	if idx < 0 {
		return html
	}
	// Insert right after the viewport meta's closing '>'.
	rest := html[idx:]
	closeIdx := bytes.Index(rest, []byte(">"))
	if closeIdx < 0 {
		return html
	}
	insertAt := idx + closeIdx + 1
	html = append(html[:insertAt],
		append([]byte("\n    "+string(appMeta)), html[insertAt:]...)...)
	return html
}

// panelNameSafe strips characters that could break out of a <title>
// or <meta> attribute. The panel name is rendered as plain text, so
// we keep visible characters and collapse runs of whitespace.
func panelNameSafe(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "ITDLUPanel"
	}
	// Strip control characters and angle brackets. Allow spaces, but
	// collapse any sequence of whitespace into a single space.
	var b strings.Builder
	b.Grow(len(s))
	prevSpace := false
	for _, r := range s {
		switch {
		case r == '<' || r == '>' || r == '"' || r == '\'':
			continue
		case r < 0x20 || r == 0x7f:
			continue
		case r == ' ' || r == '\t' || r == '\n' || r == '\r':
			if !prevSpace {
				b.WriteByte(' ')
				prevSpace = true
			}
		default:
			b.WriteRune(r)
			prevSpace = false
		}
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return "ITDLUPanel"
	}
	// Hard cap so a malicious rename doesn't bloat the document.
	if len(out) > 64 {
		out = out[:64]
	}
	return out
}
