package installer

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// PhpMyAdminInstaller handles phpMyAdmin installation and removal.
type PhpMyAdminInstaller struct{}

func NewPhpMyAdminInstaller() *PhpMyAdminInstaller {
	return &PhpMyAdminInstaller{}
}

func (i *PhpMyAdminInstaller) Name() string { return "phpmyadmin" }

func (i *PhpMyAdminInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	if version == "" {
		version = "5.2.1"
	}

	progress(5)
	logger.Info().Str("version", version).Msg("installing phpMyAdmin")

	installDir := "/ITDLUPanel/server/phpmyadmin/www"

	// Install dependencies (php, php-mbstring, php-zip, php-gd, php-json, php-curl, unzip, wget)
	osInfo := system.GetOSInfo()
	progress(10)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	progress(20)
	// Use versioned PHP packages matching the installed PHP-FPM
	phpVer := detectInstalledPHPVersion()
	var deps []string
	if osInfo.PkgManager == "apt" {
		deps = []string{"install", "-y",
			fmt.Sprintf("php%s-mbstring", phpVer),
			fmt.Sprintf("php%s-zip", phpVer),
			fmt.Sprintf("php%s-gd", phpVer),
			fmt.Sprintf("php%s-curl", phpVer),
			fmt.Sprintf("php%s-mysql", phpVer),
			fmt.Sprintf("php%s-xml", phpVer),
			"unzip", "wget",
		}
	} else {
		// RHEL: php extension packages use php{ver}-php-{ext} format with remi
		deps = []string{"install", "-y",
			fmt.Sprintf("php%s-php-mbstring", phpVer),
			fmt.Sprintf("php%s-php-zip", phpVer),
			fmt.Sprintf("php%s-php-gd", phpVer),
			fmt.Sprintf("php%s-php-curl", phpVer),
			fmt.Sprintf("php%s-php-mysqlnd", phpVer),
			fmt.Sprintf("php%s-php-xml", phpVer),
			"unzip", "wget",
		}
	}
	if _, err := system.Exec(ctx, osInfo.PkgManager, deps...); err != nil {
		logger.Warn().Err(err).Msg("some php deps may have failed, continuing")
	}

	// Ensure parent server dir exists
	os.MkdirAll("/ITDLUPanel/server/phpmyadmin", 0755)

	progress(40)
	// Download phpMyAdmin
	url := fmt.Sprintf("https://files.phpmyadmin.net/phpMyAdmin/%s/phpMyAdmin-%s-all-languages.zip", version, version)
	tmpFile := "/tmp/phpmyadmin.zip"
	if _, err := system.Exec(ctx, "wget", "-q", "-O", tmpFile, url); err != nil {
		return fmt.Errorf("failed to download phpMyAdmin: %w", err)
	}

	progress(60)
	// Clean old install
	os.RemoveAll(installDir)

	// Extract
	if _, err := system.Exec(ctx, "unzip", "-q", "-o", tmpFile, "-d", "/tmp/phpmyadmin_extract"); err != nil {
		return fmt.Errorf("failed to extract phpMyAdmin: %w", err)
	}

	// Move to install dir
	extractedDir := fmt.Sprintf("/tmp/phpmyadmin_extract/phpMyAdmin-%s-all-languages", version)
	if _, err := system.Exec(ctx, "mv", extractedDir, installDir); err != nil {
		return fmt.Errorf("failed to move phpMyAdmin to %s: %w", installDir, err)
	}

	progress(80)
	// Create config with secure session settings for HTTPS support
	// Session save path is OS-dependent
	sessionPath := "/var/lib/php/sessions"
	if osInfo.PkgManager == "dnf" {
		sessionPath = "/var/lib/php/session"
		os.MkdirAll(sessionPath, 0733)
	}

	configContent := fmt.Sprintf(`<?php
$cfg['blowfish_secret'] = '%s';
$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'cookie';
$cfg['Servers'][$i]['host'] = 'localhost';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = false;
$cfg['Servers'][$i]['SessionSavePath'] = '%s';
$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';
$cfg['TempDir'] = '/tmp';

// Secure session cookies (required for HTTPS access on port 887)
@ini_set('session.cookie_secure', '1');
@ini_set('session.cookie_httponly', '1');
@ini_set('session.cookie_samesite', 'Lax');
@ini_set('session.use_strict_mode', '1');
`, randomHex(32), sessionPath)

	if err := os.WriteFile(installDir+"/config.inc.php", []byte(configContent), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write phpMyAdmin config")
	}

	// Create tmp dir
	os.MkdirAll(installDir+"/tmp", 0777)

	// Set ownership (OS-aware web user — detect active webserver)
	webUser := "www-data"
	if osInfo.PkgManager == "dnf" {
		// On RHEL, use apache user if httpd is installed, otherwise nginx
		if _, err := os.Stat("/usr/sbin/httpd"); err == nil {
			webUser = "apache"
		} else {
			webUser = "nginx"
		}
	}
	system.ExecWithTimeout(10*time.Second, "chown", "-R", webUser+":"+webUser, installDir)

	progress(90)
	// Configure web server to serve phpMyAdmin
	setupPhpMyAdminWebServer(ctx)

	// Cleanup
	os.Remove(tmpFile)
	os.RemoveAll("/tmp/phpmyadmin_extract")

	progress(100)
	logger.Info().Msg("phpMyAdmin installed successfully")
	return nil
}

