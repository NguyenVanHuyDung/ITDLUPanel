package app

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilhy/cmux"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/database"
	"github.com/ITDLUPanel/panel/internal/i18n"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/service"
	"github.com/ITDLUPanel/panel/internal/system"
)

// backupUploadShutdown wires BackupUploadService into the app shutdown
// path. The variable is set in SetupRouter and read by App.Shutdown.
var (
	backupUploadShutdownMu sync.Mutex
	backupUploadShutdown   *service.BackupUploadService
)

func registerBackupUploadShutdown(s *service.BackupUploadService) {
	backupUploadShutdownMu.Lock()
	backupUploadShutdown = s
	backupUploadShutdownMu.Unlock()
}

func shutdownBackupUpload(grace time.Duration) {
	backupUploadShutdownMu.Lock()
	s := backupUploadShutdown
	backupUploadShutdown = nil
	backupUploadShutdownMu.Unlock()
	if s != nil {
		s.Stop(grace)
	}
}

// App holds all top-level dependencies for the application.
type App struct {
	Config *config.Config
	DB     *database.DB
	Router *gin.Engine
	I18n   *i18n.Manager
}

// New creates and fully initialises the application.
// configPath is the path to the JSON configuration file.
func New(configPath string) (*App, error) {
	// 1. Load configuration.
	cfg, err := config.Load(configPath)
	if err != nil {
		return nil, fmt.Errorf("load config: %w", err)
	}

	// 2. Initialise structured logger.
	logDir := cfg.Paths.Logs
	if logDir == "" {
		logDir = "logs"
	}
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, fmt.Errorf("create log directory: %w", err)
	}
	debug := gin.Mode() != gin.ReleaseMode
	logger.Init(logDir, debug)

	logger.Info().
		Str("config", configPath).
		Msg("Configuration loaded")

	// 3. Detect operating system.
	osInfo, err := system.DetectOS()
	if err != nil {
		logger.Warn().Err(err).Msg("Failed to detect OS, using defaults")
		osInfo = &system.OSInfo{
			Name:       "unknown",
			Arch:       "unknown",
			PkgManager: "apt",
		}
	}
	logger.Info().
		Str("os", osInfo.Name).
		Str("version", osInfo.Version).
		Str("arch", osInfo.Arch).
		Str("package_manager", osInfo.PkgManager).
		Msg("Operating system detected")

	// 4. Initialise database (create directories, open, auto-migrate).
	dbPath := cfg.Database.Path
	if dbPath == "" {
		dbPath = "data/panel.db"
	}
	dbDir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}

	db, err := database.New(dbPath)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	if err := db.Migrate(); err != nil {
		return nil, fmt.Errorf("migrate database: %w", err)
	}

	logger.Info().Str("path", dbPath).Msg("Database ready")

	// 5a. Reconcile vhost configs — regenerate any that are missing on disk.
	siteService := service.NewSiteService(db.GetDB())
	siteService.ReconcileVhosts()

	// 5b. Initialise i18n.
	localesDir := filepath.Join(filepath.Dir(configPath), "..", "internal", "i18n", "locales")
	// Prefer a well-known absolute location if it exists.
	if cfg.Paths.Base != "" {
		candidate := filepath.Join(cfg.Paths.Base, "server", "internal", "i18n", "locales")
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			localesDir = candidate
		}
	}
	// Fall back to a relative path from the working directory.
	if info, statErr := os.Stat(localesDir); statErr != nil || !info.IsDir() {
		localesDir = "internal/i18n/locales"
	}

	i18nManager, err := i18n.New(localesDir)
	if err != nil {
		logger.Warn().Err(err).Msg("Failed to initialise i18n, translations will be unavailable")
		i18nManager = nil
	} else {
		defaultLang := cfg.Panel.Language
		if defaultLang == "" {
			defaultLang = "en"
		}
		i18nManager.SetDefault(defaultLang)
		logger.Info().Str("default_language", defaultLang).Msg("Internationalisation ready")
	}

	// 6. Create default admin if no users exist.
	authService := service.NewAuthService(db.GetDB())
	defaultPassword, err := authService.CreateDefaultAdmin()
	if err != nil {
		logger.Warn().Err(err).Msg("Failed to create default admin")
	} else if defaultPassword != "" {
		logger.Info().
			Str("username", "admin").
			Str("password", defaultPassword).
			Msg("=== Default admin credentials (change immediately!) ===")
	}

	// 6b. Auto-enable HTTPS with self-signed cert on first boot.
	if !cfg.Server.SSL && cfg.Server.SSLCert == "" {
		if service.PanelCertExists() {
			// Cert files already exist (e.g. from previous run), just enable SSL
			certPath, keyPath := service.PanelCertPaths()
			cfg.Server.SSL = true
			cfg.Server.SSLCert = certPath
			cfg.Server.SSLKey = keyPath
			_ = cfg.Save()
			logger.Info().Msg("Panel SSL auto-enabled (existing certificate found)")
		} else {
			// Generate a new self-signed cert
			sslService := service.NewSSLService(db.GetDB())
			if err := sslService.GenerateSelfSignedCert(); err != nil {
				logger.Warn().Err(err).Msg("Failed to auto-generate self-signed certificate, panel will run over HTTP")
			} else {
				certPath, keyPath := service.PanelCertPaths()
				cfg.Server.SSL = true
				cfg.Server.SSLCert = certPath
				cfg.Server.SSLKey = keyPath
				_ = cfg.Save()
				logger.Info().Msg("Panel SSL auto-enabled with self-signed certificate")
			}
		}
	}

	// 7. Setup HTTP router.
	router := SetupRouter(db.GetDB(), logDir)

	logger.Info().Msg("Router initialised")

	return &App{
		Config: cfg,
		DB:     db,
		Router: router,
		I18n:   i18nManager,
	}, nil
}

