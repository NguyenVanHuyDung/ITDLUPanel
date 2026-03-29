package installer

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

const (
	nginxRepoFile    = "/etc/apt/sources.list.d/nginx.list"
	nginxPinFile     = "/etc/apt/preferences.d/99nginx"
	nginxKeyringFile = "/usr/share/keyrings/nginx-archive-keyring.gpg"
	nginxConfPath    = "/etc/nginx/nginx.conf"
	nginxConfBackup  = "/etc/nginx/nginx.conf.itdlu-bak"
)

// NginxVersion represents a parsed nginx version with feature detection.
type NginxVersion struct {
	Full   string `json:"full"`   // "1.27.5"
	Major  int    `json:"major"`  // 1
	Minor  int    `json:"minor"`  // 27
	Patch  int    `json:"patch"`  // 5
	Branch string `json:"branch"` // "mainline" or "stable"
}

// SupportsQUIC returns true if this version supports HTTP/3 QUIC (>= 1.25.0).
func (v NginxVersion) SupportsQUIC() bool {
	return v.Major > 1 || (v.Major == 1 && v.Minor >= 25)
}

// UsesHTTP2Directive returns true if http2 should be a separate directive (>= 1.25.1).
func (v NginxVersion) UsesHTTP2Directive() bool {
	if v.Major > 1 {
		return true
	}
	if v.Minor > 25 {
		return true
	}
	if v.Minor == 25 && v.Patch >= 1 {
		return true
	}
	return false
}

// IsZero returns true if the version is empty/unset.
func (v NginxVersion) IsZero() bool {
	return v.Full == ""
}

// ParseNginxVersion parses a version string like "1.27.5" into a NginxVersion.
func ParseNginxVersion(s string) NginxVersion {
	v := NginxVersion{Full: s}
	parts := strings.Split(s, ".")
	if len(parts) >= 1 {
		fmt.Sscanf(parts[0], "%d", &v.Major)
	}
	if len(parts) >= 2 {
		fmt.Sscanf(parts[1], "%d", &v.Minor)
	}
	if len(parts) >= 3 {
		fmt.Sscanf(parts[2], "%d", &v.Patch)
	}
	if v.Minor%2 == 1 {
		v.Branch = "mainline"
	} else {
		v.Branch = "stable"
	}
	return v
}

// NginxVersionInfo describes an available nginx version.
type NginxVersionInfo struct {
	Version  string   `json:"version"`  // "1.27.5"
	Branch   string   `json:"branch"`   // "mainline" or "stable"
	Status   string   `json:"status"`   // "latest", "active", "legacy"
	Features []string `json:"features"` // ["quic", "http2_directive"]
}

