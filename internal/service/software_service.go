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
	"sort"
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
		DefaultVersion: "mariadb-11.4",
	},
	"php": {
		DisplayName:    "PHP",
		Type:           "runtime",
		ServiceName:    "php-fpm",
		ConfigPath:     "/ITDLUPanel/server/php/conf/php.ini",
		InstallPath:    "/ITDLUPanel/server/php",
		DefaultVersion: "8.4",
	},
	"redis": {
		DisplayName:    "Redis",
		Type:           "cache",
		ServiceName:    "redis-server",
		ConfigPath:     "/ITDLUPanel/server/redis/conf/redis.conf",
		InstallPath:    "/ITDLUPanel/server/redis",
		DefaultVersion: "7.2",
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
	"ftp_storage": {
		DisplayName:    "FTP Storage",
		Type:           "tool",
		ServiceName:    "",
		ConfigPath:     "",
		InstallPath:    "/ITDLUPanel/server/ftp_storage",
		DefaultVersion: "stable",
	},
	"s3_storage": {
		DisplayName:    "Amazon S3",
		Type:           "storage",
		ServiceName:    "",
		ConfigPath:     "",
		InstallPath:    "/ITDLUPanel/server/s3_storage",
		DefaultVersion: "stable",
	},
	"google_drive": {
		DisplayName:    "Google Drive",
		Type:           "storage",
		ServiceName:    "",
		ConfigPath:     "",
		InstallPath:    "/ITDLUPanel/server/google_drive",
		DefaultVersion: "stable",
	},
	"onedrive": {
		DisplayName:    "OneDrive",
		Type:           "storage",
		ServiceName:    "",
		ConfigPath:     "",
		InstallPath:    "/ITDLUPanel/server/onedrive",
		DefaultVersion: "stable",
	},
	"docker": {
		DisplayName:    "Docker",
		Type:           "tool",
		ServiceName:    "docker",
		ConfigPath:     "/etc/docker/daemon.json",
		InstallPath:    "/ITDLUPanel/server/docker",
		DefaultVersion: "stable",
	},
	"postgresql": {
		DisplayName:    "PostgreSQL",
		Type:           "database",
		ServiceName:    "postgresql",
		ConfigPath:     "/ITDLUPanel/server/postgresql/conf/postgresql.conf",
		InstallPath:    "/ITDLUPanel/server/postgresql",
		DefaultVersion: "17",
	},
	"pgadmin": {
		DisplayName:    "pgAdmin",
		Type:           "tool",
		ServiceName:    "pgadmin4",
		ConfigPath:     "/ITDLUPanel/server/config/pgadmin_config.json",
		InstallPath:    "/ITDLUPanel/server/pgadmin",
		DefaultVersion: "latest",
	},
}

func init() {
	// Adjust metadata based on the detected OS.
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		m := knownSoftware["apache"]
		m.ServiceName = "httpd"
		m.ConfigPath = "/ITDLUPanel/server/apache/conf/httpd.conf"
		knownSoftware["apache"] = m

		m2 := knownSoftware["redis"]
		m2.ServiceName = "redis"
		knownSoftware["redis"] = m2

		m3 := knownSoftware["mysql"]
		m3.ServiceName = "mysqld"
		knownSoftware["mysql"] = m3

		m4 := knownSoftware["nginx"]
		m4.ServiceName = "nginx" // same on both, but explicit
		knownSoftware["nginx"] = m4

		// PHP: service name needs version, set generic marker
		m5 := knownSoftware["php"]
		m5.ServiceName = "php-fpm" // Will be resolved dynamically by resolveServiceName
		knownSoftware["php"] = m5
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
	Name              string   `json:"name"`
	DisplayName       string   `json:"display_name"`
	Type              string   `json:"type"`
	Installed         bool     `json:"installed"`
	Versions          []string `json:"versions"`
	DefaultVersion    string   `json:"default_version"`
	InstalledVersions []string `json:"installed_versions,omitempty"`
	MultiVersion      bool     `json:"multi_version,omitempty"`
}

// SoftwareService manages software installation, removal, and service control.
type SoftwareService struct {
	db              *sql.DB
	queue           *task.Queue
	registry        *installer.Registry
	firewallService *FirewallService
	notifier        *NotificationService
	onNginxVersionChanged func() // called after nginx version switch to regenerate vhosts
}

// SetOnNginxVersionChanged sets a callback invoked after nginx version switch.
func (s *SoftwareService) SetOnNginxVersionChanged(fn func()) {
	s.onNginxVersionChanged = fn
}

