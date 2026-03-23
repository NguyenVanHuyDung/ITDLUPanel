package installer

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

const (
	nginxRepoFile    = "/etc/apt/sources.list.d/nginx.list"
	nginxPinFile     = "/etc/apt/preferences.d/99nginx"
	nginxKeyringFile = "/usr/share/keyrings/nginx-archive-keyring.gpg"
	nginxConfPath    = "/etc/nginx/nginx.conf"
	nginxConfBackup  = "/tmp/nginx.conf.bak"
)

// NginxInstaller handles Nginx installation and removal.
type NginxInstaller struct{}

func NewNginxInstaller() *NginxInstaller {
	return &NginxInstaller{}
}

func (i *NginxInstaller) Name() string { return "nginx" }

func (i *NginxInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	if version == "" {
		version = "stable"
	}

	osInfo := system.GetOSInfo()
	if osInfo.PkgManager != "apt" {
		return fmt.Errorf("nginx version switching only supports apt-based systems")
	}

	progress(5)
	logger.Info().Str("version", version).Msg("installing nginx")

	// Backup existing nginx config if present
	if _, err := os.Stat(nginxConfPath); err == nil {
		progress(8)
		logger.Info().Msg("backing up nginx.conf")
		if data, err := os.ReadFile(nginxConfPath); err == nil {
			_ = os.WriteFile(nginxConfBackup, data, 0644)
		}
	}

	// If nginx is already installed, purge it first
	if i.IsInstalled() {
		progress(10)
		logger.Info().Msg("purging existing nginx installation")
		_, _ = system.Exec(ctx, "systemctl", "stop", "nginx")
		_, _ = system.Exec(ctx, "systemctl", "disable", "nginx")
		_, _ = system.Exec(ctx, "apt", "purge", "-y", "nginx", "nginx-common", "nginx-core", "nginx-full")
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	}

	// Install prerequisites
	progress(15)
	if _, err := system.Exec(ctx, "apt", "install", "-y",
		"curl", "gnupg2", "ca-certificates", "lsb-release", "ubuntu-keyring"); err != nil {
		logger.Warn().Err(err).Msg("some prerequisites may not have installed")
	}

	// Setup nginx.org repository
	progress(25)
	if err := i.setupNginxRepo(ctx, version, osInfo); err != nil {
		return fmt.Errorf("failed to setup nginx repo: %w", err)
	}

	// Update package index
	progress(35)
	if _, err := system.Exec(ctx, "apt", "update", "-y"); err != nil {
		logger.Warn().Err(err).Msg("apt update had warnings")
	}

	// Install nginx from nginx.org
	progress(50)
	if _, err := system.Exec(ctx, "apt", "install", "-y", "nginx"); err != nil {
		return fmt.Errorf("failed to install nginx: %w", err)
	}

	progress(75)

	// Restore nginx.conf backup if it was saved and the new install replaced it
	if _, err := os.Stat(nginxConfBackup); err == nil {
		logger.Info().Msg("restoring nginx.conf backup")
		if data, err := os.ReadFile(nginxConfBackup); err == nil {
			_ = os.WriteFile(nginxConfPath, data, 0644)
		}
		_ = os.Remove(nginxConfBackup)
	}

	// Enable and start nginx
	progress(85)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", "nginx"); err != nil {
		logger.Warn().Err(err).Msg("failed to enable nginx service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", "nginx"); err != nil {
		logger.Warn().Err(err).Msg("failed to start nginx service")
	}

	// Verify installation
	progress(92)
	if res, err := system.ExecWithTimeout(5*time.Second, "nginx", "-v"); err == nil {
		out := strings.TrimSpace(res.Stderr)
		if out == "" {
			out = strings.TrimSpace(res.Stdout)
		}
		logger.Info().Str("version_output", out).Msg("nginx version verified")
	}

	SetupServerDir("nginx", []SymlinkDef{
		{Name: "conf", Target: "/etc/nginx"},
		{Name: "logs", Target: "/var/log/nginx"},
	})

	progress(100)
	logger.Info().Str("version", version).Msg("nginx installed successfully")
	return nil
}

