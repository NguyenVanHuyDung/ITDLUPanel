package service

import (
	"database/sql"
	"fmt"
	"net"
	"net/http"
	"os"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/database/models"
	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
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
	PanelName  string `json:"panel_name"`
}

// ServerInfo holds server network information.
type ServerInfo struct {
	Hostname  string   `json:"hostname"`
	LocalIPs  []string `json:"local_ips"`
	PublicIP  string   `json:"public_ip"`
	OS        string   `json:"os"`
	Arch      string   `json:"arch"`
	GoVersion string   `json:"go_version"`
}

var PanelStartedAt = time.Now()

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

	uptime := time.Since(PanelStartedAt).Round(time.Second)

	binaryPath, _ := os.Executable()

	panelName, _ := s.Get("panel_name")
	if panelName == "" {
		panelName = cfg.Panel.Name
	}

	return &PanelInfo{
		Version:    cfg.Panel.Version,
		Uptime:     uptime.String(),
		OS:         fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
		GoVersion:  runtime.Version(),
		StartedAt:  PanelStartedAt.Format(time.RFC3339),
		Port:       cfg.Server.Port,
		SSLEnabled: cfg.Server.SSL,
		AdminPath:  cfg.Panel.AdminPath,
		BinaryPath: binaryPath,
		ConfigPath: cfg.GetConfigPath(),
		PanelName:  panelName,
	}, nil
}

// SetAdminPath validates and updates the custom admin URL path.
var validAdminPathRe = regexp.MustCompile(`^/[a-zA-Z0-9._~\-/]*$`)

func (s *SettingsService) SetAdminPath(path string) error {
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") {
		return apperrors.New(apperrors.ErrValidation, "admin path must start with /")
	}
	if path != "/" && !validAdminPathRe.MatchString(path) {
		return apperrors.New(apperrors.ErrValidation, "admin path may only contain letters, digits, hyphens, underscores, dots, and slashes")
	}
	if strings.Contains(path, "..") {
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

// GetServerInfo returns server network and system information.
func (s *SettingsService) GetServerInfo() (*ServerInfo, error) {
	hostname, _ := os.Hostname()

	localIPs := getLocalIPs()
	publicIP := getPublicIP()

	return &ServerInfo{
		Hostname:  hostname,
		LocalIPs:  localIPs,
		PublicIP:   publicIP,
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
		GoVersion: runtime.Version(),
	}, nil
}

// SetPanelName updates the panel display name.
var htmlTagRe = regexp.MustCompile(`<[^>]*>`)

func (s *SettingsService) SetPanelName(name string) (string, error) {
	name = strings.TrimSpace(name)
	name = htmlTagRe.ReplaceAllString(name, "")
	if name == "" {
		return "", apperrors.New(apperrors.ErrValidation, "panel name cannot be empty")
	}
	if len(name) > 100 {
		return "", apperrors.New(apperrors.ErrValidation, "panel name must be 100 characters or less")
	}

	if err := s.settings.Set("panel_name", name); err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to update panel name")
	}

	cfg := config.Get()
	cfg.Panel.Name = name
	if err := cfg.Save(); err != nil {
		logger.Error().Err(err).Msg("failed to persist panel name to config file")
	}

	logger.Info().Str("name", name).Msg("panel name updated")
	return name, nil
}

// SetTimezone updates the server timezone setting and applies it to the process and system.
func (s *SettingsService) SetTimezone(tz string) error {
	tz = strings.TrimSpace(tz)
	if tz == "" {
		return apperrors.New(apperrors.ErrValidation, "timezone cannot be empty")
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("invalid timezone: %s", tz))
	}

	if err := s.settings.Set("timezone", tz); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update timezone")
	}

	// Apply timezone to the process
	time.Local = loc
	os.Setenv("TZ", tz)

	// Apply timezone to the OS via timedatectl
	if _, err := system.ExecWithTimeout(10*time.Second, "timedatectl", "set-timezone", tz); err != nil {
		logger.Warn().Str("timezone", tz).Err(err).Msg("failed to set system timezone via timedatectl")
	}

	logger.Info().Str("timezone", tz).Msg("timezone updated and applied")
	return nil
}

