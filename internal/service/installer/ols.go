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

const (
	olsBasePath    = "/usr/local/lsws"
	olsConfPath    = "/usr/local/lsws/conf/httpd_config.conf"
	olsConfBackup  = "/usr/local/lsws/conf/httpd_config.conf.itdlu-bak"
	olsRepoFileApt = "/etc/apt/sources.list.d/lst_debian_repo.list"
)

// lsphpDefaultExtensions lists the LSPHP extensions installed by default.
var lsphpDefaultExtensions = []string{
	"common", "mysql", "curl", "gd", "mbstring",
	"xml", "zip", "bcmath", "intl", "soap", "opcache", "ioncube",
}

// OLSInstaller handles OpenLiteSpeed installation and removal.
type OLSInstaller struct{}

// NewOLSInstaller creates a new OLSInstaller.
func NewOLSInstaller() *OLSInstaller {
	return &OLSInstaller{}
}

func (i *OLSInstaller) Name() string { return "openlitespeed" }

func (i *OLSInstaller) Install(ctx context.Context, version string, progress func(int)) error {
	osInfo := system.GetOSInfo()

	progress(5)
	logger.Info().Str("version", version).Msg("installing openlitespeed")

	// Add the official LiteSpeed repository
	progress(10)
	if err := i.setupLSRepo(ctx, osInfo); err != nil {
		return fmt.Errorf("failed to setup litespeed repo: %w", err)
	}

	// Update package index
	progress(20)
	if osInfo.PkgManager == "apt" {
		if _, err := system.Exec(ctx, "apt", "update", "-y"); err != nil {
			logger.Warn().Err(err).Msg("apt update had warnings")
		}
	}

	// Backup existing config if present
	if _, err := os.Stat(olsConfPath); err == nil {
		progress(22)
		logger.Info().Msg("backing up httpd_config.conf")
		if data, err := os.ReadFile(olsConfPath); err == nil {
			_ = os.WriteFile(olsConfBackup, data, 0644)
		}
	}

	// Install OpenLiteSpeed
	progress(25)
	if _, err := system.Exec(ctx, osInfo.PkgManager, "install", "-y", "openlitespeed"); err != nil {
		return fmt.Errorf("failed to install openlitespeed: %w", err)
	}

	progress(50)

	// Install default LSPHP (8.2)
	defaultPHP := "82"
	if err := i.installLSPHP(ctx, osInfo, defaultPHP); err != nil {
		logger.Warn().Err(err).Msg("failed to install default lsphp82")
	}

	progress(70)

	// Restore config backup if saved
	if _, err := os.Stat(olsConfBackup); err == nil {
		logger.Info().Msg("restoring httpd_config.conf backup")
		if data, err := os.ReadFile(olsConfBackup); err == nil {
			_ = os.WriteFile(olsConfPath, data, 0644)
		}
		_ = os.Remove(olsConfBackup)
	}

	// Optimize httpd_config.conf
	optimizeOLSConf()

	// Setup default listener
	i.ensureDefaultListener()

	// Setup default LSPHP external app
	i.ensureLSPHPExtApp(defaultPHP)

	progress(85)

	// Enable and start the service
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "enable", "lsws"); err != nil {
		logger.Warn().Err(err).Msg("failed to enable openlitespeed service")
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", "lsws"); err != nil {
		logger.Warn().Err(err).Msg("failed to start openlitespeed service")
	}

	// Verify installation
	progress(92)
	if res, err := system.ExecWithTimeout(5*time.Second, "/usr/local/lsws/bin/lshttpd", "-v"); err == nil {
		out := strings.TrimSpace(res.Stdout)
		if out == "" {
			out = strings.TrimSpace(res.Stderr)
		}
		logger.Info().Str("version_output", out).Msg("openlitespeed version verified")
	}

	SetupServerDir("openlitespeed", []SymlinkDef{
		{Name: "conf", Target: "/usr/local/lsws/conf"},
		{Name: "logs", Target: "/usr/local/lsws/logs"},
	})

	SetupLogLinks([]LogSymlink{
		{Name: "openlitespeed.error.log", Target: "/usr/local/lsws/logs/error.log"},
		{Name: "openlitespeed.access.log", Target: "/usr/local/lsws/logs/access.log"},
	})

	progress(100)
	logger.Info().Msg("openlitespeed installed successfully")
	return nil
}

