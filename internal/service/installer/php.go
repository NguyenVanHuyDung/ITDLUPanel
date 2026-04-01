package installer

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// PHPExtensionInfo describes an available PHP extension.
type PHPExtensionInfo struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Description string `json:"description"`
	Installed   bool   `json:"installed"`
}

var phpExtensionsCatalog = []struct {
	Name string
	Type string
	Desc string
}{
	// Core
	{"cli", "core", "Command-line interface"},
	{"fpm", "core", "FastCGI Process Manager"},
	{"common", "core", "Common files for PHP packages"},
	{"dev", "core", "Development files (headers, phpize)"},

	// Database
	{"mysql", "database", "MySQL native driver"},
	{"pgsql", "database", "PostgreSQL driver"},
	{"sqlite3", "database", "SQLite3 driver"},
	{"mongodb", "database", "MongoDB driver"},
	{"redis", "database", "Redis extension"},
	{"memcached", "database", "Memcached extension"},

	// Web & Networking
	{"curl", "web", "cURL HTTP client"},
	{"soap", "web", "SOAP protocol support"},
	{"xmlrpc", "web", "XML-RPC support"},
	{"ldap", "web", "LDAP protocol support"},
	{"imap", "web", "IMAP email protocol"},

	// Text & XML
	{"xml", "text", "XML parser"},
	{"mbstring", "text", "Multibyte string support"},
	{"intl", "text", "Internationalization (ICU)"},
	{"gettext", "text", "GNU gettext support"},
	{"dom", "text", "DOM XML manipulation"},
	{"xsl", "text", "XSL transformations"},
	{"json", "text", "JSON support"},

	// Math & Encryption
	{"bcmath", "math", "Arbitrary precision math"},
	{"gmp", "math", "GNU Multiple Precision"},
	{"openssl", "security", "OpenSSL encryption"},
	{"sodium", "security", "Libsodium encryption"},

	// Image
	{"gd", "image", "GD image library"},
	{"imagick", "image", "ImageMagick integration"},
	{"exif", "image", "EXIF metadata reading"},

	// Compression
	{"zip", "compression", "ZIP archive support"},
	{"bz2", "compression", "Bzip2 compression"},
	{"zlib", "compression", "Zlib compression"},

	// Performance
	{"opcache", "performance", "OPcache bytecode caching"},
	{"apcu", "performance", "APCu user cache"},

	// Other
	{"fileinfo", "other", "File type detection"},
	{"tokenizer", "other", "PHP tokenizer"},
	{"ctype", "other", "Character type checking"},
	{"phar", "other", "PHP Archive support"},
	{"pcntl", "other", "Process control"},
	{"posix", "other", "POSIX functions"},
	{"shmop", "other", "Shared memory operations"},
	{"sysvsem", "other", "System V semaphore"},
	{"sysvshm", "other", "System V shared memory"},
	{"ftp", "other", "FTP client"},
	{"sockets", "other", "Socket programming"},
	{"calendar", "other", "Calendar functions"},
	{"readline", "other", "GNU readline support"},
	{"tidy", "other", "HTML Tidy support"},
	{"snmp", "other", "SNMP protocol support"},
	{"pspell", "other", "Spell checking"},
}

// GetPHPExtensions returns the list of available extensions for a PHP version with install status.
func (i *PHPInstaller) GetPHPExtensions(version string) ([]PHPExtensionInfo, error) {
	result := make([]PHPExtensionInfo, 0, len(phpExtensionsCatalog))
	for _, ext := range phpExtensionsCatalog {
		result = append(result, PHPExtensionInfo{
			Name:        ext.Name,
			Type:        ext.Type,
			Description: ext.Desc,
			Installed:   isPhpExtensionInstalled(version, ext.Name),
		})
	}
	return result, nil
}

func isPhpExtensionInstalled(version, ext string) bool {
	pkg := fmt.Sprintf("php%s-%s", version, ext)
	res, err := system.ExecWithTimeout(5*time.Second, "dpkg", "-s", pkg)
	if err != nil || res.ExitCode != 0 {
		return false
	}
	return strings.Contains(res.Stdout, "Status: install ok installed")
}

// Common PHP extensions installed alongside the FPM package.
var defaultPHPExtensions = []string{
	"cli", "fpm", "mysql", "curl", "gd", "mbstring",
	"xml", "zip", "bcmath", "intl", "soap", "opcache",
}

// PHPInstaller handles multi-version PHP installation and removal.
type PHPInstaller struct{}

// NewPHPInstaller creates a new PHPInstaller.
func NewPHPInstaller() *PHPInstaller {
	return &PHPInstaller{}
}

