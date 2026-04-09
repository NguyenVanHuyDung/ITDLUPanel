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
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "apt" {
		pkg := fmt.Sprintf("php%s-%s", version, ext)
		res, err := system.ExecWithTimeout(5*time.Second, "dpkg", "-s", pkg)
		if err != nil || res.ExitCode != 0 {
			return false
		}
		return strings.Contains(res.Stdout, "Status: install ok installed")
	}
	// RHEL: check via rpm
	pkg := fmt.Sprintf("php%s-php-%s", version, ext)
	res, err := system.ExecWithTimeout(5*time.Second, "rpm", "-q", pkg)
	return err == nil && res.ExitCode == 0
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
		version = "8.4"
	}

	progress(5)
	logger.Info().Str("version", version).Msg("installing php")

	// Add third-party PHP repository for multi-version support
	if osInfo.PkgManager == "apt" {
		progress(10)
		if err := setupPHPRepoAPT(ctx, osInfo); err != nil {
			logger.Warn().Err(err).Msg("failed to setup PHP repo (will try distro packages)")
		}

		progress(25)
		if _, err := system.Exec(ctx, "apt", "update", "-y"); err != nil {
			logger.Warn().Err(err).Msg("apt update had warnings")
		}
	} else {
		// RHEL-based: install EPEL and Remi repo for multi-version PHP
		progress(15)
		if err := setupPHPRepoDNF(ctx, osInfo, version); err != nil {
			logger.Warn().Err(err).Msg("failed to setup Remi PHP repo")
		}
		progress(25)
	}

	// Build package list: php{version}-{ext}
	progress(30)
	packages := buildPHPPackageList(osInfo, version, defaultPHPExtensions)

	progress(40)
	args := append([]string{"install", "-y"}, packages...)
	if _, err := system.Exec(ctx, osInfo.PkgManager, args...); err != nil {
		return fmt.Errorf("failed to install php %s packages: %w", version, err)
	}

	progress(80)

	// Enable and start php-fpm
	serviceName := phpFPMServiceNameForOS(osInfo, version)

	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", serviceName); err != nil {
		logger.Warn().Err(err).Str("service", serviceName).Msg("failed to enable php-fpm")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", serviceName); err != nil {
		logger.Warn().Err(err).Str("service", serviceName).Msg("failed to start php-fpm")
	}

	// Optimize FPM pool and PHP settings
	optimizePHPFPM(version)

	if osInfo.PkgManager == "apt" {
		SetupServerDir("php", []SymlinkDef{
			{Name: "conf", Target: "/etc/php"},
		})
	} else {
		SetupServerDir("php", []SymlinkDef{
			{Name: "conf", Target: "/etc/opt/remi"},
		})
	}

	if osInfo.PkgManager == "apt" {
		SetupLogLinks([]LogSymlink{
			{Name: fmt.Sprintf("php%s-fpm.log", version), Target: fmt.Sprintf("/var/log/php%s-fpm.log", version)},
		})
	} else {
		remiVer := strings.ReplaceAll(version, ".", "")
		SetupLogLinks([]LogSymlink{
			{Name: fmt.Sprintf("php%s-fpm.log", version), Target: fmt.Sprintf("/var/opt/remi/php%s/log/php-fpm/error.log", remiVer)},
		})
	}

	progress(100)
	logger.Info().Str("version", version).Msg("php installed successfully")
	return nil
}

// setupPHPRepoAPT configures the ondrej/sury PHP repository for Debian/Ubuntu.
func setupPHPRepoAPT(ctx context.Context, osInfo *system.OSInfo) error {
	if osInfo.ID == "debian" {
		// Debian: use packages.sury.org with signed keyring
		system.Exec(ctx, "apt", "install", "-y", "software-properties-common",
			"apt-transport-https", "lsb-release", "ca-certificates", "curl")
		if _, err := system.Exec(ctx, "bash", "-c",
			"curl -fsSL https://packages.sury.org/php/apt.gpg | gpg --batch --yes --dearmor -o /usr/share/keyrings/deb.sury.org-php.gpg"); err != nil {
			return fmt.Errorf("fetch sury GPG key: %w", err)
		}
		codename := getDistroCodename()
		repoLine := fmt.Sprintf("deb [signed-by=/usr/share/keyrings/deb.sury.org-php.gpg] https://packages.sury.org/php/ %s main", codename)
		return os.WriteFile("/etc/apt/sources.list.d/php-sury.list", []byte(repoLine+"\n"), 0644)
	}

	// Ubuntu: use ondrej/php PPA
	if _, err := system.Exec(ctx, "apt", "install", "-y", "software-properties-common"); err != nil {
		logger.Warn().Err(err).Msg("failed to install software-properties-common")
	}
	if _, err := system.Exec(ctx, "add-apt-repository", "-y", "ppa:ondrej/php"); err != nil {
		return fmt.Errorf("add ondrej PPA: %w", err)
	}
	return nil
}