func (i *OLSInstaller) Uninstall(ctx context.Context) error {
	CleanupServerDir("openlitespeed",
		SymlinkDef{Name: "conf", Target: "/usr/local/lsws/conf"},
		SymlinkDef{Name: "logs", Target: "/usr/local/lsws/logs"},
	)
	CleanupLogLinks("openlitespeed")

	osInfo := system.GetOSInfo()

	_, _ = system.Exec(ctx, "systemctl", "stop", "lsws")
	_, _ = system.Exec(ctx, "systemctl", "disable", "lsws")

	// Fix any interrupted dpkg state
	if osInfo.PkgManager == "apt" {
		FixDpkg(ctx)
	}

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	// Remove OLS and all LSPHP packages
	if _, err := system.Exec(ctx, osInfo.PkgManager, removeCmd, "-y", "openlitespeed"); err != nil {
		return fmt.Errorf("failed to uninstall openlitespeed: %w", err)
	}

	// Remove all lsphp packages
	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "bash", "-c", "apt purge -y 'lsphp*' 2>/dev/null || true")
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	} else {
		_, _ = system.Exec(ctx, "bash", "-c", "dnf remove -y 'lsphp*' 2>/dev/null || true")
	}

	// Remove repo file
	i.removeLSRepo()

	logger.Info().Msg("openlitespeed uninstalled successfully")
	return nil
}

func (i *OLSInstaller) IsInstalled() bool {
	_, err := os.Stat("/usr/local/lsws/bin/lshttpd")
	return err == nil
}

func (i *OLSInstaller) GetVersions() []string {
	return []string{"stable"}
}

// setupLSRepo configures the LiteSpeed apt/dnf repository.
func (i *OLSInstaller) setupLSRepo(ctx context.Context, osInfo *system.OSInfo) error {
	if osInfo.PkgManager == "apt" {
		// Import signing key
		_, _ = system.Exec(ctx, "bash", "-c",
			"curl -fsSL https://rpms.litespeedtech.com/debian/lst_debian_repo.gpg | "+
				"gpg --batch --yes --dearmor -o /usr/share/keyrings/lst-debian-repo.gpg 2>/dev/null || "+
				"wget -qO - https://rpms.litespeedtech.com/debian/lst_debian_repo.gpg | apt-key add -")

		// Detect codename
		codename := getDistroCodename()
		if codename == "" {
			codename = "focal"
		}

		repoLine := fmt.Sprintf("deb [signed-by=/usr/share/keyrings/lst-debian-repo.gpg] "+
			"http://rpms.litespeedtech.com/debian/ %s main", codename)
		if err := os.WriteFile(olsRepoFileApt, []byte(repoLine+"\n"), 0644); err != nil {
			// Fallback: try without signed-by
			repoLine = fmt.Sprintf("deb http://rpms.litespeedtech.com/debian/ %s main", codename)
			if err := os.WriteFile(olsRepoFileApt, []byte(repoLine+"\n"), 0644); err != nil {
				return fmt.Errorf("failed to write litespeed repo file: %w", err)
			}
		}
	} else {
		// RHEL-based
		repoURL := "http://rpms.litespeedtech.com/centos/litespeed-repo-1.3-1.el8.noarch.rpm"
		if _, err := system.Exec(ctx, "rpm", "-Uvh", repoURL); err != nil {
			logger.Warn().Err(err).Msg("litespeed repo RPM may already be installed")
		}
	}
	return nil
}

// removeLSRepo removes the LiteSpeed repository configuration.
func (i *OLSInstaller) removeLSRepo() {
	for _, f := range []string{olsRepoFileApt, "/usr/share/keyrings/lst-debian-repo.gpg"} {
		if err := os.Remove(f); err != nil && !os.IsNotExist(err) {
			logger.Warn().Err(err).Str("file", f).Msg("failed to remove litespeed repo file")
		}
	}
}