func (i *PhpMyAdminInstaller) Uninstall(ctx context.Context) error {
	logger.Info().Msg("uninstalling phpMyAdmin")
	CleanupServerDir("phpmyadmin")
	removePhpMyAdminWebServer(ctx)
	logger.Info().Msg("phpMyAdmin uninstalled")
	return nil
}

func (i *PhpMyAdminInstaller) IsInstalled() bool {
	_, err := os.Stat("/ITDLUPanel/server/phpmyadmin/www/index.php")
	return err == nil
}

func (i *PhpMyAdminInstaller) GetVersions() []string {
	return []string{"5.2.1", "5.2.0", "5.1.4"}
}

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

const phpMyAdminNginxConfPath = `/ITDLUPanel/server/nginx/conf/conf.d/phpmyadmin.conf`

func phpMyAdminNginxConf(phpVersion string) string {
	socketPath := getPhpFpmSocketPath(phpVersion)
	return fmt.Sprintf(`# phpMyAdmin - managed by ITDLUPanel
server {
    listen 888;
    server_name _;
    root /ITDLUPanel/server/phpmyadmin/www;
    index index.php index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ \.php$ {
        fastcgi_pass unix:%s;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /tmp/ {
        deny all;
    }
}
`, socketPath)
}

// getPhpFpmSocketPath returns the PHP-FPM socket path based on OS.
func getPhpFpmSocketPath(phpVersion string) string {
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "apt" {
		return fmt.Sprintf("/var/run/php/php%s-fpm.sock", phpVersion)
	}
	// RHEL with remi: socket at /var/opt/remi/php{ver}/run/php-fpm/www.sock
	remiVer := strings.ReplaceAll(phpVersion, ".", "")
	return fmt.Sprintf("/var/opt/remi/php%s/run/php-fpm/www.sock", remiVer)
}

// detectInstalledPHPVersion finds the first active PHP-FPM version on the system.
func detectInstalledPHPVersion() string {
	osInfo := system.GetOSInfo()

	// Check common PHP-FPM sockets (Debian paths)
	if osInfo.PkgManager == "apt" {
		for _, ver := range []string{"8.4", "8.3", "8.2", "8.1", "8.0", "7.4"} {
			sock := fmt.Sprintf("/var/run/php/php%s-fpm.sock", ver)
			if _, err := os.Stat(sock); err == nil {
				return ver
			}
		}
	}

	// Check systemctl for active PHP-FPM (both naming conventions)
	for _, ver := range []string{"8.4", "8.3", "8.2", "8.1", "8.0", "7.4"} {
		for _, svc := range []string{
			fmt.Sprintf("php%s-fpm", ver),
			fmt.Sprintf("php%s-php-fpm", ver),
		} {
			result, err := system.ExecWithTimeout(3*time.Second, "systemctl", "is-active", svc)
			if err == nil && result.ExitCode == 0 {
				return ver
			}
		}
	}

	// RHEL remi: check for binary existence
	if osInfo.PkgManager == "dnf" {
		for _, ver := range []string{"8.4", "8.3", "8.2", "8.1", "8.0", "7.4"} {
			remiVer := strings.ReplaceAll(ver, ".", "")
			binPath := fmt.Sprintf("/opt/remi/php%s/root/usr/sbin/php-fpm", remiVer)
			if _, err := os.Stat(binPath); err == nil {
				return ver
			}
		}
	}

	return "8.3" // default fallback
}

