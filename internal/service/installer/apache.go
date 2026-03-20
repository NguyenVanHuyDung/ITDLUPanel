package installer

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// ApacheInstaller handles Apache HTTP Server installation and removal.
type ApacheInstaller struct{}

// NewApacheInstaller creates a new ApacheInstaller.
func NewApacheInstaller() *ApacheInstaller {
	return &ApacheInstaller{}
}

func (i *ApacheInstaller) Name() string { return "apache" }

func (i *ApacheInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing apache")

	// Update package index
	progress(10)
	if _, err := system.Exec(ctx, osInfo.PkgManager, "update", "-y"); err != nil {
		logger.Warn().Err(err).Msg("package index update had warnings")
	}

	// Install apache – package name differs by distro
	progress(30)
	pkg := "apache2"
	serviceName := "apache2"
	if osInfo.PkgManager == "dnf" {
		pkg = "httpd"
		serviceName = "httpd"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", pkg); err != nil {
		return fmt.Errorf("failed to install apache: %w", err)
	}

	progress(60)

	// Enable common modules on Debian/Ubuntu
	if osInfo.PkgManager == "apt" {
		for _, mod := range []string{"rewrite", "ssl", "headers"} {
			if _, err := system.Exec(ctx, "a2enmod", mod); err != nil {
				logger.Warn().Err(err).Str("module", mod).Msg("failed to enable apache module")
			}
		}
	}

	progress(80)

	// Enable and start
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to enable apache service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to start apache service")
	}

	if osInfo.PkgManager == "apt" {
		SetupServerDir("apache", []SymlinkDef{
			{Name: "conf", Target: "/etc/apache2"},
			{Name: "logs", Target: "/var/log/apache2"},
		})
	} else {
		SetupServerDir("apache", []SymlinkDef{
			{Name: "conf", Target: "/etc/httpd"},
			{Name: "logs", Target: "/var/log/httpd"},
		})
	}

	progress(100)
	logger.Info().Msg("apache installed successfully")
	return nil
}

func (i *ApacheInstaller) Uninstall(ctx context.Context) error {
	CleanupServerDir("apache")

	osInfo := system.GetOSInfo()

	pkg := "apache2"
	serviceName := "apache2"
	if osInfo.PkgManager == "dnf" {
		pkg = "httpd"
		serviceName = "httpd"
	}

	_, _ = system.Exec(ctx, "systemctl", "stop", serviceName)
	_, _ = system.Exec(ctx, "systemctl", "disable", serviceName)

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", pkg); err != nil {
		return fmt.Errorf("failed to uninstall apache: %w", err)
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	}

	logger.Info().Msg("apache uninstalled successfully")
	return nil
}

func (i *ApacheInstaller) IsInstalled() bool {
	// Check both Debian and RHEL binary paths
	for _, path := range []string{"/usr/sbin/apache2", "/usr/sbin/httpd"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *ApacheInstaller) GetVersions() []string {
	return []string{"2.4"}
}