// installLSPHP installs LSPHP for the given version code (e.g., "82" for PHP 8.2).
func (i *OLSInstaller) installLSPHP(ctx context.Context, osInfo *system.OSInfo, versionCode string) error {
	packages := []string{fmt.Sprintf("lsphp%s", versionCode)}
	for _, ext := range lsphpDefaultExtensions {
		packages = append(packages, fmt.Sprintf("lsphp%s-%s", versionCode, ext))
	}

	logger.Info().Str("version", versionCode).Strs("packages", packages).Msg("installing lsphp")

	args := append([]string{"install", "-y"}, packages...)
	if _, err := system.Exec(ctx, osInfo.PkgManager, args...); err != nil {
		return fmt.Errorf("failed to install lsphp%s: %w", versionCode, err)
	}

	logger.Info().Str("version", versionCode).Msg("lsphp installed successfully")
	return nil
}

// InstallLSPHP is the public method for installing LSPHP for a specific PHP version.
// version should be like "8.2", "8.3", "7.4", etc.
func (i *OLSInstaller) InstallLSPHP(ctx context.Context, version string) error {
	osInfo := system.GetOSInfo()
	versionCode := strings.ReplaceAll(version, ".", "")
	if err := i.installLSPHP(ctx, osInfo, versionCode); err != nil {
		return err
	}

	// Ensure the external app definition exists in httpd_config.conf
	i.ensureLSPHPExtApp(versionCode)

	// Restart OLS to pick up changes
	_, _ = system.ExecWithTimeout(30*time.Second, "systemctl", "restart", "lsws")
	return nil
}

// UninstallLSPHP removes LSPHP packages for a specific version.
func (i *OLSInstaller) UninstallLSPHP(ctx context.Context, version string) error {
	osInfo := system.GetOSInfo()
	versionCode := strings.ReplaceAll(version, ".", "")

	removeCmd := "remove"
	if osInfo.PkgManager == "apt" {
		removeCmd = "purge"
	}

	// Remove all packages for this LSPHP version
	pattern := fmt.Sprintf("lsphp%s*", versionCode)
	if _, err := system.Exec(ctx, "bash", "-c",
		fmt.Sprintf("%s %s -y '%s' 2>/dev/null || true", osInfo.PkgManager, removeCmd, pattern)); err != nil {
		return fmt.Errorf("failed to uninstall lsphp%s: %w", versionCode, err)
	}

	if osInfo.PkgManager == "apt" {
		_, _ = system.Exec(ctx, "apt", "autoremove", "-y")
	}

	// Remove external app from httpd_config.conf
	i.removeLSPHPExtApp(versionCode)

	_, _ = system.ExecWithTimeout(30*time.Second, "systemctl", "restart", "lsws")
	return nil
}

// GetInstalledLSPHPVersions detects installed LSPHP versions.
func GetInstalledLSPHPVersions() []string {
	var versions []string
	for _, ver := range []string{"74", "81", "82", "83"} {
		binPath := fmt.Sprintf("/usr/local/lsws/lsphp%s/bin/lsphp", ver)
		if _, err := os.Stat(binPath); err == nil {
			// Convert "82" to "8.2"
			if len(ver) == 2 {
				versions = append(versions, string(ver[0])+"."+string(ver[1]))
			}
		}
	}
	return versions
}

// IsLSPHPInstalled checks if a specific LSPHP version is installed.
func IsLSPHPInstalled(version string) bool {
	versionCode := strings.ReplaceAll(version, ".", "")
	binPath := fmt.Sprintf("/usr/local/lsws/lsphp%s/bin/lsphp", versionCode)
	_, err := os.Stat(binPath)
	return err == nil
}