func setupPhpMyAdminWebServer(ctx context.Context) {
	ws := DetectWebServer()
	logger.Info().Str("webserver", ws).Msg("setting up phpMyAdmin web server config")

	switch ws {
	case "apache":
		setupPhpMyAdminApache(ctx)
	case "openlitespeed":
		setupPhpMyAdminOLS(ctx)
	default:
		setupPhpMyAdminNginx(ctx)
	}
}

func setupPhpMyAdminNginx(ctx context.Context) {
	phpVer := detectInstalledPHPVersion()
	logger.Info().Str("php_version", phpVer).Msg("configuring phpMyAdmin nginx with detected PHP version")

	os.MkdirAll(filepath.Join(ServerBaseDir, "nginx", "conf", "conf.d"), 0755)

	// Generate initial config with both HTTP (888) and SSL (887)
	nginxConf := phpMyAdminNginxConf(phpVer)

	// Also generate SSL certs and add SSL block
	sslDir := "/ITDLUPanel/server/phpmyadmin/ssl"
	certPath := filepath.Join(sslDir, "phpmyadmin.crt")
	keyPath := filepath.Join(sslDir, "phpmyadmin.key")
	os.MkdirAll(sslDir, 0755)

	_, certErr := os.Stat(certPath)
	_, keyErr := os.Stat(keyPath)
	if certErr != nil || keyErr != nil {
		result, err := system.ExecWithTimeout(30*time.Second,
			"openssl", "req", "-x509", "-nodes", "-days", "3650",
			"-newkey", "rsa:2048",
			"-keyout", keyPath,
			"-out", certPath,
			"-subj", "/CN=phpMyAdmin/O=ITDLUPanel",
		)
		if err == nil && result.ExitCode == 0 {
			logger.Info().Msg("generated self-signed SSL cert for phpMyAdmin")
		} else {
			logger.Warn().Msg("failed to generate phpMyAdmin SSL cert, skipping SSL block")
		}
	}

	// Add SSL block if certs exist
	if _, err := os.Stat(certPath); err == nil {
		socketPath := getPhpFpmSocketPath(phpVer)
		nginxConf += fmt.Sprintf(`
# SSL block
server {
    listen 887 ssl;
    server_name _;
    root /ITDLUPanel/server/phpmyadmin/www;
    index index.php index.html;

    ssl_certificate %s/phpmyadmin.crt;
    ssl_certificate_key %s/phpmyadmin.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ \.php$ {
        fastcgi_pass unix:%s;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_param HTTPS on;
    }

    location ~ /tmp/ {
        deny all;
    }
}
`, sslDir, sslDir, socketPath)
	}

	// Save default config JSON with SSL enabled
	configDir := "/ITDLUPanel/server/config"
	os.MkdirAll(configDir, 0755)
	defaultCfg := []byte(`{
  "public_access": true,
  "php_version": "` + phpVer + `",
  "access_port": 888,
  "ssl_enabled": true,
  "ssl_port": 887,
  "auth_enabled": false,
  "auth_user": "",
  "auth_password": ""
}`)
	configPath := filepath.Join(configDir, "phpmyadmin_config.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		os.WriteFile(configPath, defaultCfg, 0644)
	}

	if err := os.WriteFile(phpMyAdminNginxConfPath, []byte(nginxConf), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write phpMyAdmin nginx config")
		return
	}

	result, err := system.ExecWithTimeout(5*time.Second, "nginx", "-t")
	if err != nil || result.ExitCode != 0 {
		logger.Warn().Str("stderr", result.Stderr).Msg("nginx config test failed after phpMyAdmin setup")
		return
	}
	system.ExecWithTimeout(5*time.Second, "systemctl", "reload", "nginx")
	logger.Info().Msg("phpMyAdmin nginx config applied and nginx reloaded")
}

