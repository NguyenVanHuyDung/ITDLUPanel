package installer

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// NginxInstaller handles Nginx installation and removal.
type NginxInstaller struct{}

// NewNginxInstaller creates a new NginxInstaller.
func NewNginxInstaller() *NginxInstaller {
	return &NginxInstaller{}
}

func (i *NginxInstaller) Name() string { return "nginx" }

func (i *NginxInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing nginx")

	// Update package index
	progress(10)
	if _, err := system.Exec(ctx, osInfo.PkgManager, "update", "-y"); err != nil {
		// update may have a non-zero exit on warnings – log but continue
		logger.Warn().Err(err).Msg("package index update had warnings")
	}

	// Install nginx
	progress(30)
	pkg := "nginx"
	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", pkg); err != nil {
		return fmt.Errorf("failed to install nginx: %w", err)
	}

	progress(70)

	// Enable and start nginx
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", "nginx"); err != nil {
		logger.Warn().Err(err).Msg("failed to enable nginx service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", "nginx"); err != nil {
		logger.Warn().Err(err).Msg("failed to start nginx service")
	}

	progress(100)
	logger.Info().Msg("nginx installed successfully")
	return nil
}

func (i *NginxInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	// Stop service first
	_, _ = system.Exec(ctx, "systemctl", "stop", "nginx")
	_, _ = system.Exec(ctx, "systemctl", "disable", "nginx")

	pkg := "nginx"
	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", pkg); err != nil {
		return fmt.Errorf("failed to uninstall nginx: %w", err)
	}

	// Autoremove leftover dependencies
	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	}

	logger.Info().Msg("nginx uninstalled successfully")
	return nil
}

func (i *NginxInstaller) IsInstalled() bool {
	_, err := os.Stat("/usr/sbin/nginx")
	return err == nil
}

func (i *NginxInstaller) GetVersions() []string {
	return []string{"stable", "mainline"}
}
