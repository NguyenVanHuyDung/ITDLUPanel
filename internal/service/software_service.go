package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/service/installer"
	"github.com/ITDLUPanel/panel/internal/system"
	"github.com/ITDLUPanel/panel/internal/task"
)

// softwareMeta holds metadata about a known software package.
type softwareMeta struct {
	DisplayName    string
	Type           string // webserver, database, runtime, cache, ftp, etc.
	ServiceName    string
	ConfigPath     string
	InstallPath    string
	DefaultVersion string
}

// knownSoftware maps installer names to their metadata.
var knownSoftware = map[string]softwareMeta{
	"nginx": {
		DisplayName:    "Nginx",
		Type:           "webserver",
		ServiceName:    "nginx",
		ConfigPath:     "/ITDLUPanel/server/nginx/conf/nginx.conf",
		InstallPath:    "/ITDLUPanel/server/nginx",
		DefaultVersion: "stable",
	},
	"apache": {
		DisplayName:    "Apache",
		Type:           "webserver",
		ServiceName:    "apache2",
		ConfigPath:     "/ITDLUPanel/server/apache/conf/apache2.conf",
		InstallPath:    "/ITDLUPanel/server/apache",
		DefaultVersion: "2.4",
	},
	"mysql": {
		DisplayName:    "MySQL/MariaDB",
		Type:           "database",
		ServiceName:    "mysql",
		ConfigPath:     "/ITDLUPanel/server/mysql/conf/my.cnf",
		InstallPath:    "/ITDLUPanel/server/mysql",
		DefaultVersion: "mysql-8.0",
	},
	"php": {
		DisplayName:    "PHP",
		Type:           "runtime",
		ServiceName:    "php8.2-fpm",
		ConfigPath:     "/ITDLUPanel/server/php/conf/php.ini",
		InstallPath:    "/ITDLUPanel/server/php",
		DefaultVersion: "8.2",
	},
	"redis": {
		DisplayName:    "Redis",
		Type:           "cache",
		ServiceName:    "redis-server",
		ConfigPath:     "/ITDLUPanel/server/redis/conf/redis.conf",
		InstallPath:    "/ITDLUPanel/server/redis",
		DefaultVersion: "stable",
	},
	"pureftpd": {
		DisplayName:    "Pure-FTPd",
		Type:           "ftp",
		ServiceName:    "pure-ftpd",
		ConfigPath:     "/ITDLUPanel/server/pureftpd/conf/pure-ftpd.conf",
		InstallPath:    "/ITDLUPanel/server/pureftpd",
		DefaultVersion: "stable",
	},
	"openlitespeed": {
		DisplayName:    "OpenLiteSpeed",
		Type:           "webserver",
		ServiceName:    "lsws",
		ConfigPath:     "/ITDLUPanel/server/openlitespeed/conf/httpd_config.conf",
		InstallPath:    "/ITDLUPanel/server/openlitespeed",
		DefaultVersion: "stable",
	},
	"phpmyadmin": {
		DisplayName:    "phpMyAdmin",
		Type:           "tool",
		ServiceName:    "",
		ConfigPath:     "/ITDLUPanel/server/phpmyadmin/www/config.inc.php",
		InstallPath:    "/ITDLUPanel/server/phpmyadmin",
		DefaultVersion: "5.2.1",
	},
}

func init() {
	// Adjust metadata based on the detected OS.
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		m := knownSoftware["apache"]
		m.ServiceName = "httpd"
		m.ConfigPath = "/ITDLUPanel/server/apache/conf/httpd.conf"
		m.InstallPath = "/ITDLUPanel/server/apache"
		knownSoftware["apache"] = m

		m2 := knownSoftware["redis"]
		m2.ServiceName = "redis"
		m2.ConfigPath = "/ITDLUPanel/server/redis/conf/redis.conf"
		knownSoftware["redis"] = m2

		m3 := knownSoftware["mysql"]
		m3.ServiceName = "mysqld"
		m3.ConfigPath = "/ITDLUPanel/server/mysql/conf/my.cnf"
		m3.InstallPath = "/ITDLUPanel/server/mysql"
		knownSoftware["mysql"] = m3
	}
}

// SoftwareInfo represents a software record from the database.
type SoftwareInfo struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Version     string `json:"version"`
	Type        string `json:"type"`
	Status      int    `json:"status"`
	ConfigPath  string `json:"config_path,omitempty"`
	InstallPath string `json:"install_path,omitempty"`
	ServiceName string `json:"service_name,omitempty"`
	InstalledAt string `json:"installed_at,omitempty"`
	UpdatedAt   string `json:"updated_at,omitempty"`
}

// SoftwareListItem extends SoftwareInfo with live service status.
type SoftwareListItem struct {
	SoftwareInfo
	IsRunning bool `json:"is_running"`
}

// AvailableSoftware describes software that can be installed.
type AvailableSoftware struct {
	Name        string   `json:"name"`
	DisplayName string   `json:"display_name"`
	Type        string   `json:"type"`
	Installed   bool     `json:"installed"`
	Versions    []string `json:"versions"`
}

// SoftwareService manages software installation, removal, and service control.
type SoftwareService struct {
	db              *sql.DB
	queue           *task.Queue
	registry        *installer.Registry
	firewallService *FirewallService
	onNginxVersionChanged func() // called after nginx version switch to regenerate vhosts
}

// SetOnNginxVersionChanged sets a callback invoked after nginx version switch.
func (s *SoftwareService) SetOnNginxVersionChanged(fn func()) {
	s.onNginxVersionChanged = fn
}

// NewSoftwareService creates a new SoftwareService.
func NewSoftwareService(db *sql.DB, queue *task.Queue, registry *installer.Registry, firewallSvc *FirewallService) *SoftwareService {
	svc := &SoftwareService{
		db:              db,
		queue:           queue,
		registry:        registry,
		firewallService: firewallSvc,
	}
	svc.registerTaskHandlers()
	return svc
}

