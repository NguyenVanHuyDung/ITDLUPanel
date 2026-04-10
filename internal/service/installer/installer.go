package installer

import (
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
	// ServerBaseDir is the root directory for all managed software.
	ServerBaseDir = "/ITDLUPanel/server"
)

// SymlinkDef defines a directory mapping: Target is the real system path, Name is the local dir name.
type SymlinkDef struct {
	Name   string // subdirectory name under /ITDLUPanel/server/<software>/ (e.g. "conf", "logs", "data")
	Target string // real system path (e.g. "/etc/nginx") — content will be moved here, and a reverse symlink created
}

// sharedSystemPaths are top-level system directories that must never be moved.
var sharedSystemPaths = map[string]bool{
	"/etc": true, "/var": true, "/var/log": true, "/var/lib": true,
	"/var/run": true, "/usr": true, "/usr/local": true, "/usr/share": true,
	"/tmp": true, "/root": true, "/home": true,
}

// SetupServerDir moves real system directories into /ITDLUPanel/server/<name>/<subdir>/
// and creates reverse symlinks so the system path points back.
// e.g. /etc/nginx → moved to /ITDLUPanel/server/nginx/conf/ → /etc/nginx becomes a symlink to it.
// Shared system dirs (e.g. /var/log, /etc) are forward-symlinked only (never moved).
func SetupServerDir(name string, links []SymlinkDef) error {
	baseDir := filepath.Join(ServerBaseDir, name)
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return fmt.Errorf("failed to create %s: %w", baseDir, err)
	}

	for _, link := range links {
		localDir := filepath.Join(baseDir, link.Name)

		// Safety: never move shared system directories — use forward symlink instead
		if sharedSystemPaths[link.Target] {
			os.RemoveAll(localDir)
			if _, err := os.Stat(link.Target); err == nil {
				os.Symlink(link.Target, localDir)
			} else {
				os.MkdirAll(localDir, 0755)
			}
			continue
		}

		// If localDir already has real content (re-install), just ensure reverse symlink
		if info, err := os.Lstat(localDir); err == nil && info.Mode()&os.ModeSymlink == 0 && info.IsDir() {
			ensureReverseSymlink(link.Target, localDir)
			continue
		}

		// Remove any existing symlink/placeholder at localDir
		os.RemoveAll(localDir)

		// Check if the system target exists
		targetInfo, err := os.Lstat(link.Target)
		if err != nil {
			os.MkdirAll(localDir, 0755)
			logger.Warn().Str("target", link.Target).Msg("system path does not exist, created empty dir")
			continue
		}

		if targetInfo.Mode()&os.ModeSymlink != 0 {
			resolved, err := os.Readlink(link.Target)
			if err == nil && resolved == localDir {
				continue
			}
			os.MkdirAll(localDir, 0755)
			system.ExecWithTimeout(30*time.Second, "cp", "-a", link.Target+"/.", localDir+"/")
			os.Remove(link.Target)
			os.Symlink(localDir, link.Target)
			continue
		}

		// Target is a real directory — move it to localDir, create reverse symlink
		if err := os.Rename(link.Target, localDir); err != nil {
			os.MkdirAll(localDir, 0755)
			if _, cpErr := system.ExecWithTimeout(60*time.Second, "cp", "-a", link.Target+"/.", localDir+"/"); cpErr != nil {
				logger.Error().Err(cpErr).Str("src", link.Target).Str("dst", localDir).Msg("failed to copy directory")
				continue
			}
			os.RemoveAll(link.Target)
		}

		if err := os.Symlink(localDir, link.Target); err != nil {
			logger.Error().Err(err).
				Str("link", link.Target).
				Str("target", localDir).
				Msg("failed to create reverse symlink")
		} else {
			logger.Info().
				Str("system_path", link.Target).
				Str("real_path", localDir).
				Msg("moved content and created reverse symlink")
		}
	}

	logger.Info().Str("software", name).Str("path", baseDir).Msg("server directory setup complete")
	return nil
}