// NginxAvailableVersions groups versions by branch.
type NginxAvailableVersions struct {
	Stable   []NginxVersionInfo `json:"stable"`
	Mainline []NginxVersionInfo `json:"mainline"`
	Current  *NginxVersion      `json:"current,omitempty"`
}

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
		return fmt.Errorf("nginx installation only supports apt-based systems")
	}

	progress(5)
	logger.Info().Str("version", version).Msg("installing nginx")

	// Parse version to determine repo and pin
	repoType, aptPin := resolveNginxVersion(version)

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
		_, _ = system.Exec(ctx, "apt-mark", "unhold", "nginx")
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
	if err := i.setupNginxRepo(ctx, repoType, osInfo); err != nil {
		return fmt.Errorf("failed to setup nginx repo: %w", err)
	}

	// Update package index
	progress(35)
	if _, err := system.Exec(ctx, "apt", "update", "-y"); err != nil {
		logger.Warn().Err(err).Msg("apt update had warnings")
	}

	// Install nginx — with optional version pin
	progress(50)
	if aptPin != "" {
		codename := getUbuntuCodename()
		aptPkg := fmt.Sprintf("nginx=%s-1~%s", aptPin, codename)
		logger.Info().Str("package", aptPkg).Msg("installing pinned nginx version")
		if _, err := system.Exec(ctx, "apt", "install", "-y", "--allow-downgrades", aptPkg); err != nil {
			aptPkg2 := fmt.Sprintf("nginx=%s-2~%s", aptPin, codename)
			if _, err2 := system.Exec(ctx, "apt", "install", "-y", "--allow-downgrades", aptPkg2); err2 != nil {
				return fmt.Errorf("failed to install nginx %s: %w", aptPin, err)
			}
		}
		// Hold version to prevent auto-upgrade
		_, _ = system.Exec(ctx, "apt-mark", "hold", "nginx")
	} else {
		if _, err := system.Exec(ctx, "apt", "install", "-y", "nginx"); err != nil {
			return fmt.Errorf("failed to install nginx: %w", err)
		}
		// Unhold to allow upgrades for latest channel
		_, _ = system.Exec(ctx, "apt-mark", "unhold", "nginx")
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

	// Apply optimized nginx.conf defaults
	optimizeNginxConf()

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

// resolveNginxVersion parses a version request and returns the repo type and optional apt pin.
// Examples:
//
//	"stable"   → ("stable", "")
//	"mainline" → ("mainline", "")
//	"1.28.3"   → ("stable", "1.28.3")
//	"1.27.5"   → ("mainline", "1.27.5")
//	"1.28"     → ("stable", "1.28")
func resolveNginxVersion(version string) (repoType string, aptPin string) {
	switch version {
	case "stable":
		return "stable", ""
	case "mainline":
		return "mainline", ""
	}

	v := ParseNginxVersion(version)
	if v.Major == 0 && v.Minor == 0 {
		return "stable", ""
	}

	if v.Minor%2 == 0 {
		repoType = "stable"
	} else {
		repoType = "mainline"
	}

	return repoType, version
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
	return []string{"stable", "mainline", "1.28", "1.27", "1.26", "1.25"}
}

// setupNginxRepo configures the nginx.org apt repository for the given repo type.
func (i *NginxInstaller) setupNginxRepo(ctx context.Context, repoType string, osInfo *system.OSInfo) error {
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

	// Determine repo URL based on repo type
	var repoURL string
	if repoType == "mainline" {
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

// DetectNginxVersion returns the full version info of the installed nginx.
func DetectNginxVersion() NginxVersion {
	var ver NginxVersion

	// Get version string from binary
	if res, err := system.ExecWithTimeout(5*time.Second, "nginx", "-v"); err == nil {
		out := strings.TrimSpace(res.Stderr)
		if out == "" {
			out = strings.TrimSpace(res.Stdout)
		}
		if idx := strings.Index(out, "/"); idx >= 0 {
			verStr := strings.TrimSpace(out[idx+1:])
			if sp := strings.Index(verStr, " "); sp > 0 {
				verStr = verStr[:sp]
			}
			ver = ParseNginxVersion(verStr)
		}
	}

	// Detect branch from repo config
	if data, err := os.ReadFile(nginxRepoFile); err == nil {
		content := string(data)
		if strings.Contains(content, "/mainline/") {
			ver.Branch = "mainline"
		} else if strings.Contains(content, "nginx.org/packages") {
			ver.Branch = "stable"
		}
	}

	// Fallback branch detection from version number
	if ver.Branch == "" && ver.Minor > 0 {
		if ver.Minor%2 == 1 {
			ver.Branch = "mainline"
		} else {
			ver.Branch = "stable"
		}
	}

	if ver.Branch == "" {
		ver.Branch = "stable"
	}

	return ver
}

// DetectNginxVersionType returns "stable" or "mainline" (backward compat).
func DetectNginxVersionType() string {
	return DetectNginxVersion().Branch
}

// Cache for available versions (avoid repeated slow remote fetches).
var (
	nginxVersionCache   *NginxAvailableVersions
	nginxVersionCacheAt time.Time
	nginxVersionCacheMu sync.Mutex
)

const nginxVersionCacheTTL = 1 * time.Hour

// GetAvailableNginxVersions fetches available nginx versions from both repos.
// Results are cached for 1 hour to avoid slow remote fetches.
func GetAvailableNginxVersions(ctx context.Context) (*NginxAvailableVersions, error) {
	nginxVersionCacheMu.Lock()
	defer nginxVersionCacheMu.Unlock()

	// Return cache if fresh
	if nginxVersionCache != nil && time.Since(nginxVersionCacheAt) < nginxVersionCacheTTL {
		// Update current version (cheap local check)
		cur := DetectNginxVersion()
		if !cur.IsZero() {
			nginxVersionCache.Current = &cur
		}
		return nginxVersionCache, nil
	}

	codename := getUbuntuCodename()
	if codename == "" {
		return nil, fmt.Errorf("could not detect Ubuntu codename")
	}

	result := &NginxAvailableVersions{}

	// Fetch both repos in parallel
	var wg sync.WaitGroup
	var stableVersions, mainlineVersions []NginxVersionInfo

	wg.Add(2)
	go func() {
		defer wg.Done()
		url := fmt.Sprintf("http://nginx.org/packages/ubuntu/dists/%s/nginx/binary-amd64/Packages", codename)
		stableVersions = fetchNginxRepoVersions(ctx, url, "stable")
	}()
	go func() {
		defer wg.Done()
		url := fmt.Sprintf("http://nginx.org/packages/mainline/ubuntu/dists/%s/nginx/binary-amd64/Packages", codename)
		mainlineVersions = fetchNginxRepoVersions(ctx, url, "mainline")
	}()
	wg.Wait()

	result.Stable = stableVersions
	result.Mainline = mainlineVersions

	cur := DetectNginxVersion()
	if !cur.IsZero() {
		result.Current = &cur
	}

	// Cache result
	nginxVersionCache = result
	nginxVersionCacheAt = time.Now()

	return result, nil
}

// fetchNginxRepoVersions fetches and parses version list from a nginx.org Packages file URL.
func fetchNginxRepoVersions(ctx context.Context, url, branch string) []NginxVersionInfo {
	res, err := system.Exec(ctx, "curl", "-sfL", "--connect-timeout", "10", url)
	if err != nil || res.ExitCode != 0 {
		logger.Warn().Str("url", url).Err(err).Msg("failed to fetch nginx repo packages")
		return nil
	}

	type verEntry struct {
		full  string
		major int
		minor int
		patch int
	}

	seen := make(map[string]verEntry) // key: "1.27" → latest patch
	for _, line := range strings.Split(res.Stdout, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "Version: ") {
			continue
		}
		aptVer := strings.TrimPrefix(line, "Version: ")
		if strings.Contains(aptVer, "+") {
			continue
		}
		verStr := aptVer
		if idx := strings.Index(verStr, "-"); idx > 0 {
			verStr = verStr[:idx]
		}

		v := ParseNginxVersion(verStr)
		// Filter: only include versions that belong to this branch
		// Even minor = stable, odd minor = mainline
		isStable := v.Minor%2 == 0
		if (branch == "stable" && !isStable) || (branch == "mainline" && isStable) {
			continue
		}
		key := fmt.Sprintf("%d.%d", v.Major, v.Minor)
		if existing, ok := seen[key]; !ok || v.Patch > existing.patch {
			seen[key] = verEntry{full: verStr, major: v.Major, minor: v.Minor, patch: v.Patch}
		}
	}

	var versions []NginxVersionInfo
	for _, entry := range seen {
		v := ParseNginxVersion(entry.full)

		var features []string
		if v.SupportsQUIC() {
			features = append(features, "quic")
		}
		if v.UsesHTTP2Directive() {
			features = append(features, "http2_directive")
		} else {
			features = append(features, "http2_listen")
		}

		versions = append(versions, NginxVersionInfo{
			Version:  entry.full,
			Branch:   branch,
			Features: features,
		})
	}

	sort.Slice(versions, func(i, j int) bool {
		vi := ParseNginxVersion(versions[i].Version)
		vj := ParseNginxVersion(versions[j].Version)
		if vi.Major != vj.Major {
			return vi.Major > vj.Major
		}
		if vi.Minor != vj.Minor {
			return vi.Minor > vj.Minor
		}
		return vi.Patch > vj.Patch
	})

	for i := range versions {
		switch i {
		case 0:
			versions[i].Status = "latest"
		case 1:
			versions[i].Status = "active"
		default:
			versions[i].Status = "legacy"
		}
	}

	return versions
}

// optimizeNginxConf replaces nginx.conf with a performance-optimized version if not already tuned.
func optimizeNginxConf() {
	data, err := os.ReadFile(nginxConfPath)
	if err != nil {
		logger.Warn().Err(err).Msg("failed to read nginx.conf for optimization")
		return
	}

	if strings.Contains(string(data), "fastcgi_cache_path") {
		logger.Info().Msg("nginx.conf already optimized, skipping")
		return
	}

	const optimizedConf = `user www-data;
worker_processes auto;
pid /run/nginx.pid;
worker_rlimit_nofile 65535;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 2048;
    multi_accept on;
    use epoll;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    types_hash_max_size 2048;
    server_tokens off;
    keepalive_timeout 30;
    keepalive_requests 1000;

    client_body_buffer_size 16k;
    client_max_body_size 64m;

    open_file_cache max=10000 inactive=30s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml font/ttf font/otf application/wasm;

    fastcgi_cache_path /tmp/nginx-cache levels=1:2 keys_zone=WORDPRESS:100m inactive=60m max_size=512m;
    fastcgi_cache_key "$scheme$request_method$host$request_uri";

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
`

	if err := os.WriteFile(nginxConfPath, []byte(optimizedConf), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write optimized nginx.conf")
		return
	}

	logger.Info().Msg("wrote optimized nginx.conf")
}
