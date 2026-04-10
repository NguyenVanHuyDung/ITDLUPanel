package installer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// PgAdminInstaller handles pgAdmin4 installation and removal.
type PgAdminInstaller struct{}

func NewPgAdminInstaller() *PgAdminInstaller {
	return &PgAdminInstaller{}
}

func (i *PgAdminInstaller) Name() string { return "pgadmin" }

func (i *PgAdminInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	progress(5)
	logger.Info().Msg("installing pgAdmin4")

	osInfo := system.GetOSInfo()
	progress(10)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	progress(15)
	// Add pgAdmin4 repository
	if osInfo.PkgManager == "apt" {
		if err := i.addAptRepo(ctx); err != nil {
			return fmt.Errorf("failed to add pgAdmin apt repo: %w", err)
		}
	} else {
		if err := i.addDnfRepo(ctx); err != nil {
			return fmt.Errorf("failed to add pgAdmin dnf repo: %w", err)
		}
	}

	progress(30)
	// Install pgadmin4-web package
	if osInfo.PkgManager == "apt" {
		FixDpkg(ctx)
		if _, err := system.Exec(ctx, "apt", "install", "-y", "pgadmin4-web"); err != nil {
			return fmt.Errorf("failed to install pgadmin4-web: %w", err)
		}
	} else {
		if _, err := system.Exec(ctx, "dnf", "install", "-y", "pgadmin4-web"); err != nil {
			return fmt.Errorf("failed to install pgadmin4-web: %w", err)
		}
	}

	progress(60)
	// Create server directory structure
	os.MkdirAll("/ITDLUPanel/server/pgadmin", 0755)
	os.MkdirAll("/ITDLUPanel/server/pgadmin/ssl", 0755)

	progress(70)
	// Configure pgAdmin4 for standalone mode with Gunicorn
	i.configurePgAdmin(ctx)

	progress(80)
	// Generate self-signed SSL cert
	i.generateSSLCert()

	progress(85)
	// Setup nginx reverse proxy
	setupPgAdminNginx(ctx)

	progress(90)
	// Enable and start pgadmin4 service (if using systemd setup)
	// pgAdmin web mode runs via Apache/WSGI by default — we override with Gunicorn + nginx
	i.setupGunicornService(ctx)

	progress(95)
	// Start the service
	system.ExecWithTimeout(10*time.Second, "systemctl", "daemon-reload")
	system.ExecWithTimeout(10*time.Second, "systemctl", "enable", "pgadmin4")
	system.ExecWithTimeout(10*time.Second, "systemctl", "start", "pgadmin4")

	progress(100)
	logger.Info().Msg("pgAdmin4 installed successfully")
	return nil
}

func (i *PgAdminInstaller) addAptRepo(ctx context.Context) error {
	// Import the repository signing key
	keyDir := "/usr/share/keyrings"
	os.MkdirAll(keyDir, 0755)

	_, err := system.Exec(ctx, "bash", "-c",
		"curl -fsS https://www.pgadmin.org/static/packages_pgadmin_org.pub | gpg --dearmor -o /usr/share/keyrings/pgadmin.gpg")
	if err != nil {
		return fmt.Errorf("failed to import pgAdmin GPG key: %w", err)
	}

	// Determine codename
	result, err := system.ExecWithTimeout(5*time.Second, "lsb_release", "-cs")
	codename := "jammy"
	if err == nil {
		codename = strings.TrimSpace(result.Stdout)
	}

	// Add repository
	repoLine := fmt.Sprintf("deb [signed-by=/usr/share/keyrings/pgadmin.gpg] https://ftp.postgresql.org/pub/pgadmin/pgadmin4/apt/%s pgadmin4 main", codename)
	if err := os.WriteFile("/etc/apt/sources.list.d/pgadmin4.list", []byte(repoLine+"\n"), 0644); err != nil {
		return fmt.Errorf("failed to write repo file: %w", err)
	}

	// Update package index
	if _, err := system.Exec(ctx, "apt", "update", "-y"); err != nil {
		logger.Warn().Err(err).Msg("apt update after adding pgadmin repo had warnings")
	}

	return nil
}