// SetNotifier sets the notification service for event dispatching.
func (s *SoftwareService) SetNotifier(n *NotificationService) { s.notifier = n }

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

		// Double-check conflict at execution time (since tasks are async)
		if m := knownSoftware[name]; m.Type == "webserver" {
			var existing string
			_ = s.db.QueryRow("SELECT name FROM software WHERE type = 'webserver' AND status = 1 AND name != ? LIMIT 1", name).Scan(&existing)
			if existing != "" {
				return fmt.Errorf("cannot install %s: web server %s is already installed", name, existing)
			}
		}

		if err := inst.Install(ctx, version, func(pct int) {
			progress(pct, fmt.Sprintf("Installing %s... %d%%", name, pct))
		}); err != nil {
			if s.notifier != nil {
				s.notifier.Notify(NotificationEvent{Type: EventSoftwareInstallFail, Title: name, Detail: err.Error()})
			}
			return err
		}

		// Record in database
		meta := knownSoftware[name]
		if version == "" {
			version = meta.DefaultVersion
		}

		dbVersion := version
		// For PHP, track all installed versions as comma-separated list
		if name == "php" {
			var existing string
			_ = s.db.QueryRow("SELECT version FROM software WHERE name = 'php'").Scan(&existing)
			if existing != "" {
				// Merge: add new version if not already present
				versions := strings.Split(existing, ",")
				found := false
				for _, v := range versions {
					if strings.TrimSpace(v) == version {
						found = true
						break
					}
				}
				if !found {
					versions = append(versions, version)
				}
				// Sort versions
				sort.Strings(versions)
				dbVersion = strings.Join(versions, ",")
			}
		}

		// Determine the actual running service name (may differ from metadata default)
		actualServiceName := meta.ServiceName
		if aliases, ok := serviceNameAliases[name]; ok {
			for _, alias := range aliases {
				if s.isServiceRunning(alias) {
					actualServiceName = alias
					break
				}
			}
		}

		if _, err := s.db.Exec(
			`INSERT OR REPLACE INTO software (name, display_name, version, type, status, config_path, install_path, service_name, installed_at, updated_at)
			 VALUES (?, ?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			name, meta.DisplayName, dbVersion, meta.Type, meta.ConfigPath, meta.InstallPath, actualServiceName,
		); err != nil {
			logger.Error().Err(err).Str("software", name).Msg("failed to record software installation in DB")
		}

		progress(100, fmt.Sprintf("%s installed successfully", name))

		// Notify
		if s.notifier != nil {
			s.notifier.Notify(NotificationEvent{Type: EventSoftwareInstalled, Title: name, Detail: fmt.Sprintf("Version: %s", version)})
		}

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
		version := ""
		// Parse "php@8.3" format for per-version uninstall
		if idx := strings.Index(name, "@"); idx != -1 {
			version = name[idx+1:]
			name = name[:idx]
		}

		inst, ok := s.registry.Get(name)
		if !ok {
			return fmt.Errorf("unknown software: %s", name)
		}

		if version != "" {
			// Per-version uninstall
			vu, ok := inst.(installer.VersionedUninstaller)
			if !ok {
				return fmt.Errorf("%s does not support per-version uninstall", name)
			}
			progress(0, fmt.Sprintf("Uninstalling %s %s", name, version))
			if err := vu.UninstallVersion(ctx, version); err != nil {
				return err
			}
			// Only remove DB record if no versions remain installed
			if !inst.IsInstalled() {
				if _, err := s.db.Exec("DELETE FROM software WHERE name = ?", name); err != nil {
					logger.Error().Err(err).Str("software", name).Msg("failed to remove software record from DB")
				}
			}
			progress(100, fmt.Sprintf("%s %s uninstalled successfully", name, version))
		} else {
			// Full uninstall — remove all versions
			progress(0, fmt.Sprintf("Starting uninstallation of %s", name))
			if err := inst.Uninstall(ctx); err != nil {
				return err
			}
			if _, err := s.db.Exec("DELETE FROM software WHERE name = ?", name); err != nil {
				logger.Error().Err(err).Str("software", name).Msg("failed to remove software record from DB")
			}
			progress(100, fmt.Sprintf("%s uninstalled successfully", name))
		}

		// Auto-close firewall ports for this software
		if s.firewallService != nil {
			s.firewallService.ClosePortsForSoftware(name)
		}

		return nil
	})

	// Stack install handler: Name is a JSON array of component names, e.g. ["nginx","mysql","php"]
	// Installs each component sequentially, waiting for each to complete before starting the next.
	s.queue.RegisterHandler("stack_install", func(ctx context.Context, t *task.TaskInfo, progress func(int, string)) error {
		var components []string
		if err := json.Unmarshal([]byte(t.Name), &components); err != nil {
			return fmt.Errorf("invalid stack components: %w", err)
		}
		if len(components) == 0 {
			return fmt.Errorf("no components to install")
		}

		total := len(components)
		for i, comp := range components {
			select {
			case <-ctx.Done():
				return fmt.Errorf("stack installation cancelled")
			default:
			}

			basePct := (i * 100) / total
			progress(basePct, fmt.Sprintf("[%d/%d] Starting installation of %s", i+1, total, comp))

			parts := strings.SplitN(comp, ":", 2)
			name := parts[0]
			version := ""
			if len(parts) > 1 {
				version = parts[1]
			}

			inst, ok := s.registry.Get(name)
			if !ok {
				progress(basePct, fmt.Sprintf("[%d/%d] Skipping unknown software: %s", i+1, total, name))
				continue
			}

			// Skip already installed (unless it's multi-version PHP)
			if name != "php" && inst.IsInstalled() {
				progress(basePct, fmt.Sprintf("[%d/%d] %s already installed, skipping", i+1, total, name))
				continue
			}

			// Web server conflict check
			if m := knownSoftware[name]; m.Type == "webserver" {
				var existing string
				_ = s.db.QueryRow("SELECT name FROM software WHERE type = 'webserver' AND status = 1 AND name != ? LIMIT 1", name).Scan(&existing)
				if existing != "" {
					progress(basePct, fmt.Sprintf("[%d/%d] Skipping %s: web server %s already installed", i+1, total, name, existing))
					continue
				}
			}

			meta := knownSoftware[name]
			if version == "" {
				version = meta.DefaultVersion
			}

			if err := inst.Install(ctx, version, func(pct int) {
				scaledPct := basePct + (pct*100/total)/100
				if scaledPct > 99 {
					scaledPct = 99
				}
				progress(scaledPct, fmt.Sprintf("[%d/%d] Installing %s... %d%%", i+1, total, name, pct))
			}); err != nil {
				progress(basePct, fmt.Sprintf("[%d/%d] Failed to install %s: %s", i+1, total, name, err.Error()))
				return fmt.Errorf("failed to install %s: %w", name, err)
			}

			// Record in database
			dbVersion := version
			if name == "php" {
				var existing string
				_ = s.db.QueryRow("SELECT version FROM software WHERE name = 'php'").Scan(&existing)
				if existing != "" {
					versions := strings.Split(existing, ",")
					found := false
					for _, v := range versions {
						if strings.TrimSpace(v) == version {
							found = true
							break
						}
					}
					if !found {
						versions = append(versions, version)
					}
					sort.Strings(versions)
					dbVersion = strings.Join(versions, ",")
				}
			}

			// Determine the actual running service name
			actualSvcName := meta.ServiceName
			if aliases, ok := serviceNameAliases[name]; ok {
				for _, alias := range aliases {
					if s.isServiceRunning(alias) {
						actualSvcName = alias
						break
					}
				}
			}

			if _, dbErr := s.db.Exec(
				`INSERT OR REPLACE INTO software (name, display_name, version, type, status, config_path, install_path, service_name, installed_at, updated_at)
				 VALUES (?, ?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
				name, meta.DisplayName, dbVersion, meta.Type, meta.ConfigPath, meta.InstallPath, actualSvcName,
			); dbErr != nil {
				logger.Error().Err(dbErr).Str("software", name).Msg("failed to record software installation in DB")
			}

			// Auto-open firewall ports
			if s.firewallService != nil {
				s.firewallService.OpenPortsForSoftware(name)
			}

			if name == "nginx" && s.onNginxVersionChanged != nil {
				s.onNginxVersionChanged()
			}

			progress(((i + 1) * 100) / total, fmt.Sprintf("[%d/%d] %s installed successfully", i+1, total, name))
		}

		progress(100, fmt.Sprintf("Stack installation complete: %d components", total))
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
		} else if _, ok := inst.(*installer.OLSInstaller); ok {
			// LSPHP extension install for OpenLiteSpeed
			version := strings.TrimPrefix(software, "lsphp-")
			if version == software {
				version = "8.2"
			}
			if err := installer.InstallLSPHPExtensions(ctx, version, exts); err != nil {
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

		// LSPHP extension uninstall for OpenLiteSpeed
		if strings.HasPrefix(software, "lsphp-") {
			version := strings.TrimPrefix(software, "lsphp-")
			code := strings.ReplaceAll(version, ".", "")
			osInfo := system.GetOSInfo()
			packages := make([]string, 0, len(exts))
			for _, ext := range exts {
				ext = strings.TrimSpace(ext)
				if ext == "" {
					continue
				}
				if osInfo.PkgManager == "apt" {
					packages = append(packages, fmt.Sprintf("lsphp%s-%s", code, ext))
				} else {
					packages = append(packages, fmt.Sprintf("lsphp%s-%s", code, ext))
				}
			}
			if len(packages) == 0 {
				return fmt.Errorf("no extensions specified")
			}
			args := append([]string{"remove", "-y"}, packages...)
			if _, execErr := system.Exec(ctx, osInfo.PkgManager, args...); execErr != nil {
				return fmt.Errorf("failed to remove LSPHP extensions: %w", execErr)
			}
			progress(100, fmt.Sprintf("Extensions [%s] removed successfully", extStr))
			return nil
		}

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
		if info.Name == "php" {
			// PHP multi-version: check if any PHP-FPM version is running
			for _, ver := range []string{"8.4", "8.3", "8.2", "8.1", "8.0", "7.4"} {
				if s.isServiceRunning(phpFPMServiceName(ver)) {
					item.IsRunning = true
					break
				}
			}
		} else if info.ServiceName != "" {
			item.IsRunning = s.isServiceRunning(info.ServiceName)
			// If not running under DB service name, probe aliases (e.g. mysql→mariadb)
			if !item.IsRunning {
				if aliases, ok := serviceNameAliases[info.Name]; ok {
					for _, alias := range aliases {
						if alias != info.ServiceName && s.isServiceRunning(alias) {
							item.IsRunning = true
							item.ServiceName = alias
							_, _ = s.db.Exec("UPDATE software SET service_name = ? WHERE name = ?", alias, info.Name)
							break
						}
					}
				}
			}
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
		versions := inst.GetVersions()
		defaultVer := meta.DefaultVersion
		if defaultVer == "" && len(versions) > 0 {
			defaultVer = versions[0]
		}
		item := AvailableSoftware{
			Name:           name,
			DisplayName:    meta.DisplayName,
			Type:           meta.Type,
			Installed:      inst.IsInstalled(),
			Versions:       versions,
			DefaultVersion: defaultVer,
		}
		// PHP supports multi-version: detect which versions are installed
		if name == "php" {
			item.MultiVersion = true
			item.InstalledVersions = s.detectInstalledPHPVersions()
		}
		result = append(result, item)
	}
	return result
}

// detectInstalledPHPVersions returns which PHP-FPM versions have binaries on disk.
func (s *SoftwareService) detectInstalledPHPVersions() []string {
	// Use the installer's version list as the source of truth
	phpInst, ok := s.registry.Get("php")
	var candidates []string
	if ok {
		candidates = phpInst.GetVersions()
	} else {
		candidates = []string{"8.4", "8.3", "8.2", "8.1", "8.0", "7.4"}
	}
	var installed []string
	osInfo := system.GetOSInfo()
	for _, v := range candidates {
		found := false
		if osInfo.PkgManager == "dnf" {
			remiVer := strings.ReplaceAll(v, ".", "")
			bin := fmt.Sprintf("/opt/remi/php%s/root/usr/sbin/php-fpm", remiVer)
			if _, err := os.Stat(bin); err == nil {
				found = true
			}
		} else {
			bin := fmt.Sprintf("/usr/sbin/php-fpm%s", v)
			if _, err := os.Stat(bin); err == nil {
				found = true
			}
		}
		if found {
			installed = append(installed, v)
		}
	}
	return installed
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
		if !item.IsRunning {
			if aliases, ok := serviceNameAliases[name]; ok {
				for _, alias := range aliases {
					if alias != info.ServiceName && s.isServiceRunning(alias) {
						item.IsRunning = true
						item.ServiceName = alias
						_, _ = s.db.Exec("UPDATE software SET service_name = ? WHERE name = ?", alias, name)
						break
					}
				}
			}
		}
	}
	return item, nil
}

// InstallSoftware enqueues a background install task. Returns the task ID.
func (s *SoftwareService) InstallSoftware(name, version string, createdBy int64) (int64, error) {
	meta, ok := knownSoftware[name]
	if !ok {
		if _, ok2 := s.registry.Get(name); !ok2 {
			return 0, fmt.Errorf("unknown software: %s", name)
		}
	}

	// Prevent installing multiple web servers
	if meta.Type == "webserver" {
		installed, err := s.getInstalledWebServer()
		if err == nil && installed != "" && installed != name {
			return 0, fmt.Errorf("web server %s is already installed; uninstall it before installing %s", installed, name)
		}
	}

	taskName := name
	if version != "" {
		taskName = name + ":" + version
	}

	return s.queue.Enqueue("software_install", taskName, createdBy)
}

// InstallStack enqueues a single task that installs multiple components sequentially.
// Only components that are not yet installed are included.
func (s *SoftwareService) InstallStack(components []string, createdBy int64) (int64, error) {
	var toInstall []string
	for _, comp := range components {
		name := strings.SplitN(comp, ":", 2)[0]
		if _, ok := knownSoftware[name]; !ok {
			if _, ok2 := s.registry.Get(name); !ok2 {
				continue
			}
		}
		inst, ok := s.registry.Get(name)
		if !ok {
			continue
		}
		// Skip already installed (except multi-version PHP)
		if name != "php" && inst.IsInstalled() {
			continue
		}
		toInstall = append(toInstall, comp)
	}
	if len(toInstall) == 0 {
		return 0, fmt.Errorf("all components are already installed")
	}

	taskName, err := json.Marshal(toInstall)
	if err != nil {
		return 0, fmt.Errorf("failed to encode components: %w", err)
	}

	return s.queue.Enqueue("stack_install", string(taskName), createdBy)
}

// getInstalledWebServer returns the name of the currently installed web server, or "" if none.
func (s *SoftwareService) getInstalledWebServer() (string, error) {
	var name string
	err := s.db.QueryRow("SELECT name FROM software WHERE type = 'webserver' AND status = 1 LIMIT 1").Scan(&name)
	if err != nil {
		return "", err
	}
	return name, nil
}

// GetInstalledWebServer is the exported version for API handlers.
func (s *SoftwareService) GetInstalledWebServer() (string, error) {
	return s.getInstalledWebServer()
}

// UninstallSoftware enqueues a background uninstall task. Returns the task ID.
// When version is non-empty and the software supports per-version removal,
// only that single version is removed.
func (s *SoftwareService) UninstallSoftware(name, version string, createdBy int64) (int64, error) {
	if _, ok := s.registry.Get(name); !ok {
		return 0, fmt.Errorf("unknown software: %s", name)
	}
	taskName := name
	if version != "" {
		taskName = name + "@" + version
	}
	return s.queue.Enqueue("software_uninstall", taskName, createdBy)
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
// On APT it symlinks to /etc/php; on DNF (Remi) it symlinks to /etc/opt/remi.
const phpConfBase = "/ITDLUPanel/server/php/conf"

// phpRemiVer converts a dotted version "8.4" to the Remi directory format "php84".
func phpRemiVer(version string) string {
	return "php" + strings.ReplaceAll(version, ".", "")
}

// phpFPMServiceName returns the systemd service name for PHP-FPM on the current OS.
// RHEL Remi uses "php{ver}-php-fpm" (e.g., php83-php-fpm), while
// Debian/Ubuntu uses "php{ver}-fpm" (e.g., php8.3-fpm).
func phpFPMServiceName(version string) string {
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		return fmt.Sprintf("%s-php-fpm", phpRemiVer(version))
	}
	return fmt.Sprintf("php%s-fpm", version)
}

