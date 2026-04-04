package installer

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// RedisInstaller handles Redis installation and removal.
type RedisInstaller struct{}

// NewRedisInstaller creates a new RedisInstaller.
func NewRedisInstaller() *RedisInstaller {
	return &RedisInstaller{}
}

func (i *RedisInstaller) Name() string { return "redis" }

func (i *RedisInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing redis")

	progress(10)
	if _, err := system.Exec(ctx, osInfo.PkgManager, "update", "-y"); err != nil {
		logger.Warn().Err(err).Msg("package index update had warnings")
	}

	progress(30)
	pkg := "redis-server"
	serviceName := "redis-server"
	if osInfo.PkgManager == "dnf" {
		pkg = "redis"
		serviceName = "redis"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", pkg); err != nil {
		return fmt.Errorf("failed to install redis: %w", err)
	}

	progress(70)

	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to enable redis service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to start redis service")
	}

	confDir := "/etc/redis"
	if osInfo.PkgManager == "dnf" {
		// RHEL: config is at /etc/redis/ or /etc/redis.conf; data at /var/lib/redis
		if _, err := os.Stat("/etc/redis"); os.IsNotExist(err) {
			os.MkdirAll("/etc/redis", 0755)
		}
	}
	SetupServerDir("redis", []SymlinkDef{
		{Name: "conf", Target: confDir},
		{Name: "data", Target: "/var/lib/redis"},
		{Name: "logs", Target: "/var/log/redis"},
	})

	// Log path differs between Ubuntu and RHEL
	redisLog := "/var/log/redis/redis-server.log"
	if osInfo.PkgManager == "dnf" {
		redisLog = "/var/log/redis/redis.log"
	}
	SetupLogLinks([]LogSymlink{
		{Name: "redis.log", Target: redisLog},
	})

	progress(100)
	logger.Info().Msg("redis installed successfully")
	return nil
}

func (i *RedisInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	if osInfo.PkgManager == "apt" {
		CleanupServerDir("redis",
			SymlinkDef{Name: "conf", Target: "/etc/redis"},
			SymlinkDef{Name: "data", Target: "/var/lib/redis"},
			SymlinkDef{Name: "logs", Target: "/var/log/redis"},
		)
	} else {
		CleanupServerDir("redis",
			SymlinkDef{Name: "conf", Target: "/etc/redis"},
			SymlinkDef{Name: "data", Target: "/var/lib/redis"},
			SymlinkDef{Name: "logs", Target: "/var/log/redis"},
		)
	}
	CleanupLogLinks("redis")

	for _, svc := range []string{"redis-server", "redis"} {
		_, _ = system.Exec(ctx, "systemctl", "stop", svc)
		_, _ = system.Exec(ctx, "systemctl", "disable", svc)
	}

	// Fix any interrupted dpkg state
	if osInfo.PkgManager == "apt" {
		FixDpkg(ctx)
	}

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	pkg := "redis-server"
	if osInfo.PkgManager == "dnf" {
		pkg = "redis"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", pkg); err != nil {
		return fmt.Errorf("failed to uninstall redis: %w", err)
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	}

	logger.Info().Msg("redis uninstalled successfully")
	return nil
}

func (i *RedisInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/bin/redis-server", "/usr/sbin/redis-server"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *RedisInstaller) GetVersions() []string {
	return []string{"stable"}
}