func (i *PgAdminInstaller) addDnfRepo(ctx context.Context) error {
	_, err := system.Exec(ctx, "rpm", "-i",
		"https://ftp.postgresql.org/pub/pgadmin/pgadmin4/yum/pgadmin4-redhat-repo-2-1.noarch.rpm")
	if err != nil {
		logger.Warn().Err(err).Msg("pgAdmin repo RPM install (may already exist)")
	}
	return nil
}

func (i *PgAdminInstaller) configurePgAdmin(ctx context.Context) {
	// pgAdmin4 config for web mode
	configDir := "/var/lib/pgadmin"
	os.MkdirAll(configDir, 0755)
	os.MkdirAll("/var/log/pgadmin", 0755)

	// Set default admin email/password via config_local.py
	configLocalPath := "/usr/pgadmin4/web/config_local.py"
	// Also check alternative path
	if _, err := os.Stat("/usr/pgadmin4/web"); os.IsNotExist(err) {
		// Try alternative location
		if _, err2 := os.Stat("/usr/share/pgadmin4/web"); err2 == nil {
			configLocalPath = "/usr/share/pgadmin4/web/config_local.py"
		}
	}

	configContent := `import os
LOG_FILE = '/var/log/pgadmin/pgadmin4.log'
SQLITE_PATH = '/var/lib/pgadmin/pgadmin4.db'
SESSION_DB_PATH = '/var/lib/pgadmin/sessions'
STORAGE_DIR = '/var/lib/pgadmin/storage'
SERVER_MODE = True
DEFAULT_SERVER = '0.0.0.0'
DEFAULT_SERVER_PORT = 5050
`

	if err := os.WriteFile(configLocalPath, []byte(configContent), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write pgAdmin config_local.py")
	}

	// Create required directories
	os.MkdirAll("/var/lib/pgadmin/sessions", 0700)
	os.MkdirAll("/var/lib/pgadmin/storage", 0700)

	// Set ownership to pgadmin user (created by package) or www-data
	for _, owner := range []string{"pgadmin", "www-data"} {
		result, _ := system.ExecWithTimeout(5*time.Second, "id", "-u", owner)
		if result != nil && result.ExitCode == 0 {
			system.ExecWithTimeout(5*time.Second, "chown", "-R", owner+":"+owner, "/var/lib/pgadmin")
			system.ExecWithTimeout(5*time.Second, "chown", "-R", owner+":"+owner, "/var/log/pgadmin")
			break
		}
	}

	// Run setup-web.sh non-interactively to initialize
	// This sets up the initial admin user
	setupScript := "/usr/pgadmin4/bin/setup-web.sh"
	if _, err := os.Stat(setupScript); os.IsNotExist(err) {
		setupScript = "/usr/share/pgadmin4/bin/setup-web.sh"
	}

	// Create the initial admin user using pgadmin4 setup utility
	// We use environment variables for non-interactive setup
	pgSetup := findPgAdminSetupPy()
	if pgSetup != "" {
		system.ExecWithTimeout(30*time.Second, "bash", "-c",
			fmt.Sprintf("PGADMIN_SETUP_EMAIL=admin@itdlupanel.local PGADMIN_SETUP_PASSWORD=admin python3 %s setup-db", pgSetup))
	}
}

