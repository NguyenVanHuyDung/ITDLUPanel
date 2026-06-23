package app

import (
	"database/sql"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/service"
)

// AuthMiddleware validates JWT access token from the Authorization header
// or from the "token" query parameter (for WebSocket connections).
// Sets "user_id", "username", "role" in the gin context.
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenStr string

		// 1. Check Authorization header first
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
				tokenStr = parts[1]
			}
		}

		// 2. Fall back to "token" query parameter (for WebSocket)
		if tokenStr == "" {
			tokenStr = c.Query("token")
		}

	if tokenStr == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
			"code":    http.StatusUnauthorized,
			"message": "authorization header is required",
		})
		logger.Warn().
			Str("ip", c.ClientIP()).
			Str("path", c.Request.URL.Path).
			Str("method", c.Request.Method).
			Str("auth_header", authHeader).
			Msg("missing authorization token")
		return
	}

	claims, err := service.ValidateAccessToken(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"code":    http.StatusUnauthorized,
				"message": "invalid or expired token",
			})
			logger.Warn().
				Str("ip", c.ClientIP()).
				Str("path", c.Request.URL.Path).
				Str("err", err.Error()).
				Msg("invalid or expired token")
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Next()
	}
}

// --- RBAC ---

// InitPermissionCache sets up the permission cache with a database connection.
// Thin wrapper around service.InitPermissionCache kept for backward
// compatibility with router.go and existing callers.
func InitPermissionCache(db *sql.DB) {
	service.InitPermissionCache(db)
}

// ReloadPermissionCache forces a reload of the permission cache.
// Wrapper around service.ReloadPermissionCache so role-mutating handlers
// under internal/api/v1 can invalidate the cache without importing app.
func ReloadPermissionCache() {
	service.ReloadPermissionCache()
}

// CheckPermission checks if a role has a specific permission.
// admin has "*" (all permissions). Supports wildcard "<group>.*".
func CheckPermission(role string, permission string) bool {
	return service.CheckPermission(role, permission)
}

// GetUserPermissions returns the permissions list for a role.
func GetUserPermissions(role string) []string {
	return service.GetUserPermissions(role)
}

// IsAdmin checks if a role has full admin access.
func IsAdmin(role string) bool {
	return CheckPermission(role, "*")
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

		// Capture values before goroutine (c is reused).
		userID, _ := c.Get("user_id")
		username, _ := c.Get("username")
		usernameStr, _ := username.(string)
		var userIDVal interface{}
		if uid, ok := userID.(int64); ok && uid > 0 {
			userIDVal = uid
		}
		path := c.Request.URL.Path
		paramID := c.Param("id")
		ip := c.ClientIP()
		ua := c.Request.UserAgent()

		go func() {
			_, err := db.Exec(
				`INSERT INTO audit_logs (user_id, username, action, resource, resource_id, detail, ip, user_agent, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
				userIDVal, usernameStr, method, path, paramID, "", ip, ua,
			)
			if err != nil {
				logger.Error().Err(err).Str("path", path).Msg("Failed to write audit log")
			}
		}()
	}
}
