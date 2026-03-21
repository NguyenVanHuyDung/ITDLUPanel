package installer

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
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
	deps := []string{"install", "-y", "php", "php-mbstring", "php-zip", "php-gd", "php-json", "php-curl", "php-mysql", "unzip", "wget"}
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
	// Create config
	configContent := fmt.Sprintf(`<?php
$cfg['blowfish_secret'] = '%s';
$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'cookie';
$cfg['Servers'][$i]['host'] = 'localhost';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = false;
$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';
$cfg['TempDir'] = '/tmp';
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

const phpMyAdminNginxSnippet = `/etc/nginx/snippets/phpmyadmin.conf`
const phpMyAdminNginxConf = `# phpMyAdmin - managed by ITDLUPanel
location /phpmyadmin/ {
    alias /ITDLUPanel/server/phpmyadmin/www/;
    index index.php;

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $request_filename;
        include fastcgi_params;
    }
}
`

func setupPhpMyAdminNginx(ctx context.Context) {
	// Write snippet
	if err := os.WriteFile(phpMyAdminNginxSnippet, []byte(phpMyAdminNginxConf), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write phpMyAdmin nginx snippet")
		return
	}

	// Check if already included in default site
	defaultSite := "/etc/nginx/sites-enabled/default"
	data, err := os.ReadFile(defaultSite)
	if err != nil {
		logger.Warn().Err(err).Msg("cannot read default nginx site")
		return
	}

	if !contains(string(data), "snippets/phpmyadmin.conf") {
		// Insert include after the index line
		content := string(data)
		needle := "index index.html index.htm index.nginx-debian.html;"
		if idx := indexOf(content, needle); idx >= 0 {
			insertAt := idx + len(needle)
			content = content[:insertAt] + "\n\n\t# phpMyAdmin\n\tinclude snippets/phpmyadmin.conf;" + content[insertAt:]
			os.WriteFile(defaultSite, []byte(content), 0644)
		}
	}

	// Reload nginx
	system.ExecWithTimeout(5*time.Second, "nginx", "-t")
	system.ExecWithTimeout(5*time.Second, "systemctl", "reload", "nginx")
	logger.Info().Msg("phpMyAdmin nginx config applied")
}

func removePhpMyAdminNginx(ctx context.Context) {
	os.Remove(phpMyAdminNginxSnippet)

	// Remove include from default site
	defaultSite := "/etc/nginx/sites-enabled/default"
	data, err := os.ReadFile(defaultSite)
	if err != nil {
		return
	}
	content := string(data)
	// Remove the include lines
	lines := splitLines(content)
	var filtered []string
	for i := 0; i < len(lines); i++ {
		if contains(lines[i], "# phpMyAdmin") {
			continue
		}
		if contains(lines[i], "snippets/phpmyadmin.conf") {
			continue
		}
		filtered = append(filtered, lines[i])
	}
	os.WriteFile(defaultSite, []byte(joinLines(filtered)), 0644)
	system.ExecWithTimeout(5*time.Second, "systemctl", "reload", "nginx")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && indexOf(s, substr) >= 0
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

func joinLines(lines []string) string {
	result := ""
	for i, l := range lines {
		if i > 0 {
			result += "\n"
		}
		result += l
	}
	return result
}
