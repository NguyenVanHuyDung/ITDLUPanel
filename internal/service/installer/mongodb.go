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

type MongoDBInstaller struct{}

func NewMongoDBInstaller() *MongoDBInstaller { return &MongoDBInstaller{} }

func (i *MongoDBInstaller) Name() string { return "mongodb" }

func (i *MongoDBInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	if version == "" {
		version = "8.0"
	}
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing MongoDB")

	progress(10)
	if err := setupMongoDBRepo(ctx, osInfo, version); err != nil {
		return fmt.Errorf("failed to setup MongoDB repo: %w", err)
	}

	progress(30)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	progress(40)
	pkg := "mongodb-org"
	serviceName := "mongod"

	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", pkg); err != nil {
		return fmt.Errorf("failed to install mongodb: %w", err)
	}

	progress(70)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "daemon-reload"); err != nil {
		logger.Warn().Err(err).Msg("failed to daemon-reload")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to enable mongod service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to start mongod service")
	}

	progress(85)
	SetupServerDir("mongodb", []SymlinkDef{
		{Name: "conf", Target: "/etc"},
		{Name: "data", Target: "/var/lib/mongodb"},
		{Name: "logs", Target: "/var/log/mongodb"},
	})

	SetupLogLinks([]LogSymlink{
		{Name: "mongod.log", Target: "/var/log/mongodb/mongod.log"},
	})

	progress(100)
	logger.Info().Str("version", version).Msg("MongoDB installed successfully")
	return nil
}

func setupMongoDBRepo(ctx context.Context, osInfo *system.OSInfo, version string) error {
	if osInfo.PkgManager == "apt" {
		// Import MongoDB GPG key
		system.Exec(ctx, "apt", "install", "-y", "curl", "gnupg")
		keyCmd := fmt.Sprintf(
			"curl -fsSL https://www.mongodb.org/static/pgp/server-%s.asc | gpg --batch --yes --dearmor -o /usr/share/keyrings/mongodb-server-%s.gpg",
			version, version)
		if _, err := system.Exec(ctx, "bash", "-c", keyCmd); err != nil {
			return fmt.Errorf("failed to import MongoDB GPG key: %w", err)
		}

		// Detect codename — MongoDB may not have Ubuntu 24.04 (noble) yet.
		// Fall back to jammy (22.04) for which packages are compatible.
		codename := getDistroCodename()
		switch codename {
		case "noble":
			codename = "jammy" // MongoDB may not have noble yet; jammy packages are compatible
		case "bookworm":
			codename = "bullseye"
		case "trixie":
			codename = "bookworm"
		}

		repoLine := fmt.Sprintf(
			"deb [signed-by=/usr/share/keyrings/mongodb-server-%s.gpg] https://repo.mongodb.org/apt/ubuntu %s/mongodb-org/%s multiverse",
			version, codename, version)

		return os.WriteFile(
			fmt.Sprintf("/etc/apt/sources.list.d/mongodb-org-%s.list", version),
			[]byte(repoLine+"\n"), 0644)
	}

	// DNF: RHEL/CentOS/AlmaLinux
	repoContent := fmt.Sprintf(`[mongodb-org-%s]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/$releasever/mongodb-org/%s/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-%s.asc
`, version, version, version)
	return os.WriteFile(
		fmt.Sprintf("/etc/yum.repos.d/mongodb-org-%s.repo", version),
		[]byte(repoContent), 0644)
}

func (i *MongoDBInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	_, _ = system.Exec(ctx, "systemctl", "stop", "mongod")
	_, _ = system.Exec(ctx, "systemctl", "disable", "mongod")

	CleanupServerDir("mongodb")
	CleanupLogLinks("mongodb")

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", "mongodb-org"); err != nil {
		return fmt.Errorf("failed to uninstall mongodb: %w", err)
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
		// Remove repo files
		system.Exec(ctx, "bash", "-c", "rm -f /etc/apt/sources.list.d/mongodb-org-*.list")
		system.Exec(ctx, "bash", "-c", "rm -f /usr/share/keyrings/mongodb-server-*.gpg")
	} else {
		system.Exec(ctx, "bash", "-c", "rm -f /etc/yum.repos.d/mongodb-org-*.repo")
	}

	logger.Info().Msg("MongoDB uninstalled successfully")
	return nil
}

func (i *MongoDBInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/bin/mongod", "/usr/bin/mongos"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *MongoDBInstaller) GetVersions() []string {
	return []string{"8.0", "7.0", "6.0"}
}

func DetectMongoDBVersion() string {
	res, err := system.ExecWithTimeout(5*time.Second, "mongod", "--version")
	if err != nil {
		return ""
	}
	// Output: "db version v8.0.3" or similar
	for _, line := range strings.Split(res.Stdout, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "db version") {
			if idx := strings.Index(line, "v"); idx >= 0 {
				return line[idx+1:]
			}
		}
	}
	return ""
}
