package installer

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
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
	if _, err := system.Exec(ctx, osInfo.PkgManager, "update", "-y"); err != nil {
		logger.Warn().Err(err).Msg("package index update had warnings")
	}

	progress(20)
	// Use versioned PHP packages matching the installed PHP-FPM
	phpVer := detectInstalledPHPVersion()
	deps := []string{"install", "-y",
		fmt.Sprintf("php%s-mbstring", phpVer),
		fmt.Sprintf("php%s-zip", phpVer),
		fmt.Sprintf("php%s-gd", phpVer),
		fmt.Sprintf("php%s-curl", phpVer),
		fmt.Sprintf("php%s-mysql", phpVer),
		fmt.Sprintf("php%s-xml", phpVer),
		"unzip", "wget",
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
	configContent := fmt.Sprintf(`<?php
$cfg['blowfish_secret'] = '%s';
$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'cookie';
$cfg['Servers'][$i]['host'] = 'localhost';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = false;
$cfg['Servers'][$i]['SessionSavePath'] = '/var/lib/php/sessions';
$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';
$cfg['TempDir'] = '/tmp';

// Secure session cookies (required for HTTPS access on port 887)
@ini_set('session.cookie_secure', '1');
@ini_set('session.cookie_httponly', '1');
@ini_set('session.cookie_samesite', 'Lax');
@ini_set('session.use_strict_mode', '1');
`, randomHex(32))

	if err := os.WriteFile(installDir+"/config.inc.php", []byte(configContent), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write phpMyAdmin config")
	}

	// Create tmp dir
	os.MkdirAll(installDir+"/tmp", 0777)

	// Set ownership
	system.ExecWithTimeout(10*time.Second, "chown", "-R", "www-data:www-data", installDir)

	progress(90)
	// Configure nginx to serve phpMyAdmin at /phpmyadmin/
	setupPhpMyAdminNginx(ctx)

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
	removePhpMyAdminNginx(ctx)
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
        fastcgi_pass unix:/var/run/php/php%s-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /tmp/ {
        deny all;
    }
}
`, phpVersion)
}

// detectInstalledPHPVersion finds the first active PHP-FPM version on the system.
func detectInstalledPHPVersion() string {
	// Check common PHP-FPM sockets
	for _, ver := range []string{"8.4", "8.3", "8.2", "8.1", "8.0", "7.4"} {
		sock := fmt.Sprintf("/var/run/php/php%s-fpm.sock", ver)
		if _, err := os.Stat(sock); err == nil {
			return ver
		}
	}
	// Fallback: check systemctl
	for _, ver := range []string{"8.4", "8.3", "8.2", "8.1", "8.0", "7.4"} {
		result, err := system.ExecWithTimeout(3*time.Second, "systemctl", "is-active", fmt.Sprintf("php%s-fpm", ver))
		if err == nil && result.ExitCode == 0 {
			return ver
		}
	}
	return "8.3" // default fallback
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
        fastcgi_pass unix:/var/run/php/php%s-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_param HTTPS on;
    }

    location ~ /tmp/ {
        deny all;
    }
}
`, sslDir, sslDir, phpVer)
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

func removePhpMyAdminNginx(ctx context.Context) {
	os.Remove(phpMyAdminNginxConfPath)
	system.ExecWithTimeout(5*time.Second, "systemctl", "reload", "nginx")
}