// setupPHPRepoDNF configures the Remi repository for RHEL-based distros.
func setupPHPRepoDNF(ctx context.Context, osInfo *system.OSInfo, version string) error {
	EnsureEPEL(ctx, osInfo)

	// Determine the correct Remi RPM URL based on distro
	remiURL := remiReleaseURL(osInfo)
	if _, err := system.Exec(ctx, "dnf", "install", "-y", remiURL); err != nil {
		logger.Warn().Err(err).Msg("remi-release install (may already be present)")
	}

	// Enable the specific PHP version via dnf module stream
	remiModule := fmt.Sprintf("php:remi-%s", version)
	system.Exec(ctx, "dnf", "module", "reset", "-y", "php")
	if _, err := system.Exec(ctx, "dnf", "module", "enable", "-y", remiModule); err != nil {
		return fmt.Errorf("enable remi module %s: %w", remiModule, err)
	}
	return nil
}

// remiReleaseURL returns the correct Remi release RPM URL for the given OS.
func remiReleaseURL(osInfo *system.OSInfo) string {
	major := getMajorVersion(osInfo.VersionID)
	switch osInfo.ID {
	case "fedora":
		return "https://rpms.remirepo.net/fedora/remi-release-" + major + ".rpm"
	default:
		// RHEL, CentOS, AlmaLinux, Rocky Linux — all use enterprise URL
		return "https://rpms.remirepo.net/enterprise/remi-release-" + major + ".rpm"
	}
}

// buildPHPPackageList builds the list of packages to install for a PHP version.
func buildPHPPackageList(osInfo *system.OSInfo, version string, extensions []string) []string {
	packages := make([]string, 0, len(extensions))
	for _, ext := range extensions {
		if osInfo.PkgManager == "apt" {
			packages = append(packages, fmt.Sprintf("php%s-%s", version, ext))
		} else {
			// Remi package naming: php{ver_no_dot}-php-{ext}
			remiVer := strings.ReplaceAll(version, ".", "")
			packages = append(packages, fmt.Sprintf("php%s-php-%s", remiVer, ext))
		}
	}
	return packages
}

// phpFPMServiceNameForOS returns the correct php-fpm systemd service name.
func phpFPMServiceNameForOS(osInfo *system.OSInfo, version string) string {
	if osInfo.PkgManager == "dnf" {
		remiVer := strings.ReplaceAll(version, ".", "")
		return fmt.Sprintf("php%s-php-fpm", remiVer)
	}
	return fmt.Sprintf("php%s-fpm", version)
}