func removePhpMyAdminWebServer(ctx context.Context) {
	// Remove configs from all webservers (safe — removes non-existent files silently)
	os.Remove(phpMyAdminNginxConfPath)
	os.Remove(filepath.Join(ServerBaseDir, "apache", "conf", "conf.d", "phpmyadmin.conf"))
	os.Remove(filepath.Join(ServerBaseDir, "openlitespeed", "conf", "vhosts", "phpmyadmin", "vhconf.conf"))

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

func setupPhpMyAdminApache(ctx context.Context) {
	phpVer := detectInstalledPHPVersion()
	logger.Info().Str("php_version", phpVer).Msg("configuring phpMyAdmin Apache")

	confDir := filepath.Join(ServerBaseDir, "apache", "conf", "conf.d")
	os.MkdirAll(confDir, 0755)

	// Save default config JSON
	savePhpMyAdminDefaultConfig(phpVer)

	// Generate self-signed SSL certs
	ensurePhpMyAdminSSLCert()

	fpmSock := fmt.Sprintf("unix:/var/run/php/php%s-fpm.sock", phpVer)
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		remiVer := strings.ReplaceAll(phpVer, ".", "")
		fpmSock = fmt.Sprintf("unix:/var/opt/remi/php%s/run/php-fpm/www.sock", remiVer)
	}

	installDir := "/ITDLUPanel/server/phpmyadmin/www"
	sslDir := "/ITDLUPanel/server/phpmyadmin/ssl"
	conf := fmt.Sprintf(`# phpMyAdmin - managed by ITDLUPanel
Listen 888
<VirtualHost *:888>
    DocumentRoot %s
    ServerName _
    <Directory %s>
        Options FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    <FilesMatch \.php$>
        SetHandler "proxy:%s|fcgi://localhost"
    </FilesMatch>
    <Directory %s/tmp>
        Require all denied
    </Directory>
</VirtualHost>

Listen 887
<VirtualHost *:887>
    DocumentRoot %s
    ServerName _
    SSLEngine on
    SSLCertificateFile %s/phpmyadmin.crt
    SSLCertificateKeyFile %s/phpmyadmin.key
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    <Directory %s>
        Options FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    <FilesMatch \.php$>
        SetHandler "proxy:%s|fcgi://localhost"
    </FilesMatch>
    <Directory %s/tmp>
        Require all denied
    </Directory>
</VirtualHost>
`, installDir, installDir, fpmSock, installDir,
		installDir, sslDir, sslDir, installDir, fpmSock, installDir)

	confPath := filepath.Join(confDir, "phpmyadmin.conf")
	if err := os.WriteFile(confPath, []byte(conf), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write phpMyAdmin Apache config")
		return
	}

	if _, err := system.ExecWithTimeout(5*time.Second, "apachectl", "configtest"); err != nil {
		logger.Warn().Err(err).Msg("apache config test failed after phpMyAdmin setup")
		return
	}
	svc := "apache2"
	if osInfo.PkgManager == "dnf" {
		svc = "httpd"
	}
	system.ExecWithTimeout(5*time.Second, "systemctl", "reload", svc)
	logger.Info().Msg("phpMyAdmin Apache config applied")
}

func setupPhpMyAdminOLS(ctx context.Context) {
	phpVer := detectInstalledPHPVersion()
	logger.Info().Str("php_version", phpVer).Msg("configuring phpMyAdmin OLS")

	phpHandler := fmt.Sprintf("lsphp%s", strings.ReplaceAll(phpVer, ".", ""))
	installDir := "/ITDLUPanel/server/phpmyadmin/www"

	vhostDir := filepath.Join(ServerBaseDir, "openlitespeed", "conf", "vhosts", "phpmyadmin")
	os.MkdirAll(vhostDir, 0755)

	savePhpMyAdminDefaultConfig(phpVer)
	ensurePhpMyAdminSSLCert()

	conf := fmt.Sprintf(`docRoot                   %s
vhDomain                  phpmyadmin
enableGzip                1

index  {
  useServer               0
  indexFiles              index.php, index.html
}

scripthandler  {
  add                     lsapi:%s php
}

extprocessor %s {
  type                    lsapi
  address                 uds://tmp/lshttpd/%s.sock
  maxConns                10
  env                     PHP_LSAPI_CHILDREN=10
  initTimeout             60
  retryTimeout            0
  respBuffer              0
  path                    /usr/local/lsws/%s/bin/lsphp
}

context /tmp/ {
  allowBrowse             0
}
`, installDir, phpHandler, phpHandler, phpHandler, phpHandler)

	confPath := filepath.Join(vhostDir, "vhconf.conf")
	if err := os.WriteFile(confPath, []byte(conf), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write phpMyAdmin OLS config")
		return
	}

	// Register in httpd_config.conf
	registerOLSToolVhost("phpmyadmin", 888, 887)

	system.ExecWithTimeout(5*time.Second, "/usr/local/lsws/bin/lswsctrl", "restart")
	logger.Info().Msg("phpMyAdmin OLS config applied")
}

