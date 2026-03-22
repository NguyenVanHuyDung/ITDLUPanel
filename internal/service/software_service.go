package service

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

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
	db       *sql.DB
	queue    *task.Queue
	registry *installer.Registry
}

// NewSoftwareService creates a new SoftwareService.
func NewSoftwareService(db *sql.DB, queue *task.Queue, registry *installer.Registry) *SoftwareService {
	svc := &SoftwareService{
		db:       db,
		queue:    queue,
		registry: registry,
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

// parseExtensionTaskName parses "php-8.3:fileinfo,mbstring" into ("php", "fileinfo,mbstring").
func parseExtensionTaskName(name string) (software, extensions string, err error) {
	parts := strings.SplitN(name, ":", 2)
	if len(parts) != 2 || parts[1] == "" {
		return "", "", fmt.Errorf("invalid extension task name: %s (expected format: software-version:ext1,ext2)", name)
	}
	return parts[0], parts[1], nil
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
					result["version"] = strings.TrimSpace(parts[1])
				}
			}
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
		"php":    "/var/log/php8.2-fpm.log",
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