func (i *PHPInstaller) Name() string { return "php" }

func (i *PHPInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	if version == "" {
		version = "8.2"
	}

	progress(5)
	logger.Info().Str("version", version).Msg("installing php")

	// On Debian/Ubuntu add the ondrej/php PPA for multi-version support
	if osInfo.PkgManager == "apt" {
		progress(10)
		// Install software-properties-common for add-apt-repository
		if _, err := system.Exec(ctx, "apt", "install", "-y", "software-properties-common"); err != nil {
			logger.Warn().Err(err).Msg("failed to install software-properties-common")
		}

		progress(15)
		// Add ondrej/php PPA (idempotent)
		if _, err := system.Exec(ctx, "add-apt-repository", "-y", "ppa:ondrej/php"); err != nil {
			logger.Warn().Err(err).Msg("failed to add ondrej/php PPA")
		}

		progress(25)
		if _, err := system.Exec(ctx, "apt", "update", "-y"); err != nil {
			logger.Warn().Err(err).Msg("apt update had warnings")
		}
	} else {
		// RHEL-based: enable remi repo
		progress(15)
		if _, err := system.Exec(ctx, "dnf", "install", "-y", "epel-release"); err != nil {
			logger.Warn().Err(err).Msg("failed to install epel-release")
		}
		progress(25)
	}

	// Build package list: php{version}-{ext}
	progress(30)
	packages := make([]string, 0, len(defaultPHPExtensions))
	for _, ext := range defaultPHPExtensions {
		if osInfo.PkgManager == "apt" {
			packages = append(packages, fmt.Sprintf("php%s-%s", version, ext))
		} else {
			packages = append(packages, fmt.Sprintf("php%s-php-%s", version, ext))
		}
	}

	progress(40)
	args := append([]string{"install", "-y"}, packages...)
	if _, err := system.Exec(ctx, osInfo.PkgManager, args...); err != nil {
		return fmt.Errorf("failed to install php %s packages: %w", version, err)
	}

	progress(80)

	// Enable and start php-fpm
	serviceName := fmt.Sprintf("php%s-fpm", version)
	if osInfo.PkgManager == "dnf" {
		serviceName = fmt.Sprintf("php%s-php-fpm", version)
	}

	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Str("service", serviceName).Msg("failed to enable php-fpm")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err != nil {
		logger.Warn().Err(err).Str("service", serviceName).Msg("failed to start php-fpm")
	}

	// Optimize FPM pool and PHP settings
	optimizePHPFPM(version)

	SetupServerDir("php", []SymlinkDef{
		{Name: "conf", Target: "/etc/php"},
		{Name: "logs", Target: "/var/log/php"},
	})

	progress(100)
	logger.Info().Str("version", version).Msg("php installed successfully")
	return nil
}

func (i *PHPInstaller) Uninstall(ctx context.Context) error {
	CleanupServerDir("php")

	osInfo := system.GetOSInfo()

	// Stop all known php-fpm versions
	for _, ver := range i.GetVersions() {
		svc := fmt.Sprintf("php%s-fpm", ver)
		_, _ = system.Exec(ctx, "systemctl", "stop", svc)
		_, _ = system.Exec(ctx, "systemctl", "disable", svc)
	}

	if osInfo.PkgManager == "apt" {
		// Fix any interrupted dpkg state
		FixDpkg(ctx)

		// List all installed php packages and purge them
		pkgs := listInstalledPHPPackages(ctx)
		if len(pkgs) > 0 {
			args := append([]string{"purge", "-y"}, pkgs...)
			if _, err := system.Exec(ctx, "apt", args...); err != nil {
				return fmt.Errorf("failed to uninstall php: %w", err)
			}
		}
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	} else {
		// RHEL: build explicit package list per version
		var pkgs []string
		for _, ver := range i.GetVersions() {
			remiVer := strings.ReplaceAll(ver, ".", "")
			result, err := system.Exec(ctx, "rpm", "-qa", "--queryformat", "%{NAME}\n")
			if err == nil {
				for _, line := range strings.Split(result.Stdout, "\n") {
					if strings.HasPrefix(line, "php"+remiVer) {
						pkgs = append(pkgs, strings.TrimSpace(line))
					}
				}
			}
		}
		if len(pkgs) > 0 {
			args := append([]string{"remove", "-y"}, pkgs...)
			if _, err := system.Exec(ctx, "dnf", args...); err != nil {
				return fmt.Errorf("failed to uninstall php: %w", err)
			}
		}
	}

	logger.Info().Msg("php uninstalled successfully")
	return nil
}

