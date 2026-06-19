package service

import (
	"database/sql"
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// PermissionCache caches role permissions loaded from the database.
//
// It exists in the service package (not app) so that HTTP handlers under
// internal/api/v1 can invalidate the cache after role mutations without
// introducing an import cycle on internal/app.
type PermissionCache struct {
	mu       sync.RWMutex
	roles    map[string][]string
	loadedAt time.Time
	cacheTTL time.Duration
	db       *sql.DB
}

var globalPermissionCache = &PermissionCache{
	roles:    make(map[string][]string),
	cacheTTL: 5 * time.Minute,
}

// InitPermissionCache (re)initialises the cache with a database handle and
// performs the first load.
func InitPermissionCache(db *sql.DB) {
	globalPermissionCache.mu.Lock()
	defer globalPermissionCache.mu.Unlock()
	globalPermissionCache.db = db
	globalPermissionCache.cacheTTL = 5 * time.Minute
	if globalPermissionCache.roles == nil {
		globalPermissionCache.roles = make(map[string][]string)
	}
	loadPermissionsLocked(globalPermissionCache)
}

// ReloadPermissionCache forces an immediate reload from the database. Safe
// to call concurrently; the underlying mutex is acquired for the duration of
// the SELECT.
func ReloadPermissionCache() {
	globalPermissionCache.mu.Lock()
	defer globalPermissionCache.mu.Unlock()
	if globalPermissionCache.db == nil {
		return
	}
	loadPermissionsLocked(globalPermissionCache)
}

// CheckPermission reports whether role grants the requested permission.
// "*" matches everything; "<group>.*" matches any permission under that
// group (e.g. "sites.*" matches "sites.read").
func CheckPermission(role, permission string) bool {
	perms := getPermissionsFor(role)
	for _, p := range perms {
		if p == "*" {
			return true
		}
		if p == permission {
			return true
		}
		if strings.HasSuffix(p, ".*") {
			prefix := strings.TrimSuffix(p, ".*")
			if strings.HasPrefix(permission, prefix+".") {
				return true
			}
		}
	}
	return false
}

// GetUserPermissions returns the cached permission list for a role. The
// returned slice must be treated as read-only.
func GetUserPermissions(role string) []string {
	return getPermissionsFor(role)
}

func getPermissionsFor(role string) []string {
	globalPermissionCache.mu.RLock()
	if time.Since(globalPermissionCache.loadedAt) < globalPermissionCache.cacheTTL {
		perms := globalPermissionCache.roles[role]
		globalPermissionCache.mu.RUnlock()
		return perms
	}
	globalPermissionCache.mu.RUnlock()

	globalPermissionCache.mu.Lock()
	defer globalPermissionCache.mu.Unlock()

	// Double-check after upgrading to write lock
	if time.Since(globalPermissionCache.loadedAt) < globalPermissionCache.cacheTTL {
		return globalPermissionCache.roles[role]
	}
	loadPermissionsLocked(globalPermissionCache)
	return globalPermissionCache.roles[role]
}

func loadPermissionsLocked(c *PermissionCache) {
	if c.db == nil {
		return
	}
	rows, err := c.db.Query("SELECT name, permissions FROM roles")
	if err != nil {
		logger.Error().Err(err).Msg("Failed to load role permissions")
		return
	}
	defer rows.Close()

	newRoles := make(map[string][]string)
	for rows.Next() {
		var name, permsJSON string
		if err := rows.Scan(&name, &permsJSON); err != nil {
			logger.Error().Err(err).Msg("Failed to scan role row")
			continue
		}
		var perms []string
		if err := json.Unmarshal([]byte(permsJSON), &perms); err != nil {
			logger.Error().Err(err).Str("role", name).Msg("Failed to parse permissions JSON")
			continue
		}
		newRoles[name] = perms
	}
	c.roles = newRoles
	c.loadedAt = time.Now()
}