// findPgAdminSetupPy locates the pgadmin4 setup.py / pgadmin4-cli script
func findPgAdminSetupPy() string {
	paths := []string{
		"/usr/pgadmin4/web/setup.py",
		"/usr/share/pgadmin4/web/setup.py",
		"/usr/pgadmin4/bin/pgadmin4-cli",
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func (i *PgAdminInstaller) setupGunicornService(ctx context.Context) {
	// Find the pgAdmin web directory
	webDir := "/usr/pgadmin4/web"
	if _, err := os.Stat(webDir); os.IsNotExist(err) {
		webDir = "/usr/share/pgadmin4/web"
	}

	// Determine run user
	runUser := "pgadmin"
	result, _ := system.ExecWithTimeout(3*time.Second, "id", "-u", "pgadmin")
	if result == nil || result.ExitCode != 0 {
		runUser = "www-data"
	}

	// Install gunicorn if not available
	system.ExecWithTimeout(60*time.Second, "pip3", "install", "gunicorn")

	// Find gunicorn binary
	gunicornBin := "gunicorn"
	for _, p := range []string{"/usr/local/bin/gunicorn", "/usr/bin/gunicorn"} {
		if _, err := os.Stat(p); err == nil {
			gunicornBin = p
			break
		}
	}

	serviceContent := fmt.Sprintf(`[Unit]
Description=pgAdmin4 Web Interface
After=network.target

[Service]
Type=simple
User=%s
Group=%s
WorkingDirectory=%s
Environment=PGADMIN_INT_PORT=5050
ExecStart=%s --bind 127.0.0.1:5050 --workers 1 --threads 4 pgAdmin4:app
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
`, runUser, runUser, webDir, gunicornBin)

	if err := os.WriteFile("/etc/systemd/system/pgadmin4.service", []byte(serviceContent), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write pgAdmin4 systemd service")
	}
}

func (i *PgAdminInstaller) generateSSLCert() {
	sslDir := "/ITDLUPanel/server/pgadmin/ssl"
	certPath := filepath.Join(sslDir, "pgadmin.crt")
	keyPath := filepath.Join(sslDir, "pgadmin.key")

	if _, err := os.Stat(certPath); err == nil {
		if _, err := os.Stat(keyPath); err == nil {
			return // certs already exist
		}
	}

	os.MkdirAll(sslDir, 0755)
	result, err := system.ExecWithTimeout(30*time.Second,
		"openssl", "req", "-x509", "-nodes", "-days", "3650",
		"-newkey", "rsa:2048",
		"-keyout", keyPath,
		"-out", certPath,
		"-subj", "/CN=pgAdmin/O=ITDLUPanel",
	)
	if err == nil && result.ExitCode == 0 {
		logger.Info().Msg("generated self-signed SSL cert for pgAdmin")
	} else {
		logger.Warn().Msg("failed to generate pgAdmin SSL cert")
	}
}

func (i *PgAdminInstaller) Uninstall(ctx context.Context) error {
	logger.Info().Msg("uninstalling pgAdmin4")

	// Stop and disable service
	system.ExecWithTimeout(10*time.Second, "systemctl", "stop", "pgadmin4")
	system.ExecWithTimeout(10*time.Second, "systemctl", "disable", "pgadmin4")
	os.Remove("/etc/systemd/system/pgadmin4.service")
	system.ExecWithTimeout(5*time.Second, "systemctl", "daemon-reload")

	// Remove package
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "apt" {
		system.Exec(ctx, "apt", "purge", "-y", "pgadmin4-web", "pgadmin4-server")
		system.Exec(ctx, "apt", "autoremove", "-y")
	} else {
		system.Exec(ctx, "dnf", "remove", "-y", "pgadmin4-web", "pgadmin4-server")
	}

	// Remove nginx config
	removePgAdminNginx(ctx)

	// Clean up directories
	CleanupServerDir("pgadmin")
	os.RemoveAll("/var/lib/pgadmin")
	os.RemoveAll("/var/log/pgadmin")

	// Remove config
	os.Remove("/ITDLUPanel/server/config/pgadmin_config.json")

	logger.Info().Msg("pgAdmin4 uninstalled")
	return nil
}

func (i *PgAdminInstaller) IsInstalled() bool {
	// Check for pgadmin4 binary or web directory
	for _, p := range []string{
		"/usr/pgadmin4/web/pgAdmin4.py",
		"/usr/share/pgadmin4/web/pgAdmin4.py",
		"/usr/pgadmin4/bin/pgadmin4",
	} {
		if _, err := os.Stat(p); err == nil {
			return true
		}
	}
	return false
}

func (i *PgAdminInstaller) GetVersions() []string {
	return []string{"latest"}
}

// ── Nginx configuration ──

const pgAdminNginxConfPath = `/ITDLUPanel/server/nginx/conf/conf.d/pgadmin.conf`

func setupPgAdminNginx(ctx context.Context) {
	os.MkdirAll(filepath.Join(ServerBaseDir, "nginx", "conf", "conf.d"), 0755)

	// Save default config JSON
	configDir := "/ITDLUPanel/server/config"
	os.MkdirAll(configDir, 0755)
	defaultCfg := []byte(`{
  "public_access": true,
  "access_port": 5050,
  "ssl_enabled": false,
  "ssl_port": 5051,
  "auth_enabled": false,
  "auth_user": "",
  "auth_password": ""
}`)
	configPath := filepath.Join(configDir, "pgadmin_config.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		os.WriteFile(configPath, defaultCfg, 0644)
	}

	// Write nginx config (HTTP only for initial install)
	nginxConf := pgAdminNginxConfBlock(5050, false, false, "", "")
	if err := os.WriteFile(pgAdminNginxConfPath, []byte(nginxConf), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write pgAdmin nginx config")
		return
	}

	result, err := system.ExecWithTimeout(5*time.Second, "nginx", "-t")
	if err != nil || result.ExitCode != 0 {
		logger.Warn().Msg("nginx config test failed after pgAdmin setup")
		return
	}
	system.ExecWithTimeout(5*time.Second, "systemctl", "reload", "nginx")
	logger.Info().Msg("pgAdmin nginx config applied and nginx reloaded")
}

func pgAdminNginxConfBlock(port int, ssl bool, authEnabled bool, htpasswdPath string, sslDir string) string {
	var b strings.Builder
	b.WriteString("# pgAdmin4 - managed by ITDLUPanel\n")
	b.WriteString("server {\n")
	if ssl {
		fmt.Fprintf(&b, "    listen %d ssl;\n", port)
	} else {
		fmt.Fprintf(&b, "    listen %d;\n", port)
	}
	b.WriteString("    server_name _;\n\n")

	if ssl && sslDir != "" {
		fmt.Fprintf(&b, "    ssl_certificate %s/pgadmin.crt;\n", sslDir)
		fmt.Fprintf(&b, "    ssl_certificate_key %s/pgadmin.key;\n", sslDir)
		b.WriteString("    ssl_protocols TLSv1.2 TLSv1.3;\n\n")
	}

	if authEnabled && htpasswdPath != "" {
		b.WriteString("    auth_basic \"pgAdmin Login\";\n")
		fmt.Fprintf(&b, "    auth_basic_user_file %s;\n\n", htpasswdPath)
	}

	b.WriteString("    location / {\n")
	b.WriteString("        proxy_pass http://127.0.0.1:5050;\n")
	b.WriteString("        proxy_set_header Host $host;\n")
	b.WriteString("        proxy_set_header X-Real-IP $remote_addr;\n")
	b.WriteString("        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n")
	b.WriteString("        proxy_set_header X-Forwarded-Proto $scheme;\n")
	b.WriteString("        proxy_set_header X-Script-Name /;\n")
	b.WriteString("        proxy_redirect off;\n")
	b.WriteString("    }\n")
	b.WriteString("}\n")

	return b.String()
}

func removePgAdminNginx(ctx context.Context) {
	os.Remove(pgAdminNginxConfPath)
	system.ExecWithTimeout(5*time.Second, "systemctl", "reload", "nginx")
}
