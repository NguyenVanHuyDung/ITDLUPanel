package installer

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

type MemcachedInstaller struct{}

func NewMemcachedInstaller() *MemcachedInstaller { return &MemcachedInstaller{} }

func (i *MemcachedInstaller) Name() string { return "memcached" }

func (i *MemcachedInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	if version == "" {
		version = "stable"
	}
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing Memcached")

	progress(10)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	progress(20)
	pkg := "memcached"
	serviceName := "memcached"
	extraPkgs := []string{"libmemcached-tools"}
	if osInfo.PkgManager == "dnf" {
		extraPkgs = []string{"libmemcached"}
	}

	args := append([]string{"install", "-y", pkg}, extraPkgs...)
	if _, err := system.Exec(ctx, osInfo.PkgManager, args...); err != nil {
		return fmt.Errorf("failed to install memcached: %w", err)
	}

	progress(60)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to enable memcached service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to start memcached service")
	}

	progress(80)
	confDir := "/etc/memcached.conf"
	if osInfo.PkgManager == "dnf" {
		confDir = "/etc/sysconfig/memcached"
	}

	SetupServerDir("memcached", []SymlinkDef{
		{Name: "conf", Target: confDir},
	})

	progress(100)
	logger.Info().Msg("Memcached installed successfully")
	return nil
}

func (i *MemcachedInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	_, _ = system.Exec(ctx, "systemctl", "stop", "memcached")
	_, _ = system.Exec(ctx, "systemctl", "disable", "memcached")

	CleanupServerDir("memcached")

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", "memcached"); err != nil {
		return fmt.Errorf("failed to uninstall memcached: %w", err)
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	}

	logger.Info().Msg("Memcached uninstalled successfully")
	return nil
}

func (i *MemcachedInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/bin/memcached", "/usr/local/bin/memcached"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *MemcachedInstaller) GetVersions() []string {
	return []string{"stable"}
}

func DetectMemcachedVersion() string {
	res, err := system.ExecWithTimeout(5*time.Second, "memcached", "-h")
	if err != nil {
		return ""
	}
	// First line: "memcached 1.6.29"
	lines := strings.SplitN(strings.TrimSpace(res.Stdout), "\n", 2)
	if len(lines) > 0 {
		parts := strings.Fields(lines[0])
		if len(parts) >= 2 {
			return parts[1]
		}
	}
	return ""
}
