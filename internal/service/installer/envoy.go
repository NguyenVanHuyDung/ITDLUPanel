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

const (
	envoyRepoFile     = "/etc/apt/sources.list.d/envoy.list"
	envoyKeyringFile = "/etc/apt/keyrings/envoy-archive-keyring.gpg"
	envoyDNFRepoFile  = "/etc/yum.repos.d/envoy.repo"
	envoyConfPath     = "/etc/envoy/envoy.yaml"
	envoyDefaultConf  = `/etc/envoy/envoy.yaml.default`
)

// EnvoyInstaller handles Envoy Proxy installation and removal.
type EnvoyInstaller struct{}

// NewEnvoyInstaller creates a new EnvoyInstaller.
func NewEnvoyInstaller() *EnvoyInstaller {
	return &EnvoyInstaller{}
}

func (i *EnvoyInstaller) Name() string { return "envoy" }

func (i *EnvoyInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	if version == "" {
		version = "stable"
	}

	progress(5)
	logger.Info().Str("version", version).Msg("installing envoy proxy")

	// Remove any existing unofficial envoy packages first
	progress(8)
	for _, pkg := range []string{"envoy", "envoy-dev"} {
		_, _ = system.Exec(ctx, osInfo.PkgManager, "remove", "-y", pkg)
	}

	progress(15)
	if err := i.setupEnvoyRepo(ctx, osInfo, version); err != nil {
		logger.Warn().Err(err).Msg("failed to setup envoy repo, trying direct install")
	}

	progress(25)
	if err := RefreshPackageIndex(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("package index refresh had warnings")
	}

	progress(35)
	// Install envoy package
	if err := i.installEnvoyPackage(ctx, osInfo, version); err != nil {
		return fmt.Errorf("failed to install envoy: %w", err)
	}

	progress(65)
	// Ensure config directory and default config
	if err := i.ensureConfig(ctx, osInfo); err != nil {
		logger.Warn().Err(err).Msg("failed to ensure envoy config")
	}

	progress(75)
	serviceName := "envoy"
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to enable envoy service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to start envoy service")
	}

	progress(85)
	// Setup panel directory structure
	SetupServerDir("envoy", []SymlinkDef{
		{Name: "conf", Target: "/etc/envoy"},
		{Name: "logs", Target: "/var/log/envoy"},
	})

	SetupLogLinks([]LogSymlink{
		{Name: "envoy.log", Target: "/var/log/envoy/envoy.log"},
	})

	progress(100)
	logger.Info().Str("version", version).Msg("envoy proxy installed successfully")
	return nil
}