// phpConfDir returns the versioned config directory inside phpConfBase.
// APT: /ITDLUPanel/server/php/conf/8.4  (symlink to /etc/php/8.4)
// DNF: /ITDLUPanel/server/php/conf/php84 (symlink to /etc/opt/remi/php84)
func phpConfDir(version string) string {
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		return fmt.Sprintf("%s/%s", phpConfBase, phpRemiVer(version))
	}
	return fmt.Sprintf("%s/%s", phpConfBase, version)
}

// phpFPMIni returns the path to the FPM php.ini for the given version.
// APT: {conf}/8.4/fpm/php.ini   DNF: {conf}/php84/php.ini
func phpFPMIni(version string) string {
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		return fmt.Sprintf("%s/%s/php.ini", phpConfBase, phpRemiVer(version))
	}
	return fmt.Sprintf("%s/%s/fpm/php.ini", phpConfBase, version)
}

// phpCLIIni returns the path to the CLI php.ini for the given version.
// APT: {conf}/8.4/cli/php.ini   DNF: {conf}/php84/php.ini (same file)
func phpCLIIni(version string) string {
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		// Remi shares one php.ini for both FPM and CLI
		return fmt.Sprintf("%s/%s/php.ini", phpConfBase, phpRemiVer(version))
	}
	return fmt.Sprintf("%s/%s/cli/php.ini", phpConfBase, version)
}

// phpFPMPoolConf returns the path to the FPM www.conf pool config.
// APT: {conf}/8.4/fpm/pool.d/www.conf   DNF: {conf}/php84/php-fpm.d/www.conf
func phpFPMPoolConf(version string) string {
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		return fmt.Sprintf("%s/%s/php-fpm.d/www.conf", phpConfBase, phpRemiVer(version))
	}
	return fmt.Sprintf("%s/%s/fpm/pool.d/www.conf", phpConfBase, version)
}

// phpSlowLogPath returns the default slow log path for the given PHP version.
func phpSlowLogPath(version string) string {
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		remiVer := phpRemiVer(version)
		return fmt.Sprintf("/var/opt/remi/%s/log/php-fpm/www-slow.log", remiVer)
	}
	return fmt.Sprintf("/var/log/php%s-fpm.log.slow", version)
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

	svcName := phpFPMServiceName(version)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", svcName); err != nil {
		logger.Warn().Err(err).Str("service", svcName).Msg("failed to restart php-fpm after config change")
	}

	return nil
}

// PHPOPcacheConfig represents PHP OPcache settings.
type PHPOPcacheConfig struct {
	Enable                string `json:"opcache_enable"`
	MemoryConsumption     string `json:"opcache_memory_consumption"`
	MaxAcceleratedFiles   string `json:"opcache_max_accelerated_files"`
	ValidateTimestamps    string `json:"opcache_validate_timestamps"`
	RevalidateFreq        string `json:"opcache_revalidate_freq"`
	SaveComments          string `json:"opcache_save_comments"`
	EnableCLI             string `json:"opcache_enable_cli"`
	InternedStringsBuffer string `json:"opcache_interned_strings_buffer"`
}

// GetPHPOPcache reads OPcache config values from php.ini for the given version.
func (s *SoftwareService) GetPHPOPcache(version string) (*PHPOPcacheConfig, error) {
	iniPath := phpFPMIni(version)
	if _, err := os.Stat(iniPath); err != nil {
		return nil, fmt.Errorf("php.ini not found for PHP %s: %w", version, err)
	}

	cfg := &PHPOPcacheConfig{
		Enable:                readPHPIniValue(iniPath, "opcache.enable"),
		MemoryConsumption:     readPHPIniValue(iniPath, "opcache.memory_consumption"),
		MaxAcceleratedFiles:   readPHPIniValue(iniPath, "opcache.max_accelerated_files"),
		ValidateTimestamps:    readPHPIniValue(iniPath, "opcache.validate_timestamps"),
		RevalidateFreq:        readPHPIniValue(iniPath, "opcache.revalidate_freq"),
		SaveComments:          readPHPIniValue(iniPath, "opcache.save_comments"),
		EnableCLI:             readPHPIniValue(iniPath, "opcache.enable_cli"),
		InternedStringsBuffer: readPHPIniValue(iniPath, "opcache.interned_strings_buffer"),
	}
	return cfg, nil
}

