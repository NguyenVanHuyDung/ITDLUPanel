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
	// Setup web server reverse proxy
	setupPgAdminWebServer(ctx)

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
DEFAULT_SERVER_PORT = 15050
ALLOW_SPECIAL_EMAIL_DOMAINS = ['local', 'localhost']
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
	// Use the venv python to ensure all pgAdmin dependencies are available
	pgSetup := findPgAdminSetupPy()
	if pgSetup != "" {
		venvPy := "/usr/pgadmin4/venv/bin/python3"
		if _, err := os.Stat(venvPy); err != nil {
			venvPy = "python3"
		}
		system.ExecWithTimeout(60*time.Second, "bash", "-c",
			fmt.Sprintf("cd /usr/pgadmin4/web && PGADMIN_SETUP_EMAIL=admin@itdlupanel.local PGADMIN_SETUP_PASSWORD=admin %s %s setup-db", venvPy, pgSetup))
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

	// Use pgAdmin4's own venv Python to run gunicorn (avoids missing flask/modules)
	venvPython := "/usr/pgadmin4/venv/bin/python3"
	if _, err := os.Stat(venvPython); err != nil {
		venvPython = "python3"
	}

	// Ensure gunicorn is available in venv's Python path
	system.ExecWithTimeout(60*time.Second, venvPython, "-m", "pip", "install", "gunicorn")

	serviceContent := fmt.Sprintf(`[Unit]
Description=pgAdmin4 Web Interface
After=network.target

[Service]
Type=simple
User=%s
Group=%s
WorkingDirectory=%s
Environment=PGADMIN_INT_PORT=15050
ExecStart=%s -m gunicorn --bind 127.0.0.1:15050 --workers 1 --threads 4 pgAdmin4:app
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
`, runUser, runUser, webDir, venvPython)

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

	// Remove web server config
	removePgAdminWebServer(ctx)

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

func setupPgAdminWebServer(ctx context.Context) {
	ws := DetectWebServer()
	logger.Info().Str("webserver", ws).Msg("setting up pgAdmin web server config")

	switch ws {
	case "apache":
		setupPgAdminApache(ctx)
	case "openlitespeed":
		setupPgAdminOLS(ctx)
	default:
		setupPgAdminNginx(ctx)
	}
}

func setupPgAdminNginx(ctx context.Context) {
	os.MkdirAll(filepath.Join(ServerBaseDir, "nginx", "conf", "conf.d"), 0755)

	// Save default config JSON
	configDir := "/ITDLUPanel/server/config"
	os.MkdirAll(configDir, 0755)
	defaultCfg := []byte(`{
  "public_access": true,
  "access_port": 5050,
  "ssl_enabled": true,
  "ssl_port": 5051,
  "auth_enabled": false,
  "auth_user": "",
  "auth_password": ""
}`)
	configPath := filepath.Join(configDir, "pgadmin_config.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		os.WriteFile(configPath, defaultCfg, 0644)
	}

	// Generate self-signed SSL certs for initial install
	sslDir := filepath.Join(ServerBaseDir, "pgadmin", "ssl")
	os.MkdirAll(sslDir, 0755)
	certPath := filepath.Join(sslDir, "pgadmin.crt")
	keyPath := filepath.Join(sslDir, "pgadmin.key")
	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		system.ExecWithTimeout(10*time.Second, "openssl", "req", "-x509", "-nodes",
			"-days", "3650", "-newkey", "rsa:2048",
			"-keyout", keyPath, "-out", certPath,
			"-subj", "/CN=pgadmin")
	}

	// Write nginx config with both HTTP and SSL blocks
	var conf strings.Builder
	conf.WriteString(pgAdminNginxConfBlock(5050, false, false, "", ""))
	conf.WriteString("\n")
	conf.WriteString(pgAdminNginxConfBlock(5051, true, false, "", sslDir))

	if err := os.WriteFile(pgAdminNginxConfPath, []byte(conf.String()), 0644); err != nil {
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

	// pgAdmin uses large session cookies — increase header buffer sizes
	b.WriteString("    large_client_header_buffers 4 32k;\n")
	b.WriteString("    proxy_buffer_size 16k;\n")
	b.WriteString("    proxy_buffers 4 16k;\n\n")

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
	b.WriteString("        proxy_pass http://127.0.0.1:15050;\n")
	b.WriteString("        proxy_set_header Host $host:$server_port;\n")
	b.WriteString("        proxy_set_header X-Real-IP $remote_addr;\n")
	b.WriteString("        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n")
	b.WriteString("        proxy_set_header X-Forwarded-Proto $scheme;\n")
	b.WriteString("        proxy_redirect off;\n")
	b.WriteString("    }\n")
	b.WriteString("}\n")

	return b.String()
}

func removePgAdminWebServer(ctx context.Context) {
	os.Remove(pgAdminNginxConfPath)
	os.Remove(filepath.Join(ServerBaseDir, "apache", "conf", "conf.d", "pgadmin.conf"))
	os.Remove(filepath.Join(ServerBaseDir, "openlitespeed", "conf", "vhosts", "pgadmin", "vhconf.conf"))

	ws := DetectWebServer()
	switch ws {
	case "apache":
		osInfo := system.GetOSInfo()
		svc := "apache2"
		if osInfo.PkgManager == "dnf" {
			svc = "httpd"
		}
		system.ExecWithTimeout(5*time.Second, "systemctl", "reload", svc)
	case "openlitespeed":
		system.ExecWithTimeout(5*time.Second, "/usr/local/lsws/bin/lswsctrl", "restart")
	default:
		system.ExecWithTimeout(5*time.Second, "systemctl", "reload", "nginx")
	}
}

func setupPgAdminApache(ctx context.Context) {
	confDir := filepath.Join(ServerBaseDir, "apache", "conf", "conf.d")
	os.MkdirAll(confDir, 0755)

	// Save default config JSON with SSL enabled
	configDir := "/ITDLUPanel/server/config"
	os.MkdirAll(configDir, 0755)
	defaultCfg := []byte(`{
  "public_access": true,
  "access_port": 5050,
  "ssl_enabled": true,
  "ssl_port": 5051,
  "auth_enabled": false,
  "auth_user": "",
  "auth_password": ""
}`)
	configPath := filepath.Join(configDir, "pgadmin_config.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		os.WriteFile(configPath, defaultCfg, 0644)
	}

	sslDir := filepath.Join(ServerBaseDir, "pgadmin", "ssl")
	os.MkdirAll(sslDir, 0755)
	certPath := filepath.Join(sslDir, "pgadmin.crt")
	keyPath := filepath.Join(sslDir, "pgadmin.key")
	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		system.ExecWithTimeout(10*time.Second, "openssl", "req", "-x509", "-nodes",
			"-days", "3650", "-newkey", "rsa:2048",
			"-keyout", keyPath, "-out", certPath,
			"-subj", "/CN=pgadmin")
	}

	conf := fmt.Sprintf(`# pgAdmin4 - managed by ITDLUPanel
Listen 5050
<VirtualHost *:5050>
    ServerName _
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:15050/
    ProxyPassReverse / http://127.0.0.1:15050/
    RequestHeader set X-Forwarded-Proto expr=%%{REQUEST_SCHEME}
    RequestHeader set X-Real-IP expr=%%{REMOTE_ADDR}
</VirtualHost>

Listen 5051
<VirtualHost *:5051>
    ServerName _
    SSLEngine on
    SSLCertificateFile %s/pgadmin.crt
    SSLCertificateKeyFile %s/pgadmin.key
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:15050/
    ProxyPassReverse / http://127.0.0.1:15050/
    RequestHeader set X-Forwarded-Proto https
    RequestHeader set X-Real-IP expr=%%{REMOTE_ADDR}
</VirtualHost>
`, sslDir, sslDir)

	confPath := filepath.Join(confDir, "pgadmin.conf")
	if err := os.WriteFile(confPath, []byte(conf), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write pgAdmin Apache config")
		return
	}

	if _, err := system.ExecWithTimeout(5*time.Second, "apachectl", "configtest"); err != nil {
		logger.Warn().Err(err).Msg("apache config test failed after pgAdmin setup")
		return
	}
	osInfo := system.GetOSInfo()
	svc := "apache2"
	if osInfo.PkgManager == "dnf" {
		svc = "httpd"
	}
	system.ExecWithTimeout(5*time.Second, "systemctl", "reload", svc)
	logger.Info().Msg("pgAdmin Apache config applied")
}

