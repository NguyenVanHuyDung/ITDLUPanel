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

// RedisInstaller handles Redis installation and removal.
type RedisInstaller struct{}

// NewRedisInstaller creates a new RedisInstaller.
func NewRedisInstaller() *RedisInstaller {
	return &RedisInstaller{}
}

func (i *RedisInstaller) Name() string { return "redis" }

func (i *RedisInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	if version == "" {
		version = "7.2"
	}

	progress(5)
	logger.Info().Str("version", version).Msg("installing redis")

	// Setup official Redis repo for specific version installs
	progress(10)
	if version != "distro" {
		if err := setupRedisRepo(ctx, osInfo); err != nil {
			logger.Warn().Err(err).Msg("failed to setup Redis repo, falling back to distro packages")
		}
	}

	progress(20)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	progress(30)
	pkg := "redis-server"
	serviceName := "redis-server"
	if osInfo.PkgManager == "dnf" {
		pkg = "redis"
		serviceName = "redis"
	}

	// Version-pinned install from official repo
	if version != "distro" && osInfo.PkgManager == "apt" {
		pinned := installRedisVersionAPT(ctx, version)
		if !pinned {
			logger.Warn().Str("version", version).Msg("version pinning failed, installing latest available")
			if _, err := system.Exec(ctx, "apt", "install", "-y", pkg); err != nil {
				return fmt.Errorf("failed to install redis: %w", err)
			}
		}
	} else if version != "distro" && osInfo.PkgManager == "dnf" {
		pinned := installRedisVersionDNF(ctx, version)
		if !pinned {
			logger.Warn().Str("version", version).Msg("version pinning failed, installing latest available")
			if _, err := system.Exec(ctx, "dnf", "install", "-y", pkg); err != nil {
				return fmt.Errorf("failed to install redis: %w", err)
			}
		}
	} else {
		if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", pkg); err != nil {
			return fmt.Errorf("failed to install redis: %w", err)
		}
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
		if _, err := os.Stat("/etc/redis"); os.IsNotExist(err) {
			os.MkdirAll("/etc/redis", 0755)
		}
	}
	SetupServerDir("redis", []SymlinkDef{
		{Name: "conf", Target: confDir},
		{Name: "data", Target: "/var/lib/redis"},
		{Name: "logs", Target: "/var/log/redis"},
	})

	redisLog := "/var/log/redis/redis-server.log"
	if osInfo.PkgManager == "dnf" {
		redisLog = "/var/log/redis/redis.log"
	}
	SetupLogLinks([]LogSymlink{
		{Name: "redis.log", Target: redisLog},
	})

	progress(100)
	logger.Info().Str("version", version).Msg("redis installed successfully")
	return nil
}

// setupRedisRepo adds the official packages.redis.io repository.
func setupRedisRepo(ctx context.Context, osInfo *system.OSInfo) error {
	if osInfo.PkgManager == "apt" {
		// Install prerequisites
		system.Exec(ctx, "apt", "install", "-y", "curl", "gnupg", "lsb-release")

		// Import GPG key
		if _, err := system.Exec(ctx, "bash", "-c",
			"curl -fsSL https://packages.redis.io/gpg | gpg --batch --yes --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg"); err != nil {
			return fmt.Errorf("fetch Redis GPG key: %w", err)
		}

		// Add repo
		codename := getDistroCodename()
		repoLine := fmt.Sprintf(
			"deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb %s main",
			codename)
		return os.WriteFile("/etc/apt/sources.list.d/redis.list", []byte(repoLine+"\n"), 0644)
	}

	// DNF: official Redis repo for RHEL/CentOS/AlmaLinux/Rocky
	EnsureEPEL(ctx, osInfo)
	repoContent := `[Redis]
name=Redis
baseurl=https://packages.redis.io/rpm/rhel$releasever/$basearch
enabled=1
gpgcheck=1
gpgkey=https://packages.redis.io/gpg
`
	return os.WriteFile("/etc/yum.repos.d/redis.repo", []byte(repoContent), 0644)
}