// savePhpMyAdminDefaultConfig writes the default phpmyadmin_config.json if it doesn't exist.
func savePhpMyAdminDefaultConfig(phpVer string) {
	configDir := "/ITDLUPanel/server/config"
	os.MkdirAll(configDir, 0755)
	defaultCfg := []byte(`{
  "public_access": true,
  "php_version": "` + phpVer + `",
  "access_port": 888,
  "ssl_enabled": true,
  "ssl_port": 887,
  "auth_enabled": false,
  "auth_user": "",
  "auth_password": ""
}`)
	configPath := filepath.Join(configDir, "phpmyadmin_config.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		os.WriteFile(configPath, defaultCfg, 0644)
	}
}

// ensurePhpMyAdminSSLCert generates a self-signed cert if missing.
func ensurePhpMyAdminSSLCert() {
	sslDir := "/ITDLUPanel/server/phpmyadmin/ssl"
	certPath := filepath.Join(sslDir, "phpmyadmin.crt")
	keyPath := filepath.Join(sslDir, "phpmyadmin.key")
	os.MkdirAll(sslDir, 0755)

	if _, err := os.Stat(certPath); err == nil {
		if _, err := os.Stat(keyPath); err == nil {
			return
		}
	}

	result, err := system.ExecWithTimeout(30*time.Second,
		"openssl", "req", "-x509", "-nodes", "-days", "3650",
		"-newkey", "rsa:2048",
		"-keyout", keyPath,
		"-out", certPath,
		"-subj", "/CN=phpMyAdmin/O=ITDLUPanel",
	)
	if err == nil && result.ExitCode == 0 {
		logger.Info().Msg("generated self-signed SSL cert for phpMyAdmin")
	} else {
		logger.Warn().Msg("failed to generate phpMyAdmin SSL cert")
	}
}

// registerOLSToolVhost adds a listener + virtualhost block for a tool in httpd_config.conf.
func registerOLSToolVhost(name string, httpPort, sslPort int) {
	configPath := filepath.Join(ServerBaseDir, "openlitespeed", "conf", "httpd_config.conf")
	data, err := os.ReadFile(configPath)
	if err != nil {
		logger.Warn().Err(err).Msg("failed to read httpd_config.conf")
		return
	}
	content := string(data)

	listenerName := fmt.Sprintf("tool_%s", name)
	if !strings.Contains(content, fmt.Sprintf("listener %s {", listenerName)) {
		content += fmt.Sprintf("\nlistener %s {\n  address                 *:%d\n  secure                  0\n  map                     %s %s\n}\n", listenerName, httpPort, name, name)
	}

	sslListenerName := fmt.Sprintf("tool_%s_ssl", name)
	sslDir := filepath.Join(ServerBaseDir, name, "ssl")
	if !strings.Contains(content, fmt.Sprintf("listener %s {", sslListenerName)) {
		content += fmt.Sprintf("\nlistener %s {\n  address                 *:%d\n  secure                  1\n  keyFile                 %s/%s.key\n  certFile                %s/%s.crt\n  map                     %s %s\n}\n", sslListenerName, sslPort, sslDir, name, sslDir, name, name, name)
	}

	vhostDir := filepath.Join(ServerBaseDir, "openlitespeed", "conf", "vhosts", name)
	if !strings.Contains(content, fmt.Sprintf("virtualhost %s {", name)) {
		content += fmt.Sprintf("\nvirtualhost %s {\n  vhRoot                  %s\n  configFile              %s/vhconf.conf\n  allowSymbolLink         1\n  enableScript            1\n  restrained              0\n}\n", name, vhostDir, vhostDir)
	}

	os.WriteFile(configPath, []byte(content), 0644)
}