// SetPHPOPcache updates OPcache config values in php.ini and restarts php-fpm.
func (s *SoftwareService) SetPHPOPcache(version string, cfg PHPOPcacheConfig) error {
	iniPaths := []string{
		phpFPMIni(version),
		phpCLIIni(version),
	}

	settings := map[string]string{
		"opcache.enable":                  cfg.Enable,
		"opcache.memory_consumption":      cfg.MemoryConsumption,
		"opcache.max_accelerated_files":   cfg.MaxAcceleratedFiles,
		"opcache.validate_timestamps":     cfg.ValidateTimestamps,
		"opcache.revalidate_freq":         cfg.RevalidateFreq,
		"opcache.save_comments":           cfg.SaveComments,
		"opcache.enable_cli":              cfg.EnableCLI,
		"opcache.interned_strings_buffer": cfg.InternedStringsBuffer,
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

	svcName := phpFPMServiceName(version)
	if _, err := system.ExecWithTimeout(30*time.Second, "systemctl", "restart", svcName); err != nil {
		logger.Warn().Err(err).Str("service", svcName).Msg("failed to restart php-fpm after opcache config change")
	}

	return nil
}

func readPHPIniValue(filePath, key string) string {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return ""
	}

	// First pass: look for an uncommented (active) value.
	// Second pass: fall back to commented-out default (;key=val).
	var commented string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)

		if strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
			stripped := strings.TrimLeft(line, ";# ")
			if strings.HasPrefix(stripped, key+" ") || strings.HasPrefix(stripped, key+"=") {
				parts := strings.SplitN(stripped, "=", 2)
				if len(parts) == 2 && commented == "" {
					commented = strings.TrimSpace(parts[1])
				}
			}
			continue
		}
		if strings.HasPrefix(line, key+" ") || strings.HasPrefix(line, key+"=") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return commented
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

	svcName := phpFPMServiceName(version)
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
	svcName := phpFPMServiceName(version)
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

	osInfo := system.GetOSInfo()

	// Try common log paths — centralized logs first, then system paths
	candidates := []string{
		filepath.Join(installer.LogsBaseDir, fmt.Sprintf("php%s-fpm.log", version)),
	}
	if osInfo.PkgManager == "dnf" {
		remiVer := "php" + strings.ReplaceAll(version, ".", "")
		candidates = append(candidates,
			fmt.Sprintf("/var/opt/remi/%s/log/php-fpm/error.log", remiVer),
			"/var/log/php-fpm/error.log",
		)
	} else {
		candidates = append(candidates,
			fmt.Sprintf("/var/log/php%s-fpm.log", version),
			fmt.Sprintf("/var/log/php-fpm/php%s-fpm.log", version),
		)
	}
	candidates = append(candidates, "/var/log/syslog")

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

	svcName := phpFPMServiceName(version)
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

	// MySQL/MariaDB specific: get version from mysqld, port, datadir, uptime
	if name == "mysql" {
		vRes, _ := system.ExecWithTimeout(5*time.Second, "mysql", "--version")
		if vRes != nil && vRes.Stdout != "" {
			result["version_string"] = strings.TrimSpace(vRes.Stdout)
		}
		if s.isServiceRunning(svcName) {
			statusRes, _ := system.ExecWithTimeout(5*time.Second, "mysql", "-e",
				"SELECT @@port AS port, @@datadir AS datadir, @@version AS version;",
				"--batch", "--skip-column-names")
			if statusRes != nil && statusRes.Stdout != "" {
				fields := strings.Split(strings.TrimSpace(statusRes.Stdout), "\t")
				if len(fields) >= 3 {
					result["port"] = fields[0]
					result["datadir"] = fields[1]
					result["version"] = fields[2]
				}
			}
			uptimeRes, _ := system.ExecWithTimeout(5*time.Second, "mysql", "-e",
				"SHOW GLOBAL STATUS LIKE 'Uptime';", "--batch", "--skip-column-names")
			if uptimeRes != nil && uptimeRes.Stdout != "" {
				parts := strings.Fields(strings.TrimSpace(uptimeRes.Stdout))
				if len(parts) >= 2 {
					result["uptime_seconds"] = parts[1]
				}
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

// serviceNameAliases maps a software key to alternative systemd service names
// to try when the primary name fails (e.g., Ubuntu 24 drops mysql→mariadb alias).
var serviceNameAliases = map[string][]string{
	"mysql":    {"mariadb", "mysql", "mysqld"},
	"pureftpd": {"pure-ftpd", "pureftpd"},
	"redis":    {"redis-server", "redis"},
	"apache":   {"apache2", "httpd"},
}

// resolveServiceName looks up the systemd service name for the given software.
func (s *SoftwareService) resolveServiceName(name string) (string, error) {
	// Handle version-specific PHP-FPM names (e.g., "php8.3-fpm", "php8.2-fpm")
	if strings.HasPrefix(name, "php") && strings.HasSuffix(name, "-fpm") {
		return name, nil
	}

	// For generic "php", resolve to the first installed PHP-FPM version
	if name == "php" {
		versions := s.detectInstalledPHPVersions()
		if len(versions) > 0 {
			return phpFPMServiceName(versions[len(versions)-1]), nil
		}
		return phpFPMServiceName("8.3"), nil // fallback
	}

	// First try the database value
	var svcName string
	err := s.db.QueryRow("SELECT service_name FROM software WHERE name = ?", name).Scan(&svcName)
	if err == nil && svcName != "" {
		// Verify the DB service name actually resolves; if not, probe aliases
		if s.isServiceRunning(svcName) {
			return svcName, nil
		}
		if aliases, ok := serviceNameAliases[name]; ok {
			for _, alias := range aliases {
				if alias != svcName && s.isServiceKnown(alias) {
					// Update the DB so future lookups are fast
					_, _ = s.db.Exec("UPDATE software SET service_name = ? WHERE name = ?", alias, name)
					return alias, nil
				}
			}
		}
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

// isServiceKnown checks if a systemd unit exists (active, inactive, or failed).
func (s *SoftwareService) isServiceKnown(serviceName string) bool {
	res, err := system.ExecWithTimeout(5*time.Second, "systemctl", "is-active", serviceName)
	if err != nil {
		return false
	}
	status := strings.TrimSpace(res.Stdout)
	return status == "active" || status == "inactive" || status == "failed"
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
	// Log symlinks are in /ITDLUPanel/logs/ — created by installers
	logPaths := map[string]string{
		"nginx":         filepath.Join(installer.LogsBaseDir, "nginx.error.log"),
		"mysql":         filepath.Join(installer.LogsBaseDir, "mysql.error.log"),
		"redis":         filepath.Join(installer.LogsBaseDir, "redis.log"),
		"apache":        filepath.Join(installer.LogsBaseDir, "apache.error.log"),
		"openlitespeed": filepath.Join(installer.LogsBaseDir, "openlitespeed.error.log"),
	}

	if lines <= 0 {
		lines = 100
	}
	if lines > 1000 {
		lines = 1000
	}

	logPath, ok := logPaths[name]
	if !ok {
		return "", "", fmt.Errorf("no error log path known for %s", name)
	}

	// Try file-based log first
	if _, statErr := os.Stat(logPath); statErr == nil {
		res, err := system.ExecWithTimeout(10*time.Second, "tail", "-n", strconv.Itoa(lines), logPath)
		if err != nil {
			return "", logPath, fmt.Errorf("failed to read error log: %w", err)
		}
		return res.Stdout, logPath, nil
	}

	// Fallback to journalctl for MySQL/MariaDB (often logs to syslog)
	if name == "mysql" {
		for _, svc := range []string{"mariadb", "mysql", "mysqld"} {
			res, err := system.ExecWithTimeout(10*time.Second, "journalctl", "-u", svc, "--no-pager", "-n", strconv.Itoa(lines))
			if err == nil && res.Stdout != "" && !strings.Contains(res.Stdout, "No entries") {
				return res.Stdout, "journalctl -u " + svc, nil
			}
		}
	}

	return "", logPath, fmt.Errorf("error log not found at %s (file does not exist)", logPath)
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

	// Advanced Performance
	WorkerRlimitNofile string `json:"worker_rlimit_nofile"`
	SendTimeout        string `json:"send_timeout"`

	// File Cache
	OpenFileCache        string `json:"open_file_cache"`
	OpenFileCacheValid   string `json:"open_file_cache_valid"`
	OpenFileCacheMinUses string `json:"open_file_cache_min_uses"`

	// SSL
	SSLProtocols           string `json:"ssl_protocols"`
	SSLPreferServerCiphers string `json:"ssl_prefer_server_ciphers"`

	// FastCGI Cache
	FastcgiCachePath string `json:"fastcgi_cache_path"`
}

// GetNginxOptimization reads tunable params from nginx.conf.
func (s *SoftwareService) GetNginxOptimization() (*NginxOptimization, error) {
	content, err := s.GetConfig("nginx")
	if err != nil {
		return nil, err
	}

	// Extract fastcgi_cache_path with custom regex (value is multi-word with options).
	fastcgiCachePath := ""
	if re := regexp.MustCompile(`(?m)^\s*fastcgi_cache_path\s+(.+?)\s*;`); true {
		if m := re.FindStringSubmatch(content); len(m) > 1 {
			fastcgiCachePath = strings.TrimSpace(m[1])
		}
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

		WorkerRlimitNofile:     extractDirective(content, "worker_rlimit_nofile", "65535"),
		SendTimeout:            extractDirective(content, "send_timeout", "60"),
		OpenFileCache:          extractDirective(content, "open_file_cache", "off"),
		OpenFileCacheValid:     extractDirective(content, "open_file_cache_valid", "60s"),
		OpenFileCacheMinUses:   extractDirective(content, "open_file_cache_min_uses", "2"),
		SSLProtocols:           extractDirective(content, "ssl_protocols", "TLSv1.2 TLSv1.3"),
		SSLPreferServerCiphers: extractDirective(content, "ssl_prefer_server_ciphers", "on"),
		FastcgiCachePath:       fastcgiCachePath,
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

	content = setDirective(content, "worker_rlimit_nofile", opt.WorkerRlimitNofile)
	content = setDirective(content, "send_timeout", opt.SendTimeout)
	content = setDirective(content, "open_file_cache ", opt.OpenFileCache) // trailing space to avoid matching open_file_cache_*
	content = setDirective(content, "open_file_cache_valid", opt.OpenFileCacheValid)
	content = setDirective(content, "open_file_cache_min_uses", opt.OpenFileCacheMinUses)
	content = setDirective(content, "ssl_protocols", opt.SSLProtocols)
	content = setDirective(content, "ssl_prefer_server_ciphers", opt.SSLPreferServerCiphers)
	if opt.FastcgiCachePath != "" {
		content = setDirective(content, "fastcgi_cache_path", opt.FastcgiCachePath)
	}

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
// Apache Optimization
// ---------------------------------------------------------------------------

// ApacheOptimization holds tunable Apache parameters.
type ApacheOptimization struct {
	// General
	Timeout              string `json:"timeout"`
	KeepAlive            string `json:"keep_alive"`
	MaxKeepAliveRequests string `json:"max_keep_alive_requests"`
	KeepAliveTimeout     string `json:"keep_alive_timeout"`
	// MPM (event/worker)
	MaxRequestWorkers string `json:"max_request_workers"`
	StartServers      string `json:"start_servers"`
	MinSpareThreads   string `json:"min_spare_threads"`
	MaxSpareThreads   string `json:"max_spare_threads"`
	ServerLimit       string `json:"server_limit"`
	ThreadLimit       string `json:"thread_limit"`
	// Security
	ServerTokens    string `json:"server_tokens"`
	ServerSignature string `json:"server_signature"`
	TraceEnable     string `json:"trace_enable"`
}

// GetApacheOptimization reads tunable params from Apache config.
func (s *SoftwareService) GetApacheOptimization() (*ApacheOptimization, error) {
	content, err := s.GetConfig("apache")
	if err != nil {
		return nil, err
	}

	// Also try to read MPM config
	mpmContent := ""
	apacheConf := filepath.Join(installer.ServerBaseDir, "apache", "conf")
	mpmPaths := []string{
		filepath.Join(apacheConf, "mods-enabled", "mpm_event.conf"),
		filepath.Join(apacheConf, "mods-enabled", "mpm_worker.conf"),
		filepath.Join(apacheConf, "mods-enabled", "mpm_prefork.conf"),
	}
	for _, p := range mpmPaths {
		if data, err := os.ReadFile(p); err == nil {
			mpmContent = string(data)
			break
		}
	}

	opt := &ApacheOptimization{
		Timeout:              extractApacheDirective(content, "Timeout", "300"),
		KeepAlive:            extractApacheDirective(content, "KeepAlive", "On"),
		MaxKeepAliveRequests: extractApacheDirective(content, "MaxKeepAliveRequests", "100"),
		KeepAliveTimeout:     extractApacheDirective(content, "KeepAliveTimeout", "5"),
		ServerTokens:         extractApacheDirective(content, "ServerTokens", "OS"),
		ServerSignature:      extractApacheDirective(content, "ServerSignature", "On"),
		TraceEnable:          extractApacheDirective(content, "TraceEnable", "On"),
	}

	// MPM directives from mpm config
	if mpmContent != "" {
		opt.MaxRequestWorkers = extractApacheDirective(mpmContent, "MaxRequestWorkers", "150")
		opt.StartServers = extractApacheDirective(mpmContent, "StartServers", "2")
		opt.MinSpareThreads = extractApacheDirective(mpmContent, "MinSpareThreads", "25")
		opt.MaxSpareThreads = extractApacheDirective(mpmContent, "MaxSpareThreads", "75")
		opt.ServerLimit = extractApacheDirective(mpmContent, "ServerLimit", "16")
		opt.ThreadLimit = extractApacheDirective(mpmContent, "ThreadLimit", "64")
	} else {
		opt.MaxRequestWorkers = "150"
		opt.StartServers = "2"
		opt.MinSpareThreads = "25"
		opt.MaxSpareThreads = "75"
		opt.ServerLimit = "16"
		opt.ThreadLimit = "64"
	}

	return opt, nil
}

// UpdateApacheOptimization updates tunable params in Apache config.
func (s *SoftwareService) UpdateApacheOptimization(opt *ApacheOptimization) error {
	// Update main config
	content, err := s.GetConfig("apache")
	if err != nil {
		return err
	}

	content = setApacheDirective(content, "Timeout", opt.Timeout)
	content = setApacheDirective(content, "KeepAlive", opt.KeepAlive)
	content = setApacheDirective(content, "MaxKeepAliveRequests", opt.MaxKeepAliveRequests)
	content = setApacheDirective(content, "KeepAliveTimeout", opt.KeepAliveTimeout)
	content = setApacheDirective(content, "ServerTokens", opt.ServerTokens)
	content = setApacheDirective(content, "ServerSignature", opt.ServerSignature)
	content = setApacheDirective(content, "TraceEnable", opt.TraceEnable)

	if err := s.UpdateConfig("apache", content); err != nil {
		return err
	}

	// Update MPM config
	apacheConf := filepath.Join(installer.ServerBaseDir, "apache", "conf")
	mpmPaths2 := []string{
		filepath.Join(apacheConf, "mods-enabled", "mpm_event.conf"),
		filepath.Join(apacheConf, "mods-enabled", "mpm_worker.conf"),
		filepath.Join(apacheConf, "mods-enabled", "mpm_prefork.conf"),
	}
	for _, p := range mpmPaths2 {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		mpmContent := string(data)
		mpmContent = setApacheDirective(mpmContent, "MaxRequestWorkers", opt.MaxRequestWorkers)
		mpmContent = setApacheDirective(mpmContent, "StartServers", opt.StartServers)
		mpmContent = setApacheDirective(mpmContent, "MinSpareThreads", opt.MinSpareThreads)
		mpmContent = setApacheDirective(mpmContent, "MaxSpareThreads", opt.MaxSpareThreads)
		mpmContent = setApacheDirective(mpmContent, "ServerLimit", opt.ServerLimit)
		mpmContent = setApacheDirective(mpmContent, "ThreadLimit", opt.ThreadLimit)
		os.WriteFile(p, []byte(mpmContent), 0644)
		break
	}

	return nil
}

// extractApacheDirective reads a directive value from Apache config text.
func extractApacheDirective(content, directive, defaultVal string) string {
	re := regexp.MustCompile(`(?mi)^\s*` + regexp.QuoteMeta(directive) + `\s+(.+?)\s*$`)
	matches := re.FindStringSubmatch(content)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}
	return defaultVal
}

// setApacheDirective replaces a directive's value in Apache config text.
func setApacheDirective(content, directive, value string) string {
	re := regexp.MustCompile(`(?mi)(^\s*` + regexp.QuoteMeta(directive) + `\s+).+?(\s*)$`)
	if re.MatchString(content) {
		return re.ReplaceAllString(content, "${1}"+value+"${2}")
	}
	return content
}

// ---------------------------------------------------------------------------
// OpenLiteSpeed Optimization
// ---------------------------------------------------------------------------

// OLSOptimization holds tunable OpenLiteSpeed parameters.
type OLSOptimization struct {
	// Server
	MaxConnections    string `json:"max_connections"`
	MaxSSLConnections string `json:"max_ssl_connections"`
	ConnTimeout       string `json:"conn_timeout"`
	MaxKeepAliveReq   string `json:"max_keep_alive_req"`
	KeepAliveTimeout  string `json:"keep_alive_timeout"`
	// Tuning
	MaxReqURLLen         string `json:"max_req_url_len"`
	MaxReqHeaderSize     string `json:"max_req_header_size"`
	MaxReqBodySize       string `json:"max_req_body_size"`
	MaxDynRespHeaderSize string `json:"max_dyn_resp_header_size"`
	MaxDynRespSize       string `json:"max_dyn_resp_size"`
	// Gzip
	EnableGzip    string `json:"enable_gzip"`
	GzipCompLevel string `json:"gzip_comp_level"`
	// Security
	ServerName          string `json:"server_name"`
	DisableServerHeader string `json:"disable_server_header"`
}

// GetOLSOptimization reads tunable params from OpenLiteSpeed config.
func (s *SoftwareService) GetOLSOptimization() (*OLSOptimization, error) {
	content, err := s.GetConfig("openlitespeed")
	if err != nil {
		return nil, err
	}

	opt := &OLSOptimization{
		MaxConnections:       extractOLSDirective(content, "maxConnections", "10000"),
		MaxSSLConnections:    extractOLSDirective(content, "maxSSLConnections", "10000"),
		ConnTimeout:          extractOLSDirective(content, "connTimeout", "300"),
		MaxKeepAliveReq:      extractOLSDirective(content, "maxKeepAliveReq", "10000"),
		KeepAliveTimeout:     extractOLSDirective(content, "keepAliveTimeout", "5"),
		MaxReqURLLen:         extractOLSDirective(content, "maxReqURLLen", "8192"),
		MaxReqHeaderSize:     extractOLSDirective(content, "maxReqHeaderSize", "16380"),
		MaxReqBodySize:       extractOLSDirective(content, "maxReqBodySize", "2047M"),
		MaxDynRespHeaderSize: extractOLSDirective(content, "maxDynRespHeaderSize", "8192"),
		MaxDynRespSize:       extractOLSDirective(content, "maxDynRespSize", "2047M"),
		EnableGzip:           extractOLSDirective(content, "enableGzipCompress", "1"),
		GzipCompLevel:        extractOLSDirective(content, "gzipCompressLevel", "6"),
		ServerName:           extractOLSDirective(content, "serverName", "LiteSpeed"),
		DisableServerHeader:  extractOLSDirective(content, "useIpInProxyHeader", "0"),
	}
	return opt, nil
}

// UpdateOLSOptimization updates tunable params in OpenLiteSpeed config.
func (s *SoftwareService) UpdateOLSOptimization(opt *OLSOptimization) error {
	content, err := s.GetConfig("openlitespeed")
	if err != nil {
		return err
	}

	content = setOLSDirective(content, "maxConnections", opt.MaxConnections)
	content = setOLSDirective(content, "maxSSLConnections", opt.MaxSSLConnections)
	content = setOLSDirective(content, "connTimeout", opt.ConnTimeout)
	content = setOLSDirective(content, "maxKeepAliveReq", opt.MaxKeepAliveReq)
	content = setOLSDirective(content, "keepAliveTimeout", opt.KeepAliveTimeout)
	content = setOLSDirective(content, "maxReqURLLen", opt.MaxReqURLLen)
	content = setOLSDirective(content, "maxReqHeaderSize", opt.MaxReqHeaderSize)
	content = setOLSDirective(content, "maxReqBodySize", opt.MaxReqBodySize)
	content = setOLSDirective(content, "maxDynRespHeaderSize", opt.MaxDynRespHeaderSize)
	content = setOLSDirective(content, "maxDynRespSize", opt.MaxDynRespSize)
	content = setOLSDirective(content, "enableGzipCompress", opt.EnableGzip)
	content = setOLSDirective(content, "gzipCompressLevel", opt.GzipCompLevel)
	content = setOLSDirective(content, "serverName", opt.ServerName)
	content = setOLSDirective(content, "useIpInProxyHeader", opt.DisableServerHeader)

	return s.UpdateConfig("openlitespeed", content)
}

// extractOLSDirective reads a directive value from OpenLiteSpeed config text.
func extractOLSDirective(content, directive, defaultVal string) string {
	re := regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(directive) + `\s+(.+?)\s*$`)
	matches := re.FindStringSubmatch(content)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}
	return defaultVal
}

// setOLSDirective replaces a directive's value in OpenLiteSpeed config text.
func setOLSDirective(content, directive, value string) string {
	re := regexp.MustCompile(`(?m)(^\s*` + regexp.QuoteMeta(directive) + `\s+).+?(\s*)$`)
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
	phpmyadminRoot       = "/ITDLUPanel/server/phpmyadmin/www"
	phpmyadminSSLDir     = "/ITDLUPanel/server/phpmyadmin/ssl"
	phpmyadminHTPasswd   = "/ITDLUPanel/server/phpmyadmin/.htpasswd"
)

// phpmyadminNginxConfPath returns the path to the phpMyAdmin nginx config via server dir.
func phpmyadminNginxConfPath() string {
	return filepath.Join(installer.ServerBaseDir, "nginx", "conf", "conf.d", "phpmyadmin.conf")
}

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
	// Detect installed PHP version instead of hardcoding
	phpVer := detectDefaultPHPVersion()
	return &PhpMyAdminConfig{
		PublicAccess: true,
		PHPVersion:   phpVer,
		AccessPort:   888,
		SSLEnabled:   false,
		SSLPort:      887,
		AuthEnabled:  false,
	}
}

// detectDefaultPHPVersion finds the best PHP-FPM version on the system.
func detectDefaultPHPVersion() string {
	for _, ver := range []string{"8.4", "8.3", "8.2", "8.1", "8.0", "7.4"} {
		sock := fmt.Sprintf("/var/run/php/php%s-fpm.sock", ver)
		if _, err := os.Stat(sock); err == nil {
			return ver
		}
		sock = fmt.Sprintf("/run/php/php%s-fpm.sock", ver)
		if _, err := os.Stat(sock); err == nil {
			return ver
		}
	}
	return "8.3"
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

	// Reconcile: if SSL is enabled but nginx config is missing SSL block, regenerate
	if cfg.SSLEnabled {
		nginxData, _ := os.ReadFile(phpmyadminNginxConfPath())
		if !strings.Contains(string(nginxData), "ssl") {
			go func() {
				if err := s.SetPhpMyAdminConfig(cfg); err != nil {
					logger.Warn().Err(err).Msg("failed to reconcile phpMyAdmin SSL config")
				}
			}()
		}
	}

	return cfg, nil
}

// detectPHPVersionFromNginx reads the nginx phpmyadmin config and extracts the
// php-fpm version from the fastcgi_pass socket path.
func (s *SoftwareService) detectPHPVersionFromNginx(fallback string) string {
	data, err := os.ReadFile(phpmyadminNginxConfPath())
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
		cfg.PHPVersion = detectDefaultPHPVersion()
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
	if err := os.WriteFile(phpmyadminNginxConfPath(), []byte(nginxCfg), 0644); err != nil {
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
	if ssl {
		b.WriteString("        fastcgi_param HTTPS on;\n")
	}
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

// ═══════════════════════════════════════════════════════════════════════════
// pgAdmin4 Manager
// ═══════════════════════════════════════════════════════════════════════════

const (
	pgadminConfigPath = "/ITDLUPanel/server/config/pgadmin_config.json"
	pgadminSSLDir     = "/ITDLUPanel/server/pgadmin/ssl"
	pgadminHTPasswd   = "/ITDLUPanel/server/pgadmin/.htpasswd"
)

func pgadminNginxConfPath() string {
	return filepath.Join(installer.ServerBaseDir, "nginx", "conf", "conf.d", "pgadmin.conf")
}

// PgAdminConfig holds the pgAdmin manager settings.
type PgAdminConfig struct {
	PublicAccess bool   `json:"public_access"`
	AccessPort   int    `json:"access_port"`
	SSLEnabled   bool   `json:"ssl_enabled"`
	SSLPort      int    `json:"ssl_port"`
	AuthEnabled  bool   `json:"auth_enabled"`
	AuthUser     string `json:"auth_user"`
	AuthPassword string `json:"auth_password"`
}

func defaultPgAdminConfig() *PgAdminConfig {
	return &PgAdminConfig{
		PublicAccess: true,
		AccessPort:   5050,
		SSLEnabled:   false,
		SSLPort:      5051,
		AuthEnabled:  false,
	}
}

// GetPgAdminConfig reads the pgAdmin config from disk or returns defaults.
func (s *SoftwareService) GetPgAdminConfig() (*PgAdminConfig, error) {
	cfg := defaultPgAdminConfig()

	data, err := os.ReadFile(pgadminConfigPath)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, fmt.Errorf("failed to read pgadmin config: %w", err)
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("failed to parse pgadmin config: %w", err)
	}

	return cfg, nil
}

// SetPgAdminConfig persists the config, regenerates nginx config, manages
// SSL certs, htpasswd, firewall rules, and reloads nginx.
func (s *SoftwareService) SetPgAdminConfig(cfg *PgAdminConfig) error {
	if cfg.AccessPort == 0 {
		cfg.AccessPort = 5050
	}
	if cfg.SSLPort == 0 {
		cfg.SSLPort = 5051
	}

	// Persist config JSON
	if err := s.savePgAdminConfig(cfg); err != nil {
		return err
	}

	// Handle basic auth htpasswd
	if cfg.AuthEnabled {
		if err := s.ensurePgAdminHTPasswd(cfg.AuthUser, cfg.AuthPassword); err != nil {
			return fmt.Errorf("failed to create htpasswd: %w", err)
		}
	}

	// Handle SSL certs
	if cfg.SSLEnabled {
		if err := s.ensurePgAdminSSLCerts(); err != nil {
			return fmt.Errorf("failed to ensure SSL certs: %w", err)
		}
	}

	// Generate nginx config
	nginxCfg := s.buildPgAdminNginxConfig(cfg)
	if err := os.WriteFile(pgadminNginxConfPath(), []byte(nginxCfg), 0644); err != nil {
		return fmt.Errorf("failed to write nginx config: %w", err)
	}

	// Test nginx config
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
		logger.Warn().Err(err).Msg("failed to reload nginx after pgadmin config update")
	}

	// Manage firewall rules
	s.managePgAdminFirewall(cfg)

	return nil
}

func (s *SoftwareService) savePgAdminConfig(cfg *PgAdminConfig) error {
	dir := filepath.Dir(pgadminConfigPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config dir: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal pgadmin config: %w", err)
	}
	return os.WriteFile(pgadminConfigPath, data, 0644)
}

func (s *SoftwareService) ensurePgAdminHTPasswd(user, password string) error {
	if user == "" || password == "" {
		return fmt.Errorf("auth_user and auth_password are required when auth is enabled")
	}

	dir := filepath.Dir(pgadminHTPasswd)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	result, err := system.ExecWithTimeout(5*time.Second, "htpasswd", "-cb", pgadminHTPasswd, user, password)
	if err == nil && result.ExitCode == 0 {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	line := fmt.Sprintf("%s:%s\n", user, string(hash))
	return os.WriteFile(pgadminHTPasswd, []byte(line), 0644)
}

func (s *SoftwareService) ensurePgAdminSSLCerts() error {
	certPath := filepath.Join(pgadminSSLDir, "pgadmin.crt")
	keyPath := filepath.Join(pgadminSSLDir, "pgadmin.key")

	if _, err := os.Stat(certPath); err == nil {
		if _, err := os.Stat(keyPath); err == nil {
			return nil
		}
	}

	if err := os.MkdirAll(pgadminSSLDir, 0755); err != nil {
		return fmt.Errorf("failed to create SSL dir: %w", err)
	}

	result, err := system.ExecWithTimeout(30*time.Second,
		"openssl", "req", "-x509", "-nodes", "-days", "3650",
		"-newkey", "rsa:2048",
		"-keyout", keyPath,
		"-out", certPath,
		"-subj", "/CN=pgAdmin/O=ITDLUPanel",
	)
	if err != nil {
		return fmt.Errorf("failed to generate self-signed cert: %w", err)
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("openssl failed: %s", result.Stderr)
	}
	return nil
}

func (s *SoftwareService) buildPgAdminNginxConfig(cfg *PgAdminConfig) string {
	var b strings.Builder
	b.WriteString("# pgAdmin4 - managed by ITDLUPanel\n")

	// HTTP server block
	s.writePgAdminServerBlock(&b, cfg, false)

	// SSL server block
	if cfg.SSLEnabled {
		b.WriteString("\n")
		s.writePgAdminServerBlock(&b, cfg, true)
	}

	return b.String()
}

func (s *SoftwareService) writePgAdminServerBlock(b *strings.Builder, cfg *PgAdminConfig, ssl bool) {
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
	b.WriteString("    server_name _;\n\n")

	// pgAdmin uses large session cookies — increase header buffer sizes
	b.WriteString("    large_client_header_buffers 4 32k;\n")
	b.WriteString("    proxy_buffer_size 16k;\n")
	b.WriteString("    proxy_buffers 4 16k;\n\n")

	if ssl {
		fmt.Fprintf(b, "    ssl_certificate %s/pgadmin.crt;\n", pgadminSSLDir)
		fmt.Fprintf(b, "    ssl_certificate_key %s/pgadmin.key;\n", pgadminSSLDir)
		b.WriteString("    ssl_protocols TLSv1.2 TLSv1.3;\n\n")
	}

	if cfg.AuthEnabled {
		b.WriteString("    auth_basic \"pgAdmin Login\";\n")
		fmt.Fprintf(b, "    auth_basic_user_file %s;\n\n", pgadminHTPasswd)
	}

	if !cfg.PublicAccess {
		b.WriteString("    allow 127.0.0.1;\n")
		b.WriteString("    deny all;\n\n")
	}

	b.WriteString("    location / {\n")
	b.WriteString("        proxy_pass http://127.0.0.1:15050;\n")
	b.WriteString("        proxy_set_header Host $host;\n")
	b.WriteString("        proxy_set_header X-Real-IP $remote_addr;\n")
	b.WriteString("        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n")
	b.WriteString("        proxy_set_header X-Forwarded-Proto $scheme;\n")
	b.WriteString("        proxy_set_header X-Script-Name /;\n")
	b.WriteString("        proxy_redirect off;\n")
	b.WriteString("    }\n")

	b.WriteString("}\n")
}

func (s *SoftwareService) managePgAdminFirewall(cfg *PgAdminConfig) {
	if s.firewallService == nil {
		return
	}

	httpPort := strconv.Itoa(cfg.AccessPort)
	sslPort := strconv.Itoa(cfg.SSLPort)

	if err := s.firewallService.UpdateDefaultPort("pgAdmin", httpPort); err != nil {
		logger.Warn().Err(err).Str("port", httpPort).Msg("failed to update default pgAdmin firewall port")
	}

	if cfg.SSLEnabled {
		softwarePortMap["pgadmin-ssl"] = []struct {
			Port     string
			Protocol string
			Desc     string
		}{{Port: sslPort, Protocol: "tcp", Desc: "pgAdmin SSL"}}
		s.firewallService.OpenPortsForSoftware("pgadmin-ssl")
	} else {
		s.firewallService.ClosePortsForSoftware("pgadmin-ssl")
		delete(softwarePortMap, "pgadmin-ssl")
	}

	softwarePortMap["pgadmin"] = []struct {
		Port     string
		Protocol string
		Desc     string
	}{{Port: httpPort, Protocol: "tcp", Desc: "pgAdmin"}}
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

	osInfo := system.GetOSInfo()
	isDNF := osInfo.PkgManager == "dnf"

	var versions []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()

		// Derive dotted version from directory name.
		// APT dirs: "8.4", "8.3", etc.
		// DNF (Remi) dirs: "php84", "php83", etc.
		var ver string
		if isDNF {
			if !strings.HasPrefix(name, "php") {
				continue
			}
			digits := name[3:] // "84"
			if len(digits) < 2 {
				continue
			}
			ver = digits[:len(digits)-1] + "." + digits[len(digits)-1:]
		} else {
			ver = name
		}

		// Check for active FPM socket
		if hasPHPFPMSocket(ver, isDNF) {
			versions = append(versions, ver)
		}
	}

	return versions, nil
}

// hasPHPFPMSocket checks common socket paths for a PHP-FPM version.
func hasPHPFPMSocket(version string, isDNF bool) bool {
	var candidates []string
	if isDNF {
		remiVer := "php" + strings.ReplaceAll(version, ".", "")
		candidates = []string{
			fmt.Sprintf("/var/opt/remi/%s/run/php-fpm/www.sock", remiVer),
			fmt.Sprintf("/run/php-fpm/%s-www.sock", remiVer),
			"/run/php-fpm/www.sock",
		}
	} else {
		candidates = []string{
			fmt.Sprintf("/run/php/php%s-fpm.sock", version),
			fmt.Sprintf("/var/run/php/php%s-fpm.sock", version),
		}
	}

	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return true
		}
	}

	// Fallback: check if the service is active
	svcName := phpFPMServiceName(version)
	res, err := system.ExecWithTimeout(5*time.Second, "systemctl", "is-active", svcName)
	if err == nil && strings.TrimSpace(res.Stdout) == "active" {
		return true
	}

	return false
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
	svcName := phpFPMServiceName(version)
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
		slowlogPath = phpSlowLogPath(version)
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
	slowlogPath := phpSlowLogPath(version)

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

	svcName := phpFPMServiceName(version)
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
	osInfo := system.GetOSInfo()
	var bin string
	if osInfo.PkgManager == "dnf" {
		remiVer := "php" + strings.ReplaceAll(version, ".", "")
		bin = fmt.Sprintf("/opt/remi/%s/root/usr/bin/php", remiVer)
		// Fallback to alternatives-managed binary
		if _, err := os.Stat(bin); err != nil {
			bin = fmt.Sprintf("php%s", version)
		}
	} else {
		bin = fmt.Sprintf("php%s", version)
	}
	res, err := system.ExecWithTimeout(15*time.Second, bin, "-i")
	if err != nil {
		return "", fmt.Errorf("failed to run %s -i: %w", bin, err)
	}
	return res.Stdout, nil
}

// ---------------------------------------------------------------------------
// MariaDB / MySQL Optimization
// ---------------------------------------------------------------------------

// MariaDBOptimization holds tunable MariaDB/MySQL parameters.
type MariaDBOptimization struct {
	InnodbBufferPoolSize    string `json:"innodb_buffer_pool_size"`
	InnodbLogFileSize       string `json:"innodb_log_file_size"`
	InnodbFlushLogAtTrxCommit string `json:"innodb_flush_log_at_trx_commit"`
	InnodbFlushMethod       string `json:"innodb_flush_method"`
	InnodbIOCapacity        string `json:"innodb_io_capacity"`
	InnodbIOCapacityMax     string `json:"innodb_io_capacity_max"`
	QueryCacheType          string `json:"query_cache_type"`
	QueryCacheSize          string `json:"query_cache_size"`
	QueryCacheLimit         string `json:"query_cache_limit"`
	MaxConnections          string `json:"max_connections"`
	ThreadCacheSize         string `json:"thread_cache_size"`
	TmpTableSize            string `json:"tmp_table_size"`
	MaxHeapTableSize        string `json:"max_heap_table_size"`
	JoinBufferSize          string `json:"join_buffer_size"`
	SortBufferSize          string `json:"sort_buffer_size"`
	ReadBufferSize          string `json:"read_buffer_size"`
	ReadRndBufferSize       string `json:"read_rnd_buffer_size"`
	TableOpenCache          string `json:"table_open_cache"`
	TableDefinitionCache    string `json:"table_definition_cache"`
	KeyBufferSize           string `json:"key_buffer_size"`
	SlowQueryLog            string `json:"slow_query_log"`
	LongQueryTime           string `json:"long_query_time"`
	LogBin                  string `json:"log_bin"`
	ExpireLogsDays          string `json:"expire_logs_days"`
	BinlogFormat            string `json:"binlog_format"`
	MaxBinlogSize           string `json:"max_binlog_size"`
}

func (s *SoftwareService) getMariaDBTuningPath() string {
	mysqlConf := filepath.Join(installer.ServerBaseDir, "mysql", "conf")
	// Check all possible locations: RHEL flat, then MariaDB/MySQL subdirs
	paths := []string{
		filepath.Join(mysqlConf, "99-itdlu-tuning.cnf"),                       // RHEL: /etc/my.cnf.d/99-itdlu-tuning.cnf
		filepath.Join(mysqlConf, "mariadb.conf.d", "99-itdlu-tuning.cnf"),     // Debian MariaDB
		filepath.Join(mysqlConf, "mysql.conf.d", "99-itdlu-tuning.cnf"),       // Debian MySQL
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	// Check version from DB to determine default
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		return filepath.Join(mysqlConf, "99-itdlu-tuning.cnf")
	}
	var version string
	s.db.QueryRow("SELECT version FROM software WHERE name = 'mysql'").Scan(&version)
	if strings.Contains(version, "mariadb") {
		return filepath.Join(mysqlConf, "mariadb.conf.d", "99-itdlu-tuning.cnf")
	}
	return filepath.Join(mysqlConf, "mysql.conf.d", "99-itdlu-tuning.cnf")
}

func parseMySQLConfig(content string) map[string]string {
	result := make(map[string]string)
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "[") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if ok {
			result[strings.TrimSpace(k)] = strings.TrimSpace(v)
		}
	}
	return result
}

