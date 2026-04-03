package service

import (
	"database/sql"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/database/models"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// PanelInfo holds runtime information about the panel.
type PanelInfo struct {
	Version    string `json:"version"`
	Uptime     string `json:"uptime"`
	OS         string `json:"os"`
	GoVersion  string `json:"go_version"`
	StartedAt  string `json:"started_at"`
	Port       int    `json:"port"`
	SSLEnabled bool   `json:"ssl_enabled"`
	AdminPath  string `json:"admin_path"`
	BinaryPath string `json:"binary_path"`
	ConfigPath string `json:"config_path"`
}

var panelStartedAt = time.Now()

// SettingsService manages panel settings.
type SettingsService struct {
	db       *sql.DB
	settings *models.SettingRepository
}

// NewSettingsService creates a new SettingsService.
func NewSettingsService(db *sql.DB) *SettingsService {
	return &SettingsService{
		db:       db,
		settings: models.NewSettingRepository(db),
	}
}

// GetAll returns all settings as a key-value map.
func (s *SettingsService) GetAll() (map[string]string, error) {
	all, err := s.settings.GetAll()
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get settings")
	}

	result := make(map[string]string, len(all))
	for _, setting := range all {
		result[setting.Key] = setting.Value
	}
	return result, nil
}

// Get returns a single setting value by key.
func (s *SettingsService) Get(key string) (string, error) {
	val, err := s.settings.Get(key)
	if err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrNotFound, "setting not found")
	}
	return val, nil
}

// Set creates or updates a single setting.
func (s *SettingsService) Set(key, value string) error {
	if err := s.settings.Set(key, value); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save setting")
	}
	return nil
}

// SetMultiple creates or updates multiple settings at once.
func (s *SettingsService) SetMultiple(settings map[string]string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to begin transaction")
	}
	defer tx.Rollback() //nolint:errcheck

	stmt, err := tx.Prepare(
		`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to prepare statement")
	}
	defer stmt.Close()

	for k, v := range settings {
		if _, err := stmt.Exec(k, v); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, fmt.Sprintf("failed to set %q", k))
		}
	}

	if err := tx.Commit(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to commit settings")
	}
	return nil
}

// ChangePanelPort updates the panel port setting and config.
func (s *SettingsService) ChangePanelPort(newPort int) error {
	if newPort < 1 || newPort > 65535 {
		return apperrors.New(apperrors.ErrValidation, "port must be between 1 and 65535")
	}

	if err := s.settings.Set("panel_port", strconv.Itoa(newPort)); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update port setting")
	}

	cfg := config.Get()
	cfg.Server.Port = newPort
	if err := cfg.Save(); err != nil {
		logger.Error().Err(err).Msg("failed to persist port change to config file")
	}

	logger.Info().Int("port", newPort).Msg("panel port updated")
	return nil
}

// ConfigurePanelSSL enables or disables SSL for the panel.
func (s *SettingsService) ConfigurePanelSSL(enable bool) error {
	val := "0"
	if enable {
		val = "1"
	}

	if err := s.settings.Set("panel_ssl", val); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update SSL setting")
	}

	cfg := config.Get()
	cfg.Server.SSL = enable
	if err := cfg.Save(); err != nil {
		logger.Error().Err(err).Msg("failed to persist SSL change to config file")
	}

	logger.Info().Bool("ssl", enable).Msg("panel SSL setting updated")
	return nil
}

// GetPanelInfo returns runtime information about the panel.
func (s *SettingsService) GetPanelInfo() (*PanelInfo, error) {
	cfg := config.Get()

	uptime := time.Since(panelStartedAt).Round(time.Second)

	binaryPath, _ := os.Executable()

	return &PanelInfo{
		Version:    cfg.Panel.Version,
		Uptime:     uptime.String(),
		OS:         fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
		GoVersion:  runtime.Version(),
		StartedAt:  panelStartedAt.Format(time.RFC3339),
		Port:       cfg.Server.Port,
		SSLEnabled: cfg.Server.SSL,
		AdminPath:  cfg.Panel.AdminPath,
		BinaryPath: binaryPath,
		ConfigPath: cfg.GetConfigPath(),
	}, nil
}

// SetAdminPath validates and updates the custom admin URL path.
func (s *SettingsService) SetAdminPath(path string) error {
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") {
		return apperrors.New(apperrors.ErrValidation, "admin path must start with /")
	}
	// Disallow common dangerous patterns
	if strings.Contains(path, "..") || strings.Contains(path, " ") {
		return apperrors.New(apperrors.ErrValidation, "admin path contains invalid characters")
	}

	if err := s.settings.Set("admin_path", path); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update admin path")
	}

	cfg := config.Get()
	cfg.Panel.AdminPath = path
	if err := cfg.Save(); err != nil {
		logger.Error().Err(err).Msg("failed to persist admin path to config file")
	}

	logger.Info().Str("path", path).Msg("admin path updated")
	return nil
}

// SetLanguage updates the panel language setting.
func (s *SettingsService) SetLanguage(lang string) error {
	supported := map[string]bool{"en": true, "vi": true}
	if !supported[lang] {
		return apperrors.New(apperrors.ErrValidation, "unsupported language; supported: en, vi")
	}

	if err := s.settings.Set("panel_language", lang); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update language setting")
	}

	cfg := config.Get()
	cfg.Panel.Language = lang
	if err := cfg.Save(); err != nil {
		logger.Error().Err(err).Msg("failed to persist language to config file")
	}

	logger.Info().Str("lang", lang).Msg("panel language updated")
	return nil
}
