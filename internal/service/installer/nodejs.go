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

type NodeJSInstaller struct{}

func NewNodeJSInstaller() *NodeJSInstaller { return &NodeJSInstaller{} }

func (i *NodeJSInstaller) Name() string { return "nodejs" }

func (i *NodeJSInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	if version == "" {
		version = "22"
	}
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing Node.js")

	progress(10)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	// Install curl if not present
	system.Exec(ctx, osInfo.PkgManager, "install", "-y", "curl", "ca-certificates", "gnupg")

	progress(20)
	// Setup NodeSource repository
	if err := setupNodeSourceRepo(ctx, osInfo, version); err != nil {
		return fmt.Errorf("failed to setup NodeSource repo: %w", err)
	}

	progress(40)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	progress(50)
	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", "nodejs"); err != nil {
		return fmt.Errorf("failed to install nodejs: %w", err)
	}

	progress(80)
	// Install common global tools
	if _, err := system.ExecWithTimeout(60*time.Second, "npm", "install", "-g", "npm@latest"); err != nil {
		logger.Warn().Err(err).Msg("failed to update npm")
	}

	installDir := "/ITDLUPanel/server/nodejs"
	os.MkdirAll(installDir, 0755)

	progress(100)
	logger.Info().Str("version", version).Msg("Node.js installed successfully")
	return nil
}

func setupNodeSourceRepo(ctx context.Context, osInfo *system.OSInfo, majorVersion string) error {
	if osInfo.PkgManager == "apt" {
		// NodeSource setup script for Debian/Ubuntu
		script := fmt.Sprintf("curl -fsSL https://deb.nodesource.com/setup_%s.x | bash -", majorVersion)
		if _, err := system.Exec(ctx, "bash", "-c", script); err != nil {
			return fmt.Errorf("NodeSource APT setup failed: %w", err)
		}
		return nil
	}

	// DNF: NodeSource RPM repo
	script := fmt.Sprintf("curl -fsSL https://rpm.nodesource.com/setup_%s.x | bash -", majorVersion)
	if _, err := system.Exec(ctx, "bash", "-c", script); err != nil {
		return fmt.Errorf("NodeSource DNF setup failed: %w", err)
	}
	return nil
}

func (i *NodeJSInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	if _, err := system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", "nodejs"); err != nil {
		return fmt.Errorf("failed to uninstall nodejs: %w", err)
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
		os.Remove("/etc/apt/sources.list.d/nodesource.list")
		os.Remove("/etc/apt/keyrings/nodesource.gpg")
	} else {
		os.Remove("/etc/yum.repos.d/nodesource-*.repo")
	}

	os.RemoveAll("/ITDLUPanel/server/nodejs")
	logger.Info().Msg("Node.js uninstalled successfully")
	return nil
}

func (i *NodeJSInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/bin/node", "/usr/local/bin/node"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *NodeJSInstaller) GetVersions() []string {
	return []string{"22", "20", "18"}
}

func DetectNodeJSVersion() string {
	res, err := system.ExecWithTimeout(5*time.Second, "node", "--version")
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(strings.TrimSpace(res.Stdout), "v")
}