func (s *SoftwareService) GetMariaDBOptimization() (*MariaDBOptimization, error) {
	path := s.getMariaDBTuningPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return &MariaDBOptimization{}, nil
	}
	kv := parseMySQLConfig(string(data))
	opt := &MariaDBOptimization{
		InnodbBufferPoolSize:      kv["innodb_buffer_pool_size"],
		InnodbLogFileSize:         kv["innodb_log_file_size"],
		InnodbFlushLogAtTrxCommit: kv["innodb_flush_log_at_trx_commit"],
		InnodbFlushMethod:         kv["innodb_flush_method"],
		InnodbIOCapacity:          kv["innodb_io_capacity"],
		InnodbIOCapacityMax:       kv["innodb_io_capacity_max"],
		QueryCacheType:            kv["query_cache_type"],
		QueryCacheSize:            kv["query_cache_size"],
		QueryCacheLimit:           kv["query_cache_limit"],
		MaxConnections:            kv["max_connections"],
		ThreadCacheSize:           kv["thread_cache_size"],
		TmpTableSize:              kv["tmp_table_size"],
		MaxHeapTableSize:          kv["max_heap_table_size"],
		JoinBufferSize:            kv["join_buffer_size"],
		SortBufferSize:            kv["sort_buffer_size"],
		ReadBufferSize:            kv["read_buffer_size"],
		ReadRndBufferSize:         kv["read_rnd_buffer_size"],
		TableOpenCache:            kv["table_open_cache"],
		TableDefinitionCache:      kv["table_definition_cache"],
		KeyBufferSize:             kv["key_buffer_size"],
		SlowQueryLog:              kv["slow_query_log"],
		LongQueryTime:             kv["long_query_time"],
		LogBin:                    kv["log_bin"],
		ExpireLogsDays:            kv["expire_logs_days"],
		BinlogFormat:              kv["binlog_format"],
		MaxBinlogSize:             kv["max_binlog_size"],
	}
	return opt, nil
}

