package installer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

const (
	// ServerBaseDir is the root directory for all managed software.
	ServerBaseDir = "/ITDLUPanel/server"
)

// SymlinkDef defines a symlink to create: Target is the real system path, Name is the local dir name.
type SymlinkDef struct {
	Name   string // subdirectory name under /ITDLUPanel/server/<software>/ (e.g. "conf", "logs", "data")
	Target string // real system path to symlink to (e.g. "/etc/nginx")
}

// SetupServerDir creates /ITDLUPanel/server/<name>/ and symlinks to system paths.
func SetupServerDir(name string, links []SymlinkDef) error {
	baseDir := filepath.Join(ServerBaseDir, name)
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return fmt.Errorf("failed to create %s: %w", baseDir, err)
	}

	for _, link := range links {
		linkPath := filepath.Join(baseDir, link.Name)
		// Remove existing (file, dir, or broken symlink)
		os.RemoveAll(linkPath)

		// Only create symlink if target exists
		if _, err := os.Stat(link.Target); err == nil {
			if err := os.Symlink(link.Target, linkPath); err != nil {
				logger.Warn().Err(err).
					Str("link", linkPath).
					Str("target", link.Target).
					Msg("failed to create symlink")
			}
		} else {
			// Create empty dir as placeholder
			os.MkdirAll(linkPath, 0755)
			logger.Warn().Str("target", link.Target).Msg("symlink target does not exist, created empty dir")
		}
	}

	logger.Info().Str("software", name).Str("path", baseDir).Msg("server directory setup complete")
	return nil
}

// CleanupServerDir removes /ITDLUPanel/server/<name>/.
func CleanupServerDir(name string) {
	dir := filepath.Join(ServerBaseDir, name)
	if err := os.RemoveAll(dir); err != nil {
		logger.Warn().Err(err).Str("path", dir).Msg("failed to cleanup server directory")
	}
}

// FixDpkg runs dpkg --configure -a to recover from interrupted package operations.
func FixDpkg(ctx context.Context) {
	result, err := system.Exec(ctx, "dpkg", "--configure", "-a")
	if err != nil {
		logger.Warn().Err(err).Str("stderr", result.Stderr).Msg("dpkg --configure -a failed")
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
	return r
}
