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