// registerTaskHandlers registers the install/uninstall task handlers with the queue.
func (s *SoftwareService) registerTaskHandlers() {
	s.queue.RegisterHandler("software_install", func(ctx context.Context, t *task.TaskInfo, progress func(int, string)) error {
		parts := strings.SplitN(t.Name, ":", 2)
		name := parts[0]
		version := ""
		if len(parts) > 1 {
			version = parts[1]
		}

		inst, ok := s.registry.Get(name)
		if !ok {
			return fmt.Errorf("unknown software: %s", name)
		}

		progress(0, fmt.Sprintf("Starting installation of %s", name))

		if err := inst.Install(ctx, version, func(pct int) {
			progress(pct, fmt.Sprintf("Installing %s... %d%%", name, pct))
		}); err != nil {
			return err
		}

		// Record in database
		meta := knownSoftware[name]
		if version == "" {
			version = meta.DefaultVersion
		}
		if _, err := s.db.Exec(
			`INSERT OR REPLACE INTO software (name, display_name, version, type, status, config_path, install_path, service_name, installed_at, updated_at)
			 VALUES (?, ?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			name, meta.DisplayName, version, meta.Type, meta.ConfigPath, meta.InstallPath, meta.ServiceName,
		); err != nil {
			logger.Error().Err(err).Str("software", name).Msg("failed to record software installation in DB")
		}

		progress(100, fmt.Sprintf("%s installed successfully", name))

		// Auto-open firewall ports for this software
		if s.firewallService != nil {
			s.firewallService.OpenPortsForSoftware(name)
		}

		// Regenerate vhost configs after nginx version switch
		if name == "nginx" && s.onNginxVersionChanged != nil {
			s.onNginxVersionChanged()
		}

		return nil
	})

	s.queue.RegisterHandler("software_uninstall", func(ctx context.Context, t *task.TaskInfo, progress func(int, string)) error {
		name := t.Name

		inst, ok := s.registry.Get(name)
		if !ok {
			return fmt.Errorf("unknown software: %s", name)
		}

		progress(0, fmt.Sprintf("Starting uninstallation of %s", name))

		if err := inst.Uninstall(ctx); err != nil {
			return err
		}

		// Remove from database
		if _, err := s.db.Exec("DELETE FROM software WHERE name = ?", name); err != nil {
			logger.Error().Err(err).Str("software", name).Msg("failed to remove software record from DB")
		}

		progress(100, fmt.Sprintf("%s uninstalled successfully", name))

		// Auto-close firewall ports for this software
		if s.firewallService != nil {
			s.firewallService.ClosePortsForSoftware(name)
		}

		return nil
	})

	// Extension install handler: Name format "php-8.3:fileinfo" or "php-8.3:fileinfo,mbstring"
	s.queue.RegisterHandler("extension_install", func(ctx context.Context, t *task.TaskInfo, progress func(int, string)) error {
		software, extStr, err := parseExtensionTaskName(t.Name)
		if err != nil {
			return err
		}

		inst, ok := s.registry.Get(software)
		if !ok {
			return fmt.Errorf("unknown software: %s", software)
		}

		exts := strings.Split(extStr, ",")
		progress(0, fmt.Sprintf("Installing extensions [%s] for %s", extStr, software))

		// Currently only PHP supports extensions
		if phpInst, ok := inst.(*installer.PHPInstaller); ok {
			// Extract version from software name (e.g., "php-8.3" → "8.3")
			version := strings.TrimPrefix(software, "php-")
			if version == software {
				version = "8.2" // default
			}
			if err := phpInst.InstallExtensions(ctx, version, exts); err != nil {
				return err
			}
		} else {
			return fmt.Errorf("software %s does not support extensions", software)
		}

		progress(100, fmt.Sprintf("Extensions [%s] installed successfully", extStr))
		return nil
	})

	// Extension uninstall handler: Name format "php-8.3:fileinfo" or "php-8.3:fileinfo,mbstring"
	s.queue.RegisterHandler("extension_uninstall", func(ctx context.Context, t *task.TaskInfo, progress func(int, string)) error {
		software, extStr, err := parseExtensionTaskName(t.Name)
		if err != nil {
			return err
		}

		exts := strings.Split(extStr, ",")
		progress(0, fmt.Sprintf("Removing extensions [%s] from %s", extStr, software))

		osInfo := system.GetOSInfo()
		version := strings.TrimPrefix(software, "php-")
		if version == software {
			version = "8.2"
		}

		packages := make([]string, 0, len(exts))
		for _, ext := range exts {
			ext = strings.TrimSpace(ext)
			if ext == "" {
				continue
			}
			if osInfo.PkgManager == "apt" {
				packages = append(packages, fmt.Sprintf("php%s-%s", version, ext))
			} else {
				packages = append(packages, fmt.Sprintf("php%s-php-%s", version, ext))
			}
		}

		if len(packages) == 0 {
			return fmt.Errorf("no extensions specified")
		}

		args := append([]string{"remove", "-y"}, packages...)
		if _, execErr := system.Exec(ctx, osInfo.PkgManager, args...); execErr != nil {
			return fmt.Errorf("failed to remove extensions: %w", execErr)
		}

		progress(100, fmt.Sprintf("Extensions [%s] removed successfully", extStr))
		return nil
	})
}

// ListInstalled returns all software recorded in the database with live status.
func (s *SoftwareService) ListInstalled() ([]SoftwareListItem, error) {
	rows, err := s.db.Query(
		"SELECT id, name, display_name, version, type, status, COALESCE(config_path,''), COALESCE(install_path,''), COALESCE(service_name,''), COALESCE(installed_at,''), COALESCE(updated_at,'') FROM software ORDER BY name",
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list software: %w", err)
	}
	defer rows.Close()

	var items []SoftwareListItem
	for rows.Next() {
		var info SoftwareInfo
		if err := rows.Scan(&info.ID, &info.Name, &info.DisplayName, &info.Version,
			&info.Type, &info.Status, &info.ConfigPath, &info.InstallPath,
			&info.ServiceName, &info.InstalledAt, &info.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan software row: %w", err)
		}
		item := SoftwareListItem{SoftwareInfo: info}
		if info.ServiceName != "" {
			item.IsRunning = s.isServiceRunning(info.ServiceName)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// ListAvailable returns all software known to the registry with install status.
func (s *SoftwareService) ListAvailable() []AvailableSoftware {
	names := s.registry.List()
	result := make([]AvailableSoftware, 0, len(names))
	for _, name := range names {
		inst, _ := s.registry.Get(name)
		meta := knownSoftware[name]
		result = append(result, AvailableSoftware{
			Name:        name,
			DisplayName: meta.DisplayName,
			Type:        meta.Type,
			Installed:   inst.IsInstalled(),
			Versions:    inst.GetVersions(),
		})
	}
	return result
}

// GetSoftwareInfo returns info about a specific software from the database.
func (s *SoftwareService) GetSoftwareInfo(name string) (*SoftwareListItem, error) {
	var info SoftwareInfo
	err := s.db.QueryRow(
		"SELECT id, name, display_name, version, type, status, COALESCE(config_path,''), COALESCE(install_path,''), COALESCE(service_name,''), COALESCE(installed_at,''), COALESCE(updated_at,'') FROM software WHERE name = ?",
		name,
	).Scan(&info.ID, &info.Name, &info.DisplayName, &info.Version,
		&info.Type, &info.Status, &info.ConfigPath, &info.InstallPath,
		&info.ServiceName, &info.InstalledAt, &info.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("software %s not found: %w", name, err)
	}
	item := &SoftwareListItem{SoftwareInfo: info}
	if info.ServiceName != "" {
		item.IsRunning = s.isServiceRunning(info.ServiceName)
	}
	return item, nil
}

// InstallSoftware enqueues a background install task. Returns the task ID.
func (s *SoftwareService) InstallSoftware(name, version string, createdBy int64) (int64, error) {
	if _, ok := s.registry.Get(name); !ok {
		return 0, fmt.Errorf("unknown software: %s", name)
	}

	taskName := name
	if version != "" {
		taskName = name + ":" + version
	}

	return s.queue.Enqueue("software_install", taskName, createdBy)
}

// UninstallSoftware enqueues a background uninstall task. Returns the task ID.
func (s *SoftwareService) UninstallSoftware(name string, createdBy int64) (int64, error) {
	if _, ok := s.registry.Get(name); !ok {
		return 0, fmt.Errorf("unknown software: %s", name)
	}
	return s.queue.Enqueue("software_uninstall", name, createdBy)
}

// InstallExtension enqueues a background extension install task.
// software: base software name (e.g., "php"), version: e.g., "8.3", extensions: e.g., ["fileinfo","mbstring"]
func (s *SoftwareService) InstallExtension(software, version string, extensions []string, createdBy int64) (int64, error) {
	taskName := fmt.Sprintf("php-%s:%s", version, strings.Join(extensions, ","))
	return s.queue.Enqueue("extension_install", taskName, createdBy)
}

// UninstallExtension enqueues a background extension uninstall task.
func (s *SoftwareService) UninstallExtension(software, version string, extensions []string, createdBy int64) (int64, error) {
	taskName := fmt.Sprintf("php-%s:%s", version, strings.Join(extensions, ","))
	return s.queue.Enqueue("extension_uninstall", taskName, createdBy)
}

// GetInstaller returns the installer for the given software name.
func (s *SoftwareService) GetInstaller(name string) (installer.Installer, bool) {
	return s.registry.Get(name)
}

// phpConfBase is the base directory for PHP configuration files managed by the panel.
// It symlinks to /etc/php so both paths resolve identically.
const phpConfBase = "/ITDLUPanel/server/php/conf"

// phpFPMIni returns the path to the FPM php.ini for the given version.
func phpFPMIni(version string) string {
	return fmt.Sprintf("%s/%s/fpm/php.ini", phpConfBase, version)
}

// phpCLIIni returns the path to the CLI php.ini for the given version.
func phpCLIIni(version string) string {
	return fmt.Sprintf("%s/%s/cli/php.ini", phpConfBase, version)
}

// phpFPMPoolConf returns the path to the FPM www.conf pool config.
func phpFPMPoolConf(version string) string {
	return fmt.Sprintf("%s/%s/fpm/pool.d/www.conf", phpConfBase, version)
}

// PHPConfig represents configurable PHP settings.
type PHPConfig struct {
	UploadMaxFilesize string `json:"upload_max_filesize"`
	PostMaxSize       string `json:"post_max_size"`
	MaxExecutionTime  string `json:"max_execution_time"`
	MaxInputTime      string `json:"max_input_time"`
	MemoryLimit       string `json:"memory_limit"`
	MaxInputVars      string `json:"max_input_vars"`
}

// GetPHPConfig reads PHP config values from php.ini for the given version.
func (s *SoftwareService) GetPHPConfig(version string) (*PHPConfig, error) {
	iniPath := phpFPMIni(version)
	if _, err := os.Stat(iniPath); err != nil {
		return nil, fmt.Errorf("php.ini not found for PHP %s: %w", version, err)
	}

	cfg := &PHPConfig{
		UploadMaxFilesize: readPHPIniValue(iniPath, "upload_max_filesize"),
		PostMaxSize:       readPHPIniValue(iniPath, "post_max_size"),
		MaxExecutionTime:  readPHPIniValue(iniPath, "max_execution_time"),
		MaxInputTime:      readPHPIniValue(iniPath, "max_input_time"),
		MemoryLimit:       readPHPIniValue(iniPath, "memory_limit"),
		MaxInputVars:      readPHPIniValue(iniPath, "max_input_vars"),
	}
	return cfg, nil
}

// SetPHPConfig updates PHP config values in php.ini and restarts php-fpm.
func (s *SoftwareService) SetPHPConfig(version string, cfg PHPConfig) error {
	iniPaths := []string{
		phpFPMIni(version),
		phpCLIIni(version),
	}

	settings := map[string]string{
		"upload_max_filesize": cfg.UploadMaxFilesize,
		"post_max_size":       cfg.PostMaxSize,
		"max_execution_time":  cfg.MaxExecutionTime,
		"max_input_time":      cfg.MaxInputTime,
		"memory_limit":        cfg.MemoryLimit,
		"max_input_vars":      cfg.MaxInputVars,
	}

	for _, iniPath := range iniPaths {
		if _, err := os.Stat(iniPath); err != nil {
			continue
		}
		for key, value := range settings {
			if value == "" {
				continue
			}
			if err := setPHPIniValue(iniPath, key, value); err != nil {
				return fmt.Errorf("failed to set %s in %s: %w", key, iniPath, err)
			}
		}
	}

	svcName := fmt.Sprintf("php%s-fpm", version)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", svcName); err != nil {
		logger.Warn().Err(err).Str("service", svcName).Msg("failed to restart php-fpm after config change")
	}

	return nil
}

func readPHPIniValue(filePath, key string) string {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, key+" ") || strings.HasPrefix(line, key+"=") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return ""
}

func setPHPIniValue(filePath, key, value string) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}

	lines := strings.Split(string(data), "\n")
	found := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, key+" ") || strings.HasPrefix(trimmed, key+"=") ||
			strings.HasPrefix(trimmed, ";"+key+" ") || strings.HasPrefix(trimmed, ";"+key+"=") ||
			strings.HasPrefix(trimmed, "; "+key+" ") || strings.HasPrefix(trimmed, "; "+key+"=") {
			lines[i] = key + " = " + value
			found = true
			break
		}
	}
	if !found {
		lines = append(lines, key+" = "+value)
	}
	return os.WriteFile(filePath, []byte(strings.Join(lines, "\n")), 0644)
}

// parseExtensionTaskName parses "php-8.3:fileinfo,mbstring" into ("php", "fileinfo,mbstring").
func parseExtensionTaskName(name string) (software, extensions string, err error) {
	parts := strings.SplitN(name, ":", 2)
	if len(parts) != 2 || parts[1] == "" {
		return "", "", fmt.Errorf("invalid extension task name: %s (expected format: software-version:ext1,ext2)", name)
	}
	return parts[0], parts[1], nil
}

// ---------------------------------------------------------------------------
// PHP disable_functions management
// ---------------------------------------------------------------------------

// defaultDisableFunctions is the recommended set of dangerous PHP functions to disable.
var defaultDisableFunctions = []string{
	"exec", "passthru", "shell_exec", "system", "proc_open", "popen",
	"curl_exec", "curl_multi_exec", "parse_ini_file", "show_source",
	"proc_close", "proc_get_status", "proc_nice", "proc_terminate",
	"dl", "putenv", "phpinfo", "pcntl_exec", "pcntl_fork",
	"pcntl_signal", "pcntl_waitpid", "pcntl_wexitstatus", "pcntl_setpriority",
	"pcntl_sigprocmask", "pcntl_alarm", "chown", "chgrp", "apache_child_terminate",
	"posix_kill", "posix_mkfifo", "posix_setpgid", "posix_setsid", "posix_setuid",
	"escapeshellcmd", "escapeshellarg",
}

// GetPHPDisableFunctions reads the disable_functions list from php.ini.
// If no functions are disabled, it auto-applies the default dangerous functions list.
func (s *SoftwareService) GetPHPDisableFunctions(version string) ([]string, error) {
	iniPath := phpFPMIni(version)
	raw := readPHPIniValue(iniPath, "disable_functions")
	if raw == "" {
		// Auto-apply default dangerous functions
		if err := s.SetPHPDisableFunctions(version, defaultDisableFunctions); err != nil {
			return nil, fmt.Errorf("failed to apply default disable_functions: %w", err)
		}
		return defaultDisableFunctions, nil
	}
	var functions []string
	for _, f := range strings.Split(raw, ",") {
		f = strings.TrimSpace(f)
		if f != "" {
			functions = append(functions, f)
		}
	}
	return functions, nil
}

// SetPHPDisableFunctions writes the disable_functions list to php.ini and restarts FPM.
func (s *SoftwareService) SetPHPDisableFunctions(version string, functions []string) error {
	value := strings.Join(functions, ",")

	iniPaths := []string{
		phpFPMIni(version),
		phpCLIIni(version),
	}
	for _, iniPath := range iniPaths {
		if _, err := os.Stat(iniPath); err != nil {
			continue
		}
		if err := setPHPIniValue(iniPath, "disable_functions", value); err != nil {
			return fmt.Errorf("failed to set disable_functions in %s: %w", iniPath, err)
		}
	}

	svcName := fmt.Sprintf("php%s-fpm", version)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", svcName); err != nil {
		logger.Warn().Err(err).Str("service", svcName).Msg("failed to restart php-fpm after disable_functions change")
	}
	return nil
}

// ---------------------------------------------------------------------------
// PHP config file (raw php.ini)
// ---------------------------------------------------------------------------

// GetPHPConfigFile returns the raw content of php.ini for a PHP version.
func (s *SoftwareService) GetPHPConfigFile(version string) (string, error) {
	iniPath := phpFPMIni(version)
	data, err := os.ReadFile(iniPath)
	if err != nil {
		return "", fmt.Errorf("failed to read php.ini for PHP %s: %w", version, err)
	}
	return string(data), nil
}

// SetPHPConfigFile writes raw content to php.ini and restarts FPM.
func (s *SoftwareService) SetPHPConfigFile(version, content string) error {
	iniPath := phpFPMIni(version)
	if err := os.WriteFile(iniPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write php.ini: %w", err)
	}
	svcName := fmt.Sprintf("php%s-fpm", version)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", svcName); err != nil {
		logger.Warn().Err(err).Str("service", svcName).Msg("failed to restart php-fpm after config file change")
	}
	return nil
}

// ---------------------------------------------------------------------------
// PHP version-specific error log
// ---------------------------------------------------------------------------

// GetPHPErrorLog returns the last N lines of the PHP-FPM error log.
func (s *SoftwareService) GetPHPErrorLog(version string, lines int) (string, string, error) {
	if lines <= 0 {
		lines = 100
	}
	if lines > 1000 {
		lines = 1000
	}

	// Try common log paths
	candidates := []string{
		fmt.Sprintf("/var/log/php%s-fpm.log", version),
		fmt.Sprintf("/var/log/php-fpm/php%s-fpm.log", version),
		"/var/log/syslog",
	}

	for _, logPath := range candidates {
		if _, err := os.Stat(logPath); err == nil {
			res, err := system.ExecWithTimeout(10*time.Second, "tail", "-n", fmt.Sprintf("%d", lines), logPath)
			if err != nil {
				return "", logPath, fmt.Errorf("failed to read log: %w", err)
			}
			return res.Stdout, logPath, nil
		}
	}
	return "", "", fmt.Errorf("no PHP-FPM error log found for version %s", version)
}

// ---------------------------------------------------------------------------
// PHP-FPM pool configuration
// ---------------------------------------------------------------------------

// PHPFPMConfig represents configurable FPM pool settings.
type PHPFPMConfig struct {
	PM                   string `json:"pm"`
	MaxChildren          string `json:"max_children"`
	StartServers         string `json:"start_servers"`
	MinSpareServers      string `json:"min_spare_servers"`
	MaxSpareServers      string `json:"max_spare_servers"`
	MaxRequests          string `json:"max_requests"`
	RequestTermTimeout   string `json:"request_terminate_timeout"`
	RequestSlowlogTimeout string `json:"request_slowlog_timeout"`
	SlowlogPath          string `json:"slowlog"`
	ListenAddress        string `json:"listen"`
	User                 string `json:"user"`
	Group                string `json:"group"`
}

func phpFPMPoolPath(version string) string {
	return phpFPMPoolConf(version)
}

// GetPHPFPMConfig reads FPM pool settings from www.conf.
func (s *SoftwareService) GetPHPFPMConfig(version string) (*PHPFPMConfig, error) {
	poolPath := phpFPMPoolPath(version)
	data, err := os.ReadFile(poolPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read FPM pool config: %w", err)
	}
	content := string(data)

	cfg := &PHPFPMConfig{
		PM:                    readFPMValue(content, "pm"),
		MaxChildren:           readFPMValue(content, "pm.max_children"),
		StartServers:          readFPMValue(content, "pm.start_servers"),
		MinSpareServers:       readFPMValue(content, "pm.min_spare_servers"),
		MaxSpareServers:       readFPMValue(content, "pm.max_spare_servers"),
		MaxRequests:           readFPMValue(content, "pm.max_requests"),
		RequestTermTimeout:    readFPMValue(content, "request_terminate_timeout"),
		RequestSlowlogTimeout: readFPMValue(content, "request_slowlog_timeout"),
		SlowlogPath:           readFPMValue(content, "slowlog"),
		ListenAddress:         readFPMValue(content, "listen"),
		User:                  readFPMValue(content, "user"),
		Group:                 readFPMValue(content, "group"),
	}
	return cfg, nil
}

// SetPHPFPMConfig writes FPM pool settings and restarts FPM.
func (s *SoftwareService) SetPHPFPMConfig(version string, cfg PHPFPMConfig) error {
	poolPath := phpFPMPoolPath(version)
	data, err := os.ReadFile(poolPath)
	if err != nil {
		return fmt.Errorf("failed to read FPM pool config: %w", err)
	}

	content := string(data)
	settings := map[string]string{
		"pm":                        cfg.PM,
		"pm.max_children":           cfg.MaxChildren,
		"pm.start_servers":          cfg.StartServers,
		"pm.min_spare_servers":      cfg.MinSpareServers,
		"pm.max_spare_servers":      cfg.MaxSpareServers,
		"pm.max_requests":           cfg.MaxRequests,
		"request_terminate_timeout":  cfg.RequestTermTimeout,
		"request_slowlog_timeout":    cfg.RequestSlowlogTimeout,
		"slowlog":                    cfg.SlowlogPath,
		"listen":                     cfg.ListenAddress,
		"user":                       cfg.User,
		"group":                      cfg.Group,
	}

	for key, value := range settings {
		if value == "" {
			continue
		}
		content = setFPMValue(content, key, value)
	}

	if err := os.WriteFile(poolPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write FPM pool config: %w", err)
	}

	svcName := fmt.Sprintf("php%s-fpm", version)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", svcName); err != nil {
		logger.Warn().Err(err).Str("service", svcName).Msg("failed to restart php-fpm after pool config change")
	}
	return nil
}

// readFPMValue reads an uncommented value from FPM pool config.
func readFPMValue(content, key string) string {
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
			continue
		}
		// Match "key = value" with possible spaces
		if strings.HasPrefix(line, key+" ") || strings.HasPrefix(line, key+"=") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return ""
}

// setFPMValue sets a value in FPM pool config content, uncommenting if needed.
func setFPMValue(content, key, value string) string {
	lines := strings.Split(content, "\n")
	found := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		// Match active or commented-out directives
		if strings.HasPrefix(trimmed, key+" ") || strings.HasPrefix(trimmed, key+"=") ||
			strings.HasPrefix(trimmed, ";"+key+" ") || strings.HasPrefix(trimmed, ";"+key+"=") ||
			strings.HasPrefix(trimmed, "; "+key+" ") || strings.HasPrefix(trimmed, "; "+key+"=") {
			lines[i] = key + " = " + value
			found = true
			break
		}
	}
	if !found {
		// Insert before closing section or at end
		lines = append(lines, key+" = "+value)
	}
	return strings.Join(lines, "\n")
}

// StartService starts a systemd service.
func (s *SoftwareService) StartService(name string) error {
	svcName, err := s.resolveServiceName(name)
	if err != nil {
		return err
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "start", svcName); err != nil {
		return fmt.Errorf("failed to start %s: %w", svcName, err)
	}
	return nil
}

// StopService stops a systemd service.
func (s *SoftwareService) StopService(name string) error {
	svcName, err := s.resolveServiceName(name)
	if err != nil {
		return err
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "stop", svcName); err != nil {
		return fmt.Errorf("failed to stop %s: %w", svcName, err)
	}
	return nil
}

// RestartService restarts a systemd service.
func (s *SoftwareService) RestartService(name string) error {
	svcName, err := s.resolveServiceName(name)
	if err != nil {
		return err
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", svcName); err != nil {
		return fmt.Errorf("failed to restart %s: %w", svcName, err)
	}
	return nil
}

// GetServiceStatus returns the current status of a service.
func (s *SoftwareService) GetServiceStatus(name string) (map[string]interface{}, error) {
	svcName, err := s.resolveServiceName(name)
	if err != nil {
		return nil, err
	}

	result := map[string]interface{}{
		"name":       name,
		"service":    svcName,
		"is_running": s.isServiceRunning(svcName),
		"running":    s.isServiceRunning(svcName),
	}

	// Get version from binary
	if name == "nginx" {
		vRes, _ := system.ExecWithTimeout(5*time.Second, "nginx", "-v")
		if vRes != nil {
			// nginx -v outputs to stderr
			vStr := strings.TrimSpace(vRes.Stderr)
			if vStr == "" {
				vStr = strings.TrimSpace(vRes.Stdout)
			}
			if strings.Contains(vStr, "/") {
				parts := strings.SplitN(vStr, "/", 2)
				if len(parts) == 2 {
					ver := strings.TrimSpace(parts[1])
					// Strip parenthetical suffix like "(Ubuntu)"
					if idx := strings.Index(ver, " ("); idx > 0 {
						ver = ver[:idx]
					}
					result["version"] = ver
				}
			}
		}

		// Detect stable vs mainline
		vType := installer.DetectNginxVersionType()
		result["version_type"] = vType
		if ver, ok := result["version"].(string); ok && ver != "" {
			label := "Stable"
			if vType == "mainline" {
				label = "Mainline"
			}
			result["version_display"] = fmt.Sprintf("%s (%s)", ver, label)
		}
	}

	// Also try DB version
	var dbVersion string
	if err := s.db.QueryRow("SELECT version FROM software WHERE name = ?", name).Scan(&dbVersion); err == nil && dbVersion != "" {
		if _, exists := result["version"]; !exists {
			result["version"] = dbVersion
		}
	}

	// Get detailed status
	res, _ := system.ExecWithTimeout(10*time.Second, "systemctl", "show", svcName,
		"--property=ActiveState,SubState,MainPID,MemoryCurrent")
	if res != nil && res.Stdout != "" {
		for _, line := range strings.Split(strings.TrimSpace(res.Stdout), "\n") {
			k, v, ok := strings.Cut(line, "=")
			if ok {
				result[strings.ToLower(k)] = v
			}
		}
	}

	return result, nil
}

// GetConfig reads the main configuration file for the named software.
func (s *SoftwareService) GetConfig(name string) (string, error) {
	configPath, err := s.resolveConfigPath(name)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(configPath)
	if err != nil {
		return "", fmt.Errorf("failed to read config %s: %w", configPath, err)
	}
	return string(data), nil
}

// UpdateConfig writes new content to the main configuration file.
func (s *SoftwareService) UpdateConfig(name, content string) error {
	configPath, err := s.resolveConfigPath(name)
	if err != nil {
		return err
	}
	if err := os.WriteFile(configPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write config %s: %w", configPath, err)
	}
	return nil
}

// resolveServiceName looks up the systemd service name for the given software.
func (s *SoftwareService) resolveServiceName(name string) (string, error) {
	// First try the database
	var svcName string
	err := s.db.QueryRow("SELECT service_name FROM software WHERE name = ?", name).Scan(&svcName)
	if err == nil && svcName != "" {
		return svcName, nil
	}

	// Fall back to known metadata
	if meta, ok := knownSoftware[name]; ok {
		return meta.ServiceName, nil
	}

	return "", fmt.Errorf("unknown software: %s", name)
}

// resolveConfigPath looks up the config file path for the given software.
func (s *SoftwareService) resolveConfigPath(name string) (string, error) {
	var cfgPath string
	err := s.db.QueryRow("SELECT config_path FROM software WHERE name = ?", name).Scan(&cfgPath)
	if err == nil && cfgPath != "" {
		return cfgPath, nil
	}

	if meta, ok := knownSoftware[name]; ok && meta.ConfigPath != "" {
		return meta.ConfigPath, nil
	}

	return "", fmt.Errorf("no config path known for %s", name)
}

// isServiceRunning checks if a systemd service is currently active.
func (s *SoftwareService) isServiceRunning(serviceName string) bool {
	res, err := system.ExecWithTimeout(5*time.Second, "systemctl", "is-active", serviceName)
	if err != nil {
		return false
	}
	return strings.TrimSpace(res.Stdout) == "active"
}

// ReloadService reloads a systemd service (graceful config reload).
func (s *SoftwareService) ReloadService(name string) error {
	svcName, err := s.resolveServiceName(name)
	if err != nil {
		return err
	}
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "reload", svcName); err != nil {
		return fmt.Errorf("failed to reload %s: %w", svcName, err)
	}
	return nil
}

// NginxStubStatus holds parsed nginx stub_status metrics.
type NginxStubStatus struct {
	ActiveConnections int64 `json:"active_connections"`
	TotalAccepts      int64 `json:"total_accepts"`
	TotalHandled      int64 `json:"total_handled"`
	TotalRequests     int64 `json:"total_requests"`
	Reading           int64 `json:"reading"`
	Writing           int64 `json:"writing"`
	Waiting           int64 `json:"waiting"`
}

// NginxMetrics holds combined nginx metrics.
type NginxMetrics struct {
	NginxStubStatus
	WorkerProcesses int    `json:"worker_processes"`
	NginxCPU        string `json:"nginx_cpu_usage"`
	NginxMemory     string `json:"nginx_memory_usage"`
}

// GetNginxMetrics fetches nginx stub_status and process metrics.
func (s *SoftwareService) GetNginxMetrics() (*NginxMetrics, error) {
	metrics := &NginxMetrics{}

	// Try to fetch stub_status
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:19999/nginx_status")
	if err != nil {
		// stub_status might not be configured, return process info only
		s.fillNginxProcessMetrics(metrics)
		return metrics, nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err == nil {
		s.parseStubStatus(string(body), metrics)
	}

	s.fillNginxProcessMetrics(metrics)
	return metrics, nil
}

func (s *SoftwareService) parseStubStatus(body string, m *NginxMetrics) {
	lines := strings.Split(strings.TrimSpace(body), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Active connections:") {
			fmt.Sscanf(line, "Active connections: %d", &m.ActiveConnections)
		} else if strings.Contains(line, "Reading:") {
			fmt.Sscanf(line, " Reading: %d Writing: %d Waiting: %d", &m.Reading, &m.Writing, &m.Waiting)
		} else if !strings.Contains(line, "server") {
			parts := strings.Fields(line)
			if len(parts) == 3 {
				m.TotalAccepts, _ = strconv.ParseInt(parts[0], 10, 64)
				m.TotalHandled, _ = strconv.ParseInt(parts[1], 10, 64)
				m.TotalRequests, _ = strconv.ParseInt(parts[2], 10, 64)
			}
		}
	}
}

func (s *SoftwareService) fillNginxProcessMetrics(m *NginxMetrics) {
	// Worker process count
	res, _ := system.ExecWithTimeout(5*time.Second, "bash", "-c", "pgrep -c 'nginx: worker'")
	if res != nil {
		count, _ := strconv.Atoi(strings.TrimSpace(res.Stdout))
		m.WorkerProcesses = count
	}

	// CPU usage
	res, _ = system.ExecWithTimeout(5*time.Second, "bash", "-c",
		"ps aux | grep 'nginx' | grep -v grep | awk '{sum+=$3} END {printf \"%.1f\", sum}'")
	if res != nil && res.Stdout != "" {
		m.NginxCPU = strings.TrimSpace(res.Stdout)
	} else {
		m.NginxCPU = "0"
	}

	// Memory usage
	res, _ = system.ExecWithTimeout(5*time.Second, "bash", "-c",
		"ps aux | grep 'nginx' | grep -v grep | awk '{sum+=$6} END {printf \"%.0f\", sum}'")
	if res != nil && res.Stdout != "" {
		kb, _ := strconv.ParseFloat(strings.TrimSpace(res.Stdout), 64)
		if kb > 1024*1024 {
			m.NginxMemory = fmt.Sprintf("%.1fGB", kb/1024/1024)
		} else if kb > 1024 {
			m.NginxMemory = fmt.Sprintf("%.0fMB", kb/1024)
		} else {
			m.NginxMemory = fmt.Sprintf("%.0fKB", kb)
		}
	} else {
		m.NginxMemory = "0KB"
	}
}

// GetErrorLog reads the last N lines of a software's error log.
func (s *SoftwareService) GetErrorLog(name string, lines int) (string, string, error) {
	logPaths := map[string]string{
		"nginx":  "/var/log/nginx/error.log",
		"mysql":  "/var/log/mysql/error.log",
		"php":    "/var/log/php8.3-fpm.log",
		"redis":  "/var/log/redis/redis-server.log",
		"apache": "/var/log/apache2/error.log",
	}

	logPath, ok := logPaths[name]
	if !ok {
		return "", "", fmt.Errorf("no error log path known for %s", name)
	}

	if lines <= 0 {
		lines = 100
	}
	if lines > 1000 {
		lines = 1000
	}

	res, err := system.ExecWithTimeout(10*time.Second, "tail", "-n", strconv.Itoa(lines), logPath)
	if err != nil {
		return "", logPath, fmt.Errorf("failed to read error log: %w", err)
	}
	return res.Stdout, logPath, nil
}

// NginxOptimization holds tunable nginx parameters.
type NginxOptimization struct {
	WorkerProcesses          string `json:"worker_processes"`
	WorkerConnections        string `json:"worker_connections"`
	KeepaliveTimeout         string `json:"keepalive_timeout"`
	Gzip                     string `json:"gzip"`
	GzipMinLength            string `json:"gzip_min_length"`
	GzipCompLevel            string `json:"gzip_comp_level"`
	ClientMaxBodySize        string `json:"client_max_body_size"`
	ServerNamesHashBucketSize string `json:"server_names_hash_bucket_size"`
	ClientHeaderBufferSize   string `json:"client_header_buffer_size"`
	ClientBodyBufferSize     string `json:"client_body_buffer_size"`
}

// GetNginxOptimization reads tunable params from nginx.conf.
func (s *SoftwareService) GetNginxOptimization() (*NginxOptimization, error) {
	content, err := s.GetConfig("nginx")
	if err != nil {
		return nil, err
	}

	opt := &NginxOptimization{
		WorkerProcesses:          extractDirective(content, "worker_processes", "auto"),
		WorkerConnections:        extractDirective(content, "worker_connections", "1024"),
		KeepaliveTimeout:         extractDirective(content, "keepalive_timeout", "65"),
		Gzip:                     extractDirective(content, "gzip", "off"),
		GzipMinLength:            extractDirective(content, "gzip_min_length", "1"),
		GzipCompLevel:            extractDirective(content, "gzip_comp_level", "1"),
		ClientMaxBodySize:        extractDirective(content, "client_max_body_size", "1m"),
		ServerNamesHashBucketSize: extractDirective(content, "server_names_hash_bucket_size", "64"),
		ClientHeaderBufferSize:   extractDirective(content, "client_header_buffer_size", "1k"),
		ClientBodyBufferSize:     extractDirective(content, "client_body_buffer_size", "8k"),
	}
	return opt, nil
}

// UpdateNginxOptimization updates tunable params in nginx.conf.
func (s *SoftwareService) UpdateNginxOptimization(opt *NginxOptimization) error {
	content, err := s.GetConfig("nginx")
	if err != nil {
		return err
	}

	content = setDirective(content, "worker_processes", opt.WorkerProcesses)
	content = setDirective(content, "worker_connections", opt.WorkerConnections)
	content = setDirective(content, "keepalive_timeout", opt.KeepaliveTimeout)
	content = setDirective(content, "gzip ", opt.Gzip) // trailing space to avoid matching gzip_*
	content = setDirective(content, "gzip_min_length", opt.GzipMinLength)
	content = setDirective(content, "gzip_comp_level", opt.GzipCompLevel)
	content = setDirective(content, "client_max_body_size", opt.ClientMaxBodySize)
	content = setDirective(content, "server_names_hash_bucket_size", opt.ServerNamesHashBucketSize)
	content = setDirective(content, "client_header_buffer_size", opt.ClientHeaderBufferSize)
	content = setDirective(content, "client_body_buffer_size", opt.ClientBodyBufferSize)

	return s.UpdateConfig("nginx", content)
}

// extractDirective reads a directive value from nginx config text.
func extractDirective(content, directive, defaultVal string) string {
	d := strings.TrimSpace(directive)
	re := regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(d) + `\s+(.+?)\s*;`)
	matches := re.FindStringSubmatch(content)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}
	return defaultVal
}

// setDirective replaces a directive's value in nginx config text.
func setDirective(content, directive, value string) string {
	d := strings.TrimSpace(directive)
	re := regexp.MustCompile(`(?m)(^\s*` + regexp.QuoteMeta(d) + `\s+).+?(\s*;)`)
	if re.MatchString(content) {
		return re.ReplaceAllString(content, "${1}"+value+"${2}")
	}
	return content
}

// ---------------------------------------------------------------------------
// phpMyAdmin Manager
// ---------------------------------------------------------------------------

const (
	phpmyadminConfigPath = "/ITDLUPanel/server/config/phpmyadmin_config.json"
	phpmyadminNginxConf  = "/etc/nginx/conf.d/phpmyadmin.conf"
	phpmyadminRoot       = "/ITDLUPanel/server/phpmyadmin/www"
	phpmyadminSSLDir     = "/ITDLUPanel/server/phpmyadmin/ssl"
	phpmyadminHTPasswd   = "/ITDLUPanel/server/phpmyadmin/.htpasswd"
)

// PhpMyAdminConfig holds the phpMyAdmin manager settings.
type PhpMyAdminConfig struct {
	PublicAccess bool   `json:"public_access"`
	PHPVersion   string `json:"php_version"`
	AccessPort   int    `json:"access_port"`
	SSLEnabled   bool   `json:"ssl_enabled"`
	SSLPort      int    `json:"ssl_port"`
	AuthEnabled  bool   `json:"auth_enabled"`
	AuthUser     string `json:"auth_user"`
	AuthPassword string `json:"auth_password"`
}

func defaultPhpMyAdminConfig() *PhpMyAdminConfig {
	return &PhpMyAdminConfig{
		PublicAccess: true,
		PHPVersion:   "8.3",
		AccessPort:   888,
		SSLEnabled:   false,
		SSLPort:      887,
		AuthEnabled:  false,
	}
}

// GetPhpMyAdminConfig reads the phpMyAdmin config from disk or returns defaults.
func (s *SoftwareService) GetPhpMyAdminConfig() (*PhpMyAdminConfig, error) {
	cfg := defaultPhpMyAdminConfig()

	data, err := os.ReadFile(phpmyadminConfigPath)
	if err != nil {
		if os.IsNotExist(err) {
			cfg.PHPVersion = s.detectPHPVersionFromNginx(cfg.PHPVersion)
			return cfg, nil
		}
		return nil, fmt.Errorf("failed to read phpmyadmin config: %w", err)
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("failed to parse phpmyadmin config: %w", err)
	}

	cfg.PHPVersion = s.detectPHPVersionFromNginx(cfg.PHPVersion)
	return cfg, nil
}

// detectPHPVersionFromNginx reads the nginx phpmyadmin config and extracts the
// php-fpm version from the fastcgi_pass socket path.
func (s *SoftwareService) detectPHPVersionFromNginx(fallback string) string {
	data, err := os.ReadFile(phpmyadminNginxConf)
	if err != nil {
		return fallback
	}
	re := regexp.MustCompile(`fastcgi_pass\s+unix:/var/run/php/php([0-9]+\.[0-9]+)-fpm\.sock`)
	m := re.FindStringSubmatch(string(data))
	if len(m) > 1 {
		return m[1]
	}
	return fallback
}

// SetPhpMyAdminConfig persists the config, regenerates nginx config, manages
// SSL certs, htpasswd, firewall rules, and reloads nginx.
func (s *SoftwareService) SetPhpMyAdminConfig(cfg *PhpMyAdminConfig) error {
	if cfg.AccessPort == 0 {
		cfg.AccessPort = 888
	}
	if cfg.SSLPort == 0 {
		cfg.SSLPort = 887
	}
	if cfg.PHPVersion == "" {
		cfg.PHPVersion = "8.3"
	}

	// Persist config JSON
	if err := s.savePhpMyAdminConfig(cfg); err != nil {
		return err
	}

	// Handle basic auth htpasswd
	if cfg.AuthEnabled {
		if err := s.ensurePhpMyAdminHTPasswd(cfg.AuthUser, cfg.AuthPassword); err != nil {
			return fmt.Errorf("failed to create htpasswd: %w", err)
		}
	}

	// Handle SSL certs
	if cfg.SSLEnabled {
		if err := s.ensurePhpMyAdminSSLCerts(); err != nil {
			return fmt.Errorf("failed to ensure SSL certs: %w", err)
		}
	}

	// Generate nginx config
	nginxCfg := s.buildPhpMyAdminNginxConfig(cfg)
	if err := os.WriteFile(phpmyadminNginxConf, []byte(nginxCfg), 0644); err != nil {
		return fmt.Errorf("failed to write nginx config: %w", err)
	}

	// Test nginx config
	ctx := context.Background()
	result, err := system.ExecWithTimeout(10*time.Second, "nginx", "-t")
	if err != nil || result.ExitCode != 0 {
		errMsg := ""
		if result != nil {
			errMsg = result.Stderr
		}
		return fmt.Errorf("nginx config test failed: %s", errMsg)
	}

	// Reload nginx
	if _, err := system.ExecWithTimeout(10*time.Second, "systemctl", "reload", "nginx"); err != nil {
		logger.Warn().Err(err).Msg("failed to reload nginx after phpmyadmin config update")
	}

	// Manage firewall rules
	s.managePhpMyAdminFirewall(ctx, cfg)

	return nil
}

func (s *SoftwareService) savePhpMyAdminConfig(cfg *PhpMyAdminConfig) error {
	dir := filepath.Dir(phpmyadminConfigPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config dir: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal phpmyadmin config: %w", err)
	}
	return os.WriteFile(phpmyadminConfigPath, data, 0644)
}

func (s *SoftwareService) ensurePhpMyAdminHTPasswd(user, password string) error {
	if user == "" || password == "" {
		return fmt.Errorf("auth_user and auth_password are required when auth is enabled")
	}

	dir := filepath.Dir(phpmyadminHTPasswd)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	// Try htpasswd command first
	result, err := system.ExecWithTimeout(5*time.Second, "htpasswd", "-cb", phpmyadminHTPasswd, user, password)
	if err == nil && result.ExitCode == 0 {
		return nil
	}

	// Fallback: generate bcrypt hash manually
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	line := fmt.Sprintf("%s:%s\n", user, string(hash))
	return os.WriteFile(phpmyadminHTPasswd, []byte(line), 0644)
}

func (s *SoftwareService) ensurePhpMyAdminSSLCerts() error {
	certPath := filepath.Join(phpmyadminSSLDir, "phpmyadmin.crt")
	keyPath := filepath.Join(phpmyadminSSLDir, "phpmyadmin.key")

	// If both files exist, skip generation
	if _, err := os.Stat(certPath); err == nil {
		if _, err := os.Stat(keyPath); err == nil {
			return nil
		}
	}

	if err := os.MkdirAll(phpmyadminSSLDir, 0755); err != nil {
		return fmt.Errorf("failed to create SSL dir: %w", err)
	}

	result, err := system.ExecWithTimeout(30*time.Second,
		"openssl", "req", "-x509", "-nodes", "-days", "3650",
		"-newkey", "rsa:2048",
		"-keyout", keyPath,
		"-out", certPath,
		"-subj", "/CN=phpMyAdmin/O=ITDLUPanel",
	)
	if err != nil {
		return fmt.Errorf("failed to generate self-signed cert: %w", err)
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("openssl failed: %s", result.Stderr)
	}
	return nil
}

func (s *SoftwareService) buildPhpMyAdminNginxConfig(cfg *PhpMyAdminConfig) string {
	var b strings.Builder

	fpmSock := fmt.Sprintf("/var/run/php/php%s-fpm.sock", cfg.PHPVersion)

	b.WriteString("# phpMyAdmin - managed by ITDLUPanel\n")

	// HTTP server block
	s.writePhpMyAdminServerBlock(&b, cfg, fpmSock, false)

	// SSL server block
	if cfg.SSLEnabled {
		b.WriteString("\n")
		s.writePhpMyAdminServerBlock(&b, cfg, fpmSock, true)
	}

	return b.String()
}

func (s *SoftwareService) writePhpMyAdminServerBlock(b *strings.Builder, cfg *PhpMyAdminConfig, fpmSock string, ssl bool) {
	port := cfg.AccessPort
	if ssl {
		port = cfg.SSLPort
		fmt.Fprintf(b, "# SSL block\n")
	}

	b.WriteString("server {\n")
	if ssl {
		fmt.Fprintf(b, "    listen %d ssl;\n", port)
	} else {
		fmt.Fprintf(b, "    listen %d;\n", port)
	}
	b.WriteString("    server_name _;\n")
	fmt.Fprintf(b, "    root %s;\n", phpmyadminRoot)
	b.WriteString("    index index.php index.html;\n")
	b.WriteString("\n")

	if ssl {
		fmt.Fprintf(b, "    ssl_certificate %s/phpmyadmin.crt;\n", phpmyadminSSLDir)
		fmt.Fprintf(b, "    ssl_certificate_key %s/phpmyadmin.key;\n", phpmyadminSSLDir)
		b.WriteString("    ssl_protocols TLSv1.2 TLSv1.3;\n")
		b.WriteString("\n")
	}

	if cfg.AuthEnabled {
		b.WriteString("    auth_basic \"phpMyAdmin Login\";\n")
		fmt.Fprintf(b, "    auth_basic_user_file %s;\n", phpmyadminHTPasswd)
		b.WriteString("\n")
	}

	if !cfg.PublicAccess {
		b.WriteString("    allow 127.0.0.1;\n")
		b.WriteString("    deny all;\n")
		b.WriteString("\n")
	}

	b.WriteString("    location / {\n")
	b.WriteString("        try_files $uri $uri/ =404;\n")
	b.WriteString("    }\n")
	b.WriteString("\n")

	b.WriteString("    location ~ \\.php$ {\n")
	fmt.Fprintf(b, "        fastcgi_pass unix:%s;\n", fpmSock)
	b.WriteString("        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n")
	b.WriteString("        include fastcgi_params;\n")
	b.WriteString("    }\n")
	b.WriteString("\n")

	b.WriteString("    location ~ /tmp/ {\n")
	b.WriteString("        deny all;\n")
	b.WriteString("    }\n")

	b.WriteString("}\n")
}

func (s *SoftwareService) managePhpMyAdminFirewall(_ context.Context, cfg *PhpMyAdminConfig) {
	if s.firewallService == nil {
		return
	}

	httpPort := strconv.Itoa(cfg.AccessPort)
	sslPort := strconv.Itoa(cfg.SSLPort)

	// Update the default phpMyAdmin port rule (is_default=1)
	if err := s.firewallService.UpdateDefaultPort("phpMyAdmin", httpPort); err != nil {
		logger.Warn().Err(err).Str("port", httpPort).Msg("failed to update default phpMyAdmin firewall port")
	}

	// Manage SSL port
	if cfg.SSLEnabled {
		softwarePortMap["phpmyadmin-ssl"] = []struct {
			Port     string
			Protocol string
			Desc     string
		}{{Port: sslPort, Protocol: "tcp", Desc: "phpMyAdmin SSL"}}
		s.firewallService.OpenPortsForSoftware("phpmyadmin-ssl")
	} else {
		s.firewallService.ClosePortsForSoftware("phpmyadmin-ssl")
		delete(softwarePortMap, "phpmyadmin-ssl")
	}

	// Keep softwarePortMap in sync with actual port
	softwarePortMap["phpmyadmin"] = []struct {
		Port     string
		Protocol string
		Desc     string
	}{{Port: httpPort, Protocol: "tcp", Desc: "phpMyAdmin"}}
}

// GetAvailablePHPVersions scans the panel PHP config directory for installed
// PHP versions with an active FPM socket.
func (s *SoftwareService) GetAvailablePHPVersions() ([]string, error) {
	entries, err := os.ReadDir(phpConfBase)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, fmt.Errorf("failed to read %s: %w", phpConfBase, err)
	}

	var versions []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		ver := e.Name()
		sockPath := fmt.Sprintf("/run/php/php%s-fpm.sock", ver)
		if _, err := os.Stat(sockPath); err == nil {
			versions = append(versions, ver)
			continue
		}
		// Also check /var/run/php which may be a symlink to /run/php
		altSock := fmt.Sprintf("/var/run/php/php%s-fpm.sock", ver)
		if _, err := os.Stat(altSock); err == nil {
			versions = append(versions, ver)
		}
	}

	return versions, nil
}

// ---------------------------------------------------------------------------
// PHP-FPM Status (process stats)
// ---------------------------------------------------------------------------

// GetPHPFPMStatus returns FPM process statistics gathered from ps and systemctl.
func (s *SoftwareService) GetPHPFPMStatus(version string) (map[string]interface{}, error) {
	emptyResult := map[string]interface{}{
		"workers":         0,
		"total_memory_mb": 0.0,
		"avg_cpu":         0.0,
		"uptime":          "",
		"processes":       []interface{}{},
	}

	// Get master PID from systemctl for accurate process tree detection
	svcName := fmt.Sprintf("php%s-fpm", version)
	pidRes, err := system.ExecWithTimeout(5*time.Second, "systemctl", "show", svcName, "--property=MainPID")
	if err != nil {
		return emptyResult, nil
	}
	parts := strings.SplitN(strings.TrimSpace(pidRes.Stdout), "=", 2)
	if len(parts) != 2 || parts[1] == "0" || parts[1] == "" {
		return emptyResult, nil
	}
	masterPID := parts[1]

	// Get master + all child processes using ps
	res, err := system.ExecWithTimeout(10*time.Second, "bash", "-c",
		fmt.Sprintf("ps -o pid,%%cpu,rss,etime,args -p %s --ppid %s --no-headers", masterPID, masterPID))
	if err != nil {
		return emptyResult, nil
	}

	lines := strings.Split(strings.TrimSpace(res.Stdout), "\n")
	var processes []map[string]interface{}
	var totalRSSKB float64
	var totalCPU float64
	workers := 0

	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Fields(line)
		// ps -o pid,%cpu,rss,etime,args => at least 5 fields
		if len(fields) < 5 {
			continue
		}

		pid, _ := strconv.Atoi(fields[0])
		cpu, _ := strconv.ParseFloat(fields[1], 64)
		rssKB, _ := strconv.ParseFloat(fields[2], 64)
		timeStr := fields[3]
		cmdPart := strings.Join(fields[4:], " ")

		role := "worker"
		if strings.Contains(cmdPart, "master") {
			role = "master"
		} else {
			workers++
		}

		totalRSSKB += rssKB
		totalCPU += cpu

		processes = append(processes, map[string]interface{}{
			"pid":       pid,
			"cpu":       cpu,
			"memory_mb": math.Round(rssKB/1024*100) / 100,
			"time":      timeStr,
			"role":      role,
		})
	}

	avgCPU := 0.0
	if len(processes) > 0 {
		avgCPU = math.Round(totalCPU/float64(len(processes))*100) / 100
	}

	// Get uptime from systemctl
	uptime := ""
	uptimeRes, err := system.ExecWithTimeout(5*time.Second, "systemctl", "show", svcName, "--property=ActiveEnterTimestamp")
	if err == nil {
		parts := strings.SplitN(strings.TrimSpace(uptimeRes.Stdout), "=", 2)
		if len(parts) == 2 {
			uptime = strings.TrimSpace(parts[1])
		}
	}

	// Get system load average from /proc/loadavg
	loadAvg := map[string]interface{}{"load1": 0.0, "load5": 0.0, "load15": 0.0}
	if loadData, err := os.ReadFile("/proc/loadavg"); err == nil {
		loadFields := strings.Fields(string(loadData))
		if len(loadFields) >= 3 {
			l1, _ := strconv.ParseFloat(loadFields[0], 64)
			l5, _ := strconv.ParseFloat(loadFields[1], 64)
			l15, _ := strconv.ParseFloat(loadFields[2], 64)
			loadAvg = map[string]interface{}{"load1": l1, "load5": l5, "load15": l15}
		}
	}

	return map[string]interface{}{
		"workers":         workers,
		"total_memory_mb": math.Round(totalRSSKB/1024*100) / 100,
		"avg_cpu":         avgCPU,
		"uptime":          uptime,
		"processes":       processes,
		"load_average":    loadAvg,
	}, nil
}

// ---------------------------------------------------------------------------
// PHP-FPM Slow Log
// ---------------------------------------------------------------------------

// GetPHPSlowLog reads the PHP-FPM slow log and returns content, log path, and error.
func (s *SoftwareService) GetPHPSlowLog(version string, lines int) (string, string, error) {
	if lines <= 0 {
		lines = 100
	}
	if lines > 1000 {
		lines = 1000
	}

	poolPath := phpFPMPoolPath(version)
	data, err := os.ReadFile(poolPath)
	if err != nil {
		return "", "", fmt.Errorf("failed to read FPM pool config: %w", err)
	}
	content := string(data)

	slowlogPath := readFPMValue(content, "slowlog")
	if slowlogPath == "" {
		slowlogPath = fmt.Sprintf("/var/log/php%s-fpm.log.slow", version)
	}

	timeout := readFPMValue(content, "request_slowlog_timeout")

	if _, statErr := os.Stat(slowlogPath); statErr != nil {
		// File doesn't exist – return empty with config info
		return "", slowlogPath, nil
	}

	res, err := system.ExecWithTimeout(10*time.Second, "tail", "-n", fmt.Sprintf("%d", lines), slowlogPath)
	if err != nil {
		return "", slowlogPath, fmt.Errorf("failed to read slow log: %w", err)
	}

	_ = timeout // included in config response below; not returned here
	return res.Stdout, slowlogPath, nil
}

// SetPHPSlowLogConfig enables or disables the PHP-FPM slow log and sets the timeout.
func (s *SoftwareService) SetPHPSlowLogConfig(version string, enabled bool, timeout string) error {
	poolPath := phpFPMPoolPath(version)
	data, err := os.ReadFile(poolPath)
	if err != nil {
		return fmt.Errorf("failed to read FPM pool config: %w", err)
	}

	content := string(data)
	slowlogPath := fmt.Sprintf("/var/log/php%s-fpm.log.slow", version)

	if enabled {
		if timeout == "" {
			timeout = "5s"
		}
		content = setFPMValue(content, "request_slowlog_timeout", timeout)
		content = setFPMValue(content, "slowlog", slowlogPath)
	} else {
		content = setFPMValue(content, "request_slowlog_timeout", "0")
	}

	if err := os.WriteFile(poolPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write FPM pool config: %w", err)
	}

	svcName := fmt.Sprintf("php%s-fpm", version)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", svcName); err != nil {
		logger.Warn().Err(err).Str("service", svcName).Msg("failed to restart php-fpm after slow log config change")
	}
	return nil
}

// ---------------------------------------------------------------------------
// PHP Info
// ---------------------------------------------------------------------------

// GetPHPInfo returns the output of php -i for the given version.
func (s *SoftwareService) GetPHPInfo(version string) (string, error) {
	bin := fmt.Sprintf("php%s", version)
	res, err := system.ExecWithTimeout(15*time.Second, bin, "-i")
	if err != nil {
		return "", fmt.Errorf("failed to run %s -i: %w", bin, err)
	}
	return res.Stdout, nil
}
