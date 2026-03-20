package app

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/service"
)

// AuthMiddleware validates JWT access token from the Authorization header.
// Sets "user_id", "username", "role" in the gin context.
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":    http.StatusUnauthorized,
				"message": "authorization header is required",
			})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":    http.StatusUnauthorized,
				"message": "authorization header must be Bearer {token}",
			})
			return
		}

		claims, err := service.ValidateAccessToken(parts[1])
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":    http.StatusUnauthorized,
				"message": "invalid or expired token",
			})
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Next()
	}
}

// --- RBAC ---

// permissionCache caches role permissions loaded from the database.
var permissionCache struct {
	sync.RWMutex
	roles     map[string][]string
	loadedAt  time.Time
	cacheTTL  time.Duration
	db        *sql.DB
	initOnce  sync.Once
}

// InitPermissionCache sets up the permission cache with a database connection.
func InitPermissionCache(db *sql.DB) {
	permissionCache.Lock()
	defer permissionCache.Unlock()
	permissionCache.db = db
	permissionCache.cacheTTL = 5 * time.Minute
	permissionCache.roles = make(map[string][]string)
	loadPermissions()
}

func loadPermissions() {
	if permissionCache.db == nil {
		return
	}

	rows, err := permissionCache.db.Query("SELECT name, permissions FROM roles")
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

	permissionCache.roles = newRoles
	permissionCache.loadedAt = time.Now()
}

func getPermissions(role string) []string {
	permissionCache.RLock()
	if time.Since(permissionCache.loadedAt) < permissionCache.cacheTTL {
		perms := permissionCache.roles[role]
		permissionCache.RUnlock()
		return perms
	}
	permissionCache.RUnlock()

	permissionCache.Lock()
	defer permissionCache.Unlock()

	// Double-check after acquiring write lock
	if time.Since(permissionCache.loadedAt) < permissionCache.cacheTTL {
		return permissionCache.roles[role]
	}

	loadPermissions()
	return permissionCache.roles[role]
}

// CheckPermission checks if a role has a specific permission.
// admin has "*" (all permissions).
// Supports wildcard: "sites.*" matches "sites.read", "sites.write", etc.
func CheckPermission(role string, permission string) bool {
	perms := getPermissions(role)

	for _, p := range perms {
		if p == "*" {
			return true
		}
		if p == permission {
			return true
		}
		// Wildcard match: "sites.*" matches "sites.read"
		if strings.HasSuffix(p, ".*") {
			prefix := strings.TrimSuffix(p, ".*")
			if strings.HasPrefix(permission, prefix+".") {
				return true
			}
		}
	}
	return false
}

// RBACMiddleware checks if the user has the required permission.
func RBACMiddleware(permission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":    http.StatusForbidden,
				"message": "access denied",
			})
			return
		}

		roleStr, ok := role.(string)
		if !ok || !CheckPermission(roleStr, permission) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":    http.StatusForbidden,
				"message": "insufficient permissions",
			})
			return
		}

		c.Next()
	}
}

// --- Rate Limiting ---

type rateLimitEntry struct {
	count     int
	expiresAt time.Time
}

// RateLimitMiddleware limits requests per IP using an in-memory map.
func RateLimitMiddleware(maxRequests int, window time.Duration) gin.HandlerFunc {
	var mu sync.Mutex
	clients := make(map[string]*rateLimitEntry)

	// Background cleanup goroutine
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			mu.Lock()
			now := time.Now()
			for ip, entry := range clients {
				if now.After(entry.expiresAt) {
					delete(clients, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(c *gin.Context) {
		ip := c.ClientIP()
		now := time.Now()

		mu.Lock()
		entry, exists := clients[ip]
		if !exists || now.After(entry.expiresAt) {
			clients[ip] = &rateLimitEntry{
				count:     1,
				expiresAt: now.Add(window),
			}
			mu.Unlock()
			c.Next()
			return
		}

		entry.count++
		if entry.count > maxRequests {
			mu.Unlock()
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"code":    http.StatusTooManyRequests,
				"message": "too many requests, please try again later",
			})
			return
		}
		mu.Unlock()
		c.Next()
	}
}

// --- CSRF ---

// CSRFMiddleware validates the CSRF token for state-changing requests.
// GET/HEAD/OPTIONS are exempt.
func CSRFMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		method := c.Request.Method
		if method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions {
			c.Next()
			return
		}

		// Skip CSRF for API requests with Bearer token (CSRF can't set custom headers)
		if authHeader := c.GetHeader("Authorization"); authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			c.Next()
			return
		}

		// Skip CSRF for unauthenticated endpoints (login, refresh, 2fa verify)
		path := c.Request.URL.Path
		if strings.HasSuffix(path, "/auth/login") ||
			strings.HasSuffix(path, "/auth/refresh") ||
			strings.HasSuffix(path, "/auth/2fa/verify") {
			c.Next()
			return
		}

		csrfToken := c.GetHeader("X-CSRF-Token")
		if csrfToken == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":    http.StatusForbidden,
				"message": "CSRF token is required",
			})
			return
		}

		// Validate the CSRF token matches what was issued in the session/cookie
		csrfCookie, err := c.Cookie("csrf_token")
		if err != nil || csrfCookie == "" || csrfToken != csrfCookie {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"code":    http.StatusForbidden,
				"message": "invalid CSRF token",
			})
			return
		}

		c.Next()
	}
}

// --- Audit ---

// AuditMiddleware logs all POST/PUT/DELETE requests to audit_logs.
func AuditMiddleware(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		method := c.Request.Method
		if method != http.MethodPost && method != http.MethodPut && method != http.MethodDelete {
			c.Next()
			return
		}

		c.Next()

		// Log after the request is processed
		userID, _ := c.Get("user_id")
		username, _ := c.Get("username")

		usernameStr, _ := username.(string)
		var userIDVal interface{}
		if uid, ok := userID.(int64); ok && uid > 0 {
			userIDVal = uid
		}

		_, err := db.Exec(
			`INSERT INTO audit_logs (user_id, username, action, resource, resource_id, detail, ip, user_agent, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			userIDVal,
			usernameStr,
			method,
			c.Request.URL.Path,
			c.Param("id"),
			"",
			c.ClientIP(),
			c.Request.UserAgent(),
		)
		if err != nil {
			logger.Error().Err(err).Str("path", c.Request.URL.Path).Msg("Failed to write audit log")
		}
	}
}
