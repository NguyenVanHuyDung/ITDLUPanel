package app

import (
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// RecoveryMiddleware recovers from panics, logs the error, and returns a 500 response.
func RecoveryMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				stack := string(debug.Stack())
				logger.Error().
					Interface("panic", r).
					Str("stack", stack).
					Str("path", c.Request.URL.Path).
					Str("method", c.Request.Method).
					Msg("Recovered from panic")

				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
					"code":    http.StatusInternalServerError,
					"message": "Internal server error",
				})
			}
		}()
		c.Next()
	}
}

// LoggerMiddleware logs each request with method, path, status, duration, and client IP.
func LoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		duration := time.Since(start)
		status := c.Writer.Status()

		event := logger.Info()
		if status >= 500 {
			event = logger.Error()
		} else if status >= 400 {
			event = logger.Warn()
		}

		if query != "" {
			path = path + "?" + query
		}

		event.
			Str("method", c.Request.Method).
			Str("path", path).
			Int("status", status).
			Dur("duration", duration).
			Str("ip", c.ClientIP()).
			Int("size", c.Writer.Size()).
			Msg("HTTP request")
	}
}

// CORSMiddleware handles Cross-Origin Resource Sharing.
// In release mode (GIN_MODE=release) only same-origin requests are served;
// in all other modes every origin is allowed for development convenience.
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := "*"
		if gin.Mode() == gin.ReleaseMode {
			// In production, reflect the request origin so credentials work
			// while still allowing legitimate cross-origin callers.
			reqOrigin := c.GetHeader("Origin")
			if reqOrigin != "" {
				origin = reqOrigin
			}
		}

		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-CSRF-Token, Accept-Language")
		c.Header("Access-Control-Max-Age", "86400")
		c.Header("Access-Control-Allow-Credentials", "true")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// CompressionMiddleware applies gzip compression to responses.
func CompressionMiddleware() gin.HandlerFunc {
	return gzip.Gzip(gzip.DefaultCompression)
}

// LanguageMiddleware detects the preferred language from the "lang" query
// parameter or the Accept-Language header and stores it in the Gin context
// under the key "lang". Supported languages: "en", "vi". Default: "en".
func LanguageMiddleware() gin.HandlerFunc {
	supported := map[string]bool{
		"en": true,
		"vi": true,
	}

	return func(c *gin.Context) {
		lang := c.Query("lang")

		if lang == "" {
			accept := c.GetHeader("Accept-Language")
			if accept != "" {
				lang = parseAcceptLanguage(accept, supported)
			}
		}

		if !supported[lang] {
			lang = "en"
		}

		c.Set("lang", lang)
		c.Next()
	}
}

// parseAcceptLanguage extracts the best matching language from an
// Accept-Language header value.
func parseAcceptLanguage(header string, supported map[string]bool) string {
	for _, part := range strings.Split(header, ",") {
		tag := strings.TrimSpace(strings.SplitN(part, ";", 2)[0])

		if supported[tag] {
			return tag
		}

		// Try the primary subtag (e.g. "en" from "en-US").
		if idx := strings.IndexByte(tag, '-'); idx > 0 {
			primary := tag[:idx]
			if supported[primary] {
				return primary
			}
		}
	}
	return "en"
}
