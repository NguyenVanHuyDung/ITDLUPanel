package installer

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// OLSInstaller handles OpenLiteSpeed installation and removal.
type OLSInstaller struct{}

// NewOLSInstaller creates a new OLSInstaller.
func NewOLSInstaller() *OLSInstaller {
	return &OLSInstaller{}
}

func (i *OLSInstaller) Name() string { return "openlitespeed" }

func (i *OLSInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing openlitespeed")

	// Add the official LiteSpeed repository
	progress(10)
	if osInfo.PkgManager == "apt" {
		// Import repo key and add source list
		if _, err := system.Exec(ctx, "bash", "-c",
			"wget -qO - https://rpms.litespeedtech.com/debian/lst_debian_repo.gpg | apt-key add -"); err != nil {
			// Fallback: try adding the repo directly
			logger.Warn().Err(err).Msg("failed to add litespeed repo key, trying alternative")
		}

		// Add repository source
		repoLine := "deb http://rpms.litespeedtech.com/debian/ focal main"
		if _, err := system.Exec(ctx, "bash", "-c",
			fmt.Sprintf("echo '%s' > /etc/apt/sources.list.d/lst_debian_repo.list", repoLine)); err != nil {
			logger.Warn().Err(err).Msg("failed to add litespeed repository")
		}

		progress(20)
		if _, err := system.Exec(ctx, "apt", "update", "-y"); err != nil {
			logger.Warn().Err(err).Msg("apt update had warnings")
		}
	} else {
		// RHEL-based: add LiteSpeed repo via RPM
		repoURL := "http://rpms.litespeedtech.com/centos/litespeed-repo-1.3-1.el8.noarch.rpm"
		if _, err := system.Exec(ctx, "rpm", "-Uvh", repoURL); err != nil {
			logger.Warn().Err(err).Msg("failed to add litespeed repository")
		}
		progress(20)
	}

	// Install OpenLiteSpeed
	progress(30)
	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", "openlitespeed"); err != nil {
		return fmt.Errorf("failed to install openlitespeed: %w", err)
	}

	progress(80)

	// Enable and start the service (OLS uses lsws as service name)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", "lsws"); err != nil {
		logger.Warn().Err(err).Msg("failed to enable openlitespeed service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", "lsws"); err != nil {
		logger.Warn().Err(err).Msg("failed to start openlitespeed service")
	}

	progress(100)
	logger.Info().Msg("openlitespeed installed successfully")
	return nil
}

func (i *OLSInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	_, _ = system.Exec(ctx, "systemctl", "stop", "lsws")
	_, _ = system.Exec(ctx, "systemctl", "disable", "lsws")

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", "openlitespeed"); err != nil {
		return fmt.Errorf("failed to uninstall openlitespeed: %w", err)
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	}

	logger.Info().Msg("openlitespeed uninstalled successfully")
	return nil
}

func (i *OLSInstaller) IsInstalled() bool {
	_, err := os.Stat("/usr/local/lsws/bin/lshttpd")
	return err == nil
}

func (i *OLSInstaller) GetVersions() []string {
	return []string{"stable"}
}