// Run starts the HTTP(S) server. It blocks until the server exits.
// When SSL is enabled, both HTTP and HTTPS are served on the same port
// using connection multiplexing. Plain HTTP requests are redirected to HTTPS.
func (a *App) Run() error {
	addr := fmt.Sprintf("%s:%d", a.Config.Server.Host, a.Config.Server.Port)
	logger.Info().Str("address", addr).Bool("ssl", a.Config.Server.SSL).Msg("Starting ITDLUPanel server")

	if !a.Config.Server.SSL {
		return a.Router.Run(addr)
	}

	// Listen on a single TCP port for both HTTP and HTTPS.
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", addr, err)
	}

	m := cmux.New(ln)
	tlsL := m.Match(cmux.TLS())
	httpL := m.Match(cmux.Any())

	cert, err := tls.LoadX509KeyPair(a.Config.Server.SSLCert, a.Config.Server.SSLKey)
	if err != nil {
		return fmt.Errorf("load TLS certificate: %w", err)
	}
	tlsCfg := &tls.Config{Certificates: []tls.Certificate{cert}} //nolint:gosec

	// HTTPS — serve the Gin router over TLS.
	httpsServer := &http.Server{Handler: a.Router, TLSConfig: tlsCfg}
	go func() {
		tlsLn := tls.NewListener(tlsL, tlsCfg)
		if err := httpsServer.Serve(tlsLn); err != nil && err != http.ErrServerClosed {
			logger.Error().Err(err).Msg("HTTPS server error")
		}
	}()

	// HTTP — redirect every request to the HTTPS equivalent on the same port.
	port := a.Config.Server.Port
	redirectHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, splitErr := net.SplitHostPort(host); splitErr == nil {
			host = h
		}
		target := fmt.Sprintf("https://%s:%d%s", host, port, r.URL.RequestURI())
		http.Redirect(w, r, target, http.StatusMovedPermanently)
	})
	httpServer := &http.Server{Handler: redirectHandler}
	go func() {
		if err := httpServer.Serve(httpL); err != nil && err != http.ErrServerClosed {
			logger.Error().Err(err).Msg("HTTP redirect server error")
		}
	}()

	logger.Info().Str("address", addr).Msg("HTTP+HTTPS multiplexed on same port")
	return m.Serve()
}

// Shutdown performs a graceful shutdown of all resources.
func (a *App) Shutdown() {
	// Drain in-flight cloud uploads first so we don't leave Drive
	// session URIs stranded. We give workers up to 5 seconds before
	// forcing the goroutines to exit.
	shutdownBackupUpload(5 * time.Second)
	if a.DB != nil {
		a.DB.Close()
	}
	logger.Info().Msg("ITDLUPanel shutdown complete")
}