func (i *PHPInstaller) Uninstall(ctx context.Context) error {
	osInfo := system.GetOSInfo()

	if osInfo.PkgManager == "apt" {
		CleanupServerDir("php",
			SymlinkDef{Name: "conf", Target: "/etc/php"},
		)
	} else {
		CleanupServerDir("php",
			SymlinkDef{Name: "conf", Target: "/etc/opt/remi"},
		)
	}
	CleanupLogLinks("php")

	// Stop all known php-fpm versions
	for _, ver := range i.GetVersions() {
		svc := phpFPMServiceNameForOS(osInfo, ver)
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
		// Reset Remi PHP module to prevent stale state
		_, _ = system.Exec(ctx, "dnf", "module", "reset", "-y", "php")
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

// UninstallVersion removes a single PHP version without affecting other installed versions.
func (i *PHPInstaller) UninstallVersion(ctx context.Context, version string) error {
	osInfo := system.GetOSInfo()

	// Stop and disable FPM service using OS-correct naming
	svc := phpFPMServiceNameForOS(osInfo, version)
	_, _ = system.Exec(ctx, "systemctl", "stop", svc)
	_, _ = system.Exec(ctx, "systemctl", "disable", svc)
	// Also try the other naming convention as fallback
	if osInfo.PkgManager == "dnf" {
		altSvc := fmt.Sprintf("php%s-fpm", version)
		_, _ = system.Exec(ctx, "systemctl", "stop", altSvc)
		_, _ = system.Exec(ctx, "systemctl", "disable", altSvc)
	} else {
		remiVer := strings.ReplaceAll(version, ".", "")
		altSvc := fmt.Sprintf("php%s-php-fpm", remiVer)
		_, _ = system.Exec(ctx, "systemctl", "stop", altSvc)
		_, _ = system.Exec(ctx, "systemctl", "disable", altSvc)
	}

	if osInfo.PkgManager == "apt" {
		FixDpkg(ctx)

		pkgs := listInstalledPHPVersionPackages(ctx, version)
		if len(pkgs) > 0 {
			args := append([]string{"purge", "-y"}, pkgs...)
			if _, err := system.Exec(ctx, "apt", args...); err != nil {
				return fmt.Errorf("failed to uninstall php %s: %w", version, err)
			}
		}
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	} else {
		remiVer := strings.ReplaceAll(version, ".", "")
		result, err := system.Exec(ctx, "rpm", "-qa", "--queryformat", "%{NAME}\n")
		if err != nil {
			return fmt.Errorf("failed to list rpm packages: %w", err)
		}
		var pkgs []string
		for _, line := range strings.Split(result.Stdout, "\n") {
			pkg := strings.TrimSpace(line)
			if pkg != "" && strings.HasPrefix(pkg, "php"+remiVer) {
				pkgs = append(pkgs, pkg)
			}
		}
		if len(pkgs) > 0 {
			args := append([]string{"remove", "-y"}, pkgs...)
			if _, err := system.Exec(ctx, "dnf", args...); err != nil {
				return fmt.Errorf("failed to uninstall php %s: %w", version, err)
			}
		}
	}

	// Clean up server dir only if no other PHP version remains
	remaining := 0
	for _, v := range i.GetVersions() {
		if v != version {
			// Check Debian path
			bin := fmt.Sprintf("/usr/sbin/php-fpm%s", v)
			if _, err := os.Stat(bin); err == nil {
				remaining++
				continue
			}
			// Check RHEL remi path
			rv := strings.ReplaceAll(v, ".", "")
			bin = fmt.Sprintf("/opt/remi/php%s/root/usr/sbin/php-fpm", rv)
			if _, err := os.Stat(bin); err == nil {
				remaining++
			}
		}
	}
	if remaining == 0 {
		if osInfo.PkgManager == "apt" {
			CleanupServerDir("php",
				SymlinkDef{Name: "conf", Target: "/etc/php"},
			)
		} else {
			CleanupServerDir("php",
				SymlinkDef{Name: "conf", Target: "/etc/opt/remi"},
			)
		}
		CleanupLogLinks("php")
	}

	logger.Info().Str("version", version).Msg("php version uninstalled successfully")
	return nil
}

// listInstalledPHPVersionPackages returns installed dpkg packages for a specific PHP version.
func listInstalledPHPVersionPackages(ctx context.Context, version string) []string {
	result, err := system.Exec(ctx, "dpkg-query", "-W", "-f", "${Package}\n")
	if err != nil {
		return nil
	}
	prefix := "php" + version
	var pkgs []string
	for _, line := range strings.Split(result.Stdout, "\n") {
		pkg := strings.TrimSpace(line)
		if pkg == "" {
			continue
		}
		// Match packages like php8.3, php8.3-fpm, php8.3-common, etc.
		if strings.HasPrefix(pkg, prefix) {
			pkgs = append(pkgs, pkg)
		}
	}
	return pkgs
}

func (i *PHPInstaller) IsInstalled() bool {
	// Check for any php-fpm binary
	for _, ver := range i.GetVersions() {
		// Check Debian path
		path := fmt.Sprintf("/usr/sbin/php-fpm%s", ver)
		if _, err := os.Stat(path); err == nil {
			return true
		}
		// Check RHEL remi path
		remiVer := strings.ReplaceAll(ver, ".", "")
		path = fmt.Sprintf("/opt/remi/php%s/root/usr/sbin/php-fpm", remiVer)
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
	// Ordered: latest recommended first.
	// PHP lifecycle: Active Support → Security Fixes → EOL
	return []string{
		"8.4", // Active support (GA Dec 2024)
		"8.3", // Active support (GA Nov 2023)
		"8.2", // Security fixes only (GA Dec 2022)
		"8.1", // Security fixes only (GA Nov 2021)
		"8.0", // EOL (Nov 2023) — still available via ondrej/remi
		"7.4", // EOL (Nov 2022) — legacy support
	}
}

// InstallExtensions installs additional PHP extensions for a specific version.
func (i *PHPInstaller) InstallExtensions(ctx context.Context, version string, exts []string) error {
	osInfo := system.GetOSInfo()
	packages := buildPHPPackageList(osInfo, version, exts)
	args := append([]string{"install", "-y"}, packages...)
	if _, err := system.Exec(ctx, osInfo.PkgManager, args...); err != nil {
		return fmt.Errorf("failed to install php extensions: %w", err)
	}
	return nil
}

// optimizePHPFPM tunes FPM pool settings and php.ini for the given PHP version.
func optimizePHPFPM(version string) {
	osInfo := system.GetOSInfo()
	var wwwConf, phpIni, svcName string
	if osInfo.PkgManager == "apt" {
		wwwConf = fmt.Sprintf("/etc/php/%s/fpm/pool.d/www.conf", version)
		phpIni = fmt.Sprintf("/etc/php/%s/fpm/php.ini", version)
		svcName = fmt.Sprintf("php%s-fpm", version)
	} else {
		remiVer := strings.ReplaceAll(version, ".", "")
		wwwConf = fmt.Sprintf("/etc/opt/remi/php%s/php-fpm.d/www.conf", remiVer)
		phpIni = fmt.Sprintf("/etc/opt/remi/php%s/php.ini", remiVer)
		svcName = fmt.Sprintf("php%s-php-fpm", remiVer)
	}

	// Optimize www.conf pool settings
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
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", svcName); err != nil {
		logger.Warn().Err(err).Str("service", svcName).Msg("failed to restart php-fpm after optimization")
	}
}

// getMajorVersion extracts the major version number from a version string (e.g. "9.3" -> "9").
func getMajorVersion(versionID string) string {
	parts := strings.Split(versionID, ".")
	if len(parts) > 0 {
		return parts[0]
	}
	return "9"
}