// ensureReverseSymlink makes sure the system path is a symlink pointing to localDir.
func ensureReverseSymlink(systemPath, localDir string) {
	info, err := os.Lstat(systemPath)
	if err != nil {
		// Doesn't exist — create the symlink
		os.Symlink(localDir, systemPath)
		return
	}
	if info.Mode()&os.ModeSymlink != 0 {
		// Already a symlink — check if it points to the right place
		target, _ := os.Readlink(systemPath)
		if target == localDir {
			return
		}
		os.Remove(systemPath)
		os.Symlink(localDir, systemPath)
		return
	}
	// It's a real dir (shouldn't happen) — remove and symlink
	os.RemoveAll(systemPath)
	os.Symlink(localDir, systemPath)
}

// CleanupServerDir removes reverse symlinks at system paths and then removes /ITDLUPanel/server/<name>/.
// Pass the same SymlinkDefs used during setup so we can clean the reverse symlinks.
func CleanupServerDir(name string, links ...SymlinkDef) {
	dir := filepath.Join(ServerBaseDir, name)

	// Restore: remove reverse symlinks at system paths, move content back
	for _, link := range links {
		if sharedSystemPaths[link.Target] {
			continue // forward symlinks — nothing to restore
		}
		localDir := filepath.Join(dir, link.Name)

		info, err := os.Lstat(link.Target)
		if err != nil {
			// System path doesn't exist — move content back if we have it
			if localInfo, lErr := os.Lstat(localDir); lErr == nil && localInfo.Mode()&os.ModeSymlink == 0 && localInfo.IsDir() {
				os.Rename(localDir, link.Target)
			}
			continue
		}
		if info.Mode()&os.ModeSymlink != 0 {
			resolved, _ := os.Readlink(link.Target)
			if resolved == localDir {
				// Remove the reverse symlink, move real content back
				os.Remove(link.Target)
				if localInfo, lErr := os.Lstat(localDir); lErr == nil && localInfo.Mode()&os.ModeSymlink == 0 && localInfo.IsDir() {
					os.Rename(localDir, link.Target)
				}
				logger.Info().Str("restored", link.Target).Msg("restored system path from panel directory")
			}
		}
	}

	if err := os.RemoveAll(dir); err != nil {
		logger.Warn().Err(err).Str("path", dir).Msg("failed to cleanup server directory")
	}
}

// LogsBaseDir is the centralized log directory for all software managed by the panel.
const LogsBaseDir = "/ITDLUPanel/logs"

// LogSymlink defines a symlink to create in /ITDLUPanel/logs/.
type LogSymlink struct {
	Name   string // symlink name, e.g. "nginx.error.log"
	Target string // real log file path, e.g. "/var/log/nginx/error.log"
}

// SetupLogLinks creates symlinks in /ITDLUPanel/logs/ pointing to real software log files.
func SetupLogLinks(links []LogSymlink) {
	_ = os.MkdirAll(LogsBaseDir, 0755)
	for _, link := range links {
		linkPath := filepath.Join(LogsBaseDir, link.Name)
		// Skip if target doesn't exist
		if _, err := os.Stat(link.Target); err != nil {
			continue
		}
		// Remove existing (file, dir, or broken symlink)
		os.Remove(linkPath)
		if err := os.Symlink(link.Target, linkPath); err != nil {
			logger.Warn().Err(err).
				Str("link", linkPath).
				Str("target", link.Target).
				Msg("failed to create log symlink")
		}
	}
}

// CleanupLogLinks removes log symlinks from /ITDLUPanel/logs/ for a software.
func CleanupLogLinks(prefix string) {
	entries, err := os.ReadDir(LogsBaseDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), prefix+".") {
			linkPath := filepath.Join(LogsBaseDir, e.Name())
			// Only remove symlinks, not regular log files
			if info, err := os.Lstat(linkPath); err == nil && info.Mode()&os.ModeSymlink != 0 {
				os.Remove(linkPath)
			}
		}
	}
}