// installRedisVersionAPT installs a specific Redis major version via APT pinning.
func installRedisVersionAPT(ctx context.Context, version string) bool {
	// Try to install with version prefix match: redis-server=6:{major}.{minor}.*
	// The official Redis APT repo uses epoch 6: for packages
	prefixes := []string{
		fmt.Sprintf("6:%s.", version),  // exact major.minor match
		fmt.Sprintf("5:%s.", version),  // older epoch
		fmt.Sprintf("%s.", version),    // no epoch
	}

	for _, prefix := range prefixes {
		// List available versions matching this prefix
		res, err := system.Exec(ctx, "bash", "-c",
			fmt.Sprintf("apt-cache madison redis-server 2>/dev/null | grep '%s' | head -1 | awk '{print $3}'", prefix))
		if err != nil || strings.TrimSpace(res.Stdout) == "" {
			continue
		}
		exactVer := strings.TrimSpace(res.Stdout)
		logger.Info().Str("exact_version", exactVer).Msg("found Redis version to pin")

		if _, err := system.Exec(ctx, "apt", "install", "-y",
			fmt.Sprintf("redis-server=%s", exactVer),
			fmt.Sprintf("redis-tools=%s", exactVer)); err == nil {
			return true
		}
	}

	// Fallback: try plain install (repo should have the right version)
	if _, err := system.Exec(ctx, "apt", "install", "-y", "redis-server"); err == nil {
		return true
	}
	return false
}

// installRedisVersionDNF installs a specific Redis major version via DNF.
func installRedisVersionDNF(ctx context.Context, version string) bool {
	// Try version-specific install
	res, err := system.Exec(ctx, "bash", "-c",
		fmt.Sprintf("dnf list available redis --showduplicates 2>/dev/null | grep '%s\\.' | tail -1 | awk '{print $2}'", version))
	if err == nil && strings.TrimSpace(res.Stdout) != "" {
		exactVer := strings.TrimSpace(res.Stdout)
		logger.Info().Str("exact_version", exactVer).Msg("found Redis version to pin")

		if _, err := system.Exec(ctx, "dnf", "install", "-y",
			fmt.Sprintf("redis-%s", exactVer)); err == nil {
			return true
		}
	}

	// Fallback: plain install
	if _, err := system.Exec(ctx, "dnf", "install", "-y", "redis"); err == nil {
		return true
	}
	return false
}

// cleanupRedisRepo removes the official Redis repository.
func cleanupRedisRepo() {
	for _, f := range []string{
		"/etc/apt/sources.list.d/redis.list",
		"/usr/share/keyrings/redis-archive-keyring.gpg",
		"/etc/yum.repos.d/redis.repo",
	} {
		_ = os.Remove(f)
	}
}

func (i *RedisInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	CleanupServerDir("redis",
		SymlinkDef{Name: "conf", Target: "/etc/redis"},
		SymlinkDef{Name: "data", Target: "/var/lib/redis"},
		SymlinkDef{Name: "logs", Target: "/var/log/redis"},
	)
	CleanupLogLinks("redis")

	for _, svc := range []string{"redis-server", "redis"} {
		_, _ = system.Exec(ctx, "systemctl", "stop", svc)
		_, _ = system.Exec(ctx, "systemctl", "disable", svc)
	}

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

	// Clean up official repo if present
	cleanupRedisRepo()

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
	// Redis lifecycle: Active → Maintenance → EOL
	return []string{
		"7.4", // Latest stable (active development)
		"7.2", // LTS (maintained until 2028)
		"6.2", // Legacy (EOL 2025)
	}
}

// DetectRedisVersion returns the installed Redis version string (e.g., "7.2.6").
func DetectRedisVersion() string {
	res, err := system.ExecWithTimeout(5*time.Second, "redis-server", "--version")
	if err != nil {
		return ""
	}
	// Output: "Redis server v=7.2.6 sha=..." → extract version
	out := strings.TrimSpace(res.Stdout)
	if idx := strings.Index(out, "v="); idx >= 0 {
		ver := out[idx+2:]
		if sp := strings.IndexByte(ver, ' '); sp >= 0 {
			ver = ver[:sp]
		}
		return ver
	}
	return ""
}
