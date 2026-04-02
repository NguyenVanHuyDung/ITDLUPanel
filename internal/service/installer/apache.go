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
	apacheConfDebian = "/etc/apache2/apache2.conf"
	apacheConfRHEL   = "/etc/httpd/conf/httpd.conf"
)

// apacheRequiredModules lists modules to enable on Debian/Ubuntu.
var apacheRequiredModules = []string{
	"rewrite", "ssl", "headers", "deflate", "expires",
	"proxy", "proxy_fcgi", "http2", "setenvif",
}

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
	if osInfo.PkgManager == "apt" {
		if _, err := system.Exec(ctx, "apt", "update", "-y"); err != nil {
			logger.Warn().Err(err).Msg("apt update had warnings")
		}
	}

	// Install apache and supplementary packages
	progress(25)
	pkg := "apache2"
	serviceName := "apache2"
	if osInfo.PkgManager == "dnf" {
		pkg = "httpd"
		serviceName = "httpd"
	}

	installPkgs := []string{pkg}
	if osInfo.PkgManager == "apt" {
		installPkgs = append(installPkgs, "libapache2-mod-fcgid")
	} else {
		installPkgs = append(installPkgs, "mod_ssl", "mod_fcgid")
	}

	args := append([]string{"install", "-y"}, installPkgs...)
	if _, err := system.Exec(ctx, osInfo.PkgManager, args...); err != nil {
		return fmt.Errorf("failed to install apache: %w", err)
	}

	progress(50)

	// Enable required modules on Debian/Ubuntu
	if osInfo.PkgManager == "apt" {
		for _, mod := range apacheRequiredModules {
			if _, err := system.Exec(ctx, "a2enmod", mod); err != nil {
				logger.Warn().Err(err).Str("module", mod).Msg("failed to enable apache module")
			}
		}

		// Disable default site to avoid port conflicts
		_, _ = system.Exec(ctx, "a2dissite", "000-default")
	}

	progress(65)

	// Remove default index page on RHEL
	if osInfo.PkgManager == "dnf" {
		_ = os.Remove("/etc/httpd/conf.d/welcome.conf")
	}

	// Apply optimized config
	optimizeApacheConf(osInfo.PkgManager)

	progress(80)

	// Enable and start
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to enable apache service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err != nil {
		logger.Warn().Err(err).Msg("failed to start apache service")
	}

	// Verify installation
	progress(90)
	if res, err := system.ExecWithTimeout(5*time.Second, "apachectl", "-v"); err == nil {
		out := strings.TrimSpace(res.Stdout)
		logger.Info().Str("version_output", out).Msg("apache version verified")
	}

	if osInfo.PkgManager == "apt" {
		SetupServerDir("apache", []SymlinkDef{
			{Name: "conf", Target: "/etc/apache2"},
			{Name: "logs", Target: "/var/log/apache2"},
		})
		SetupLogLinks([]LogSymlink{
			{Name: "apache.error.log", Target: "/var/log/apache2/error.log"},
			{Name: "apache.access.log", Target: "/var/log/apache2/access.log"},
		})
	} else {
		SetupServerDir("apache", []SymlinkDef{
			{Name: "conf", Target: "/etc/httpd"},
			{Name: "logs", Target: "/var/log/httpd"},
		})
		SetupLogLinks([]LogSymlink{
			{Name: "apache.error.log", Target: "/var/log/httpd/error_log"},
			{Name: "apache.access.log", Target: "/var/log/httpd/access_log"},
		})
	}

	progress(100)
	logger.Info().Msg("apache installed successfully")
	return nil
}

func (i *ApacheInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	if osInfo.PkgManager == "apt" {
		CleanupServerDir("apache",
			SymlinkDef{Name: "conf", Target: "/etc/apache2"},
			SymlinkDef{Name: "logs", Target: "/var/log/apache2"},
		)
	} else {
		CleanupServerDir("apache",
			SymlinkDef{Name: "conf", Target: "/etc/httpd"},
			SymlinkDef{Name: "logs", Target: "/var/log/httpd"},
		)
	}
	CleanupLogLinks("apache")

	pkg := "apache2"
	serviceName := "apache2"
	extraPkgs := []string{"libapache2-mod-fcgid"}
	if osInfo.PkgManager == "dnf" {
		pkg = "httpd"
		serviceName = "httpd"
		extraPkgs = []string{"mod_ssl", "mod_fcgid"}
	}

	_, _ = system.Exec(ctx, "systemctl", "stop", serviceName)
	_, _ = system.Exec(ctx, "systemctl", "disable", serviceName)

	// Fix any interrupted dpkg state
	if osInfo.PkgManager == "apt" {
		FixDpkg(ctx)
	}

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	removePkgs := append([]string{pkg}, extraPkgs...)
	args := append([]string{removeCmd, "-y"}, removePkgs...)
	if _, err := system.Exec(ctx, osInfo.PkgManager, args...); err != nil {
		return fmt.Errorf("failed to uninstall apache: %w", err)
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	}

	logger.Info().Msg("apache uninstalled successfully")
	return nil
}

func (i *ApacheInstaller) IsInstalled() bool {
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

// DetectApacheVersion returns the installed Apache version string.
func DetectApacheVersion() string {
	res, err := system.ExecWithTimeout(5*time.Second, "apachectl", "-v")
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(res.Stdout, "\n") {
		if strings.HasPrefix(line, "Server version:") {
			return strings.TrimSpace(line)
		}
	}
	return ""
}

// optimizeApacheConf applies performance-tuned defaults to the Apache config.
func optimizeApacheConf(pkgManager string) {
	confPath := apacheConfDebian
	if pkgManager == "dnf" {
		confPath = apacheConfRHEL
	}

	data, err := os.ReadFile(confPath)
	if err != nil {
		logger.Warn().Err(err).Msg("failed to read apache config for optimization")
		return
	}

	content := string(data)

	// Skip if already optimized
	if strings.Contains(content, "# ITDLUPanel optimized") {
		logger.Info().Msg("apache config already optimized, skipping")
		return
	}

	// Append optimization settings
	optimizations := `
# ITDLUPanel optimized
ServerTokens Prod
ServerSignature Off
TraceEnable Off

# Timeouts
Timeout 300
KeepAlive On
MaxKeepAliveRequests 1000
KeepAliveTimeout 5

# Security
<Directory />
    Options None
    AllowOverride None
    Require all denied
</Directory>

# Logging
LogLevel warn
`

	content += optimizations

	if err := os.WriteFile(confPath, []byte(content), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write optimized apache config")
		return
	}

	logger.Info().Msg("wrote optimized apache config")
}