// setupEnvoyRepo adds the official Envoy repository.
func (i *EnvoyInstaller) setupEnvoyRepo(ctx context.Context, osInfo *system.OSInfo, version string) error {
	if osInfo.PkgManager == "apt" {
		// Install prerequisites
		if _, err := system.Exec(ctx, "apt", "install", "-y", "apt-transport-https", "curl", "gnupg", "lsb-release"); err != nil {
			logger.Warn().Err(err).Msg("failed to install prerequisites for envoy repo")
		}

		os.MkdirAll("/etc/apt/keyrings", 0755)

		// Import GPG key from official source
		if _, err := system.Exec(ctx, "bash", "-c",
			"curl -fsSL https://download.dl.getenvoy.io/gpg/DEB-GPG-KEY-ITDLU-ENVoy.asc | gpg --batch --yes --dearmor -o "+envoyKeyringFile); err != nil {
			// Try alternative key source
			if _, err2 := system.Exec(ctx, "bash", "-c",
				"curl -fsSL https://www.envoyproxy.io/docs/envoy/v1.32.0/gpgkeys | gpg --batch --yes --dearmor -o "+envoyKeyringFile); err2 != nil {
				return fmt.Errorf("failed to fetch Envoy GPG key: %w", err2)
			}
		}

		// Determine codename for apt repo
		codename := "jammy" // default to Ubuntu 22.04 LTS
		if data, err := os.ReadFile("/etc/os-release"); err == nil {
			for _, line := range strings.Split(string(data), "\n") {
				if strings.HasPrefix(line, "VERSION_CODENAME=") {
					codename = strings.TrimPrefix(line, "VERSION_CODENAME=")
					break
				}
			}
		}

		// For stable version, use the main envoy repo
		repoURL := fmt.Sprintf(
			"deb [arch=%s signed-by=%s] https://download.dl.getenvoy.io/apt/%s %s main",
			osInfo.Arch, envoyKeyringFile, "debian", codename,
		)
		if err := os.WriteFile(envoyRepoFile, []byte(repoURL+"\n"), 0644); err != nil {
			return fmt.Errorf("failed to write envoy repo file: %w", err)
		}
		return nil
	}

	// DNF: RHEL/CentOS/AlmaLinux/Rocky
	if osInfo.PkgManager == "dnf" {
		EnsureEPEL(ctx, osInfo)

		// Try version-specific repo path
		versionSuffix := ""
		if version != "stable" && version != "" {
			versionSuffix = "/" + version
		}

		repoContent := fmt.Sprintf(`[envoy]
name=Envoy Proxy
baseurl=https://rpm.dl.getenvoy.io/enterprise-linux%s/$basearch
enabled=1
gpgcheck=1
gpgkey=https://download.dl.getenvoy.io/gpg/DEB-GPG-KEY-ITDLU-ENVoy.asc
`, versionSuffix)

		return os.WriteFile(envoyDNFRepoFile, []byte(repoContent), 0644)
	}

	return fmt.Errorf("unsupported package manager: %s", osInfo.PkgManager)
}

// installEnvoyPackage installs the envoy package.
func (i *EnvoyInstaller) installEnvoyPackage(ctx context.Context, osInfo *system.OSInfo, version string) error {
	if osInfo.PkgManager == "apt" {
		// Try with version pinning for specific versions
		if version != "stable" && version != "" {
			// Check if this version exists in the repo
			res, err := system.Exec(ctx, "bash", "-c",
				fmt.Sprintf("apt-cache madison envoy 2>/dev/null | grep '%s' | head -1 | awk '{print $3}'", version))
			if err == nil && strings.TrimSpace(res.Stdout) != "" {
				exactVer := strings.TrimSpace(res.Stdout)
				logger.Info().Str("exact_version", exactVer).Msg("found envoy version to pin")
				if _, err := system.Exec(ctx, "apt", "install", "-y", fmt.Sprintf("envoy=%s", exactVer)); err == nil {
					return nil
				}
			}
		}

		// Fallback: install latest available
		if _, err := system.Exec(ctx, "apt", "install", "-y", "envoy"); err != nil {
			return err
		}
		return nil
	}

	// DNF
	if version != "stable" && version != "" {
		res, err := system.Exec(ctx, "bash", "-c",
			fmt.Sprintf("dnf list available envoy --showduplicates 2>/dev/null | grep '%s\\.' | tail -1 | awk '{print $2}'", version))
		if err == nil && strings.TrimSpace(res.Stdout) != "" {
			exactVer := strings.TrimSpace(res.Stdout)
			logger.Info().Str("exact_version", exactVer).Msg("found envoy version to pin")
			if _, err := system.Exec(ctx, "dnf", "install", "-y", fmt.Sprintf("envoy-%s", exactVer)); err == nil {
				return nil
			}
		}
	}

	if _, err := system.Exec(ctx, "dnf", "install", "-y", "envoy"); err != nil {
		return err
	}
	return nil
}