func (s *SoftwareService) UpdateMariaDBOptimization(opt *MariaDBOptimization) error {
	path := s.getMariaDBTuningPath()
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	lines := []string{"[mysqld]"}
	add := func(k, v string) {
		if v != "" {
			lines = append(lines, fmt.Sprintf("%s = %s", k, v))
		}
	}
	add("innodb_buffer_pool_size", opt.InnodbBufferPoolSize)
	add("innodb_log_file_size", opt.InnodbLogFileSize)
	add("innodb_flush_log_at_trx_commit", opt.InnodbFlushLogAtTrxCommit)
	add("innodb_flush_method", opt.InnodbFlushMethod)
	add("innodb_io_capacity", opt.InnodbIOCapacity)
	add("innodb_io_capacity_max", opt.InnodbIOCapacityMax)
	add("query_cache_type", opt.QueryCacheType)
	add("query_cache_size", opt.QueryCacheSize)
	add("query_cache_limit", opt.QueryCacheLimit)
	add("max_connections", opt.MaxConnections)
	add("thread_cache_size", opt.ThreadCacheSize)
	add("tmp_table_size", opt.TmpTableSize)
	add("max_heap_table_size", opt.MaxHeapTableSize)
	add("join_buffer_size", opt.JoinBufferSize)
	add("sort_buffer_size", opt.SortBufferSize)
	add("read_buffer_size", opt.ReadBufferSize)
	add("read_rnd_buffer_size", opt.ReadRndBufferSize)
	add("table_open_cache", opt.TableOpenCache)
	add("table_definition_cache", opt.TableDefinitionCache)
	add("key_buffer_size", opt.KeyBufferSize)
	add("slow_query_log", opt.SlowQueryLog)
	add("long_query_time", opt.LongQueryTime)
	if opt.LogBin != "" {
		add("log_bin", opt.LogBin)
	}
	add("expire_logs_days", opt.ExpireLogsDays)
	add("binlog_format", opt.BinlogFormat)
	add("max_binlog_size", opt.MaxBinlogSize)

	content := strings.Join(lines, "\n") + "\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return err
	}

	// Restart service to apply
	svcName, _ := s.resolveServiceName("mysql")
	system.ExecWithTimeout(15*time.Second, "systemctl", "restart", svcName)
	return nil
}

