package plugin

import (
	"database/sql"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
)

// Plugin defines the interface that all plugins must implement.
type Plugin interface {
	Name() string
	Version() string
	Description() string
	Init(ctx PluginContext) error
	Routes() []Route
	Hooks() map[string]HookFunc
	Cleanup() error
}

// PluginContext provides dependencies to plugins during initialization.
type PluginContext struct {
	DB     *sql.DB
	Logger zerolog.Logger
	Config map[string]string
}

// Route describes an HTTP route contributed by a plugin.
type Route struct {
	Method  string
	Path    string
	Handler gin.HandlerFunc
}

// HookFunc is a callback invoked when a named hook is triggered.
type HookFunc func(data interface{}) error

// PluginInfo holds metadata about a plugin for API responses.
type PluginInfo struct {
	Name        string                 `json:"name"`
	Version     string                 `json:"version"`
	Description string                 `json:"description"`
	Author      string                 `json:"author"`
	Status      string                 `json:"status"` // enabled, disabled
	Config      map[string]interface{} `json:"config,omitempty"`
}
