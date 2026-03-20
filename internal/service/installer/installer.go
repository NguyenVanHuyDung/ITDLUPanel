package installer

import (
	"context"
	"sort"
	"sync"
)

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
	return r
}