// GetLSPHPExtensions returns the list of available LSPHP extensions with install status.
func GetLSPHPExtensions(version string) ([]PHPExtensionInfo, error) {
	versionCode := strings.ReplaceAll(version, ".", "")

	lsphpExtCatalog := []struct {
		Name string
		Type string
		Desc string
	}{
		{"common", "core", "Common files"},
		{"mysql", "database", "MySQL native driver"},
		{"pgsql", "database", "PostgreSQL driver"},
		{"sqlite3", "database", "SQLite3 driver"},
		{"redis", "database", "Redis extension"},
		{"memcached", "database", "Memcached extension"},
		{"curl", "web", "cURL HTTP client"},
		{"soap", "web", "SOAP protocol support"},
		{"ldap", "web", "LDAP protocol support"},
		{"imap", "web", "IMAP email protocol"},
		{"xml", "text", "XML parser"},
		{"mbstring", "text", "Multibyte string support"},
		{"intl", "text", "Internationalization (ICU)"},
		{"json", "text", "JSON support"},
		{"bcmath", "math", "Arbitrary precision math"},
		{"gd", "image", "GD image library"},
		{"imagick", "image", "ImageMagick integration"},
		{"zip", "compression", "ZIP archive support"},
		{"opcache", "performance", "OPcache bytecode caching"},
		{"apcu", "performance", "APCu user cache"},
		{"ioncube", "performance", "ionCube Loader"},
		{"tidy", "other", "HTML Tidy support"},
		{"snmp", "other", "SNMP protocol support"},
	}

	result := make([]PHPExtensionInfo, 0, len(lsphpExtCatalog))
	for _, ext := range lsphpExtCatalog {
		installed := isLSPHPExtInstalled(versionCode, ext.Name)
		result = append(result, PHPExtensionInfo{
			Name:        ext.Name,
			Type:        ext.Type,
			Description: ext.Desc,
			Installed:   installed,
		})
	}
	return result, nil
}

// isLSPHPExtInstalled checks if a specific LSPHP extension package is installed.
func isLSPHPExtInstalled(versionCode, ext string) bool {
	pkg := fmt.Sprintf("lsphp%s-%s", versionCode, ext)
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "apt" {
		res, err := system.ExecWithTimeout(5*time.Second, "dpkg", "-s", pkg)
		if err != nil || res.ExitCode != 0 {
			return false
		}
		return strings.Contains(res.Stdout, "Status: install ok installed")
	}
	// RHEL: check via rpm
	res, err := system.ExecWithTimeout(5*time.Second, "rpm", "-q", pkg)
	return err == nil && res.ExitCode == 0
}

// InstallLSPHPExtensions installs additional LSPHP extensions.
func InstallLSPHPExtensions(ctx context.Context, version string, exts []string) error {
	versionCode := strings.ReplaceAll(version, ".", "")
	osInfo := system.GetOSInfo()

	packages := make([]string, 0, len(exts))
	for _, ext := range exts {
		packages = append(packages, fmt.Sprintf("lsphp%s-%s", versionCode, ext))
	}

	args := append([]string{"install", "-y"}, packages...)
	if _, err := system.Exec(ctx, osInfo.PkgManager, args...); err != nil {
		return fmt.Errorf("failed to install lsphp extensions: %w", err)
	}

	// Restart OLS to pick up new extensions
	_, _ = system.ExecWithTimeout(30*time.Second, "systemctl", "restart", "lsws")
	return nil
}

// ensureDefaultListener ensures a default HTTP/HTTPS listener exists in httpd_config.conf.
func (i *OLSInstaller) ensureDefaultListener() {
	data, err := os.ReadFile(olsConfPath)
	if err != nil {
		return
	}

	content := string(data)

	// Check if default listener already exists
	if strings.Contains(content, "listener Default {") {
		return
	}

	listenerBlock := `
listener Default {
  address                 *:80
  secure                  0
}

listener Secure {
  address                 *:443
  secure                  1
  keyFile                 /usr/local/lsws/conf/example.key
  certFile                /usr/local/lsws/conf/example.crt
}
`
	content += listenerBlock

	if err := os.WriteFile(olsConfPath, []byte(content), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write default listener to httpd_config.conf")
	}
}