func setupPgAdminOLS(ctx context.Context) {
	vhostDir := filepath.Join(ServerBaseDir, "openlitespeed", "conf", "vhosts", "pgadmin")
	os.MkdirAll(vhostDir, 0755)

	// Save default config JSON
	configDir := "/ITDLUPanel/server/config"
	os.MkdirAll(configDir, 0755)
	defaultCfg := []byte(`{
  "public_access": true,
  "access_port": 5050,
  "ssl_enabled": true,
  "ssl_port": 5051,
  "auth_enabled": false,
  "auth_user": "",
  "auth_password": ""
}`)
	configPath := filepath.Join(configDir, "pgadmin_config.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		os.WriteFile(configPath, defaultCfg, 0644)
	}

	sslDir := filepath.Join(ServerBaseDir, "pgadmin", "ssl")
	os.MkdirAll(sslDir, 0755)
	certPath := filepath.Join(sslDir, "pgadmin.crt")
	keyPath := filepath.Join(sslDir, "pgadmin.key")
	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		system.ExecWithTimeout(10*time.Second, "openssl", "req", "-x509", "-nodes",
			"-days", "3650", "-newkey", "rsa:2048",
			"-keyout", keyPath, "-out", certPath,
			"-subj", "/CN=pgadmin")
	}

	conf := `docRoot                   /usr/pgadmin4/web
vhDomain                  pgadmin
enableGzip                1

extprocessor pgadmin_backend {
  type                    proxy
  address                 127.0.0.1:15050
  maxConns                25
  initTimeout             60
  retryTimeout            0
  respBuffer              0
}

context / {
  type                    proxy
  handler                 pgadmin_backend
  addDefaultCharset       off
}
`

	confPath := filepath.Join(vhostDir, "vhconf.conf")
	if err := os.WriteFile(confPath, []byte(conf), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write pgAdmin OLS config")
		return
	}

	registerOLSToolVhost("pgadmin", 5050, 5051)

	system.ExecWithTimeout(5*time.Second, "/usr/local/lsws/bin/lswsctrl", "restart")
	logger.Info().Msg("pgAdmin OLS config applied")
}