// ensureConfig creates a default Envoy config if none exists.
func (i *EnvoyInstaller) ensureConfig(ctx context.Context, osInfo *system.OSInfo) error {
	os.MkdirAll("/etc/envoy", 0755)
	os.MkdirAll("/var/log/envoy", 0755)

	if _, err := os.Stat(envoyConfPath); err == nil {
		// Config exists, backup original
		if _, err := os.Stat(envoyDefaultConf); os.IsNotExist(err) {
			data, _ := os.ReadFile(envoyConfPath)
			os.WriteFile(envoyDefaultConf, data, 0644)
		}
		return nil
	}

	// Create a basic Envoy config
	defaultConfig := `admin:
  access_log:
    path: /var/log/envoy/envoy-admin.log
  address:
    socket_address:
      address: 127.0.0.1
      port_value: 9901

static_resources:
  listeners:
    - name: http_listener
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 8080
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                codec_type: AUTO
                stat_prefix: ingress_http
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match:
                            prefix: "/"
                          redirect:
                            scheme_redirect: https
                            port_redirect: 443
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
    - name: https_listener
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 8443
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                codec_type: AUTO
                stat_prefix: ingress_https
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match:
                            prefix: "/"
                          route:
                            cluster: original_destination
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

  clusters:
    - name: original_destination
      type: ORIGINAL_DST
      lb_policy: CLUSTER_PROVIDED
      connect_timeout: 5s
`
	return os.WriteFile(envoyConfPath, []byte(defaultConfig), 0644)
}

func (i *EnvoyInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	// Stop and disable envoy service
	_, _ = system.Exec(ctx, "systemctl", "stop", "envoy")
	_, _ = system.Exec(ctx, "systemctl", "disable", "envoy")

	// Cleanup panel directories
	CleanupServerDir("envoy",
		SymlinkDef{Name: "conf", Target: "/etc/envoy"},
		SymlinkDef{Name: "logs", Target: "/var/log/envoy"},
	)
	CleanupLogLinks("envoy")

	// Remove packages
	if osInfo.PkgManager == "apt" {
		FixDpkg(ctx)
		if _, err := system.Exec(ctx, "apt", "purge", "-y", "envoy"); err != nil {
			logger.Warn().Err(err).Msg("failed to purge envoy package")
		}
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
		// Cleanup repo
		_ = os.Remove(envoyRepoFile)
		_ = os.Remove(envoyKeyringFile)
	} else {
		if _, err := system.Exec(ctx, "dnf", "remove", "-y", "envoy"); err != nil {
			logger.Warn().Err(err).Msg("failed to remove envoy package")
		}
		_ = os.Remove(envoyDNFRepoFile)
	}

	logger.Info().Msg("envoy proxy uninstalled successfully")
	return nil
}

func (i *EnvoyInstaller) IsInstalled() bool {
	for _, path := range []string{"/usr/bin/envoy", "/usr/sbin/envoy", "/usr/local/bin/envoy"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func (i *EnvoyInstaller) GetVersions() []string {
	return []string{
		"stable",  // Recommended - latest stable release
		"1.32",    // Latest stable series
		"1.31",    // Previous LTS series
		"1.30",    // Legacy
	}
}

// DetectEnvoyVersion returns the installed Envoy version string (e.g., "1.32.0").
func DetectEnvoyVersion() string {
	res, err := system.ExecWithTimeout(5*time.Second, "envoy", "--version")
	if err != nil {
		return ""
	}
	// Output: "envoy  version: 1/32/2024/Build #1/32/0-..." or similar
	out := strings.TrimSpace(res.Stdout)
	if idx := strings.Index(out, "version:"); idx >= 0 {
		ver := strings.TrimSpace(out[idx+8:])
		// Extract just the version number
		parts := strings.Fields(ver)
		if len(parts) > 0 {
			// The first field is the version like "1/32/0" or "1.32.0"
			ver = parts[0]
			ver = strings.ReplaceAll(ver, "/", ".")
			return ver
		}
	}
	// Try stderr too
	out = strings.TrimSpace(res.Stderr)
	if idx := strings.Index(out, "version:"); idx >= 0 {
		ver := strings.TrimSpace(out[idx+8:])
		parts := strings.Fields(ver)
		if len(parts) > 0 {
			ver = parts[0]
			ver = strings.ReplaceAll(ver, "/", ".")
			return ver
		}
	}
	return ""
}