// listInstalledPHPPackages returns all installed dpkg packages matching php*.
func listInstalledPHPPackages(ctx context.Context) []string {
	result, err := system.Exec(ctx, "dpkg-query", "-W", "-f", "${Package}\n")
	if err != nil {
		return nil
	}
	var pkgs []string
	for _, line := range strings.Split(result.Stdout, "\n") {
		pkg := strings.TrimSpace(line)
		if pkg != "" && strings.HasPrefix(pkg, "php") {
			pkgs = append(pkgs, pkg)
		}
	}
	return pkgs
}

func (i *PHPInstaller) IsInstalled() bool {
	// Check for any php-fpm binary
	for _, ver := range i.GetVersions() {
		path := fmt.Sprintf("/usr/sbin/php-fpm%s", ver)
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	// Also check the generic binary
	if _, err := os.Stat("/usr/bin/php"); err == nil {
		return true
	}
	return false
}

func (i *PHPInstaller) GetVersions() []string {
	return []string{"7.4", "8.1", "8.2", "8.3"}
}

// InstallExtensions installs additional PHP extensions for a specific version.
func (i *PHPInstaller) InstallExtensions(ctx context.Context, version string, exts []string) error {
	osInfo := system.GetOSInfo()
	packages := make([]string, 0, len(exts))
	for _, ext := range exts {
		if osInfo.PkgManager == "apt" {
			packages = append(packages, fmt.Sprintf("php%s-%s", version, ext))
		} else {
			packages = append(packages, fmt.Sprintf("php%s-php-%s", version, ext))
		}
	}
	args := append([]string{"install", "-y"}, packages...)
	if _, err := system.Exec(ctx, osInfo.PkgManager, args...); err != nil {
		return fmt.Errorf("failed to install php extensions: %w", err)
	}
	return nil
}

// optimizePHPFPM tunes FPM pool settings and php.ini for the given PHP version.
func optimizePHPFPM(version string) {
	// Optimize www.conf pool settings
	wwwConf := fmt.Sprintf("/etc/php/%s/fpm/pool.d/www.conf", version)
	if data, err := os.ReadFile(wwwConf); err == nil {
		content := string(data)

		replacements := map[string]string{
			`pm\.max_children\s*=\s*\d+`:    "pm.max_children = 30",
			`pm\.start_servers\s*=\s*\d+`:   "pm.start_servers = 8",
			`pm\.min_spare_servers\s*=\s*\d+`: "pm.min_spare_servers = 4",
			`pm\.max_spare_servers\s*=\s*\d+`: "pm.max_spare_servers = 16",
		}
		for pattern, replacement := range replacements {
			re := regexp.MustCompile(pattern)
			content = re.ReplaceAllString(content, replacement)
		}

		if !strings.Contains(content, "pm.max_requests") {
			content += "\npm.max_requests = 500\n"
		}

		if err := os.WriteFile(wwwConf, []byte(content), 0644); err != nil {
			logger.Warn().Err(err).Str("path", wwwConf).Msg("failed to write optimized www.conf")
		} else {
			logger.Info().Str("path", wwwConf).Msg("optimized php-fpm pool settings")
		}
	} else {
		logger.Warn().Err(err).Str("path", wwwConf).Msg("could not read www.conf for optimization")
	}

	// Optimize php.ini opcache settings
	phpIni := fmt.Sprintf("/etc/php/%s/fpm/php.ini", version)
	if data, err := os.ReadFile(phpIni); err == nil {
		content := string(data)
		appendSettings := []string{
			"opcache.max_accelerated_files=20000",
			"opcache.validate_timestamps=1",
			"opcache.save_comments=1",
		}
		changed := false
		for _, setting := range appendSettings {
			key := strings.SplitN(setting, "=", 2)[0]
			if !strings.Contains(content, key) {
				content += "\n" + setting
				changed = true
			}
		}
		if changed {
			content += "\n"
			if err := os.WriteFile(phpIni, []byte(content), 0644); err != nil {
				logger.Warn().Err(err).Str("path", phpIni).Msg("failed to write optimized php.ini")
			} else {
				logger.Info().Str("path", phpIni).Msg("optimized php.ini opcache settings")
			}
		}
	} else {
		logger.Warn().Err(err).Str("path", phpIni).Msg("could not read php.ini for optimization")
	}

	// Restart php-fpm to apply changes
	svcName := fmt.Sprintf("php%s-fpm", version)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", svcName); err != nil {
		logger.Warn().Err(err).Str("service", svcName).Msg("failed to restart php-fpm after optimization")
	}
}