// GetMariaDBSlowLog reads the slow query log.
func (s *SoftwareService) GetMariaDBSlowLog(lines int) (string, string, error) {
	mysqlLogs := filepath.Join(installer.ServerBaseDir, "mysql", "logs")
	mysqlData := filepath.Join(installer.ServerBaseDir, "mysql", "data")
	paths := []string{
		filepath.Join(installer.LogsBaseDir, "mysql.slow.log"),
		filepath.Join(mysqlLogs, "mariadb-slow.log"),
		filepath.Join(mysqlLogs, "mysql-slow.log"),
		filepath.Join(mysqlData, "slow.log"),
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			if lines <= 0 { lines = 100 }
			if lines > 2000 { lines = 2000 }
			res, err := system.ExecWithTimeout(10*time.Second, "tail", "-n", strconv.Itoa(lines), p)
			if err != nil {
				return "", p, err
			}
			return res.Stdout, p, nil
		}
	}
	return "", "", fmt.Errorf("slow query log is not enabled or log file not found. Enable it in Optimization → Logging section (slow_query_log = 1)")
}

// GetMariaDBBinaryLogs lists binary log files and sizes.
func (s *SoftwareService) GetMariaDBBinaryLogs() ([]map[string]interface{}, error) {
	svcName, _ := s.resolveServiceName("mysql")
	if !s.isServiceRunning(svcName) {
		return nil, fmt.Errorf("MySQL/MariaDB is not running")
	}
	res, err := system.ExecWithTimeout(10*time.Second, "mysql", "-e", "SHOW BINARY LOGS;", "--batch", "--skip-column-names")
	if err != nil {
		return nil, fmt.Errorf("binary logging is not enabled. Enable it in Optimization → Logging section (log_bin)")
	}
	var logs []map[string]interface{}
	for _, line := range strings.Split(strings.TrimSpace(res.Stdout), "\n") {
		if line == "" { continue }
		parts := strings.Fields(line)
		if len(parts) >= 2 {
			logs = append(logs, map[string]interface{}{
				"name": parts[0],
				"size": parts[1],
			})
		}
	}
	return logs, nil
}

// GetMariaDBMemoryProtection returns systemd memory limit settings.
func (s *SoftwareService) GetMariaDBMemoryProtection() (map[string]string, error) {
	svcName, _ := s.resolveServiceName("mysql")
	res, err := system.ExecWithTimeout(10*time.Second, "systemctl", "show", svcName,
		"--property=MemoryLimit,MemoryCurrent,MemoryHigh,MemoryMax,OOMPolicy")
	if err != nil {
		return nil, err
	}
	result := make(map[string]string)
	for _, line := range strings.Split(strings.TrimSpace(res.Stdout), "\n") {
		k, v, ok := strings.Cut(line, "=")
		if ok {
			result[strings.ToLower(strings.TrimSpace(k))] = strings.TrimSpace(v)
		}
	}
	return result, nil
}

// SetMariaDBMemoryProtection sets systemd memory limits for the DB service.
func (s *SoftwareService) SetMariaDBMemoryProtection(memoryMax string) error {
	svcName, _ := s.resolveServiceName("mysql")
	// Create override dir
	overrideDir := fmt.Sprintf("/etc/systemd/system/%s.service.d", svcName)
	if err := os.MkdirAll(overrideDir, 0755); err != nil {
		return err
	}
	content := "[Service]\n"
	if memoryMax != "" && memoryMax != "infinity" {
		content += fmt.Sprintf("MemoryMax=%s\nMemoryHigh=%s\n", memoryMax, memoryMax)
	} else {
		content += "MemoryMax=infinity\nMemoryHigh=infinity\n"
	}
	if err := os.WriteFile(overrideDir+"/memory.conf", []byte(content), 0644); err != nil {
		return err
	}
	system.ExecWithTimeout(10*time.Second, "systemctl", "daemon-reload")
	system.ExecWithTimeout(15*time.Second, "systemctl", "restart", svcName)
	return nil
}