// ensureLSPHPExtApp ensures an LSPHP external app definition exists in httpd_config.conf.
func (i *OLSInstaller) ensureLSPHPExtApp(versionCode string) {
	data, err := os.ReadFile(olsConfPath)
	if err != nil {
		return
	}

	content := string(data)
	extAppName := fmt.Sprintf("lsphp%s", versionCode)

	// Check if already defined
	if strings.Contains(content, fmt.Sprintf("extprocessor %s {", extAppName)) {
		return
	}

	extAppBlock := fmt.Sprintf(`
extprocessor %s {
  type                    lsapi
  address                 uds://tmp/lshttpd/%s.sock
  maxConns                10
  env                     PHP_LSAPI_CHILDREN=10
  env                     LSAPI_AVOID_FORK=200M
  initTimeout             60
  retryTimeout            0
  persistConn             1
  respBuffer              0
  autoStart               2
  path                    /usr/local/lsws/%s/bin/lsphp
  backlog                 100
  instances               1
  priority                0
  memSoftLimit            2047M
  memHardLimit            2047M
  procSoftLimit           1400
  procHardLimit           1500
}
`, extAppName, extAppName, extAppName)

	content += extAppBlock

	if err := os.WriteFile(olsConfPath, []byte(content), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write lsphp extapp to httpd_config.conf")
	}
}

// removeLSPHPExtApp removes an LSPHP external app definition from httpd_config.conf.
func (i *OLSInstaller) removeLSPHPExtApp(versionCode string) {
	data, err := os.ReadFile(olsConfPath)
	if err != nil {
		return
	}

	content := string(data)
	marker := fmt.Sprintf("extprocessor lsphp%s {", versionCode)
	if idx := strings.Index(content, marker); idx >= 0 {
		braceCount := 0
		endIdx := idx + len(marker)
		for j := endIdx; j < len(content); j++ {
			if content[j] == '{' {
				braceCount++
			} else if content[j] == '}' {
				if braceCount == 0 {
					endIdx = j + 1
					if endIdx < len(content) && content[endIdx] == '\n' {
						endIdx++
					}
					break
				}
				braceCount--
			}
		}
		for idx > 0 && content[idx-1] == '\n' {
			idx--
		}
		content = content[:idx] + content[endIdx:]
		_ = os.WriteFile(olsConfPath, []byte(content), 0644)
	}
}

// optimizeOLSConf applies performance-tuned defaults to the OLS config.
func optimizeOLSConf() {
	data, err := os.ReadFile(olsConfPath)
	if err != nil {
		logger.Warn().Err(err).Msg("failed to read httpd_config.conf for optimization")
		return
	}

	content := string(data)

	// Skip if already optimized
	if strings.Contains(content, "# ITDLUPanel optimized") {
		logger.Info().Msg("ols config already optimized, skipping")
		return
	}

	// Set common directives
	tunings := map[string]string{
		"maxConnections":       "10000",
		"maxSSLConnections":    "10000",
		"connTimeout":          "300",
		"maxKeepAliveReq":      "10000",
		"keepAliveTimeout":     "5",
		"maxReqURLLen":         "32768",
		"maxReqHeaderSize":     "65536",
		"maxReqBodySize":       "2047M",
		"maxDynRespHeaderSize": "32768",
		"maxDynRespSize":       "2047M",
		"enableGzipCompress":   "1",
		"gzipCompressLevel":    "6",
	}

	for key, value := range tunings {
		re := regexp.MustCompile(`(?m)(^\s*` + regexp.QuoteMeta(key) + `\s+).+?(\s*)$`)
		if re.MatchString(content) {
			content = re.ReplaceAllString(content, "${1}"+value+"${2}")
		}
	}

	// Add optimization marker
	content += "\n# ITDLUPanel optimized\n"

	if err := os.WriteFile(olsConfPath, []byte(content), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write optimized httpd_config.conf")
		return
	}

	logger.Info().Msg("wrote optimized httpd_config.conf")
}

// LSPHPVersionToCode converts "8.2" to "82".
func LSPHPVersionToCode(version string) string {
	return strings.ReplaceAll(version, ".", "")
}

// LSPHPCodeToVersion converts "82" to "8.2".
func LSPHPCodeToVersion(code string) string {
	if len(code) == 2 {
		return string(code[0]) + "." + string(code[1])
	}
	return code
}