// ApplyTimezone loads the timezone setting from the database and sets it as the process and system timezone.
func (s *SettingsService) ApplyTimezone() {
	tz, err := s.settings.Get("timezone")
	if err != nil || tz == "" {
		tz = "UTC"
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		logger.Warn().Str("timezone", tz).Err(err).Msg("invalid timezone setting, falling back to UTC")
		loc = time.UTC
		tz = "UTC"
	}
	time.Local = loc
	os.Setenv("TZ", tz)

	// Sync system timezone on startup
	if _, err := system.ExecWithTimeout(10*time.Second, "timedatectl", "set-timezone", tz); err != nil {
		logger.Warn().Str("timezone", tz).Err(err).Msg("failed to set system timezone via timedatectl")
	}

	logger.Info().Str("timezone", tz).Msg("timezone applied")
}

// SetSessionTimeout updates the session timeout setting.
func (s *SettingsService) SetSessionTimeout(seconds int) error {
	if seconds < 300 {
		return apperrors.New(apperrors.ErrValidation, "session timeout must be at least 300 seconds (5 minutes)")
	}
	if seconds > 604800 {
		return apperrors.New(apperrors.ErrValidation, "session timeout must be at most 604800 seconds (7 days)")
	}

	if err := s.settings.Set("session_timeout", strconv.Itoa(seconds)); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update session timeout")
	}

	logger.Info().Int("seconds", seconds).Msg("session timeout updated")
	return nil
}

// getLocalIPs returns all non-loopback IPv4 addresses.
func getLocalIPs() []string {
	var ips []string
	ifaces, err := net.Interfaces()
	if err != nil {
		return ips
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			if ip4 := ip.To4(); ip4 != nil {
				ips = append(ips, ip4.String())
			}
		}
	}
	return ips
}

// getPublicIP fetches the server's public IP address.
func getPublicIP() string {
	services := []string{
		"https://api.ipify.org",
		"https://ifconfig.me/ip",
		"https://icanhazip.com",
	}

	client := &http.Client{Timeout: 3 * time.Second}
	for _, svc := range services {
		resp, err := client.Get(svc)
		if err != nil {
			continue
		}
		defer resp.Body.Close()

		var buf [64]byte
		n, _ := resp.Body.Read(buf[:])
		if n > 0 {
			ip := strings.TrimSpace(string(buf[:n]))
			if parsed := net.ParseIP(ip); parsed != nil {
				return ip
			}
		}
	}
	return ""
}

// getTimezones returns a list of common timezone names (for validation/display).
func getTimezones() []string {
	raw, err := os.ReadFile("/usr/share/zoneinfo/zone.tab")
	if err != nil {
		return []string{"UTC", "Asia/Ho_Chi_Minh", "Asia/Tokyo", "US/Eastern", "US/Pacific", "Europe/London"}
	}
	var zones []string
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) >= 3 {
			zones = append(zones, parts[2])
		}
	}
	if len(zones) == 0 {
		return []string{"UTC"}
	}
	return zones
}

// GetTimezones returns available timezones (exported for API use).
func (s *SettingsService) GetTimezones() []string {
	return getTimezones()
}

// GetFormattedSettings returns settings formatted for the frontend.
func (s *SettingsService) GetFormattedSettings() (map[string]interface{}, error) {
	all, err := s.settings.GetAll()
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get settings")
	}

	result := make(map[string]interface{}, len(all))
	for _, setting := range all {
		// Convert numeric values
		switch setting.Key {
		case "panel_port", "session_timeout":
			if v, err := strconv.Atoi(setting.Value); err == nil {
				result[setting.Key] = v
			} else {
				result[setting.Key] = setting.Value
			}
		case "panel_ssl", "setup_completed":
			result[setting.Key] = setting.Value == "1"
		default:
			result[setting.Key] = setting.Value
		}
	}
	return result, nil
}
