package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/ITDLUPanel/panel/internal/pkg/crypto"
)

// Config holds all panel configuration.
type Config struct {
	Server   ServerConfig   `json:"server"`
	Database DatabaseConfig `json:"database"`
	Auth     AuthConfig     `json:"auth"`
	Paths    PathsConfig    `json:"paths"`
	Panel    PanelConfig    `json:"panel"`

	filePath string `json:"-"`
}

type ServerConfig struct {
	Host      string `json:"host"`
	Port      int    `json:"port"`
	SSL       bool   `json:"ssl"`
	SSLCert   string `json:"ssl_cert"`
	SSLKey    string `json:"ssl_key"`
	PublicURL string `json:"public_url"`
}

// PublicAddress returns the URL the panel is reachable at from the
// browser. Returns PublicURL if set; otherwise infers from Host/Port/SSL.
func (c ServerConfig) PublicAddress() string {
	if c.PublicURL != "" {
		return strings.TrimRight(c.PublicURL, "/")
	}
	scheme := "http"
	if c.SSL {
		scheme = "https"
	}
	host := c.Host
	if host == "0.0.0.0" || host == "" {
		host = "localhost"
	}
	return fmt.Sprintf("%s://%s:%d", scheme, host, c.Port)
}

type DatabaseConfig struct {
	Path string `json:"path"`
}

type AuthConfig struct {
	JWTSecret       string `json:"jwt_secret"`
	AccessTokenTTL  int    `json:"access_token_ttl"`
	RefreshTokenTTL int    `json:"refresh_token_ttl"`
	BcryptCost      int    `json:"bcrypt_cost"`
}

type PathsConfig struct {
	Base    string `json:"base"`
	Backup  string `json:"backup"`
	Logs    string `json:"logs"`
	WWWRoot string `json:"wwwroot"`
	Vhost   string `json:"vhost"`
}

type PanelConfig struct {
	Name           string `json:"name"`
	Language       string `json:"language"`
	AdminPath      string `json:"admin_path"`
	SetupCompleted bool   `json:"setup_completed"`
	Version        string `json:"version"`
}

var (
	globalConfig *Config
	mu           sync.RWMutex
)

// defaults returns a Config populated with sane default values.
func defaults() *Config {
	return &Config{
		Server: ServerConfig{
			Host: "0.0.0.0",
			Port: 8888,
		},
		Database: DatabaseConfig{
			Path: "data/panel.db",
		},
		Auth: AuthConfig{
			AccessTokenTTL:  900,
			RefreshTokenTTL: 604800,
			BcryptCost:      12,
		},
		Paths: PathsConfig{
			Base:    "/ITDLUPanel",
			Backup:  "/ITDLUPanel/backup",
			Logs:    "/ITDLUPanel/logs",
			WWWRoot: "/ITDLUPanel/wwwroot",
			Vhost:   "/ITDLUPanel/server/vhost",
		},
		Panel: PanelConfig{
			Name:      "ITDLUPanel",
			Language:  "en",
			AdminPath: "/",
		},
	}
}

// Load reads the config from configPath. If the file does not exist, it
// creates one with default values and an auto-generated JWT secret.
func Load(configPath string) (*Config, error) {
	cfg := defaults()
	cfg.filePath = configPath

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			if err := cfg.ensureJWTSecret(); err != nil {
				return nil, err
			}
			if err := cfg.saveToFile(); err != nil {
				return nil, err
			}
			mu.Lock()
			globalConfig = cfg
			mu.Unlock()
			return cfg, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	if err := cfg.ensureJWTSecret(); err != nil {
		return nil, err
	}

	mu.Lock()
	globalConfig = cfg
	mu.Unlock()

	return cfg, nil
}

// Save persists the current global config to its file path.
func (c *Config) Save() error {
	mu.RLock()
	defer mu.RUnlock()
	return c.saveToFile()
}

// Get returns the global config instance. It panics if Load has not been called.
func Get() *Config {
	mu.RLock()
	defer mu.RUnlock()
	if globalConfig == nil {
		panic("config: Load() must be called before Get()")
	}
	return globalConfig
}

// GetConfigPath returns the absolute path to the loaded config file.
func (c *Config) GetConfigPath() string {
	if filepath.IsAbs(c.filePath) {
		return c.filePath
	}
	abs, err := filepath.Abs(c.filePath)
	if err != nil {
		return c.filePath
	}
	return abs
}

func (c *Config) ensureJWTSecret() error {
	if c.Auth.JWTSecret == "" {
		secret, err := crypto.GenerateJWTSecret()
		if err != nil {
			return err
		}
		c.Auth.JWTSecret = secret
	}
	return nil
}

func (c *Config) saveToFile() error {
	dir := filepath.Dir(c.filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(c.filePath, data, 0600)
}