// GetMariaDBRAMPlan returns optimization presets for different RAM sizes.
func (s *SoftwareService) GetMariaDBRAMPlan(totalRAM int64) map[string]map[string]string {
	mb := totalRAM / (1024 * 1024)
	plans := make(map[string]map[string]string)

	// Low: 1-2 GB
	plans["low"] = map[string]string{
		"label": "Low (1-2 GB RAM)",
		"innodb_buffer_pool_size": "128M", "innodb_log_file_size": "64M",
		"max_connections": "50", "query_cache_size": "16M",
		"tmp_table_size": "16M", "max_heap_table_size": "16M",
		"thread_cache_size": "8", "table_open_cache": "400",
		"key_buffer_size": "16M", "sort_buffer_size": "512K",
		"read_buffer_size": "256K", "join_buffer_size": "256K",
	}

	// Medium: 2-4 GB
	plans["medium"] = map[string]string{
		"label": "Medium (2-4 GB RAM)",
		"innodb_buffer_pool_size": "512M", "innodb_log_file_size": "128M",
		"max_connections": "150", "query_cache_size": "32M",
		"tmp_table_size": "32M", "max_heap_table_size": "32M",
		"thread_cache_size": "16", "table_open_cache": "2000",
		"key_buffer_size": "32M", "sort_buffer_size": "1M",
		"read_buffer_size": "1M", "join_buffer_size": "1M",
	}

	// High: 4-8 GB
	plans["high"] = map[string]string{
		"label": "High (4-8 GB RAM)",
		"innodb_buffer_pool_size": "1G", "innodb_log_file_size": "256M",
		"max_connections": "200", "query_cache_size": "64M",
		"tmp_table_size": "64M", "max_heap_table_size": "64M",
		"thread_cache_size": "32", "table_open_cache": "4000",
		"key_buffer_size": "64M", "sort_buffer_size": "2M",
		"read_buffer_size": "2M", "join_buffer_size": "2M",
	}

	// Ultra: 8+ GB
	bufPool := fmt.Sprintf("%dM", mb/4)
	if mb/4 > 4096 { bufPool = "4G" }
	plans["ultra"] = map[string]string{
		"label": fmt.Sprintf("Ultra (8+ GB RAM, yours: %dMB)", mb),
		"innodb_buffer_pool_size": bufPool, "innodb_log_file_size": "512M",
		"max_connections": "500", "query_cache_size": "128M",
		"tmp_table_size": "128M", "max_heap_table_size": "128M",
		"thread_cache_size": "64", "table_open_cache": "8000",
		"key_buffer_size": "128M", "sort_buffer_size": "4M",
		"read_buffer_size": "4M", "join_buffer_size": "4M",
	}

	// Determine recommended plan
	switch {
	case mb <= 2048:
		plans["recommended"] = plans["low"]
	case mb <= 4096:
		plans["recommended"] = plans["medium"]
	case mb <= 8192:
		plans["recommended"] = plans["high"]
	default:
		plans["recommended"] = plans["ultra"]
	}
	return plans
}

// ─── PostgreSQL Management ──────────────────────────────────────────────────

// PostgreSQLOptimization holds tunable PostgreSQL parameters.
type PostgreSQLOptimization struct {
	SharedBuffers                string `json:"shared_buffers"`
	EffectiveCacheSize           string `json:"effective_cache_size"`
	WorkMem                      string `json:"work_mem"`
	MaintenanceWorkMem           string `json:"maintenance_work_mem"`
	MaxConnections               string `json:"max_connections"`
	WalBuffers                   string `json:"wal_buffers"`
	MinWalSize                   string `json:"min_wal_size"`
	MaxWalSize                   string `json:"max_wal_size"`
	CheckpointCompletionTarget   string `json:"checkpoint_completion_target"`
	RandomPageCost               string `json:"random_page_cost"`
	EffectiveIOConcurrency       string `json:"effective_io_concurrency"`
	DefaultStatisticsTarget      string `json:"default_statistics_target"`
	MaxWorkerProcesses           string `json:"max_worker_processes"`
	MaxParallelWorkersPerGather  string `json:"max_parallel_workers_per_gather"`
	MaxParallelWorkers           string `json:"max_parallel_workers"`
	MaxParallelMaintenanceWorkers string `json:"max_parallel_maintenance_workers"`
}

func (s *SoftwareService) getPostgreSQLTuningPath() string {
	// Check conf.d in known PostgreSQL config locations
	pgConf := filepath.Join(installer.ServerBaseDir, "postgresql", "conf")
	// The symlink postgresql/conf -> /etc/postgresql/<ver>/main (Debian) or /var/lib/pgsql/<ver>/data (RHEL)
	confD := filepath.Join(pgConf, "conf.d", "99-itdlu-tuning.conf")
	if _, err := os.Stat(confD); err == nil {
		return confD
	}
	// Try reading symlink target
	target, err := os.Readlink(pgConf)
	if err == nil {
		confD = filepath.Join(target, "conf.d", "99-itdlu-tuning.conf")
		if _, err := os.Stat(confD); err == nil {
			return confD
		}
	}
	// Scan /etc/postgresql for installed versions
	entries, _ := os.ReadDir("/etc/postgresql")
	for _, e := range entries {
		if e.IsDir() {
			p := filepath.Join("/etc/postgresql", e.Name(), "main", "conf.d", "99-itdlu-tuning.conf")
			if _, err := os.Stat(p); err == nil {
				return p
			}
			// Create conf.d if needed
			confDir := filepath.Join("/etc/postgresql", e.Name(), "main", "conf.d")
			_ = os.MkdirAll(confDir, 0755)
			return filepath.Join(confDir, "99-itdlu-tuning.conf")
		}
	}
	// Fallback for RHEL
	entries, _ = os.ReadDir("/var/lib/pgsql")
	for _, e := range entries {
		if e.IsDir() {
			confDir := filepath.Join("/var/lib/pgsql", e.Name(), "data", "conf.d")
			_ = os.MkdirAll(confDir, 0755)
			return filepath.Join(confDir, "99-itdlu-tuning.conf")
		}
	}
	return filepath.Join(pgConf, "conf.d", "99-itdlu-tuning.conf")
}

func parsePGConfig(content string) map[string]string {
	result := make(map[string]string)
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if ok {
			result[strings.TrimSpace(k)] = strings.TrimSpace(v)
		}
	}
	return result
}

func (s *SoftwareService) GetPostgreSQLOptimization() (*PostgreSQLOptimization, error) {
	path := s.getPostgreSQLTuningPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return &PostgreSQLOptimization{}, nil
	}
	kv := parsePGConfig(string(data))
	opt := &PostgreSQLOptimization{
		SharedBuffers:                kv["shared_buffers"],
		EffectiveCacheSize:           kv["effective_cache_size"],
		WorkMem:                      kv["work_mem"],
		MaintenanceWorkMem:           kv["maintenance_work_mem"],
		MaxConnections:               kv["max_connections"],
		WalBuffers:                   kv["wal_buffers"],
		MinWalSize:                   kv["min_wal_size"],
		MaxWalSize:                   kv["max_wal_size"],
		CheckpointCompletionTarget:   kv["checkpoint_completion_target"],
		RandomPageCost:               kv["random_page_cost"],
		EffectiveIOConcurrency:       kv["effective_io_concurrency"],
		DefaultStatisticsTarget:      kv["default_statistics_target"],
		MaxWorkerProcesses:           kv["max_worker_processes"],
		MaxParallelWorkersPerGather:  kv["max_parallel_workers_per_gather"],
		MaxParallelWorkers:           kv["max_parallel_workers"],
		MaxParallelMaintenanceWorkers: kv["max_parallel_maintenance_workers"],
	}
	return opt, nil
}

func (s *SoftwareService) UpdatePostgreSQLOptimization(opt *PostgreSQLOptimization) error {
	path := s.getPostgreSQLTuningPath()
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	lines := []string{"# ITDLUPanel PostgreSQL Tuning (managed by panel)"}
	add := func(k, v string) {
		if v != "" {
			lines = append(lines, fmt.Sprintf("%s = %s", k, v))
		}
	}
	add("shared_buffers", opt.SharedBuffers)
	add("effective_cache_size", opt.EffectiveCacheSize)
	add("work_mem", opt.WorkMem)
	add("maintenance_work_mem", opt.MaintenanceWorkMem)
	add("max_connections", opt.MaxConnections)
	add("wal_buffers", opt.WalBuffers)
	add("min_wal_size", opt.MinWalSize)
	add("max_wal_size", opt.MaxWalSize)
	add("checkpoint_completion_target", opt.CheckpointCompletionTarget)
	add("random_page_cost", opt.RandomPageCost)
	add("effective_io_concurrency", opt.EffectiveIOConcurrency)
	add("default_statistics_target", opt.DefaultStatisticsTarget)
	add("max_worker_processes", opt.MaxWorkerProcesses)
	add("max_parallel_workers_per_gather", opt.MaxParallelWorkersPerGather)
	add("max_parallel_workers", opt.MaxParallelWorkers)
	add("max_parallel_maintenance_workers", opt.MaxParallelMaintenanceWorkers)

	content := strings.Join(lines, "\n") + "\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return err
	}

	// Restart PostgreSQL to apply changes like shared_buffers
	svcName, _ := s.resolveServiceName("postgresql")
	system.ExecWithTimeout(30*time.Second, "systemctl", "restart", svcName)
	return nil
}

// GetPostgreSQLConnections returns active connections from pg_stat_activity.
func (s *SoftwareService) GetPostgreSQLConnections() ([]map[string]string, error) {
	ctx := context.Background()
	query := `SELECT datname, usename, state, COALESCE(LEFT(query, 200), '') as query, client_addr, backend_start::text FROM pg_stat_activity WHERE backend_type = 'client backend' ORDER BY backend_start DESC`
	result, err := system.Exec(ctx, "sudo", "-u", "postgres", "psql", "-t", "-A", "-F", "\t", "-c", query)
	if err != nil {
		return nil, err
	}

	var connections []map[string]string
	for _, line := range strings.Split(strings.TrimSpace(result.Stdout), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 6)
		conn := map[string]string{
			"datname":  safeIndex(parts, 0),
			"usename":  safeIndex(parts, 1),
			"state":    safeIndex(parts, 2),
			"query":    safeIndex(parts, 3),
			"client":   safeIndex(parts, 4),
			"started":  safeIndex(parts, 5),
		}
		connections = append(connections, conn)
	}
	return connections, nil
}

// GetPostgreSQLDatabases returns all databases with size and owner info.
func (s *SoftwareService) GetPostgreSQLDatabases() ([]map[string]interface{}, error) {
	ctx := context.Background()
	query := `SELECT d.datname, pg_catalog.pg_get_userbyid(d.datdba) as owner, pg_encoding_to_char(d.encoding) as encoding, pg_database_size(d.datname) as size FROM pg_database d WHERE d.datistemplate = false ORDER BY d.datname`
	result, err := system.Exec(ctx, "sudo", "-u", "postgres", "psql", "-t", "-A", "-F", "\t", "-c", query)
	if err != nil {
		return nil, err
	}

	var databases []map[string]interface{}
	for _, line := range strings.Split(strings.TrimSpace(result.Stdout), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 4)
		size, _ := strconv.ParseInt(safeIndex(parts, 3), 10, 64)
		db := map[string]interface{}{
			"name":     safeIndex(parts, 0),
			"owner":    safeIndex(parts, 1),
			"encoding": safeIndex(parts, 2),
			"size":     size,
		}
		databases = append(databases, db)
	}
	return databases, nil
}

func safeIndex(parts []string, idx int) string {
	if idx < len(parts) {
		return parts[idx]
	}
	return ""
}