func (i *NginxInstaller) Uninstall(ctx context.Context) error {
	CleanupServerDir("nginx")

	// Stop and disable
	_, _ = system.Exec(ctx, "systemctl", "stop", "nginx")
	_, _ = system.Exec(ctx, "systemctl", "disable", "nginx")

	// Purge nginx packages
	if _, err := system.Exec(ctx, "apt", "purge", "-y", "nginx", "nginx-common", "nginx-core", "nginx-full"); err != nil {
		return fmt.Errorf("failed to uninstall nginx: %w", err)
	}

	// Autoremove
	_, _ = system.Exec(ctx, "apt", "autoremove", "-y")

	// Remove nginx.org repo and keyring
	i.removeNginxRepo()

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

// setupNginxRepo configures the nginx.org apt repository for the given version.
func (i *NginxInstaller) setupNginxRepo(ctx context.Context, version string, osInfo *system.OSInfo) error {
	codename := getUbuntuCodename()
	if codename == "" {
		return fmt.Errorf("could not detect Ubuntu codename")
	}

	// Download and install nginx signing key
	logger.Info().Msg("importing nginx.org signing key")

	// Ensure keyring directory exists
	_ = os.MkdirAll(filepath.Dir(nginxKeyringFile), 0755)

	// Fetch and dearmor the signing key
	if _, err := system.Exec(ctx, "bash", "-c",
		fmt.Sprintf("curl -fsSL https://nginx.org/keys/nginx_signing.key | gpg --dearmor -o %s", nginxKeyringFile)); err != nil {
		return fmt.Errorf("failed to import nginx signing key: %w", err)
	}

	// Determine repo URL based on version
	var repoURL string
	if version == "mainline" {
		repoURL = fmt.Sprintf("deb [signed-by=%s] http://nginx.org/packages/mainline/ubuntu/ %s nginx",
			nginxKeyringFile, codename)
	} else {
		repoURL = fmt.Sprintf("deb [signed-by=%s] http://nginx.org/packages/ubuntu/ %s nginx",
			nginxKeyringFile, codename)
	}

	// Write apt source list
	logger.Info().Str("repo", repoURL).Msg("writing nginx apt source")
	if err := os.WriteFile(nginxRepoFile, []byte(repoURL+"\n"), 0644); err != nil {
		return fmt.Errorf("failed to write nginx repo file: %w", err)
	}

	// Write apt pin to prioritize nginx.org packages over distro
	pinContent := `Package: *
Pin: origin nginx.org
Pin: release o=nginx
Pin-Priority: 1001
`
	if err := os.WriteFile(nginxPinFile, []byte(pinContent), 0644); err != nil {
		return fmt.Errorf("failed to write nginx pin file: %w", err)
	}

	return nil
}

// removeNginxRepo removes the nginx.org apt repository config and keyring.
func (i *NginxInstaller) removeNginxRepo() {
	for _, f := range []string{nginxRepoFile, nginxPinFile, nginxKeyringFile} {
		if err := os.Remove(f); err != nil && !os.IsNotExist(err) {
			logger.Warn().Err(err).Str("file", f).Msg("failed to remove nginx repo file")
		}
	}
}

// getUbuntuCodename reads VERSION_CODENAME from /etc/os-release.
func getUbuntuCodename() string {
	f, err := os.Open("/etc/os-release")
	if err != nil {
		return ""
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "VERSION_CODENAME=") {
			return strings.TrimPrefix(line, "VERSION_CODENAME=")
		}
	}
	return ""
}

// DetectNginxVersionType determines if the installed nginx is stable or mainline.
// Checks the apt repo config first, falls back to version number heuristic.
func DetectNginxVersionType() string {
	// Check repo file for "mainline" keyword
	if data, err := os.ReadFile(nginxRepoFile); err == nil {
		content := string(data)
		if strings.Contains(content, "/mainline/") {
			return "mainline"
		}
		if strings.Contains(content, "nginx.org/packages") {
			return "stable"
		}
	}

	// Fallback: check version number (even minor = stable, odd = mainline)
	if res, err := system.ExecWithTimeout(5*time.Second, "nginx", "-v"); err == nil {
		out := strings.TrimSpace(res.Stderr)
		if out == "" {
			out = strings.TrimSpace(res.Stdout)
		}
		// Parse "nginx/1.26.3" or "nginx version: nginx/1.26.3"
		if idx := strings.Index(out, "/"); idx >= 0 {
			verStr := strings.TrimSpace(out[idx+1:])
			parts := strings.Split(verStr, ".")
			if len(parts) >= 2 {
				// Even minor version = stable, odd = mainline
				minor := 0
				for _, c := range parts[1] {
					if c >= '0' && c <= '9' {
						minor = minor*10 + int(c-'0')
					}
				}
				if minor%2 == 1 {
					return "mainline"
				}
				return "stable"
			}
		}
	}

	return "stable"
}