// FixDpkg runs dpkg --configure -a to recover from interrupted package operations.
func FixDpkg(ctx context.Context) {
	result, err := system.Exec(ctx, "dpkg", "--configure", "-a")
	if err != nil {
		logger.Warn().Err(err).Str("stderr", result.Stderr).Msg("dpkg --configure -a failed")
	}
}

// RefreshPackageIndex refreshes the package manager cache.
// APT: runs "apt update -y". DNF: runs "dnf makecache --refresh".
func RefreshPackageIndex(ctx context.Context, osInfo *system.OSInfo) error {
	if osInfo.PkgManager == "dnf" {
		_, err := system.Exec(ctx, "dnf", "makecache", "--refresh")
		return err
	}
	_, err := system.Exec(ctx, "apt", "update", "-y")
	return err
}

// EnsureEPEL installs the EPEL repository on RHEL-based systems (needed for
// packages like pure-ftpd that are not in default repos).
func EnsureEPEL(ctx context.Context, osInfo *system.OSInfo) {
	if osInfo.PkgManager != "dnf" {
		return
	}
	if _, err := system.Exec(ctx, "dnf", "install", "-y", "epel-release"); err != nil {
		logger.Warn().Err(err).Msg("failed to install epel-release (may not be available on this distro)")
		// Fallback: try enabling CRB/PowerTools which some distros need for EPEL deps
		_, _ = system.Exec(ctx, "dnf", "config-manager", "--set-enabled", "crb")
	}
}

// ServerDirExists checks if /ITDLUPanel/server/<name>/ exists.
func ServerDirExists(name string) bool {
	_, err := os.Stat(filepath.Join(ServerBaseDir, name))
	return err == nil
}

// Installer defines the interface for software installers.
type Installer interface {
	// Name returns the unique identifier for this software.
	Name() string
	// Install installs the software at the given version, reporting progress via the callback.
	Install(ctx context.Context, version string, progress func(int)) error
	// Uninstall removes the software.
	Uninstall(ctx context.Context) error
	// IsInstalled checks whether the software is currently installed.
	IsInstalled() bool
	// GetVersions returns available versions/variants for installation.
	GetVersions() []string
}

// VersionedUninstaller is optionally implemented by installers that support
// removing a single version without touching other installed versions.
type VersionedUninstaller interface {
	UninstallVersion(ctx context.Context, version string) error
}

// Registry holds all registered installers, keyed by name.
type Registry struct {
	mu         sync.RWMutex
	installers map[string]Installer
}

// NewRegistry creates a new empty installer registry.
func NewRegistry() *Registry {
	return &Registry{
		installers: make(map[string]Installer),
	}
}

// Register adds an installer to the registry. If an installer with the same
// name already exists it is silently replaced.
func (r *Registry) Register(i Installer) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.installers[i.Name()] = i
}

// Get returns the installer for the given name, or false if not found.
func (r *Registry) Get(name string) (Installer, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	i, ok := r.installers[name]
	return i, ok
}

// List returns all registered installer names in sorted order.
func (r *Registry) List() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.installers))
	for name := range r.installers {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// DefaultRegistry creates a Registry pre-populated with all built-in installers.
func DefaultRegistry() *Registry {
	r := NewRegistry()
	r.Register(NewNginxInstaller())
	r.Register(NewApacheInstaller())
	r.Register(NewMySQLInstaller())
	r.Register(NewPHPInstaller())
	r.Register(NewRedisInstaller())
	r.Register(NewPureFTPdInstaller())
	r.Register(NewOLSInstaller())
	r.Register(NewPhpMyAdminInstaller())
	r.Register(NewFTPStorageInstaller())
	r.Register(NewS3StorageInstaller())
	r.Register(NewGoogleDriveInstaller())
	r.Register(NewOneDriveInstaller())
	r.Register(NewDockerInstaller())
	r.Register(NewPostgreSQLInstaller())
	return r
}
