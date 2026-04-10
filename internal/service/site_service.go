package service

import (
	"bytes"
	"context"
	"crypto/x509"
	"database/sql"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"html/template"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/service/installer"
	"github.com/ITDLUPanel/panel/internal/service/vhost"
	"github.com/ITDLUPanel/panel/internal/system"
)

// ---------------------------------------------------------------------------
// Nginx input sanitisation helpers
// ---------------------------------------------------------------------------

var (
	validNginxPathRe   = regexp.MustCompile(`^/[a-zA-Z0-9/_\-.]*$`)
	validDomainRe      = regexp.MustCompile(`^[a-zA-Z0-9*][a-zA-Z0-9.\-]*$`)
	validSuffixCharRe  = regexp.MustCompile(`[^a-zA-Z0-9|]`)
	validRefererCharRe = regexp.MustCompile(`[^a-zA-Z0-9.*\-]`)
)

// sanitizeNginxValue strips characters that could break or inject into nginx
// config values: newlines, semicolons, backticks, and dollar signs.
func sanitizeNginxValue(s string) string {
	r := strings.NewReplacer("\n", "", "\r", "", ";", "", "`", "", "$", "")
	return r.Replace(s)
}

// validateNginxPath checks that a path is safe for use in an nginx location
// directive. It must start with "/" and contain only safe characters.
func validateNginxPath(p string) bool {
	return validNginxPathRe.MatchString(p)
}

// validateURL checks that a URL is well-formed with an http(s) scheme and a
// non-empty host. Newlines are rejected in any component.
func validateURL(raw string) bool {
	if strings.ContainsAny(raw, "\n\r") {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	return u.Host != ""
}

// sanitizeNginxRegex strips characters that could break nginx config blocks
// from a regex pattern used in rewrite directives.
func sanitizeNginxRegex(s string) string {
	r := strings.NewReplacer("\n", "", "\r", "", ";", "", "{", "", "}", "")
	return r.Replace(s)
}

// escapeNginxSingleQuote escapes single quotes for use inside nginx
// single-quoted strings.
func escapeNginxSingleQuote(s string) string {
	return strings.ReplaceAll(s, "'", `'\''`)
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

// CreateSiteRequest holds the data needed to create a new site.
type CreateSiteRequest struct {
	Name        string `json:"name" validate:"required,min=1,max=128"`
	Domain      string `json:"domain" validate:"required,min=1,max=253"`
	Description string `json:"description" validate:"omitempty,max=500"`
	Path        string `json:"path" validate:"omitempty"`
	Webserver   string `json:"webserver" validate:"required,oneof=nginx apache openlitespeed"`
	PHPVersion  string `json:"php_version" validate:"omitempty"`
	CreateDB    bool   `json:"create_db"`
	DBName      string `json:"db_name" validate:"omitempty,min=1,max=64"`
	DBUser      string `json:"db_user" validate:"omitempty,min=1,max=32"`
	DBPass      string `json:"db_pass" validate:"omitempty,min=1"`
	FTPUser     string `json:"ftp_user" validate:"omitempty,min=1,max=32"`
	FTPPass     string `json:"ftp_pass" validate:"omitempty,min=6"`
}

// UpdateSiteRequest holds the mutable fields of a site.
type UpdateSiteRequest struct {
	Name       string `json:"name" validate:"omitempty,min=1,max=128"`
	PHPVersion string `json:"php_version" validate:"omitempty"`
}

// Site represents a managed website.
type Site struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	Domain      string  `json:"domain"`
	Description string  `json:"description"`
	Path        string  `json:"path"`
	Webserver   string  `json:"webserver"`
	PHPVersion  *string `json:"php_version"`
	SSLEnabled  int     `json:"ssl_enabled"`
	SSLType     *string `json:"ssl_type"`
	SSLExpiry   *string `json:"ssl_expiry"`
	Status      int     `json:"status"`
	ConfigExtra *string `json:"config_extra"`
	CreatedBy   *int64  `json:"created_by"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
	DiskQuota   int64   `json:"disk_quota"`
	DiskUsage   int64   `json:"disk_usage"`
}

// Domain represents a domain alias bound to a site.
type Domain struct {
	ID        int64  `json:"id"`
	SiteID    int64  `json:"site_id"`
	Domain    string `json:"domain"`
	IsPrimary int    `json:"is_primary"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const wwwrootBase = "/ITDLUPanel/wwwroot"

// SiteService handles website CRUD and operations.
type SiteService struct {
	db       *sql.DB
	notifier *NotificationService
}

// NewSiteService creates a new SiteService.
func NewSiteService(db *sql.DB) *SiteService {
	return &SiteService{db: db}
}

// SetNotifier sets the notification service for event dispatching.
func (s *SiteService) SetNotifier(n *NotificationService) { s.notifier = n }

// ReconcileVhosts checks all active sites and regenerates any missing vhost
// config files. Call this on startup to ensure nginx state matches the DB.
func (s *SiteService) ReconcileVhosts() {
	rows, err := s.db.Query("SELECT id, domain, webserver FROM sites WHERE status = 1")
	if err != nil {
		logger.Warn().Err(err).Msg("vhost reconciliation: failed to query active sites")
		return
	}
	defer rows.Close()

	var repaired int
	for rows.Next() {
		var id int64
		var domain, webserver string
		if err := rows.Scan(&id, &domain, &webserver); err != nil {
			logger.Warn().Err(err).Msg("vhost reconciliation: failed to scan row")
			continue
		}

		gen := generatorFor(webserver)
		confPath := gen.GetConfigPath(domain)
		if _, statErr := os.Stat(confPath); os.IsNotExist(statErr) {
			site, err := s.GetByID(id)
			if err != nil {
				logger.Warn().Err(err).Str("domain", domain).Msg("vhost reconciliation: failed to load site")
				continue
			}
			if err := s.regenerateVhost(site); err != nil {
				logger.Error().Err(err).Str("domain", domain).Msg("vhost reconciliation: failed to regenerate")
				continue
			}
			// Ensure the site is enabled (symlink exists)
			_ = gen.EnableSite(domain)
			repaired++
			logger.Info().Str("domain", domain).Msg("vhost reconciliation: config regenerated")
		}
	}

	if repaired > 0 {
		logger.Info().Int("count", repaired).Msg("vhost reconciliation: repaired missing configs")
	} else {
		logger.Info().Msg("vhost reconciliation: all configs intact")
	}
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

// Create provisions a new website: validates uniqueness, creates document root,
// generates vhost config, enables the site and inserts the record.
func (s *SiteService) Create(req CreateSiteRequest, userID int64) (*Site, error) {
	// 1. Validate domain uniqueness
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM sites WHERE domain = ?", req.Domain).Scan(&count)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to check domain")
	}
	if count > 0 {
		return nil, apperrors.New(apperrors.ErrConflict, "domain already exists")
	}

	// Also check domains table
	err = s.db.QueryRow("SELECT COUNT(*) FROM domains WHERE domain = ?", req.Domain).Scan(&count)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to check domain aliases")
	}
	if count > 0 {
		return nil, apperrors.New(apperrors.ErrConflict, "domain is already in use as an alias")
	}

	// 2. Create document root
	docRoot := filepath.Join(wwwrootBase, req.Domain)
	if req.Path != "" {
		docRoot = req.Path
	}
	if err := os.MkdirAll(docRoot, 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create document root")
	}

	// 2b. Create per-site log directory
	siteLogDir := "/ITDLUPanel/logs/" + req.Domain
	if err := os.MkdirAll(siteLogDir, 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create site log directory")
	}

	// 3. Create default pages (index.html, 404.html, 502.html, 403.html)
	for name, content := range defaultSitePages(req.Domain) {
		p := filepath.Join(docRoot, name)
		if _, err := os.Stat(p); os.IsNotExist(err) {
			if err := os.WriteFile(p, []byte(content), 0644); err != nil {
				return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create "+name)
			}
		}
	}

	// 4. Generate vhost config
	gen := generatorFor(req.Webserver)
	cfg := vhost.VhostConfig{
		Domain:     req.Domain,
		DocRoot:    docRoot,
		PHPVersion: req.PHPVersion,
	}
	if req.Webserver == "nginx" || req.Webserver == "" {
		nginxVer := installer.DetectNginxVersion()
		cfg.SupportsQUIC = nginxVer.SupportsQUIC()
		cfg.UsesHTTP2Directive = nginxVer.UsesHTTP2Directive()
	}

	content, err := gen.Generate(cfg)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate vhost config")
	}

	confPath := gen.GetConfigPath(req.Domain)
	if err := os.MkdirAll(filepath.Dir(confPath), 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create config directory")
	}
	if err := os.WriteFile(confPath, []byte(content), 0644); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to write vhost config")
	}

	// 5. Enable site and reload
	if err := gen.EnableSite(req.Domain); err != nil {
		logger.Warn().Err(err).Str("domain", req.Domain).Msg("failed to enable site (non-fatal during creation)")
	}
	if err := gen.ReloadServer(); err != nil {
		logger.Warn().Err(err).Str("domain", req.Domain).Msg("failed to reload webserver (non-fatal during creation)")
	}

	// 6. Insert into DB
	result, err := s.db.Exec(
		`INSERT INTO sites (name, domain, description, path, webserver, php_version, status, created_by, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		req.Name, req.Domain, req.Description, docRoot, req.Webserver, req.PHPVersion, userID,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to insert site")
	}

	id, _ := result.LastInsertId()

	// Insert the primary domain into the domains table
	_, err = s.db.Exec(
		"INSERT INTO domains (site_id, domain, is_primary) VALUES (?, ?, 1)",
		id, req.Domain,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to insert primary domain")
	}

	// Create database if requested
	if req.CreateDB && req.DBName != "" {
		dbSvc := NewDatabaseService(s.db)
		dbType := "mysql"
		// Auto-detect MariaDB
		if _, err := system.ExecWithTimeout(5*time.Second, "systemctl", "is-enabled", "mariadb"); err == nil {
			dbType = "mariadb"
		}
		dbReq := CreateDBRequest{
			Name:         req.DBName,
			DBType:       dbType,
			Username:     req.DBUser,
			Password:     req.DBPass,
			Charset:      "utf8mb4",
			Collation:    "utf8mb4_unicode_ci",
			RemoteAccess: "localhost",
		}
		if _, err := dbSvc.Create(dbReq); err != nil {
			logger.Warn().Err(err).Str("db", req.DBName).Msg("failed to create database for site (non-fatal)")
		}
	}

	// Create FTP account if requested
	if req.FTPUser != "" && req.FTPPass != "" {
		ftpSvc := NewFTPService(s.db)
		ftpReq := CreateFTPRequest{
			Username: req.FTPUser,
			Password: req.FTPPass,
			Path:     docRoot,
		}
		if _, err := ftpSvc.Create(ftpReq); err != nil {
			logger.Warn().Err(err).Str("user", req.FTPUser).Msg("failed to create FTP account for site (non-fatal)")
		}
	}

	logger.Info().Int64("id", id).Str("domain", req.Domain).Msg("site created")

	if s.notifier != nil {
		s.notifier.Notify(NotificationEvent{Type: EventSiteCreated, Title: req.Domain, Detail: fmt.Sprintf("Webserver: %s, PHP: %s", req.Webserver, req.PHPVersion)})
	}

	return s.GetByID(id)
}

// buildIDFilter converts a slice of IDs to a comma-separated string for SQL IN clauses.
func buildIDFilter(ids []int64) string {
	if len(ids) == 0 {
		return "-1"
	}
	parts := make([]string, len(ids))
	for i, id := range ids {
		parts[i] = fmt.Sprintf("%d", id)
	}
	return strings.Join(parts, ",")
}

// List returns a paginated list of sites.
func (s *SiteService) List(page, pageSize int, allowedIDs []int64) ([]*Site, int, error) {
	whereClause := ""
	if allowedIDs != nil {
		if len(allowedIDs) == 0 {
			return []*Site{}, 0, nil
		}
		whereClause = " WHERE id IN (" + buildIDFilter(allowedIDs) + ")"
	}

	var total int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM sites" + whereClause).Scan(&total); err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to count sites")
	}

	offset := (page - 1) * pageSize
	rows, err := s.db.Query(
		`SELECT id, name, domain, description, path, webserver, php_version, ssl_enabled,
		        ssl_type, ssl_expiry, status, config_extra, created_by, created_at, updated_at,
		        disk_quota, disk_usage
		 FROM sites`+whereClause+` ORDER BY id DESC LIMIT ? OFFSET ?`, pageSize, offset,
	)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list sites")
	}
	defer rows.Close()

	var sites []*Site
	for rows.Next() {
		site := &Site{}
		if err := rows.Scan(
			&site.ID, &site.Name, &site.Domain, &site.Description, &site.Path, &site.Webserver,
			&site.PHPVersion, &site.SSLEnabled, &site.SSLType, &site.SSLExpiry,
			&site.Status, &site.ConfigExtra, &site.CreatedBy,
			&site.CreatedAt, &site.UpdatedAt,
			&site.DiskQuota, &site.DiskUsage,
		); err != nil {
			return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to scan site row")
		}
		sites = append(sites, site)
	}

	return sites, total, nil
}

// GetByID returns a site by its ID.
func (s *SiteService) GetByID(id int64) (*Site, error) {
	site := &Site{}
	err := s.db.QueryRow(
		`SELECT id, name, domain, description, path, webserver, php_version, ssl_enabled,
		        ssl_type, ssl_expiry, status, config_extra, created_by, created_at, updated_at,
		        disk_quota, disk_usage
		 FROM sites WHERE id = ?`, id,
	).Scan(
		&site.ID, &site.Name, &site.Domain, &site.Description, &site.Path, &site.Webserver,
		&site.PHPVersion, &site.SSLEnabled, &site.SSLType, &site.SSLExpiry,
		&site.Status, &site.ConfigExtra, &site.CreatedBy,
		&site.CreatedAt, &site.UpdatedAt,
		&site.DiskQuota, &site.DiskUsage,
	)
	if err == sql.ErrNoRows {
		return nil, apperrors.New(apperrors.ErrNotFound, "site not found")
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get site")
	}
	return site, nil
}

// Update modifies mutable fields of an existing site.
func (s *SiteService) Update(id int64, req UpdateSiteRequest) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	name := site.Name
	if req.Name != "" {
		name = req.Name
	}
	phpVersion := site.PHPVersion
	phpChanged := false
	if req.PHPVersion != "" {
		phpVersion = &req.PHPVersion
		phpChanged = site.PHPVersion == nil || *site.PHPVersion != req.PHPVersion
	}

	_, err = s.db.Exec(
		"UPDATE sites SET name = ?, php_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		name, phpVersion, id,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update site")
	}

	// Regenerate vhost when PHP version changes so nginx config stays in sync
	if phpChanged {
		site.PHPVersion = phpVersion
		if err := s.regenerateVhost(site); err != nil {
			logger.Warn().Err(err).Int64("id", id).Msg("failed to regenerate vhost after PHP version change")
		}
	}

	logger.Info().Int64("id", id).Msg("site updated")
	return nil
}

// Delete removes a site, its vhost config and document root.
func (s *SiteService) Delete(id int64) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)

	// Disable and remove config
	if err := gen.DisableSite(site.Domain); err != nil {
		logger.Warn().Err(err).Str("domain", site.Domain).Msg("failed to disable site during delete")
	}

	confPath := gen.GetConfigPath(site.Domain)
	_ = os.Remove(confPath)

	// Reload webserver
	if err := gen.ReloadServer(); err != nil {
		logger.Warn().Err(err).Str("domain", site.Domain).Msg("failed to reload webserver during delete")
	}

	// Remove document root
	docRoot := filepath.Join(wwwrootBase, site.Domain)
	if err := os.RemoveAll(docRoot); err != nil {
		logger.Warn().Err(err).Str("path", docRoot).Msg("failed to remove document root during delete")
	}

	// Delete DB records — explicitly delete domains first as a safety net
	// (CASCADE may not fire if foreign_keys pragma isn't active on this connection)
	_, _ = s.db.Exec("DELETE FROM domains WHERE site_id = ?", id)
	_, err = s.db.Exec("DELETE FROM sites WHERE id = ?", id)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete site")
	}

	logger.Info().Int64("id", id).Str("domain", site.Domain).Msg("site deleted")

	if s.notifier != nil {
		s.notifier.Notify(NotificationEvent{Type: EventSiteDeleted, Title: site.Domain})
	}

	return nil
}

// BatchDelete removes multiple sites. Returns a map of site_id -> error message for failures.
func (s *SiteService) BatchDelete(ids []int64) map[int64]string {
	errors := make(map[int64]string)
	for _, id := range ids {
		if err := s.Delete(id); err != nil {
			errors[id] = err.Error()
		}
	}
	return errors
}

// BatchSwitchPHP changes the PHP version for multiple sites. Returns a map of site_id -> error message for failures.
func (s *SiteService) BatchSwitchPHP(ids []int64, phpVersion string) map[int64]string {
	errors := make(map[int64]string)
	for _, id := range ids {
		if err := s.SwitchPHP(id, phpVersion); err != nil {
			errors[id] = err.Error()
		}
	}
	return errors
}

// BatchApplySSL applies an existing certificate to multiple sites. Returns a map of site_id -> error message for failures.
func (s *SiteService) BatchApplySSL(ids []int64, sourceDomain string) map[int64]string {
	errors := make(map[int64]string)
	for _, id := range ids {
		if err := s.EnableSSLFromHolder(id, sourceDomain); err != nil {
			errors[id] = err.Error()
		}
	}
	return errors
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

// Start enables the site and reloads the web server.
func (s *SiteService) Start(id int64) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)

	// Ensure the vhost config file exists before enabling
	confPath := gen.GetConfigPath(site.Domain)
	if _, statErr := os.Stat(confPath); os.IsNotExist(statErr) {
		logger.Warn().Str("domain", site.Domain).Msg("vhost config missing, regenerating")
		if regErr := s.regenerateVhost(site); regErr != nil {
			return apperrors.Wrap(regErr, apperrors.ErrInternal, "vhost config missing and failed to regenerate")
		}
	}

	if err := gen.EnableSite(site.Domain); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to enable site")
	}
	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	_, err = s.db.Exec("UPDATE sites SET status = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", id)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update site status")
	}

	logger.Info().Int64("id", id).Str("domain", site.Domain).Msg("site started")
	return nil
}

// Stop disables the site and reloads the web server.
func (s *SiteService) Stop(id int64) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)
	if err := gen.DisableSite(site.Domain); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to disable site")
	}
	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	_, err = s.db.Exec("UPDATE sites SET status = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", id)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update site status")
	}

	logger.Info().Int64("id", id).Str("domain", site.Domain).Msg("site stopped")
	return nil
}

// GetConfig reads the raw vhost configuration file for a site.
func (s *SiteService) GetConfig(id int64) (string, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return "", err
	}

	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	data, err := os.ReadFile(confPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Config file missing — regenerate it
			if regErr := s.regenerateVhost(site); regErr != nil {
				return "", apperrors.Wrap(regErr, apperrors.ErrInternal, "config missing and failed to regenerate")
			}
			data, err = os.ReadFile(confPath)
			if err != nil {
				return "", apperrors.New(apperrors.ErrNotFound, "vhost config file not found after regeneration")
			}
			return string(data), nil
		}
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to read config")
	}

	return string(data), nil
}

// UpdateConfig writes new content to the vhost configuration file and reloads.
func (s *SiteService) UpdateConfig(id int64, content string) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	if err := os.WriteFile(confPath, []byte(content), 0644); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write config")
	}

	// Test config before reloading
	if err := gen.TestConfig(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrValidation, "config test failed — changes saved but not applied")
	}

	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	_, err = s.db.Exec("UPDATE sites SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", id)
	if err != nil {
		logger.Warn().Err(err).Int64("id", id).Msg("failed to update site timestamp after config change")
	}

	logger.Info().Int64("id", id).Msg("site config updated")
	return nil
}

// SwitchPHP changes the PHP version for a site and regenerates the vhost config.
func (s *SiteService) SwitchPHP(id int64, phpVersion string) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	// Verify PHP-FPM socket exists (best-effort check)
	socketPath := fmt.Sprintf("/run/php/php%s-fpm.sock", phpVersion)
	if site.Webserver != "openlitespeed" {
		if _, statErr := os.Stat(socketPath); statErr != nil {
			// Also try as a service check
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			result, execErr := system.Exec(ctx, "systemctl", "is-active", fmt.Sprintf("php%s-fpm", phpVersion))
			if execErr != nil {
				return apperrors.New(apperrors.ErrValidation,
					fmt.Sprintf("PHP %s FPM does not appear to be running: %s", phpVersion, result.Stdout))
			}
		}
	}

	gen := generatorFor(site.Webserver)

	// Collect current aliases
	aliases, err := s.domainAliases(id, site.Domain)
	if err != nil {
		return err
	}

	cfg := vhost.VhostConfig{
		Domain:     site.Domain,
		Aliases:    aliases,
		DocRoot:    site.Path,
		PHPVersion: phpVersion,
	}
	if site.Webserver == "nginx" || site.Webserver == "" {
		nginxVer2 := installer.DetectNginxVersion()
		cfg.SupportsQUIC = nginxVer2.SupportsQUIC()
		cfg.UsesHTTP2Directive = nginxVer2.UsesHTTP2Directive()
	}
	if site.SSLEnabled == 1 {
		cfg.SSLEnabled = true
		// Read existing cert paths from current config (best-effort)
	}

	content, err := gen.Generate(cfg)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate vhost config")
	}

	confPath := gen.GetConfigPath(site.Domain)
	if err := os.WriteFile(confPath, []byte(content), 0644); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write vhost config")
	}

	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	_, err = s.db.Exec(
		"UPDATE sites SET php_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		phpVersion, id,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update php version")
	}

	logger.Info().Int64("id", id).Str("php", phpVersion).Msg("site php version switched")
	return nil
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

// AddDomain adds a domain alias to a site.
func (s *SiteService) AddDomain(siteID int64, domain string) error {
	site, err := s.GetByID(siteID)
	if err != nil {
		return err
	}

	// Check uniqueness across all sites
	var count int
	err = s.db.QueryRow("SELECT COUNT(*) FROM domains WHERE domain = ?", domain).Scan(&count)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to check domain")
	}
	if count > 0 {
		return apperrors.New(apperrors.ErrConflict, "domain already in use")
	}

	// Also check the sites primary domain column
	err = s.db.QueryRow("SELECT COUNT(*) FROM sites WHERE domain = ?", domain).Scan(&count)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to check primary domains")
	}
	if count > 0 {
		return apperrors.New(apperrors.ErrConflict, "domain is already a primary domain")
	}

	_, err = s.db.Exec(
		"INSERT INTO domains (site_id, domain, is_primary) VALUES (?, ?, 0)",
		siteID, domain,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to add domain")
	}

	// Regenerate vhost to include the new alias
	if err := s.regenerateVhost(site); err != nil {
		logger.Warn().Err(err).Int64("site_id", siteID).Msg("failed to regenerate vhost after domain add")
	}

	logger.Info().Int64("site_id", siteID).Str("domain", domain).Msg("domain added to site")
	return nil
}

// RemoveDomain removes a domain alias from a site.
func (s *SiteService) RemoveDomain(siteID int64, domainID int64) error {
	site, err := s.GetByID(siteID)
	if err != nil {
		return err
	}

	// Prevent removing the primary domain
	var isPrimary int
	err = s.db.QueryRow(
		"SELECT is_primary FROM domains WHERE id = ? AND site_id = ?", domainID, siteID,
	).Scan(&isPrimary)
	if err == sql.ErrNoRows {
		return apperrors.New(apperrors.ErrNotFound, "domain not found")
	}
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to check domain")
	}
	if isPrimary == 1 {
		return apperrors.New(apperrors.ErrConflict, "cannot remove the primary domain")
	}

	_, err = s.db.Exec("DELETE FROM domains WHERE id = ? AND site_id = ?", domainID, siteID)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to remove domain")
	}

	// Regenerate vhost to remove the alias
	if err := s.regenerateVhost(site); err != nil {
		logger.Warn().Err(err).Int64("site_id", siteID).Msg("failed to regenerate vhost after domain remove")
	}

	logger.Info().Int64("site_id", siteID).Int64("domain_id", domainID).Msg("domain removed from site")
	return nil
}

// ListDomains returns all domains for a site.
func (s *SiteService) ListDomains(siteID int64) ([]*Domain, error) {
	// Verify site exists
	if _, err := s.GetByID(siteID); err != nil {
		return nil, err
	}

	rows, err := s.db.Query(
		"SELECT id, site_id, domain, is_primary FROM domains WHERE site_id = ? ORDER BY is_primary DESC, id ASC",
		siteID,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list domains")
	}
	defer rows.Close()

	var domains []*Domain
	for rows.Next() {
		d := &Domain{}
		if err := rows.Scan(&d.ID, &d.SiteID, &d.Domain, &d.IsPrimary); err != nil {
			return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to scan domain row")
		}
		domains = append(domains, d)
	}

	return domains, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// generatorFor returns the appropriate VhostGenerator for the webserver type.
func generatorFor(webserver string) vhost.VhostGenerator {
	switch webserver {
	case "apache":
		return vhost.NewApacheGenerator()
	case "openlitespeed":
		return vhost.NewOLSGenerator()
	default:
		return vhost.NewNginxGenerator()
	}
}

// domainAliases returns non-primary domain aliases for a site.
func (s *SiteService) domainAliases(siteID int64, primaryDomain string) ([]string, error) {
	rows, err := s.db.Query(
		"SELECT domain FROM domains WHERE site_id = ? AND domain != ?",
		siteID, primaryDomain,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list domain aliases")
	}
	defer rows.Close()

	var aliases []string
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to scan domain alias")
		}
		aliases = append(aliases, d)
	}
	return aliases, nil
}

// RegenerateAllVhosts rebuilds vhost configs for all nginx sites.
// Call this after an nginx version switch to update templates.
func (s *SiteService) RegenerateAllVhosts() error {
	rows, err := s.db.Query(
		`SELECT id, name, domain, path, webserver, php_version, ssl_enabled,
		        ssl_type, ssl_expiry, status, config_extra, created_by, created_at, updated_at,
		        disk_quota, disk_usage
		 FROM sites WHERE webserver = 'nginx'`,
	)
	if err != nil {
		return fmt.Errorf("failed to query sites: %w", err)
	}
	defer rows.Close()

	var errs []string
	for rows.Next() {
		site := &Site{}
		if err := rows.Scan(
			&site.ID, &site.Name, &site.Domain, &site.Path, &site.Webserver,
			&site.PHPVersion, &site.SSLEnabled, &site.SSLType, &site.SSLExpiry,
			&site.Status, &site.ConfigExtra, &site.CreatedBy,
			&site.CreatedAt, &site.UpdatedAt,
			&site.DiskQuota, &site.DiskUsage,
		); err != nil {
			errs = append(errs, fmt.Sprintf("scan site: %v", err))
			continue
		}
		if err := s.regenerateVhostNoReload(site); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", site.Domain, err))
		}
	}

	// Single reload after all configs are updated
	gen := generatorFor("nginx")
	if err := gen.ReloadServer(); err != nil {
		errs = append(errs, fmt.Sprintf("reload: %v", err))
	}

	if len(errs) > 0 {
		return fmt.Errorf("some sites failed: %s", strings.Join(errs, "; "))
	}
	return nil
}

// regenerateVhostNoReload rebuilds vhost config without reloading nginx.
func (s *SiteService) regenerateVhostNoReload(site *Site) error {
	gen := generatorFor(site.Webserver)
	aliases, err := s.domainAliases(site.ID, site.Domain)
	if err != nil {
		return err
	}
	phpVersion := ""
	if site.PHPVersion != nil {
		phpVersion = *site.PHPVersion
	}
	cfg := vhost.VhostConfig{
		Domain:     site.Domain,
		Aliases:    aliases,
		DocRoot:    site.Path,
		PHPVersion: phpVersion,
		SSLEnabled: site.SSLEnabled == 1,
		ForceHTTPS: s.getConfigExtraField(site, "force_https") == "1",
	}
	if site.Webserver == "nginx" || site.Webserver == "" {
		nginxVer := installer.DetectNginxVersion()
		cfg.SupportsQUIC = nginxVer.SupportsQUIC()
		cfg.UsesHTTP2Directive = nginxVer.UsesHTTP2Directive()
	}
	if cfg.SSLEnabled {
		cfg.SSLCert, cfg.SSLKey = s.resolveSSLPaths(site.Domain, site.SSLType)
	}
	content, err := gen.Generate(cfg)
	if err != nil {
		return err
	}
	confPath := gen.GetConfigPath(site.Domain)
	return os.WriteFile(confPath, []byte(content), 0644)
}

// regenerateVhost rebuilds the vhost config file from the current site state.
func (s *SiteService) regenerateVhost(site *Site) error {
	gen := generatorFor(site.Webserver)

	aliases, err := s.domainAliases(site.ID, site.Domain)
	if err != nil {
		return err
	}

	phpVersion := ""
	if site.PHPVersion != nil {
		phpVersion = *site.PHPVersion
	}

	cfg := vhost.VhostConfig{
		Domain:     site.Domain,
		Aliases:    aliases,
		DocRoot:    site.Path,
		PHPVersion: phpVersion,
		SSLEnabled: site.SSLEnabled == 1,
		ForceHTTPS: s.getConfigExtraField(site, "force_https") == "1",
	}
	if site.Webserver == "nginx" || site.Webserver == "" {
		nginxVer3 := installer.DetectNginxVersion()
		cfg.SupportsQUIC = nginxVer3.SupportsQUIC()
		cfg.UsesHTTP2Directive = nginxVer3.UsesHTTP2Directive()
	}

	// Resolve SSL cert/key paths if SSL is enabled
	if cfg.SSLEnabled {
		cfg.SSLCert, cfg.SSLKey = s.resolveSSLPaths(site.Domain, site.SSLType)
	}

	content, err := gen.Generate(cfg)
	if err != nil {
		return err
	}

	confPath := gen.GetConfigPath(site.Domain)
	if err := os.WriteFile(confPath, []byte(content), 0644); err != nil {
		return err
	}

	return gen.ReloadServer()
}

// resolveSSLPaths returns cert and key file paths for a domain.
func (s *SiteService) resolveSSLPaths(domain string, sslType *string) (string, string) {
	certBase := filepath.Join(installer.ServerBaseDir, "data", "ssl")
	subDir := "custom"
	if sslType != nil {
		switch *sslType {
		case "letsencrypt":
			subDir = "letsencrypt"
		case "custom":
			subDir = "custom"
		}
	}
	certDir := filepath.Join(certBase, subDir, domain)
	return filepath.Join(certDir, "fullchain.pem"), filepath.Join(certDir, "privkey.pem")
}

// ---------------------------------------------------------------------------
// SSL Management
// ---------------------------------------------------------------------------

// EnableSSL enables SSL for a site with the given certificate paths.
func (s *SiteService) EnableSSL(id int64, certPath, keyPath, sslType string) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	// Verify cert files exist
	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrValidation, "certificate file not found: "+certPath)
	}
	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrValidation, "private key file not found: "+keyPath)
	}

	// Update DB
	if _, err := s.db.Exec(
		`UPDATE sites SET ssl_enabled = 1, ssl_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		sslType, id,
	); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update SSL status")
	}

	// Refresh site data and regenerate vhost
	site.SSLEnabled = 1
	site.SSLType = &sslType
	// Default to force HTTPS when enabling SSL
	if s.getConfigExtraField(site, "force_https") == "" {
		_ = s.setConfigExtraField(id, site, "force_https", "1")
	}
	if err := s.regenerateVhost(site); err != nil {
		// Rollback DB change
		_, _ = s.db.Exec(`UPDATE sites SET ssl_enabled = 0, ssl_type = NULL WHERE id = ?`, id)
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to regenerate vhost config with SSL")
	}

	logger.Info().Int64("id", id).Str("domain", site.Domain).Str("type", sslType).Msg("SSL enabled for site")
	return nil
}

// EnableSSLFromHolder applies an existing certificate (from another domain) to this site.
func (s *SiteService) EnableSSLFromHolder(id int64, sourceDomain string) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	// Look for cert in both letsencrypt and custom dirs
	certBase := filepath.Join(installer.ServerBaseDir, "data", "ssl")
	var certPath, keyPath, sslType string

	for _, dir := range []string{"letsencrypt", "custom"} {
		cp := filepath.Join(certBase, dir, sourceDomain, "fullchain.pem")
		kp := filepath.Join(certBase, dir, sourceDomain, "privkey.pem")
		if _, err := os.Stat(cp); err == nil {
			if _, err := os.Stat(kp); err == nil {
				certPath = cp
				keyPath = kp
				sslType = dir
				break
			}
		}
	}

	if certPath == "" {
		return apperrors.New(apperrors.ErrNotFound, "no certificate found for domain: "+sourceDomain)
	}

	// Copy cert to site's domain directory
	siteCertDir := filepath.Join(certBase, sslType, site.Domain)
	if err := os.MkdirAll(siteCertDir, 0700); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create cert directory")
	}

	// Copy cert and key
	for _, pair := range [][2]string{
		{certPath, filepath.Join(siteCertDir, "fullchain.pem")},
		{keyPath, filepath.Join(siteCertDir, "privkey.pem")},
	} {
		data, err := os.ReadFile(pair[0])
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read "+pair[0])
		}
		if err := os.WriteFile(pair[1], data, 0600); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write "+pair[1])
		}
	}

	return s.EnableSSL(id, filepath.Join(siteCertDir, "fullchain.pem"), filepath.Join(siteCertDir, "privkey.pem"), sslType)
}

// DisableSSL disables SSL for a site.
func (s *SiteService) DisableSSL(id int64) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if _, err := s.db.Exec(
		`UPDATE sites SET ssl_enabled = 0, ssl_type = NULL, ssl_expiry = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		id,
	); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update SSL status")
	}

	site.SSLEnabled = 0
	site.SSLType = nil
	if err := s.regenerateVhost(site); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to regenerate vhost config")
	}

	logger.Info().Int64("id", id).Str("domain", site.Domain).Msg("SSL disabled for site")
	return nil
}

// GetSSLInfo returns the SSL certificate information for a site.
func (s *SiteService) GetSSLInfo(id int64) (map[string]interface{}, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	result := map[string]interface{}{
		"enabled": site.SSLEnabled == 1,
		"domain":  site.Domain,
	}

	if site.SSLEnabled == 0 {
		return result, nil
	}

	sslType := "custom"
	if site.SSLType != nil {
		sslType = *site.SSLType
	}
	result["ssl_type"] = sslType

	certPath, keyPath := s.resolveSSLPaths(site.Domain, site.SSLType)
	result["cert_path"] = certPath
	result["key_path"] = keyPath

	// Read cert to extract detailed info
	certData, err := os.ReadFile(certPath)
	if err == nil {
		result["cert_content"] = string(certData)

		block, _ := pem.Decode(certData)
		if block != nil {
			cert, err := x509.ParseCertificate(block.Bytes)
			if err == nil {
				issuerOrg := cert.Issuer.CommonName
				if len(cert.Issuer.Organization) > 0 {
					issuerOrg = cert.Issuer.Organization[0]
				}

				result["issuer"] = issuerOrg
				result["issuer_cn"] = cert.Issuer.CommonName
				result["valid_from"] = cert.NotBefore.Format("2006-01-02")
				result["valid_until"] = cert.NotAfter.Format("2006-01-02")
				result["subject"] = cert.Subject.CommonName
				result["dns_names"] = cert.DNSNames

				_, _ = s.db.Exec(
					`UPDATE sites SET ssl_expiry = ? WHERE id = ?`,
					cert.NotAfter.Format("2006-01-02"), id,
				)
			}
		}
	}

	keyData, err := os.ReadFile(keyPath)
	if err == nil {
		result["key_content"] = string(keyData)
	}

	return result, nil
}

// DetectInstalledPHPVersions checks common PHP-FPM binaries and returns
// the version strings that are present on the system (e.g. ["8.2"]).
func DetectInstalledPHPVersions() []string {
	candidates := []string{"7.4", "8.0", "8.1", "8.2", "8.3", "8.4"}
	var installed []string
	for _, v := range candidates {
		bin := fmt.Sprintf("/usr/sbin/php-fpm%s", v)
		if _, err := os.Stat(bin); err == nil {
			installed = append(installed, v)
		}
	}
	return installed
}

// ---------------------------------------------------------------------------
// Directory management
// ---------------------------------------------------------------------------

// UpdateDirectory changes the document root path and regenerates the vhost config.
func (s *SiteService) UpdateDirectory(id int64, newPath string) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	newPath = filepath.Clean(newPath)
	if newPath == "" || newPath == "." {
		return apperrors.New(apperrors.ErrValidation, "path cannot be empty")
	}

	// Ensure path exists
	info, err := os.Stat(newPath)
	if err != nil || !info.IsDir() {
		return apperrors.New(apperrors.ErrValidation, "directory does not exist")
	}

	_, err = s.db.Exec("UPDATE sites SET path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", newPath, id)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update site directory")
	}

	site.Path = newPath
	if err := s.regenerateVhost(site); err != nil {
		logger.Warn().Err(err).Int64("id", id).Msg("failed to regenerate vhost after directory change")
		return apperrors.Wrap(err, apperrors.ErrInternal, "directory updated but vhost regeneration failed")
	}

	logger.Info().Int64("id", id).Str("path", newPath).Msg("site directory updated")
	return nil
}

// ListSubdirs lists immediate child directories of a site's document root.
func (s *SiteService) ListSubdirs(id int64) ([]string, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(site.Path)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read site directory")
	}

	var dirs []string
	for _, e := range entries {
		if e.IsDir() && !isHiddenDir(e.Name()) {
			dirs = append(dirs, e.Name())
		}
	}
	return dirs, nil
}

func isHiddenDir(name string) bool {
	return len(name) > 0 && name[0] == '.'
}

// GetRunningDirectory returns the current running directory (subfolder) from config_extra.
func (s *SiteService) GetRunningDirectory(id int64) (string, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return "", err
	}
	return s.getConfigExtraField(site, "running_dir"), nil
}

// SetRunningDirectory sets a subfolder as the actual web root.
func (s *SiteService) SetRunningDirectory(id int64, subdir string) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if subdir != "" && subdir != "/" {
		full := filepath.Join(site.Path, subdir)
		info, err := os.Stat(full)
		if err != nil || !info.IsDir() {
			return apperrors.New(apperrors.ErrValidation, "subdirectory does not exist")
		}
	}

	if err := s.setConfigExtraField(id, site, "running_dir", subdir); err != nil {
		return err
	}

	// Regenerate vhost with the effective root
	effectivePath := site.Path
	if subdir != "" && subdir != "/" {
		effectivePath = filepath.Join(site.Path, subdir)
	}
	origPath := site.Path
	site.Path = effectivePath
	if err := s.regenerateVhost(site); err != nil {
		site.Path = origPath
		return apperrors.Wrap(err, apperrors.ErrInternal, "running dir saved but vhost regeneration failed")
	}

	logger.Info().Int64("id", id).Str("running_dir", subdir).Msg("site running directory updated")
	return nil
}

// GetForceHTTPS returns whether Force HTTPS is enabled for a site.
func (s *SiteService) GetForceHTTPS(id int64) (bool, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return false, err
	}
	return s.getConfigExtraField(site, "force_https") == "1", nil
}

// SetForceHTTPS enables or disables the Force HTTPS redirect for a site.
func (s *SiteService) SetForceHTTPS(id int64, enabled bool) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}
	if site.SSLEnabled != 1 {
		return apperrors.New(apperrors.ErrValidation, "SSL must be enabled to toggle Force HTTPS")
	}
	val := "0"
	if enabled {
		val = "1"
	}
	if err := s.setConfigExtraField(id, site, "force_https", val); err != nil {
		return err
	}
	if err := s.regenerateVhost(site); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "force HTTPS saved but vhost regeneration failed")
	}
	logger.Info().Int64("id", id).Bool("force_https", enabled).Msg("site force HTTPS updated")
	return nil
}

// GetOpenBasedir returns the open_basedir status for a site.
func (s *SiteService) GetOpenBasedir(id int64) (bool, string, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return false, "", err
	}

	iniPath := filepath.Join(site.Path, ".user.ini")
	content, err := os.ReadFile(iniPath)
	if err != nil {
		return false, "", nil
	}

	for _, line := range vhostLines(string(content)) {
		if len(line) > 0 && line[0] != ';' {
			if strings.HasPrefix(strings.TrimSpace(line), "open_basedir") {
				return true, line, nil
			}
		}
	}
	return false, "", nil
}

// SetOpenBasedir enables or disables open_basedir for a site.
func (s *SiteService) SetOpenBasedir(id int64, enabled bool) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	iniPath := filepath.Join(site.Path, ".user.ini")

	if enabled {
		value := fmt.Sprintf("open_basedir=%s:/tmp:/proc", site.Path)
		existing, _ := os.ReadFile(iniPath)
		var newLines []string
		found := false
		for _, line := range vhostLines(string(existing)) {
			if strings.HasPrefix(strings.TrimSpace(line), "open_basedir") {
				newLines = append(newLines, value)
				found = true
			} else {
				newLines = append(newLines, line)
			}
		}
		if !found {
			newLines = append(newLines, value)
		}
		content := vhostJoin(newLines)
		if err := os.WriteFile(iniPath, []byte(content), 0644); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write .user.ini")
		}
	} else {
		existing, err := os.ReadFile(iniPath)
		if err != nil {
			return nil // file doesn't exist, nothing to disable
		}
		var newLines []string
		for _, line := range vhostLines(string(existing)) {
			if !strings.HasPrefix(strings.TrimSpace(line), "open_basedir") {
				newLines = append(newLines, line)
			}
		}
		content := vhostJoin(newLines)
		if len(newLines) == 0 || (len(newLines) == 1 && newLines[0] == "") {
			_ = os.Remove(iniPath)
		} else {
			_ = os.WriteFile(iniPath, []byte(content), 0644)
		}
	}

	logger.Info().Int64("id", id).Bool("enabled", enabled).Msg("site open_basedir updated")
	return nil
}

// SetAccessLog enables or disables the access log in the nginx vhost config.
func (s *SiteService) SetAccessLog(id int64, enabled bool) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)
	content, err := os.ReadFile(confPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read vhost config")
	}

	lines := vhostLines(string(content))
	var newLines []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if enabled {
			// Uncomment access_log lines
			if trimmed == "#access_log off;" {
				newLines = append(newLines, strings.Replace(line, "#access_log off;", fmt.Sprintf("access_log /ITDLUPanel/logs/%s/access.log;", site.Domain), 1))
			} else if isCommentedAccessLog(trimmed) {
				newLines = append(newLines, vhostUncomment(line))
			} else {
				newLines = append(newLines, line)
			}
		} else {
			// Comment out or replace access_log lines
			if isAccessLogDirective(trimmed) {
				newLines = append(newLines, strings.Replace(line, trimmed, "#"+trimmed, 1))
			} else {
				newLines = append(newLines, line)
			}
		}
	}

	if err := os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write vhost config")
	}

	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Bool("enabled", enabled).Msg("site access log toggled")
	return nil
}

// GetAccessLogEnabled checks if access_log is enabled (not commented out) in the vhost config.
func (s *SiteService) GetAccessLogEnabled(id int64) (bool, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return false, err
	}

	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)
	content, err := os.ReadFile(confPath)
	if err != nil {
		return false, nil
	}

	for _, line := range vhostLines(string(content)) {
		trimmed := strings.TrimSpace(line)
		if isAccessLogDirective(trimmed) {
			return true, nil
		}
	}
	return false, nil
}

// SetPasswordAccess enables or disables HTTP Basic Auth for a site.
func (s *SiteService) SetPasswordAccess(id int64, enabled bool, username, password string) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)
	htpasswdDir := filepath.Join(installer.ServerBaseDir, "nginx", "htpasswd")
	htpasswdFile := filepath.Join(htpasswdDir, site.Domain)

	if enabled {
		if username == "" || password == "" {
			return apperrors.New(apperrors.ErrValidation, "username and password are required")
		}

		_ = os.MkdirAll(htpasswdDir, 0755)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Check if htpasswd command exists; if not, generate manually
		if _, err := os.Stat("/usr/bin/htpasswd"); err == nil {
			_, err = system.Exec(ctx, "htpasswd", "-cb", htpasswdFile, username, password)
			if err != nil {
				return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create htpasswd file")
			}
		} else {
			// Generate using openssl
			out, err := system.Exec(ctx, "openssl", "passwd", "-apr1", password)
			if err != nil {
				return apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate password hash")
			}
			hash := strings.TrimSpace(out.Stdout)
			if err := os.WriteFile(htpasswdFile, []byte(fmt.Sprintf("%s:%s\n", username, hash)), 0644); err != nil {
				return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write htpasswd file")
			}
		}

		// Add auth_basic to nginx config
		if err := s.addNginxAuthBasic(confPath, site.Domain, htpasswdFile); err != nil {
			return err
		}
	} else {
		// Remove htpasswd file
		_ = os.Remove(htpasswdFile)

		// Remove auth_basic from nginx config
		if err := s.removeNginxAuthBasic(confPath); err != nil {
			return err
		}
	}

	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Bool("enabled", enabled).Msg("site password access updated")
	return nil
}

// GetPasswordAccess returns whether basic auth is enabled and the username.
func (s *SiteService) GetPasswordAccess(id int64) (bool, string, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return false, "", err
	}

	htpasswdFile := filepath.Join(installer.ServerBaseDir, "nginx", "htpasswd", site.Domain)
	content, err := os.ReadFile(htpasswdFile)
	if err != nil {
		return false, "", nil
	}

	// Parse first line: username:hash
	lines := vhostLines(string(content))
	if len(lines) > 0 {
		parts := strings.SplitN(lines[0], ":", 2)
		if len(parts) >= 2 {
			return true, parts[0], nil
		}
	}
	return false, "", nil
}

// addNginxAuthBasic adds auth_basic directives to the nginx vhost config.
func (s *SiteService) addNginxAuthBasic(confPath, domain, htpasswdFile string) error {
	content, err := os.ReadFile(confPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read vhost config")
	}

	text := string(content)
	// Already has auth_basic?
	if strings.Contains(text, "auth_basic") {
		return nil
	}

	// Insert after "root" directive
	lines := vhostLines(text)
	var newLines []string
	inserted := false
	for _, line := range lines {
		newLines = append(newLines, line)
		if !inserted && strings.Contains(line, "root ") && !strings.Contains(line, "#") {
			newLines = append(newLines,
				fmt.Sprintf("    #PASSWORD_ACCESS_START"),
				fmt.Sprintf("    auth_basic \"Protected Site\";"),
				fmt.Sprintf("    auth_basic_user_file %s;", htpasswdFile),
				fmt.Sprintf("    #PASSWORD_ACCESS_END"),
			)
			inserted = true
		}
	}

	return os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644)
}

// removeNginxAuthBasic removes auth_basic directives from the nginx vhost config.
func (s *SiteService) removeNginxAuthBasic(confPath string) error {
	content, err := os.ReadFile(confPath)
	if err != nil {
		return nil
	}

	lines := vhostLines(string(content))
	var newLines []string
	inBlock := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "#PASSWORD_ACCESS_START" {
			inBlock = true
			continue
		}
		if trimmed == "#PASSWORD_ACCESS_END" {
			inBlock = false
			continue
		}
		if inBlock {
			continue
		}
		// Also remove standalone auth_basic lines not in block
		if strings.Contains(trimmed, "auth_basic") {
			continue
		}
		newLines = append(newLines, line)
	}

	return os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644)
}

// config_extra JSON helpers
func (s *SiteService) getConfigExtraField(site *Site, field string) string {
	if site.ConfigExtra == nil {
		return ""
	}
	// Simple JSON parsing without importing encoding/json to keep it lightweight
	text := *site.ConfigExtra
	key := fmt.Sprintf(`"%s":"`, field)
	idx := strings.Index(text, key)
	if idx < 0 {
		return ""
	}
	start := idx + len(key)
	end := strings.Index(text[start:], `"`)
	if end < 0 {
		return ""
	}
	return text[start : start+end]
}

func (s *SiteService) setConfigExtraField(id int64, site *Site, field, value string) error {
	extra := "{}"
	if site.ConfigExtra != nil && *site.ConfigExtra != "" {
		extra = *site.ConfigExtra
	}

	key := fmt.Sprintf(`"%s":"`, field)
	idx := strings.Index(extra, key)
	if idx >= 0 {
		start := idx + len(key)
		end := strings.Index(extra[start:], `"`)
		if end >= 0 {
			extra = extra[:idx+len(key)] + value + extra[start+end:]
		}
	} else {
		// Insert new field
		if extra == "{}" {
			extra = fmt.Sprintf(`{"%s":"%s"}`, field, value)
		} else {
			// Insert before closing brace
			extra = extra[:len(extra)-1] + fmt.Sprintf(`,"%s":"%s"}`, field, value)
		}
	}

	_, err := s.db.Exec("UPDATE sites SET config_extra = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", extra, id)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update config_extra")
	}
	return nil
}

// ---------------------------------------------------------------------------
// JSON config file helpers
// ---------------------------------------------------------------------------

func siteConfigDir() string {
	return filepath.Join(installer.ServerBaseDir, "config", "sites")
}

func readJSONFile(path string, v interface{}) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return json.Unmarshal(data, v)
}

func writeJSONFile(path string, v interface{}) error {
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// ---------------------------------------------------------------------------
// Nginx block manipulation helpers
// ---------------------------------------------------------------------------

// insertNginxBlock inserts lines between start/end markers after the "root" directive.
// If the block already exists it is replaced.
func (s *SiteService) insertNginxBlock(confPath, startMarker, endMarker string, blockLines []string) error {
	content, err := os.ReadFile(confPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read vhost config")
	}

	text := string(content)

	// If markers already exist, replace
	if strings.Contains(text, startMarker) {
		return s.replaceNginxBlock(confPath, startMarker, endMarker, blockLines)
	}

	// Insert after first uncommented "root " directive
	lines := vhostLines(text)
	var newLines []string
	inserted := false
	for _, line := range lines {
		newLines = append(newLines, line)
		if !inserted && strings.Contains(line, "root ") && !strings.Contains(line, "#") {
			newLines = append(newLines, "    "+startMarker)
			for _, bl := range blockLines {
				newLines = append(newLines, "    "+bl)
			}
			newLines = append(newLines, "    "+endMarker)
			inserted = true
		}
	}

	return os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644)
}

// removeNginxBlock removes everything between (and including) the start/end markers.
func (s *SiteService) removeNginxBlock(confPath, startMarker, endMarker string) error {
	content, err := os.ReadFile(confPath)
	if err != nil {
		return nil
	}

	lines := vhostLines(string(content))
	var newLines []string
	inBlock := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == startMarker {
			inBlock = true
			continue
		}
		if trimmed == endMarker {
			inBlock = false
			continue
		}
		if inBlock {
			continue
		}
		newLines = append(newLines, line)
	}

	return os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644)
}

// replaceNginxBlock replaces the content between start/end markers with new lines.
func (s *SiteService) replaceNginxBlock(confPath, startMarker, endMarker string, blockLines []string) error {
	content, err := os.ReadFile(confPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read vhost config")
	}

	lines := vhostLines(string(content))
	var newLines []string
	inBlock := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == startMarker {
			inBlock = true
			newLines = append(newLines, line)
			for _, bl := range blockLines {
				newLines = append(newLines, "    "+bl)
			}
			continue
		}
		if trimmed == endMarker {
			inBlock = false
			newLines = append(newLines, line)
			continue
		}
		if inBlock {
			continue
		}
		newLines = append(newLines, line)
	}

	return os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644)
}

// insertNginxBlockAll inserts block markers after EVERY server-level "root " directive.
// It tracks brace depth to skip root directives inside location/if blocks.
func (s *SiteService) insertNginxBlockAll(confPath, startMarker, endMarker string, blockLines []string) error {
	content, err := os.ReadFile(confPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read vhost config")
	}

	lines := vhostLines(string(content))
	var newLines []string
	depth := 0 // brace nesting: 1 = inside server{}, 2+ = inside location/if{}
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		// Track brace depth
		if strings.Contains(trimmed, "{") && !strings.HasPrefix(trimmed, "#") {
			depth++
		}

		newLines = append(newLines, line)

		// Only insert after root at server-block level (depth == 1)
		if depth == 1 && strings.HasPrefix(trimmed, "root ") && !strings.Contains(line, "#") {
			newLines = append(newLines, "    "+startMarker)
			for _, bl := range blockLines {
				newLines = append(newLines, "    "+bl)
			}
			newLines = append(newLines, "    "+endMarker)
		}

		if strings.Contains(trimmed, "}") && !strings.HasPrefix(trimmed, "#") {
			depth--
		}
	}

	return os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644)
}

// removeAllNginxBlocks removes ALL occurrences of a marker block from the config file.
func (s *SiteService) removeAllNginxBlocks(confPath, startMarker, endMarker string) error {
	content, err := os.ReadFile(confPath)
	if err != nil {
		return nil
	}

	lines := vhostLines(string(content))
	var newLines []string
	inBlock := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == startMarker {
			inBlock = true
			continue
		}
		if trimmed == endMarker {
			inBlock = false
			continue
		}
		if inBlock {
			continue
		}
		newLines = append(newLines, line)
	}

	return os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644)
}

// SubdirBinding represents a domain-to-subdirectory binding.
type SubdirBinding struct {
	Domain string `json:"domain"`
	Subdir string `json:"subdir"`
}

func subdirBindingsPath(id int64) string {
	return filepath.Join(siteConfigDir(), fmt.Sprintf("%d_subdir.json", id))
}

func subdirNginxConfPath(bindingDomain string) string {
	return filepath.Join(installer.ServerBaseDir, "nginx", "conf", "sites-available", bindingDomain+"_subdir.conf")
}

func subdirNginxEnabledPath(bindingDomain string) string {
	return filepath.Join(installer.ServerBaseDir, "nginx", "conf", "sites-enabled", bindingDomain+"_subdir.conf")
}

// GetSubdirBindings returns all subdirectory bindings for a site.
func (s *SiteService) GetSubdirBindings(id int64) ([]SubdirBinding, error) {
	_, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	var bindings []SubdirBinding
	if err := readJSONFile(subdirBindingsPath(id), &bindings); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read subdir bindings")
	}
	if bindings == nil {
		bindings = []SubdirBinding{}
	}
	return bindings, nil
}

// AddSubdirBinding adds a subdirectory binding and creates the nginx config.
func (s *SiteService) AddSubdirBinding(id int64, domain, subdir string) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if domain == "" || subdir == "" {
		return apperrors.New(apperrors.ErrValidation, "domain and subdir are required")
	}

	// Clean subdir: strip leading/trailing slashes
	subdir = strings.Trim(subdir, "/")
	if subdir == "" {
		return apperrors.New(apperrors.ErrValidation, "subdir cannot be empty")
	}

	var bindings []SubdirBinding
	_ = readJSONFile(subdirBindingsPath(id), &bindings)

	// Check for duplicate domain
	for _, b := range bindings {
		if b.Domain == domain {
			return apperrors.New(apperrors.ErrValidation, "domain binding already exists")
		}
	}

	bindings = append(bindings, SubdirBinding{Domain: domain, Subdir: subdir})

	if err := writeJSONFile(subdirBindingsPath(id), bindings); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save subdir bindings")
	}

	// Create nginx config for the subdomain
	docRoot := filepath.Join(wwwrootBase, site.Domain, subdir)
	nginxConf := s.generateSubdirNginxConf(domain, docRoot, site)
	confPath := subdirNginxConfPath(domain)
	if err := os.WriteFile(confPath, []byte(nginxConf), 0644); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write subdir nginx config")
	}

	// Symlink to sites-enabled
	enabledPath := subdirNginxEnabledPath(domain)
	_ = os.Remove(enabledPath)
	if err := os.Symlink(confPath, enabledPath); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to enable subdir site")
	}

	gen := generatorFor(site.Webserver)
	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Str("domain", domain).Str("subdir", subdir).Msg("subdir binding added")
	return nil
}

// RemoveSubdirBinding removes a subdirectory binding by index.
func (s *SiteService) RemoveSubdirBinding(id int64, index int) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	var bindings []SubdirBinding
	_ = readJSONFile(subdirBindingsPath(id), &bindings)

	if index < 0 || index >= len(bindings) {
		return apperrors.New(apperrors.ErrValidation, "invalid binding index")
	}

	removed := bindings[index]
	bindings = append(bindings[:index], bindings[index+1:]...)

	if err := writeJSONFile(subdirBindingsPath(id), bindings); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save subdir bindings")
	}

	// Remove nginx config files
	_ = os.Remove(subdirNginxEnabledPath(removed.Domain))
	_ = os.Remove(subdirNginxConfPath(removed.Domain))

	gen := generatorFor(site.Webserver)
	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Str("domain", removed.Domain).Msg("subdir binding removed")
	return nil
}

func (s *SiteService) generateSubdirNginxConf(bindingDomain, docRoot string, site *Site) string {
	phpVersion := ""
	if site.PHPVersion != nil {
		phpVersion = *site.PHPVersion
	}

	var b strings.Builder
	b.WriteString("server {\n")
	b.WriteString("    listen 80;\n")
	b.WriteString(fmt.Sprintf("    server_name %s;\n", bindingDomain))
	b.WriteString(fmt.Sprintf("    root %s;\n", docRoot))
	b.WriteString("    index index.php index.html index.htm;\n")
	b.WriteString("\n")
	b.WriteString("    location / {\n")
	b.WriteString("        try_files $uri $uri/ /index.php?$query_string;\n")
	b.WriteString("    }\n")

	if phpVersion != "" {
		b.WriteString("\n")
		b.WriteString("    location ~ \\.php$ {\n")
		b.WriteString("        fastcgi_pass unix:/run/php/php" + phpVersion + "-fpm.sock;\n")
		b.WriteString("        fastcgi_index index.php;\n")
		b.WriteString("        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n")
		b.WriteString("        include fastcgi_params;\n")
		b.WriteString("    }\n")
	}

	b.WriteString("\n")
	b.WriteString(fmt.Sprintf("    access_log /ITDLUPanel/logs/%s/access.log;\n", bindingDomain))
	b.WriteString(fmt.Sprintf("    error_log /ITDLUPanel/logs/%s/error.log;\n", bindingDomain))
	b.WriteString("}\n")

	return b.String()
}

// ---------------------------------------------------------------------------
// Feature 2: Limit Access (HTTP Basic Auth per path)
// ---------------------------------------------------------------------------

// LimitAccessRule represents an HTTP Basic Auth rule for a specific path.
type LimitAccessRule struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Username string `json:"username"`
	Password string `json:"password,omitempty"`
}

func limitAccessPath(id int64) string {
	return filepath.Join(siteConfigDir(), fmt.Sprintf("%d_limit_access.json", id))
}

// GetLimitAccessRules returns all limit access rules for a site.
func (s *SiteService) GetLimitAccessRules(id int64) ([]LimitAccessRule, error) {
	_, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	var rules []LimitAccessRule
	if err := readJSONFile(limitAccessPath(id), &rules); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read limit access rules")
	}
	if rules == nil {
		rules = []LimitAccessRule{}
	}
	// Strip passwords from response
	for i := range rules {
		rules[i].Password = ""
	}
	return rules, nil
}

// AddLimitAccessRule adds a basic auth rule for a specific path.
func (s *SiteService) AddLimitAccessRule(id int64, rule LimitAccessRule) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if rule.Name == "" || rule.Path == "" || rule.Username == "" || rule.Password == "" {
		return apperrors.New(apperrors.ErrValidation, "name, path, username, and password are required")
	}

	var rules []LimitAccessRule
	_ = readJSONFile(limitAccessPath(id), &rules)

	// Check for duplicate name
	for _, r := range rules {
		if r.Name == rule.Name {
			return apperrors.New(apperrors.ErrValidation, "rule with this name already exists")
		}
	}

	// Create htpasswd file
	htpasswdDir := filepath.Join(installer.ServerBaseDir, "nginx", "htpasswd")
	_ = os.MkdirAll(htpasswdDir, 0755)
	htpasswdFile := filepath.Join(htpasswdDir, fmt.Sprintf("%s_%s", site.Domain, rule.Name))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if _, err := os.Stat("/usr/bin/htpasswd"); err == nil {
		_, err = system.Exec(ctx, "htpasswd", "-cb", htpasswdFile, rule.Username, rule.Password)
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create htpasswd file")
		}
	} else {
		out, err := system.Exec(ctx, "openssl", "passwd", "-apr1", rule.Password)
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to generate password hash")
		}
		hash := strings.TrimSpace(out.Stdout)
		if err := os.WriteFile(htpasswdFile, []byte(fmt.Sprintf("%s:%s\n", rule.Username, hash)), 0644); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write htpasswd file")
		}
	}

	rules = append(rules, rule)

	if err := writeJSONFile(limitAccessPath(id), rules); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save limit access rules")
	}

	// Rebuild nginx block
	if err := s.rebuildLimitAccessNginx(site, rules); err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)
	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Str("name", rule.Name).Str("path", rule.Path).Msg("limit access rule added")
	return nil
}

// RemoveLimitAccessRule removes a limit access rule by index.
func (s *SiteService) RemoveLimitAccessRule(id int64, index int) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	var rules []LimitAccessRule
	_ = readJSONFile(limitAccessPath(id), &rules)

	if index < 0 || index >= len(rules) {
		return apperrors.New(apperrors.ErrValidation, "invalid rule index")
	}

	removed := rules[index]
	rules = append(rules[:index], rules[index+1:]...)

	// Remove htpasswd file
	htpasswdFile := filepath.Join(installer.ServerBaseDir, "nginx", "htpasswd", fmt.Sprintf("%s_%s", site.Domain, removed.Name))
	_ = os.Remove(htpasswdFile)

	if err := writeJSONFile(limitAccessPath(id), rules); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save limit access rules")
	}

	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	if len(rules) == 0 {
		if err := s.removeNginxBlock(confPath, "#LIMIT_ACCESS_START", "#LIMIT_ACCESS_END"); err != nil {
			return err
		}
	} else {
		if err := s.rebuildLimitAccessNginx(site, rules); err != nil {
			return err
		}
	}

	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Str("name", removed.Name).Msg("limit access rule removed")
	return nil
}

func (s *SiteService) rebuildLimitAccessNginx(site *Site, rules []LimitAccessRule) error {
	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	var blockLines []string
	for _, r := range rules {
		htpasswdFile := filepath.Join(installer.ServerBaseDir, "nginx", "htpasswd", fmt.Sprintf("%s_%s", site.Domain, r.Name))
		blockLines = append(blockLines,
			fmt.Sprintf("location ^~ %s {", r.Path),
			"    auth_basic \"Restricted Area\";",
			fmt.Sprintf("    auth_basic_user_file %s;", htpasswdFile),
			"    try_files $uri $uri/ /index.php?$query_string;",
			"}",
		)
	}

	return s.insertNginxBlock(confPath, "#LIMIT_ACCESS_START", "#LIMIT_ACCESS_END", blockLines)
}

// ---------------------------------------------------------------------------
// Feature 3: Deny Access (block file types in paths)
// ---------------------------------------------------------------------------

// DenyAccessRule represents a rule to deny access to certain file types in a path.
type DenyAccessRule struct {
	Name   string `json:"name"`
	Suffix string `json:"suffix"`
	Path   string `json:"path"`
}

func denyAccessPath(id int64) string {
	return filepath.Join(siteConfigDir(), fmt.Sprintf("%d_deny_access.json", id))
}

// GetDenyAccessRules returns all deny access rules for a site.
func (s *SiteService) GetDenyAccessRules(id int64) ([]DenyAccessRule, error) {
	_, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	var rules []DenyAccessRule
	if err := readJSONFile(denyAccessPath(id), &rules); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read deny access rules")
	}
	if rules == nil {
		rules = []DenyAccessRule{}
	}
	return rules, nil
}

// AddDenyAccessRule adds a deny access rule for file types in a path.
func (s *SiteService) AddDenyAccessRule(id int64, rule DenyAccessRule) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if rule.Name == "" || rule.Suffix == "" || rule.Path == "" {
		return apperrors.New(apperrors.ErrValidation, "name, suffix, and path are required")
	}

	var rules []DenyAccessRule
	_ = readJSONFile(denyAccessPath(id), &rules)

	for _, r := range rules {
		if r.Name == rule.Name {
			return apperrors.New(apperrors.ErrValidation, "rule with this name already exists")
		}
	}

	rules = append(rules, rule)

	if err := writeJSONFile(denyAccessPath(id), rules); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save deny access rules")
	}

	if err := s.rebuildDenyAccessNginx(site, rules); err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)
	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Str("name", rule.Name).Msg("deny access rule added")
	return nil
}

// RemoveDenyAccessRule removes a deny access rule by index.
func (s *SiteService) RemoveDenyAccessRule(id int64, index int) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	var rules []DenyAccessRule
	_ = readJSONFile(denyAccessPath(id), &rules)

	if index < 0 || index >= len(rules) {
		return apperrors.New(apperrors.ErrValidation, "invalid rule index")
	}

	removed := rules[index]
	rules = append(rules[:index], rules[index+1:]...)

	if err := writeJSONFile(denyAccessPath(id), rules); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save deny access rules")
	}

	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	if len(rules) == 0 {
		if err := s.removeNginxBlock(confPath, "#DENY_ACCESS_START", "#DENY_ACCESS_END"); err != nil {
			return err
		}
	} else {
		if err := s.rebuildDenyAccessNginx(site, rules); err != nil {
			return err
		}
	}

	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Str("name", removed.Name).Msg("deny access rule removed")
	return nil
}

func (s *SiteService) rebuildDenyAccessNginx(site *Site, rules []DenyAccessRule) error {
	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	var blockLines []string
	for _, r := range rules {
		path := strings.TrimRight(r.Path, "/")
		blockLines = append(blockLines,
			fmt.Sprintf("location ~ ^%s/.*\\.(%s)$ {", path, r.Suffix),
			"    deny all;",
			"}",
		)
	}

	return s.insertNginxBlock(confPath, "#DENY_ACCESS_START", "#DENY_ACCESS_END", blockLines)
}

// ---------------------------------------------------------------------------
// Feature 4: Traffic Control (rate limiting)
// ---------------------------------------------------------------------------

// TrafficConfig represents traffic control settings for a site.
type TrafficConfig struct {
	Enabled     bool   `json:"enabled"`
	Plan        string `json:"plan"`
	Concurrency int    `json:"concurrency"`
	IPLimit     int    `json:"ip_limit"`
	Bandwidth   int    `json:"bandwidth"`
}

func trafficConfigPath(id int64) string {
	return filepath.Join(siteConfigDir(), fmt.Sprintf("%d_traffic.json", id))
}

// GetTrafficControl returns the current traffic control settings for a site.
func (s *SiteService) GetTrafficControl(id int64) (*TrafficConfig, error) {
	_, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	var config TrafficConfig
	if err := readJSONFile(trafficConfigPath(id), &config); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read traffic config")
	}
	return &config, nil
}

// SetTrafficControl updates traffic control settings for a site.
func (s *SiteService) SetTrafficControl(id int64, config TrafficConfig) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	// Apply preset plans
	switch strings.ToUpper(config.Plan) {
	case "BSS":
		if config.Concurrency == 0 {
			config.Concurrency = 500
		}
		if config.IPLimit == 0 {
			config.IPLimit = 50
		}
		if config.Bandwidth == 0 {
			config.Bandwidth = 1024
		}
	case "BLOG":
		if config.Concurrency == 0 {
			config.Concurrency = 300
		}
		if config.IPLimit == 0 {
			config.IPLimit = 25
		}
		if config.Bandwidth == 0 {
			config.Bandwidth = 512
		}
	}

	if err := writeJSONFile(trafficConfigPath(id), config); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save traffic config")
	}

	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	if config.Enabled {
		// Ensure global rate limit zones exist
		if err := s.ensureRateLimitZones(); err != nil {
			return err
		}

		var blockLines []string
		if config.Concurrency > 0 {
			blockLines = append(blockLines, fmt.Sprintf("limit_conn addr %d;", config.Concurrency))
		}
		if config.IPLimit > 0 {
			blockLines = append(blockLines, fmt.Sprintf("limit_req zone=one burst=%d nodelay;", config.IPLimit))
		}
		if config.Bandwidth > 0 {
			blockLines = append(blockLines, fmt.Sprintf("limit_rate %dk;", config.Bandwidth))
		}

		if err := s.insertNginxBlock(confPath, "#TRAFFIC_CONTROL_START", "#TRAFFIC_CONTROL_END", blockLines); err != nil {
			return err
		}
	} else {
		if err := s.removeNginxBlock(confPath, "#TRAFFIC_CONTROL_START", "#TRAFFIC_CONTROL_END"); err != nil {
			return err
		}
	}

	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Bool("enabled", config.Enabled).Msg("traffic control updated")
	return nil
}

// ensureRateLimitZones creates the global nginx rate limit zone config if missing.
func (s *SiteService) ensureRateLimitZones() error {
	nginxConfD := filepath.Join(installer.ServerBaseDir, "nginx", "conf", "conf.d")
	confPath := filepath.Join(nginxConfD, "rate_limit.conf")
	if _, err := os.Stat(confPath); err == nil {
		return nil
	}

	content := "limit_conn_zone $binary_remote_addr zone=addr:10m;\nlimit_req_zone $binary_remote_addr zone=one:10m rate=25r/s;\n"
	_ = os.MkdirAll(nginxConfD, 0755)
	if err := os.WriteFile(confPath, []byte(content), 0644); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create rate limit zones config")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Vhost text helpers
// ---------------------------------------------------------------------------

func vhostLines(s string) []string    { return strings.Split(s, "\n") }
func vhostJoin(lines []string) string { return strings.Join(lines, "\n") }

func isAccessLogDirective(trimmed string) bool {
	return strings.HasPrefix(trimmed, "access_log")
}

func isCommentedAccessLog(trimmed string) bool {
	return strings.HasPrefix(trimmed, "#access_log")
}

func vhostUncomment(line string) string {
	idx := strings.Index(line, "#")
	if idx < 0 {
		return line
	}
	return line[:idx] + line[idx+1:]
}

// ---------------------------------------------------------------------------
// Feature 5: Default Document
// ---------------------------------------------------------------------------

// DefaultDocConfig holds the default index files for a site.
type DefaultDocConfig struct {
	Index string `json:"index"` // e.g. "index.php index.html index.htm default.php"
}

func defaultDocPath(siteID int64) string {
	return filepath.Join(siteConfigDir(), fmt.Sprintf("%d_default_doc.json", siteID))
}

// GetDefaultDoc returns the current default document config for a site.
func (s *SiteService) GetDefaultDoc(id int64) (*DefaultDocConfig, error) {
	_, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	var config DefaultDocConfig
	if err := readJSONFile(defaultDocPath(id), &config); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read default document config")
	}
	if config.Index == "" {
		config.Index = "index.php index.html index.htm"
	}
	return &config, nil
}

// SetDefaultDoc updates the default document settings for a site.
func (s *SiteService) SetDefaultDoc(id int64, config DefaultDocConfig) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if config.Index == "" {
		config.Index = "index.php index.html index.htm"
	}

	if err := writeJSONFile(defaultDocPath(id), config); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save default document config")
	}

	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)
	content, err := os.ReadFile(confPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read vhost config")
	}

	lines := vhostLines(string(content))
	var newLines []string
	replaced := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "index ") && !strings.Contains(line, "#") {
			// Get the indentation
			indent := line[:len(line)-len(strings.TrimLeft(line, " \t"))]
			newLines = append(newLines, fmt.Sprintf("%sindex %s;", indent, config.Index))
			replaced = true
		} else {
			newLines = append(newLines, line)
		}
	}

	if !replaced {
		// Insert after root directive
		var finalLines []string
		for _, line := range newLines {
			finalLines = append(finalLines, line)
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "root ") && !strings.Contains(line, "#") {
				indent := line[:len(line)-len(strings.TrimLeft(line, " \t"))]
				finalLines = append(finalLines, fmt.Sprintf("%sindex %s;", indent, config.Index))
			}
		}
		newLines = finalLines
	}

	if err := os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write vhost config")
	}

	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Str("index", config.Index).Msg("default document updated")
	return nil
}

// ---------------------------------------------------------------------------
// Feature 6: Reverse Proxy
// ---------------------------------------------------------------------------

// ReverseProxyRule represents a single reverse proxy configuration.
type ReverseProxyRule struct {
	Name           string               `json:"name"`
	Directory      string               `json:"directory"`       // e.g. "/api"
	TargetURL      string               `json:"target_url"`      // e.g. "http://127.0.0.1:3000"
	SendDomain     bool                 `json:"send_domain"`     // pass $host header
	EnableCache    bool                 `json:"enable_cache"`    // proxy caching
	URLRewrite     []URLRewriteRule     `json:"url_rewrite"`     // URL rewrite rules
	ContentReplace []ContentReplaceRule `json:"content_replace"` // content replacement rules
}

// URLRewriteRule represents a URL rewrite rule for reverse proxy.
type URLRewriteRule struct {
	Pattern     string `json:"pattern"`     // regex pattern
	Replacement string `json:"replacement"` // replacement string
}

// ContentReplaceRule represents a content replacement rule for reverse proxy.
type ContentReplaceRule struct {
	Search  string `json:"search"`  // string to find
	Replace string `json:"replace"` // replacement string
}

func reverseProxyPath(siteID int64) string {
	return filepath.Join(siteConfigDir(), fmt.Sprintf("%d_reverse_proxy.json", siteID))
}

// GetReverseProxyRules returns all reverse proxy rules for a site.
func (s *SiteService) GetReverseProxyRules(id int64) ([]ReverseProxyRule, error) {
	_, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	var rules []ReverseProxyRule
	if err := readJSONFile(reverseProxyPath(id), &rules); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read reverse proxy rules")
	}
	if rules == nil {
		rules = []ReverseProxyRule{}
	}
	return rules, nil
}

// AddReverseProxyRule adds a reverse proxy rule for a site.
func (s *SiteService) AddReverseProxyRule(id int64, rule ReverseProxyRule) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if rule.Name == "" || rule.Directory == "" || rule.TargetURL == "" {
		return apperrors.New(apperrors.ErrValidation, "name, directory, and target_url are required")
	}

	if !validateNginxPath(rule.Directory) {
		return apperrors.New(apperrors.ErrValidation, "directory contains invalid characters (only /a-zA-Z0-9_-. allowed)")
	}
	if !validateURL(rule.TargetURL) {
		return apperrors.New(apperrors.ErrValidation, "target_url must be a valid http:// or https:// URL")
	}

	var rules []ReverseProxyRule
	_ = readJSONFile(reverseProxyPath(id), &rules)

	for _, r := range rules {
		if r.Name == rule.Name {
			return apperrors.New(apperrors.ErrValidation, "rule with this name already exists")
		}
	}

	rules = append(rules, rule)

	if err := writeJSONFile(reverseProxyPath(id), rules); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save reverse proxy rules")
	}

	if err := s.rebuildReverseProxy(site, rules); err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)
	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Str("name", rule.Name).Str("directory", rule.Directory).Msg("reverse proxy rule added")
	return nil
}

// UpdateReverseProxyRule updates a reverse proxy rule at the given index.
func (s *SiteService) UpdateReverseProxyRule(id int64, index int, rule ReverseProxyRule) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	var rules []ReverseProxyRule
	_ = readJSONFile(reverseProxyPath(id), &rules)

	if index < 0 || index >= len(rules) {
		return apperrors.New(apperrors.ErrValidation, "invalid rule index")
	}

	if rule.Directory != "" && !validateNginxPath(rule.Directory) {
		return apperrors.New(apperrors.ErrValidation, "directory contains invalid characters")
	}
	if rule.TargetURL != "" && !validateURL(rule.TargetURL) {
		return apperrors.New(apperrors.ErrValidation, "target_url must be a valid http:// or https:// URL")
	}

	rules[index] = rule

	if err := writeJSONFile(reverseProxyPath(id), rules); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save reverse proxy rules")
	}

	if err := s.rebuildReverseProxy(site, rules); err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)
	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Int("index", index).Msg("reverse proxy rule updated")
	return nil
}

// RemoveReverseProxyRule removes a reverse proxy rule by index.
func (s *SiteService) RemoveReverseProxyRule(id int64, index int) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	var rules []ReverseProxyRule
	_ = readJSONFile(reverseProxyPath(id), &rules)

	if index < 0 || index >= len(rules) {
		return apperrors.New(apperrors.ErrValidation, "invalid rule index")
	}

	removed := rules[index]
	rules = append(rules[:index], rules[index+1:]...)

	if err := writeJSONFile(reverseProxyPath(id), rules); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save reverse proxy rules")
	}

	if err := s.removeReverseProxy(site, rules); err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)
	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Str("name", removed.Name).Msg("reverse proxy rule removed")
	return nil
}

// rebuildReverseProxy dispatches to the webserver-specific reverse proxy rebuild.
func (s *SiteService) rebuildReverseProxy(site *Site, rules []ReverseProxyRule) error {
	switch site.Webserver {
	case "apache":
		return s.rebuildReverseProxyApache(site, rules)
	case "openlitespeed":
		return s.rebuildReverseProxyOLS(site, rules)
	default:
		return s.rebuildReverseProxyNginx(site, rules)
	}
}

// removeReverseProxy removes reverse proxy config blocks or rebuilds with remaining rules.
func (s *SiteService) removeReverseProxy(site *Site, rules []ReverseProxyRule) error {
	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	if len(rules) == 0 {
		switch site.Webserver {
		case "apache":
			return s.removeApacheBlock(confPath, "#REVERSE_PROXY_START", "#REVERSE_PROXY_END")
		case "openlitespeed":
			return s.removeOLSBlock(confPath, "#REVERSE_PROXY_START", "#REVERSE_PROXY_END")
		default:
			return s.removeNginxBlock(confPath, "#REVERSE_PROXY_START", "#REVERSE_PROXY_END")
		}
	}
	return s.rebuildReverseProxy(site, rules)
}

func (s *SiteService) rebuildReverseProxyNginx(site *Site, rules []ReverseProxyRule) error {
	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	var blockLines []string
	for _, r := range rules {
		dir := r.Directory
		if dir == "" {
			dir = "/"
		}
		if !validateNginxPath(dir) {
			logger.Warn().Str("directory", dir).Msg("skipping reverse proxy rule with invalid directory path")
			continue
		}
		if !validateURL(r.TargetURL) {
			logger.Warn().Str("target_url", r.TargetURL).Msg("skipping reverse proxy rule with invalid target URL")
			continue
		}

		blockLines = append(blockLines, fmt.Sprintf("location %s {", dir))

		// URL rewrite rules (before proxy_pass)
		for _, rw := range r.URLRewrite {
			if rw.Pattern != "" && rw.Replacement != "" {
				pattern := sanitizeNginxRegex(rw.Pattern)
				replacement := sanitizeNginxRegex(rw.Replacement)
				blockLines = append(blockLines, fmt.Sprintf("    rewrite %s %s break;", pattern, replacement))
			}
		}

		blockLines = append(blockLines, fmt.Sprintf("    proxy_pass %s;", sanitizeNginxValue(r.TargetURL)))
		blockLines = append(blockLines, "    proxy_set_header X-Real-IP $remote_addr;")
		blockLines = append(blockLines, "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;")
		blockLines = append(blockLines, "    proxy_set_header X-Forwarded-Proto $scheme;")

		if r.SendDomain {
			blockLines = append(blockLines, "    proxy_set_header Host $host;")
		} else {
			blockLines = append(blockLines, "    proxy_set_header Host $proxy_host;")
		}

		blockLines = append(blockLines, "    proxy_http_version 1.1;")
		blockLines = append(blockLines, "    proxy_set_header Upgrade $http_upgrade;")
		blockLines = append(blockLines, `    proxy_set_header Connection "upgrade";`)

		if r.EnableCache {
			blockLines = append(blockLines, "    proxy_cache_valid 200 302 10m;")
			blockLines = append(blockLines, "    proxy_cache_valid 404 1m;")
			blockLines = append(blockLines, "    proxy_buffering on;")
		}

		// Content replacement using sub_filter
		if len(r.ContentReplace) > 0 {
			blockLines = append(blockLines, "    sub_filter_once off;")
			for _, cr := range r.ContentReplace {
				if cr.Search != "" {
					search := escapeNginxSingleQuote(cr.Search)
					replace := escapeNginxSingleQuote(cr.Replace)
					blockLines = append(blockLines, fmt.Sprintf("    sub_filter '%s' '%s';", search, replace))
				}
			}
		}

		blockLines = append(blockLines, "}")
	}

	return s.insertNginxBlock(confPath, "#REVERSE_PROXY_START", "#REVERSE_PROXY_END", blockLines)
}

// rebuildReverseProxyApache generates Apache ProxyPass directives for reverse proxy rules.
func (s *SiteService) rebuildReverseProxyApache(site *Site, rules []ReverseProxyRule) error {
	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	var blockLines []string
	for _, r := range rules {
		dir := r.Directory
		if dir == "" {
			dir = "/"
		}
		if !validateNginxPath(dir) {
			logger.Warn().Str("directory", dir).Msg("skipping reverse proxy rule with invalid directory path")
			continue
		}
		if !validateURL(r.TargetURL) {
			logger.Warn().Str("target_url", r.TargetURL).Msg("skipping reverse proxy rule with invalid target URL")
			continue
		}

		target := sanitizeApacheValue(r.TargetURL)

		blockLines = append(blockLines, fmt.Sprintf("    # Proxy: %s", r.Name))
		blockLines = append(blockLines, fmt.Sprintf("    ProxyPass %s %s", dir, target))
		blockLines = append(blockLines, fmt.Sprintf("    ProxyPassReverse %s %s", dir, target))

		if r.SendDomain {
			blockLines = append(blockLines, "    ProxyPreserveHost On")
		} else {
			blockLines = append(blockLines, "    ProxyPreserveHost Off")
		}

		blockLines = append(blockLines, "    RequestHeader set X-Forwarded-Proto expr=%{REQUEST_SCHEME}")
		blockLines = append(blockLines, "    RequestHeader set X-Real-IP expr=%{REMOTE_ADDR}")

		// URL rewrite rules
		for _, rw := range r.URLRewrite {
			if rw.Pattern != "" && rw.Replacement != "" {
				blockLines = append(blockLines, "    RewriteEngine On")
				blockLines = append(blockLines, fmt.Sprintf("    RewriteRule %s %s [P,L]", sanitizeApacheValue(rw.Pattern), sanitizeApacheValue(rw.Replacement)))
			}
		}

		// Content replacement using mod_substitute
		if len(r.ContentReplace) > 0 {
			blockLines = append(blockLines, "    AddOutputFilterByType SUBSTITUTE text/html")
			for _, cr := range r.ContentReplace {
				if cr.Search != "" {
					blockLines = append(blockLines, fmt.Sprintf("    Substitute \"s|%s|%s|ni\"", sanitizeApacheValue(cr.Search), sanitizeApacheValue(cr.Replace)))
				}
			}
		}

		if r.EnableCache {
			blockLines = append(blockLines, fmt.Sprintf("    CacheEnable disk %s", dir))
		}
	}

	return s.insertApacheBlock(confPath, "#REVERSE_PROXY_START", "#REVERSE_PROXY_END", blockLines)
}

// rebuildReverseProxyOLS generates OpenLiteSpeed proxy context blocks.
func (s *SiteService) rebuildReverseProxyOLS(site *Site, rules []ReverseProxyRule) error {
	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	var blockLines []string
	for i, r := range rules {
		dir := r.Directory
		if dir == "" {
			dir = "/"
		}
		if !validateNginxPath(dir) {
			logger.Warn().Str("directory", dir).Msg("skipping reverse proxy rule with invalid directory path")
			continue
		}
		if !validateURL(r.TargetURL) {
			logger.Warn().Str("target_url", r.TargetURL).Msg("skipping reverse proxy rule with invalid target URL")
			continue
		}

		target := sanitizeApacheValue(r.TargetURL)
		epName := fmt.Sprintf("proxy_%s_%d", sanitizeOLSName(r.Name), i)

		// External app (proxy backend)
		blockLines = append(blockLines, fmt.Sprintf("extprocessor %s {", epName))
		blockLines = append(blockLines, "  type                    proxy")
		blockLines = append(blockLines, fmt.Sprintf("  address                 %s", target))
		blockLines = append(blockLines, "  maxConns                100")
		blockLines = append(blockLines, "  pcKeepAliveTimeout      60")
		blockLines = append(blockLines, "  initTimeout             60")
		blockLines = append(blockLines, "  retryTimeout            0")
		blockLines = append(blockLines, "  respBuffer              0")
		blockLines = append(blockLines, "}")
		blockLines = append(blockLines, "")

		// Context block to route requests to proxy
		blockLines = append(blockLines, fmt.Sprintf("context %s {", dir))
		blockLines = append(blockLines, "  type                    proxy")
		blockLines = append(blockLines, fmt.Sprintf("  handler                 %s", epName))
		if r.SendDomain {
			blockLines = append(blockLines, "  addDefaultCharset       off")
		}

		// URL rewrite rules
		if len(r.URLRewrite) > 0 {
			blockLines = append(blockLines, "  rewrite  {")
			blockLines = append(blockLines, "    enable                1")
			var rwRules []string
			for _, rw := range r.URLRewrite {
				if rw.Pattern != "" && rw.Replacement != "" {
					rwRules = append(rwRules, fmt.Sprintf("RewriteRule %s %s [P,L]", sanitizeApacheValue(rw.Pattern), sanitizeApacheValue(rw.Replacement)))
				}
			}
			if len(rwRules) > 0 {
				blockLines = append(blockLines, "    rules                 <<<END_rules")
				blockLines = append(blockLines, rwRules...)
				blockLines = append(blockLines, "    END_rules")
			}
			blockLines = append(blockLines, "  }")
		}

		blockLines = append(blockLines, "}")
	}

	return s.insertOLSBlock(confPath, "#REVERSE_PROXY_START", "#REVERSE_PROXY_END", blockLines)
}

// sanitizeApacheValue removes dangerous characters from Apache config values.
func sanitizeApacheValue(s string) string {
	r := strings.NewReplacer("\n", "", "\r", "", "`", "")
	return r.Replace(s)
}

// sanitizeOLSName creates a safe identifier for OLS extprocessor names.
func sanitizeOLSName(s string) string {
	var buf strings.Builder
	for _, c := range s {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' {
			buf.WriteRune(c)
		}
	}
	result := buf.String()
	if result == "" {
		result = "proxy"
	}
	return result
}

// insertApacheBlock inserts lines between start/end markers in an Apache VirtualHost config.
// Inserts after the last ErrorDocument directive or before </VirtualHost>.
func (s *SiteService) insertApacheBlock(confPath, startMarker, endMarker string, blockLines []string) error {
	content, err := os.ReadFile(confPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read vhost config")
	}

	text := string(content)

	if strings.Contains(text, startMarker) {
		return s.replaceApacheBlock(confPath, startMarker, endMarker, blockLines)
	}

	lines := vhostLines(text)
	var newLines []string
	inserted := false
	for i, line := range lines {
		newLines = append(newLines, line)
		if !inserted {
			trimmed := strings.TrimSpace(line)
			// Insert before </VirtualHost> closing tag (first occurrence that has content after)
			nextIdx := i + 1
			if nextIdx < len(lines) && strings.TrimSpace(lines[nextIdx]) == "</VirtualHost>" {
				newLines = append(newLines, "    "+startMarker)
				for _, bl := range blockLines {
					newLines = append(newLines, "    "+bl)
				}
				newLines = append(newLines, "    "+endMarker)
				inserted = true
			}
			// Also try inserting after CustomConfig or ErrorDocument
			if !inserted && (strings.HasPrefix(trimmed, "ErrorDocument 502") || strings.Contains(trimmed, "# Custom configuration")) {
				newLines = append(newLines, "    "+startMarker)
				for _, bl := range blockLines {
					newLines = append(newLines, "    "+bl)
				}
				newLines = append(newLines, "    "+endMarker)
				inserted = true
			}
		}
	}

	// Fallback: if not inserted, append before last </VirtualHost>
	if !inserted {
		var finalLines []string
		done := false
		for i := len(newLines) - 1; i >= 0; i-- {
			if !done && strings.TrimSpace(newLines[i]) == "</VirtualHost>" {
				finalLines = append([]string{
					"    " + startMarker,
				}, finalLines...)
				for j := len(blockLines) - 1; j >= 0; j-- {
					finalLines = append([]string{"    " + blockLines[j]}, finalLines...)
				}
				finalLines = append([]string{"    " + endMarker}, finalLines...)
				done = true
			}
			finalLines = append([]string{newLines[i]}, finalLines...)
		}
		if done {
			newLines = finalLines
		}
	}

	return os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644)
}

// replaceApacheBlock replaces content between start/end markers in Apache config.
func (s *SiteService) replaceApacheBlock(confPath, startMarker, endMarker string, blockLines []string) error {
	content, err := os.ReadFile(confPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read vhost config")
	}

	lines := vhostLines(string(content))
	var newLines []string
	inBlock := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == startMarker {
			inBlock = true
			newLines = append(newLines, line)
			for _, bl := range blockLines {
				newLines = append(newLines, "    "+bl)
			}
			continue
		}
		if trimmed == endMarker {
			inBlock = false
			newLines = append(newLines, line)
			continue
		}
		if inBlock {
			continue
		}
		newLines = append(newLines, line)
	}

	return os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644)
}

// removeApacheBlock removes everything between (and including) the start/end markers in Apache config.
func (s *SiteService) removeApacheBlock(confPath, startMarker, endMarker string) error {
	return s.removeNginxBlock(confPath, startMarker, endMarker)
}

// insertOLSBlock inserts lines between start/end markers in an OLS vhost config.
// Inserts before the "rewrite {" global block or at end of file.
func (s *SiteService) insertOLSBlock(confPath, startMarker, endMarker string, blockLines []string) error {
	content, err := os.ReadFile(confPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read vhost config")
	}

	text := string(content)

	if strings.Contains(text, startMarker) {
		return s.replaceOLSBlock(confPath, startMarker, endMarker, blockLines)
	}

	lines := vhostLines(text)
	var newLines []string
	inserted := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		// Insert before the global "rewrite {" block (not inside a context)
		if !inserted && trimmed == "rewrite  {" {
			newLines = append(newLines, startMarker)
			for _, bl := range blockLines {
				newLines = append(newLines, bl)
			}
			newLines = append(newLines, endMarker)
			newLines = append(newLines, "")
			inserted = true
		}
		newLines = append(newLines, line)
	}

	if !inserted {
		newLines = append(newLines, startMarker)
		for _, bl := range blockLines {
			newLines = append(newLines, bl)
		}
		newLines = append(newLines, endMarker)
	}

	return os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644)
}

// replaceOLSBlock replaces content between start/end markers in OLS config.
func (s *SiteService) replaceOLSBlock(confPath, startMarker, endMarker string, blockLines []string) error {
	content, err := os.ReadFile(confPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read vhost config")
	}

	lines := vhostLines(string(content))
	var newLines []string
	inBlock := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == startMarker {
			inBlock = true
			newLines = append(newLines, line)
			for _, bl := range blockLines {
				newLines = append(newLines, bl)
			}
			continue
		}
		if trimmed == endMarker {
			inBlock = false
			newLines = append(newLines, line)
			continue
		}
		if inBlock {
			continue
		}
		newLines = append(newLines, line)
	}

	return os.WriteFile(confPath, []byte(vhostJoin(newLines)), 0644)
}

// removeOLSBlock removes everything between (and including) the start/end markers in OLS config.
func (s *SiteService) removeOLSBlock(confPath, startMarker, endMarker string) error {
	return s.removeNginxBlock(confPath, startMarker, endMarker)
}

// ---------------------------------------------------------------------------
// Redirect Rules
// ---------------------------------------------------------------------------

// RedirectRule represents a redirect rule for a site.
type RedirectRule struct {
	Enabled   bool   `json:"enabled"`
	Name      string `json:"name"`
	Type      string `json:"type"`       // "domain" or "path"
	Source    string `json:"source"`     // domain name or path
	TargetURL string `json:"target_url"`
	Mode      int    `json:"mode"`       // 301 or 302
	KeepURI   bool   `json:"keep_uri"`   // keep URI parameters
}

func redirectRulesPath(siteID int64) string {
	return filepath.Join(siteConfigDir(), fmt.Sprintf("%d_redirect.json", siteID))
}

// GetRedirectRules returns all redirect rules for a site.
func (s *SiteService) GetRedirectRules(id int64) ([]RedirectRule, error) {
	_, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	var rules []RedirectRule
	if err := readJSONFile(redirectRulesPath(id), &rules); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read redirect rules")
	}
	if rules == nil {
		rules = []RedirectRule{}
	}
	return rules, nil
}

// AddRedirectRule adds a redirect rule for a site.
func (s *SiteService) AddRedirectRule(id int64, rule RedirectRule) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if rule.Name == "" || rule.Type == "" || rule.Source == "" || rule.TargetURL == "" {
		return apperrors.New(apperrors.ErrValidation, "name, type, source, and target_url are required")
	}

	if rule.Mode != 301 && rule.Mode != 302 {
		return apperrors.New(apperrors.ErrValidation, "mode must be 301 or 302")
	}

	// Security: validate inputs before writing to nginx config
	if !validateURL(rule.TargetURL) {
		return apperrors.New(apperrors.ErrValidation, "target_url must be a valid http:// or https:// URL")
	}
	if rule.Type == "path" && !validateNginxPath(rule.Source) {
		return apperrors.New(apperrors.ErrValidation, "source path contains invalid characters")
	}
	if rule.Type == "domain" && !validDomainRe.MatchString(rule.Source) {
		return apperrors.New(apperrors.ErrValidation, "source domain contains invalid characters")
	}

	var rules []RedirectRule
	_ = readJSONFile(redirectRulesPath(id), &rules)

	// Check for duplicate name
	for _, r := range rules {
		if r.Name == rule.Name {
			return apperrors.New(apperrors.ErrValidation, "rule with this name already exists")
		}
	}

	rules = append(rules, rule)

	if err := writeJSONFile(redirectRulesPath(id), rules); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save redirect rules")
	}

	if err := s.rebuildRedirectNginx(site, rules); err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)
	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Str("name", rule.Name).Str("type", rule.Type).Msg("redirect rule added")
	return nil
}

// UpdateRedirectRule updates a redirect rule at the given index.
func (s *SiteService) UpdateRedirectRule(id int64, index int, rule RedirectRule) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	var rules []RedirectRule
	_ = readJSONFile(redirectRulesPath(id), &rules)

	if index < 0 || index >= len(rules) {
		return apperrors.New(apperrors.ErrValidation, "invalid rule index")
	}

	rules[index] = rule

	if err := writeJSONFile(redirectRulesPath(id), rules); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save redirect rules")
	}

	if err := s.rebuildRedirectNginx(site, rules); err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)
	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Int("index", index).Msg("redirect rule updated")
	return nil
}

// RemoveRedirectRule removes a redirect rule by index.
func (s *SiteService) RemoveRedirectRule(id int64, index int) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	var rules []RedirectRule
	_ = readJSONFile(redirectRulesPath(id), &rules)

	if index < 0 || index >= len(rules) {
		return apperrors.New(apperrors.ErrValidation, "invalid rule index")
	}

	removed := rules[index]
	rules = append(rules[:index], rules[index+1:]...)

	if err := writeJSONFile(redirectRulesPath(id), rules); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save redirect rules")
	}

	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	if len(rules) == 0 {
		if err := s.removeNginxBlock(confPath, "#REDIRECT_RULES_START", "#REDIRECT_RULES_END"); err != nil {
			return err
		}
	} else {
		if err := s.rebuildRedirectNginx(site, rules); err != nil {
			return err
		}
	}

	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Str("name", removed.Name).Msg("redirect rule removed")
	return nil
}

func (s *SiteService) rebuildRedirectNginx(site *Site, rules []RedirectRule) error {
	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	// Filter only enabled rules
	var enabledRules []RedirectRule
	for _, r := range rules {
		if r.Enabled {
			enabledRules = append(enabledRules, r)
		}
	}

	if len(enabledRules) == 0 {
		return s.removeNginxBlock(confPath, "#REDIRECT_RULES_START", "#REDIRECT_RULES_END")
	}

	var blockLines []string
	for _, r := range enabledRules {
		// Validate redirect mode — only 301 or 302 allowed
		if r.Mode != 301 && r.Mode != 302 {
			logger.Warn().Int("mode", r.Mode).Msg("skipping redirect rule with invalid mode")
			continue
		}
		if !validateURL(r.TargetURL) {
			logger.Warn().Str("target_url", r.TargetURL).Msg("skipping redirect rule with invalid target URL")
			continue
		}

		switch r.Type {
		case "domain":
			if !validDomainRe.MatchString(r.Source) {
				logger.Warn().Str("source", r.Source).Msg("skipping redirect rule with invalid domain source")
				continue
			}
			// Domain redirect: if the request host matches, redirect
			if r.KeepURI {
				blockLines = append(blockLines,
					fmt.Sprintf("if ($host = %s) {", r.Source),
					fmt.Sprintf("    return %d %s$request_uri;", r.Mode, strings.TrimRight(sanitizeNginxValue(r.TargetURL), "/")),
					"}",
				)
			} else {
				blockLines = append(blockLines,
					fmt.Sprintf("if ($host = %s) {", r.Source),
					fmt.Sprintf("    return %d %s;", r.Mode, sanitizeNginxValue(r.TargetURL)),
					"}",
				)
			}
		case "path":
			if !validateNginxPath(r.Source) {
				logger.Warn().Str("source", r.Source).Msg("skipping redirect rule with invalid path source")
				continue
			}
			// Path redirect
			if r.KeepURI {
				blockLines = append(blockLines,
					fmt.Sprintf("location ^~ %s {", r.Source),
					fmt.Sprintf("    return %d %s$request_uri;", r.Mode, strings.TrimRight(sanitizeNginxValue(r.TargetURL), "/")),
					"}",
				)
			} else {
				blockLines = append(blockLines,
					fmt.Sprintf("location ^~ %s {", r.Source),
					fmt.Sprintf("    return %d %s;", r.Mode, sanitizeNginxValue(r.TargetURL)),
					"}",
				)
			}
		}
	}

	return s.insertNginxBlock(confPath, "#REDIRECT_RULES_START", "#REDIRECT_RULES_END", blockLines)
}

// ---------------------------------------------------------------------------
// Hotlink Protection
// ---------------------------------------------------------------------------

func hotlinkConfigPath(siteID int64) string {
	return filepath.Join(siteConfigDir(), fmt.Sprintf("%d_hotlink.json", siteID))
}

type HotlinkConfig struct {
	Enabled        bool     `json:"enabled"`
	AllowEmpty     bool     `json:"allow_empty"`
	URLSuffix      string   `json:"url_suffix"`
	AllowedDomains []string `json:"allowed_domains"`
	Response       string   `json:"response"`
}

func (s *SiteService) GetHotlinkConfig(id int64) (*HotlinkConfig, error) {
	var config HotlinkConfig
	if err := readJSONFile(hotlinkConfigPath(id), &config); err != nil {
		if os.IsNotExist(err) {
			return &HotlinkConfig{
				Enabled:        false,
				AllowEmpty:     true,
				URLSuffix:      "jpg|jpeg|png|gif|bmp|webp|svg",
				AllowedDomains: []string{},
				Response:       "403",
			}, nil
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read hotlink config")
	}
	return &config, nil
}

func (s *SiteService) SetHotlinkConfig(id int64, config HotlinkConfig) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if err := writeJSONFile(hotlinkConfigPath(id), config); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save hotlink config")
	}

	if err := s.buildHotlinkNginx(site, config); err != nil {
		return err
	}

	logger.Info().Int64("id", id).Bool("enabled", config.Enabled).Msg("hotlink protection updated")
	return nil
}

func (s *SiteService) buildHotlinkNginx(site *Site, config HotlinkConfig) error {
	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	if !config.Enabled {
		_ = s.removeNginxBlock(confPath, "#HOTLINK_PROTECTION_START", "#HOTLINK_PROTECTION_END")
		return gen.ReloadServer()
	}

	suffix := config.URLSuffix
	if suffix == "" {
		suffix = "jpg|jpeg|png|gif|bmp|webp|svg"
	}
	suffix = validSuffixCharRe.ReplaceAllString(suffix, "")

	var referers []string
	if config.AllowEmpty {
		referers = append(referers, "none", "blocked")
	}
	seen := make(map[string]bool)
	addReferer := func(r string) {
		r = strings.TrimSpace(r)
		r = validRefererCharRe.ReplaceAllString(r, "")
		if r != "" && !seen[r] {
			seen[r] = true
			referers = append(referers, r)
		}
	}
	addReferer(site.Domain)
	addReferer("*." + site.Domain)
	for _, d := range config.AllowedDomains {
		addReferer(d)
	}

	var blockLines []string
	blockLines = append(blockLines, fmt.Sprintf("location ~* \\.(%s)$ {", suffix))
	blockLines = append(blockLines, fmt.Sprintf("    valid_referers %s;", strings.Join(referers, " ")))
	blockLines = append(blockLines, "    if ($invalid_referer) {")

	resp := strings.TrimSpace(config.Response)
	if resp == "" || resp == "403" {
		blockLines = append(blockLines, "        return 403;")
	} else if resp == "404" {
		blockLines = append(blockLines, "        return 404;")
	} else {
		if !validateURL(resp) {
			logger.Warn().Str("response", resp).Msg("invalid hotlink response URL, falling back to 403")
			blockLines = append(blockLines, "        return 403;")
		} else {
			blockLines = append(blockLines, fmt.Sprintf("        return 301 %s;", sanitizeNginxValue(resp)))
		}
	}

	blockLines = append(blockLines, "    }")
	blockLines = append(blockLines, "}")

	if err := s.insertNginxBlock(confPath, "#HOTLINK_PROTECTION_START", "#HOTLINK_PROTECTION_END", blockLines); err != nil {
		return err
	}

	return gen.ReloadServer()
}

// ---------------------------------------------------------------------------
// Maintenance Mode
// ---------------------------------------------------------------------------

func maintenanceConfigPath(siteID int64) string {
	return filepath.Join(siteConfigDir(), fmt.Sprintf("%d_maintenance.json", siteID))
}

func maintenancePageDir() string {
	return filepath.Join(installer.ServerBaseDir, "config", "maintenance")
}

type MaintenanceConfig struct {
	Enabled    bool   `json:"enabled"`
	Template   string `json:"template"`
	CustomHTML string `json:"custom_html,omitempty"`
}

var maintenanceTemplates = map[string]string{
	"default": `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maintenance - {{.Domain}}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e2e8f0}
.container{text-align:center;padding:40px;max-width:500px}
.icon{font-size:64px;margin-bottom:24px}
h1{font-size:28px;margin-bottom:12px;color:#f8fafc}
p{font-size:16px;line-height:1.6;color:#94a3b8;margin-bottom:8px}
.domain{color:#38bdf8;font-weight:600}
</style>
</head>
<body>
<div class="container">
<div class="icon">🔧</div>
<h1>Under Maintenance</h1>
<p>We're currently performing scheduled maintenance on <span class="domain">{{.Domain}}</span>.</p>
<p>We'll be back shortly. Thank you for your patience.</p>
</div>
</body>
</html>`,

	"minimal": `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maintenance</title>
<style>
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff;font-family:Georgia,serif;color:#111}
.c{text-align:center;padding:40px}
h1{font-size:22px;font-weight:400;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px}
hr{width:40px;border:none;border-top:2px solid #111;margin:0 auto 16px}
p{font-size:14px;color:#666;line-height:1.8}
</style>
</head>
<body>
<div class="c">
<h1>Maintenance</h1>
<hr>
<p>{{.Domain}} is currently undergoing maintenance.<br>Please check back soon.</p>
</div>
</body>
</html>`,

	"colorful": `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>We'll Be Right Back!</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.card{background:rgba(255,255,255,0.95);border-radius:20px;padding:48px;max-width:480px;text-align:center;box-shadow:0 25px 50px rgba(0,0,0,0.15)}
.emoji{font-size:56px;margin-bottom:20px}
h1{font-size:24px;color:#1a1a2e;margin-bottom:12px}
p{color:#666;font-size:15px;line-height:1.7;margin-bottom:8px}
.badge{display:inline-block;padding:6px 16px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:20px;font-size:12px;font-weight:600;margin-top:16px}
</style>
</head>
<body>
<div class="card">
<div class="emoji">🚀</div>
<h1>We'll Be Right Back!</h1>
<p>{{.Domain}} is getting some upgrades.</p>
<p>We're working hard to improve your experience.</p>
<div class="badge">Maintenance in Progress</div>
</div>
</body>
</html>`,

	"construction": `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Under Construction</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a1a2e;font-family:'Courier New',monospace;color:#eee}
.wrap{text-align:center;padding:40px;max-width:520px}
.bars{font-size:48px;letter-spacing:4px;margin-bottom:24px}
h1{font-size:20px;text-transform:uppercase;letter-spacing:6px;margin-bottom:16px;color:#e94560}
p{font-size:14px;color:#888;line-height:1.8;margin-bottom:8px}
.progress{width:200px;height:4px;background:#333;border-radius:2px;margin:20px auto;overflow:hidden}
.progress-bar{height:100%;width:60%;background:linear-gradient(90deg,#e94560,#0f3460);border-radius:2px;animation:loading 2s ease-in-out infinite}
@keyframes loading{0%{width:20%}50%{width:80%}100%{width:20%}}
</style>
</head>
<body>
<div class="wrap">
<div class="bars">⚠ 🏗 ⚠</div>
<h1>Under Construction</h1>
<p>{{.Domain}} is being rebuilt.</p>
<p>Exciting changes are coming soon!</p>
<div class="progress"><div class="progress-bar"></div></div>
</div>
</body>
</html>`,

	"countdown": `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maintenance Mode</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff}
.c{text-align:center;padding:40px;max-width:480px}
.icon{width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#f093fb,#f5576c);display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 24px}
h1{font-size:26px;margin-bottom:12px}
p{color:#888;font-size:14px;line-height:1.7;margin-bottom:20px}
.status{display:inline-flex;align-items:center;gap:8px;padding:8px 20px;border:1px solid #333;border-radius:24px;font-size:13px;color:#aaa}
.dot{width:8px;height:8px;border-radius:50%;background:#f5576c;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
</style>
</head>
<body>
<div class="c">
<div class="icon">⏱</div>
<h1>Scheduled Maintenance</h1>
<p>{{.Domain}} is currently offline for scheduled maintenance. We expect to be back online shortly.</p>
<div class="status"><span class="dot"></span> Maintenance in progress</div>
</div>
</body>
</html>`,
}

func (s *SiteService) GetMaintenanceConfig(id int64) (*MaintenanceConfig, error) {
	var config MaintenanceConfig
	if err := readJSONFile(maintenanceConfigPath(id), &config); err != nil {
		if os.IsNotExist(err) {
			return &MaintenanceConfig{
				Enabled:  false,
				Template: "default",
			}, nil
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read maintenance config")
	}
	return &config, nil
}

func (s *SiteService) SetMaintenanceConfig(id int64, config MaintenanceConfig) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if err := writeJSONFile(maintenanceConfigPath(id), config); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save maintenance config")
	}

	if err := s.generateMaintenancePage(id, config, site.Domain); err != nil {
		return err
	}

	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	// First, remove all existing maintenance blocks
	_ = s.removeAllNginxBlocks(confPath, "#MAINTENANCE_MODE_START", "#MAINTENANCE_MODE_END")

	if config.Enabled {
		pagePath := filepath.Join(maintenancePageDir(), fmt.Sprintf("%d_maintenance.html", id))
		var blockLines []string
		blockLines = append(blockLines, fmt.Sprintf("error_page 503 /maintenance_%d.html;", id))
		blockLines = append(blockLines, fmt.Sprintf("location = /maintenance_%d.html {", id))
		blockLines = append(blockLines, fmt.Sprintf("    alias %s;", pagePath))
		blockLines = append(blockLines, "    internal;")
		blockLines = append(blockLines, "}")
		blockLines = append(blockLines, "if ($uri !~ ^/maintenance_) {")
		blockLines = append(blockLines, "    return 503;")
		blockLines = append(blockLines, "}")

		// Insert into ALL server blocks (both HTTP and HTTPS)
		if err := s.insertNginxBlockAll(confPath, "#MAINTENANCE_MODE_START", "#MAINTENANCE_MODE_END", blockLines); err != nil {
			return err
		}
	}

	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Bool("enabled", config.Enabled).Str("template", config.Template).Msg("maintenance mode updated")
	return nil
}

func (s *SiteService) GetMaintenanceTemplates() []string {
	templates := make([]string, 0, len(maintenanceTemplates))
	for k := range maintenanceTemplates {
		templates = append(templates, k)
	}
	templates = append(templates, "custom")
	return templates
}

func (s *SiteService) generateMaintenancePage(siteID int64, config MaintenanceConfig, domain string) error {
	dir := maintenancePageDir()
	_ = os.MkdirAll(dir, 0755)

	pagePath := filepath.Join(dir, fmt.Sprintf("%d_maintenance.html", siteID))

	if config.Template == "custom" && config.CustomHTML != "" {
		return os.WriteFile(pagePath, []byte(config.CustomHTML), 0644)
	}

	tmplStr, ok := maintenanceTemplates[config.Template]
	if !ok {
		tmplStr = maintenanceTemplates["default"]
	}

	tmpl, err := template.New("maintenance").Parse(tmplStr)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to parse maintenance template")
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, map[string]string{"Domain": domain}); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to execute maintenance template")
	}

	return os.WriteFile(pagePath, buf.Bytes(), 0644)
}

// SetDiskQuota sets the disk quota for a site (0 = unlimited).
func (s *SiteService) SetDiskQuota(id int64, quotaBytes int64) error {
	_, err := s.db.Exec("UPDATE sites SET disk_quota = ? WHERE id = ?", quotaBytes, id)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to set disk quota")
	}
	return nil
}

// GetDiskUsage calculates the actual disk usage of a site and caches it.
func (s *SiteService) GetDiskUsage(id int64) (int64, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return 0, err
	}

	ctx := context.Background()
	result, err := system.Exec(ctx, "du", "-sb", site.Path)
	if err != nil {
		return 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get disk usage")
	}

	var size int64
	fmt.Sscanf(strings.TrimSpace(result.Stdout), "%d", &size)

	_, _ = s.db.Exec("UPDATE sites SET disk_usage = ? WHERE id = ?", size, id)

	return size, nil
}

// ---------------------------------------------------------------------------
// URL Rewrite templates & management
// ---------------------------------------------------------------------------

// rewriteDir returns the directory for webserver rewrite include files.
func rewriteDir() string {
	return filepath.Join(installer.ServerBaseDir, "config", "rewrite")
}

// RewriteFilePath returns the path to the rewrite include file for a domain.
func RewriteFilePath(webserver, domain string) string {
	switch webserver {
	case "apache":
		return filepath.Join(rewriteDir(), domain+".htaccess")
	case "openlitespeed":
		return filepath.Join(rewriteDir(), domain+".htaccess")
	default:
		return filepath.Join(rewriteDir(), domain+".conf")
	}
}

// GetURLRewrite returns the current rewrite content for a site.
func (s *SiteService) GetURLRewrite(id int64) (string, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return "", err
	}

	fp := RewriteFilePath(site.Webserver, site.Domain)
	data, readErr := os.ReadFile(fp)
	if readErr != nil {
		if os.IsNotExist(readErr) {
			return "", nil
		}
		return "", apperrors.Wrap(readErr, apperrors.ErrInternal, "failed to read rewrite file")
	}
	return string(data), nil
}

// SetURLRewrite writes the rewrite content for a site and reloads the webserver.
func (s *SiteService) SetURLRewrite(id int64, content string) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	dir := rewriteDir()
	if mkErr := os.MkdirAll(dir, 0755); mkErr != nil {
		return apperrors.Wrap(mkErr, apperrors.ErrInternal, "failed to create rewrite directory")
	}

	fp := RewriteFilePath(site.Webserver, site.Domain)
	if writeErr := os.WriteFile(fp, []byte(content), 0644); writeErr != nil {
		return apperrors.Wrap(writeErr, apperrors.ErrInternal, "failed to write rewrite file")
	}

	// For Apache/OLS, also write .htaccess into the site docroot
	if site.Webserver == "apache" || site.Webserver == "openlitespeed" {
		htaccessPath := filepath.Join(site.Path, ".htaccess")
		_ = os.WriteFile(htaccessPath, []byte(content), 0644)
	}

	gen := generatorFor(site.Webserver)
	if testErr := gen.TestConfig(); testErr != nil {
		return apperrors.Wrap(testErr, apperrors.ErrInternal, "rewrite rules have config errors")
	}
	return gen.ReloadServer()
}

// ListRewriteTemplates returns all available rewrite template names.
func (s *SiteService) ListRewriteTemplates(webserver string) []string {
	var templates map[string]string
	switch webserver {
	case "apache", "openlitespeed":
		templates = apacheRewriteTemplates
	default:
		templates = nginxRewriteTemplates
	}

	names := make([]string, 0, len(templates))
	for k := range templates {
		names = append(names, k)
	}
	// Sort for consistent output
	for i := 0; i < len(names); i++ {
		for j := i + 1; j < len(names); j++ {
			if names[i] > names[j] {
				names[i], names[j] = names[j], names[i]
			}
		}
	}
	return names
}

// GetRewriteTemplate returns the content of a specific rewrite template.
func (s *SiteService) GetRewriteTemplate(webserver, name string) (string, error) {
	var templates map[string]string
	switch webserver {
	case "apache", "openlitespeed":
		templates = apacheRewriteTemplates
	default:
		templates = nginxRewriteTemplates
	}

	content, ok := templates[name]
	if !ok {
		return "", apperrors.New(apperrors.ErrNotFound, "rewrite template not found: "+name)
	}
	return content, nil
}

// ---------------------------------------------------------------------------
// Nginx rewrite templates
// ---------------------------------------------------------------------------

var nginxRewriteTemplates = map[string]string{
	"wordpress": `# WordPress Rewrite Rules
location / {
    try_files $uri $uri/ /index.php?$args;
}

# Block PHP execution in uploads
location ~* /wp-content/uploads/.*\.php$ {
    deny all;
}

# Block access to xmlrpc.php
location = /xmlrpc.php {
    deny all;
}
`,
	"laravel": `# Laravel Rewrite Rules
location / {
    try_files $uri $uri/ /index.php?$query_string;
}
`,
	"thinkphp": `# ThinkPHP Rewrite Rules
location / {
    if (!-e $request_filename) {
        rewrite ^(.*)$ /index.php?s=$1 last;
        break;
    }
}
`,
	"codeigniter": `# CodeIgniter Rewrite Rules
location / {
    try_files $uri $uri/ /index.php?$uri&$args;
}
`,
	"drupal": `# Drupal Rewrite Rules
location / {
    try_files $uri /index.php?$query_string;
}

location @rewrite {
    rewrite ^/(.*)$ /index.php?q=$1;
}

location ~ \..*/.*\.php$ {
    return 403;
}
`,
	"joomla": `# Joomla Rewrite Rules
location / {
    try_files $uri $uri/ /index.php?$args;
}
`,
	"typecho": `# Typecho Rewrite Rules
location / {
    if (!-e $request_filename) {
        rewrite ^(.*)$ /index.php$1 last;
    }
}
`,
	"discuz": `# Discuz Rewrite Rules
rewrite ^([^\.]*)/topic-(.+)\.html$ $1/portal.php?mod=topic&topic=$2 last;
rewrite ^([^\.]*)/article-([0-9]+)-([0-9]+)\.html$ $1/portal.php?mod=view&aid=$2&page=$3 last;
rewrite ^([^\.]*)/forum-(\w+)-([0-9]+)\.html$ $1/forum.php?mod=forumdisplay&fid=$2&page=$3 last;
rewrite ^([^\.]*)/thread-([0-9]+)-([0-9]+)-([0-9]+)\.html$ $1/forum.php?mod=viewthread&tid=$2&extra=page%3D$4&page=$3 last;
rewrite ^([^\.]*)/group-([0-9]+)-([0-9]+)\.html$ $1/forum.php?mod=group&fid=$2&page=$3 last;
rewrite ^([^\.]*)/space-(username|uid)-(.+)\.html$ $1/home.php?mod=space&$2=$3 last;
rewrite ^([^\.]*)/blog-([0-9]+)-([0-9]+)\.html$ $1/home.php?mod=space&uid=$2&do=blog&id=$3 last;
rewrite ^([^\.]*)/(fid|tid)-([0-9]+)\.html$ $1/archiver/index.php?action=$2&value=$3 last;
if (!-e $request_filename) {
    return 404;
}
`,
	"zblog": `# Z-Blog Rewrite Rules
location / {
    try_files $uri $uri/ /index.php?$args;
}

rewrite ^(.*)/post/(.*)$ $1/zb_system/cmd.php?act=page&id=$2 last;
rewrite ^(.*)/category/(.*)$ $1/zb_system/cmd.php?act=category&id=$2 last;
rewrite ^(.*)/auth/(.*)$ $1/zb_system/cmd.php?act=author&id=$2 last;
rewrite ^(.*)/tags/(.*)$ $1/zb_system/cmd.php?act=tags&id=$2 last;
rewrite ^(.*)/date/(.*)/(.*)$ $1/zb_system/cmd.php?act=date&y=$2&m=$3 last;
`,
	"shopwind": `# Shopwind Rewrite Rules
location / {
    try_files $uri $uri/ /index.php?$query_string;
}
`,
	"crmeb": `# CRMEB Rewrite Rules
location / {
    try_files $uri $uri/ /index.php?$query_string;
}

location /adminapi {
    try_files $uri $uri/ /index.php?$query_string;
}

location /api {
    try_files $uri $uri/ /index.php?$query_string;
}
`,
	"edusoho": `# EduSoho Rewrite Rules
location / {
    try_files $uri /app.php$is_args$args;
}

location ~ ^/(app|app_dev)\.php(/|$) {
    fastcgi_split_path_info ^(.+\.php)(/.*)$;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_param HTTPS off;
}
`,
	"empirecms": `# EmpireCMS Rewrite Rules
rewrite ^(.*)/listinfo-(.+)-(.+)\.html$ $1/e/action/ListInfo/index.php?classid=$2&page=$3 last;
rewrite ^(.*)/showinfo-(.+)-(.+)-(.+)\.html$ $1/e/action/ShowInfo.php?classid=$2&id=$3&page=$4 last;
rewrite ^(.*)/tags-(.+)-(.+)\.html$ $1/e/tags/index.php?tagname=$2&page=$3 last;
rewrite ^(.*)/infotags-(.+)-(.+)\.html$ $1/e/tags/index.php?tagid=$2&page=$3 last;
`,
	"dabr": `# dabr Rewrite Rules
location / {
    try_files $uri $uri/ /index.php?$query_string;
}
`,
	"dbshop": `# DBShop Rewrite Rules
location / {
    try_files $uri $uri/ /index.php?$query_string;
}
`,
	"phpcms": `# PHPCMS Rewrite Rules
rewrite ^(.*)show-([0-9]+)-([0-9]+)-([0-9]+)\.html$ $1/index.php?m=content&c=index&a=show&catid=$2&id=$3&page=$4;
rewrite ^(.*)list-([0-9]+)-([0-9]+)\.html$ $1/index.php?m=content&c=index&a=lists&catid=$2&page=$3;
`,
	"dedecms": `# DedeCMS Rewrite Rules
rewrite ^/plus/view-([0-9]+)-1\.html$ /plus/view.php?aid=$1 last;
rewrite ^/plus/list-([0-9]+)-([0-9]+)-([0-9]+)\.html$ /plus/list.php?tid=$1&totalresult=$2&PageNo=$3 last;
`,
	"ecshop": `# ECShop Rewrite Rules
rewrite "^/index\.html$" /index.php last;
rewrite "^/category$" /index.php last;
rewrite "^/feed-c([0-9]+)\.xml$" /feed.php?cat=$1 last;
rewrite "^/feed-b([0-9]+)\.xml$" /feed.php?brand=$1 last;
rewrite "^/feed\.xml$" /feed.php last;
rewrite "^/category-([0-9]+)-b([0-9]+)-min([0-9]+)-max([0-9]+)-attr([^/]*)-([0-9]+)-(.+)-([a-zA-Z]+)(.*)\.html$" /category.php?id=$1&brand=$2&price_min=$3&price_max=$4&filter_attr=$5&page=$6&sort=$7&order=$8 last;
rewrite "^/category-([0-9]+)-b([0-9]+)-min([0-9]+)-max([0-9]+)-attr([^/]*)(.*)\.html$" /category.php?id=$1&brand=$2&price_min=$3&price_max=$4&filter_attr=$5 last;
rewrite "^/category-([0-9]+)-b([0-9]+)-([0-9]+)-(.+)-([a-zA-Z]+)(.*)\.html$" /category.php?id=$1&brand=$2&page=$3&sort=$4&order=$5 last;
rewrite "^/category-([0-9]+)-b([0-9]+)-([0-9]+)(.*)\.html$" /category.php?id=$1&brand=$2&page=$3 last;
rewrite "^/category-([0-9]+)-b([0-9]+)(.*)\.html$" /category.php?id=$1&brand=$2 last;
rewrite "^/category-([0-9]+)(.*)\.html$" /category.php?id=$1 last;
rewrite "^/goods-([0-9]+)(.*)\.html" /goods.php?id=$1 last;
rewrite "^/article_cat-([0-9]+)-([0-9]+)-(.+)-([a-zA-Z]+)(.*)\.html$" /article_cat.php?id=$1&page=$2&sort=$3&order=$4 last;
rewrite "^/article_cat-([0-9]+)-([0-9]+)(.*)\.html$" /article_cat.php?id=$1&page=$2 last;
rewrite "^/article_cat-([0-9]+)(.*)\.html$" /article_cat.php?id=$1 last;
rewrite "^/article-([0-9]+)(.*)\.html$" /article.php?id=$1 last;
rewrite "^/brand-([0-9]+)-c([0-9]+)-([0-9]+)-(.+)-([a-zA-Z]+)\.html" /brand.php?id=$1&cat=$2&page=$3&sort=$4&order=$5 last;
rewrite "^/brand-([0-9]+)-c([0-9]+)-([0-9]+)(.*)\.html" /brand.php?id=$1&cat=$2&page=$3 last;
rewrite "^/brand-([0-9]+)-c([0-9]+)(.*)\.html" /brand.php?id=$1&cat=$2 last;
rewrite "^/brand-([0-9]+)(.*)\.html" /brand.php?id=$1 last;
rewrite "^/tag-(.*)\.html" /search.php?keywords=$1 last;
rewrite "^/snatch-([0-9]+)\.html$" /snatch.php?id=$1 last;
rewrite "^/group_buy-([0-9]+)\.html$" /group_buy.php?act=view&id=$1 last;
rewrite "^/auction-([0-9]+)\.html$" /auction.php?act=view&id=$1 last;
rewrite "^/exchange-id([0-9]+)(.*)\.html$" /exchange.php?id=$1&act=view last;
rewrite "^/exchange-([0-9]+)-min([0-9]+)-max([0-9]+)-([0-9]+)-(.+)-([a-zA-Z]+)(.*)\.html$" /exchange.php?cat_id=$1&integral_min=$2&integral_max=$3&page=$4&sort=$5&order=$6 last;
rewrite "^/exchange-([0-9]+)-([0-9]+)-(.+)-([a-zA-Z]+)(.*)\.html$" /exchange.php?cat_id=$1&page=$2&sort=$3&order=$4 last;
rewrite "^/exchange-([0-9]+)-([0-9]+)(.*)\.html$" /exchange.php?cat_id=$1&page=$2 last;
rewrite "^/exchange-([0-9]+)(.*)\.html$" /exchange.php?cat_id=$1 last;
`,
	"symfony": `# Symfony Rewrite Rules
location / {
    try_files $uri /index.php$is_args$args;
}
`,
	"yii2": `# Yii2 Rewrite Rules
location / {
    try_files $uri $uri/ /index.php?$args;
}
`,
	"opencart": `# OpenCart Rewrite Rules
rewrite /admin$ /admin/index.php last;
rewrite ^/download/(.*) /index.php?route=error/not_found last;

location / {
    try_files $uri @opencart;
}

location @opencart {
    rewrite ^/(.+)$ /index.php?_route_=$1 last;
}
`,
	"prestashop": `# PrestaShop Rewrite Rules
rewrite ^/api/?(.*)$ /webservice/dispatcher.php?url=$1 last;
rewrite "^/([0-9])(\-[_a-zA-Z0-9-]*)?(-[0-9]+)?/.+\.jpg$" /img/p/$1/$1$2$3.jpg last;
rewrite "^/([0-9])([0-9])(\-[_a-zA-Z0-9-]*)?(-[0-9]+)?/.+\.jpg$" /img/p/$1/$2/$1$2$3$4.jpg last;
rewrite "^/([0-9])([0-9])([0-9])(\-[_a-zA-Z0-9-]*)?(-[0-9]+)?/.+\.jpg$" /img/p/$1/$2/$3/$1$2$3$4$5.jpg last;

location / {
    try_files $uri $uri/ /index.php?$args;
}
`,
	"maccms": `# MacCMS Rewrite Rules
if (!-e $request_filename) {
    rewrite ^/index.php(.*)$ /index.php?s=$1 last;
    rewrite ^(.*)$ /index.php?s=$1 last;
    break;
}
`,
	"niushop": `# NiuShop Rewrite Rules
location / {
    try_files $uri $uri/ /index.php?$query_string;
}
`,
	"emlog": `# Emlog Rewrite Rules
location / {
    try_files $uri $uri/ /index.php?$args;
}

rewrite ^/post-([0-9]+)\.html$ /index.php?post=$1 last;
rewrite ^/record/([0-9]+)/$ /index.php?record=$1 last;
rewrite ^/sort/(.+)$ /index.php?sort=$1 last;
rewrite ^/tag/(.+)$ /index.php?tag=$1 last;
rewrite ^/author/([0-9]+)$ /index.php?author=$1 last;
rewrite ^/date/([0-9]+)/([0-9]+)$ /index.php?date=$1-$2 last;
rewrite ^/page/([0-9]+)$ /index.php?page=$1 last;
`,
}

// ---------------------------------------------------------------------------
// Apache / OLS rewrite templates (using .htaccess format)
// ---------------------------------------------------------------------------

var apacheRewriteTemplates = map[string]string{
	"wordpress": `# WordPress Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>

# Block PHP in uploads
<IfModule mod_rewrite.c>
RewriteRule ^wp-content/uploads/.*\.php$ - [F]
</IfModule>
`,
	"laravel": `# Laravel Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ /index.php/$1 [L]
</IfModule>
`,
	"thinkphp": `# ThinkPHP Rewrite Rules
<IfModule mod_rewrite.c>
Options +FollowSymlinks -Multiviews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^(.*)$ index.php?s=/$1 [QSA,PT,L]
</IfModule>
`,
	"codeigniter": `# CodeIgniter Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ index.php?/$1 [L]
</IfModule>
`,
	"drupal": `# Drupal Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_URI} !=/favicon.ico
RewriteRule ^(.*)$ index.php?q=$1 [L,QSA]
</IfModule>
`,
	"joomla": `# Joomla Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteCond %{REQUEST_URI} !^/index\.php
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule .* index.php [L]
</IfModule>
`,
	"typecho": `# Typecho Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ /index.php/$1 [L]
</IfModule>
`,
	"discuz": `# Discuz Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{QUERY_STRING} ^(.*)$
RewriteRule ^topic-(.+)\.html$ portal.php?mod=topic&topic=$1
RewriteRule ^article-([0-9]+)-([0-9]+)\.html$ portal.php?mod=view&aid=$1&page=$2
RewriteRule ^forum-(\w+)-([0-9]+)\.html$ forum.php?mod=forumdisplay&fid=$1&page=$2
RewriteRule ^thread-([0-9]+)-([0-9]+)-([0-9]+)\.html$ forum.php?mod=viewthread&tid=$1&extra=page%%3D$3&page=$2
RewriteRule ^group-([0-9]+)-([0-9]+)\.html$ forum.php?mod=group&fid=$1&page=$2
RewriteRule ^space-(username|uid)-(.+)\.html$ home.php?mod=space&$1=$2
RewriteRule ^blog-([0-9]+)-([0-9]+)\.html$ home.php?mod=space&uid=$1&do=blog&id=$2
RewriteRule ^(fid|tid)-([0-9]+)\.html$ archiver/index.php?action=$1&value=$2
</IfModule>
`,
	"zblog": `# Z-Blog Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
`,
	"shopwind": `# Shopwind Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ /index.php?$1 [QSA,L]
</IfModule>
`,
	"crmeb": `# CRMEB Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ /index.php/$1 [L]
</IfModule>
`,
	"edusoho": `# EduSoho Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_URI}::$1 ^(/.+)/(.*)::\2$
RewriteRule ^(.*) - [E=BASE:%1]
RewriteCond %{ENV:REDIRECT_STATUS} ^$
RewriteRule ^app\.php(/(.*)|$) %{ENV:BASE}/$2 [R=301,L]
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule .? - [L]
RewriteRule .? %{ENV:BASE}/app.php [L]
</IfModule>
`,
	"empirecms": `# EmpireCMS Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^listinfo-(.+)-(.+)\.html$ /e/action/ListInfo/index.php?classid=$1&page=$2 [L]
RewriteRule ^showinfo-(.+)-(.+)-(.+)\.html$ /e/action/ShowInfo.php?classid=$1&id=$2&page=$3 [L]
RewriteRule ^tags-(.+)-(.+)\.html$ /e/tags/index.php?tagname=$1&page=$2 [L]
RewriteRule ^infotags-(.+)-(.+)\.html$ /e/tags/index.php?tagid=$1&page=$2 [L]
</IfModule>
`,
	"dabr": `# dabr Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ /index.php?$1 [QSA,L]
</IfModule>
`,
	"dbshop": `# DBShop Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^(.*)$ /index.php?$1 [QSA,L]
</IfModule>
`,
	"phpcms": `# PHPCMS Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^show-([0-9]+)-([0-9]+)-([0-9]+)\.html$ /index.php?m=content&c=index&a=show&catid=$1&id=$2&page=$3 [L]
RewriteRule ^list-([0-9]+)-([0-9]+)\.html$ /index.php?m=content&c=index&a=lists&catid=$1&page=$2 [L]
</IfModule>
`,
	"dedecms": `# DedeCMS Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^plus/view-([0-9]+)-1\.html$ /plus/view.php?aid=$1 [L]
RewriteRule ^plus/list-([0-9]+)-([0-9]+)-([0-9]+)\.html$ /plus/list.php?tid=$1&totalresult=$2&PageNo=$3 [L]
</IfModule>
`,
	"ecshop": `# ECShop Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ /index.php [L]
RewriteRule ^category$ /index.php [L]
RewriteRule ^feed-c([0-9]+)\.xml$ /feed.php?cat=$1 [L]
RewriteRule ^feed\.xml$ /feed.php [L]
RewriteRule ^category-([0-9]+)-b([0-9]+)(.*)\.html$ /category.php?id=$1&brand=$2 [L]
RewriteRule ^category-([0-9]+)(.*)\.html$ /category.php?id=$1 [L]
RewriteRule ^goods-([0-9]+)(.*)\.html$ /goods.php?id=$1 [L]
RewriteRule ^article_cat-([0-9]+)(.*)\.html$ /article_cat.php?id=$1 [L]
RewriteRule ^article-([0-9]+)(.*)\.html$ /article.php?id=$1 [L]
RewriteRule ^brand-([0-9]+)(.*)\.html$ /brand.php?id=$1 [L]
RewriteRule ^tag-(.*)\.html$ /search.php?keywords=$1 [L]
</IfModule>
`,
	"symfony": `# Symfony Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_URI}::$1 ^(/.+)/(.*)::\2$
RewriteRule ^(.*) - [E=BASE:%1]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule .? %{ENV:BASE}/index.php [L]
</IfModule>
`,
	"yii2": `# Yii2 Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
`,
	"opencart": `# OpenCart Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^sitemap.xml$ index.php?route=extension/feed/google_sitemap [L]
RewriteRule ^googlebase.xml$ index.php?route=extension/feed/google_base [L]
RewriteRule ^system/download/(.*) index.php?route=error/not_found [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_URI} !.*\.(ico|gif|jpg|jpeg|png|js|css)
RewriteRule ^([^?]*) index.php?_route_=$1 [L,QSA]
</IfModule>
`,
	"prestashop": `# PrestaShop Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^api$ api/ [L]
RewriteRule ^api/(.*)$ /webservice/dispatcher.php?url=$1 [QSA,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule . /index.php [L]
</IfModule>
`,
	"maccms": `# MacCMS Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^(.*)$ index.php?s=/$1 [QSA,PT,L]
</IfModule>
`,
	"niushop": `# NiuShop Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ /index.php?$1 [QSA,L]
</IfModule>
`,
	"emlog": `# Emlog Rewrite Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
`,
}
// ---------------------------------------------------------------------------

// ComposerStatus holds info about Composer availability for a site.
type ComposerStatus struct {
	Installed       bool   `json:"installed"`
	Version         string `json:"version"`
	HasComposerJSON bool   `json:"has_composer_json"`
	PHPVersion      string `json:"php_version"`
	PHPBinary       string `json:"php_binary"`
}

// GetComposerStatus checks if Composer is installed and if composer.json exists.
func (s *SiteService) GetComposerStatus(id int64) (*ComposerStatus, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	status := &ComposerStatus{}

	// Detect PHP binary
	if site.PHPVersion != nil && *site.PHPVersion != "" {
		status.PHPVersion = *site.PHPVersion
		phpBin := fmt.Sprintf("/usr/bin/php%s", *site.PHPVersion)
		if _, statErr := os.Stat(phpBin); statErr == nil {
			status.PHPBinary = phpBin
		}
	}
	if status.PHPBinary == "" {
		if _, statErr := os.Stat("/usr/bin/php"); statErr == nil {
			status.PHPBinary = "/usr/bin/php"
		}
	}

	// Check Composer
	composerPath := s.findComposerBinary()
	if composerPath != "" {
		status.Installed = true
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		args := []string{composerPath, "--version", "--no-ansi"}
		if status.PHPBinary != "" {
			args = []string{status.PHPBinary, composerPath, "--version", "--no-ansi"}
		}
		result, execErr := system.Exec(ctx, args[0], args[1:]...)
		if execErr == nil {
			out := strings.TrimSpace(result.Stdout)
			// "Composer version 2.7.1 2024-02-09 15:26:28"
			parts := strings.Fields(out)
			if len(parts) >= 3 && strings.EqualFold(parts[0], "composer") {
				status.Version = parts[2]
			}
		}
	}

	// Check composer.json
	composerJSON := filepath.Join(site.Path, "composer.json")
	if _, statErr := os.Stat(composerJSON); statErr == nil {
		status.HasComposerJSON = true
	}

	return status, nil
}

// findComposerBinary locates the composer binary on the system.
func (s *SiteService) findComposerBinary() string {
	candidates := []string{
		"/usr/local/bin/composer",
		"/usr/bin/composer",
		"/usr/local/bin/composer.phar",
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	// Try which
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	result, err := system.Exec(ctx, "which", "composer")
	if err == nil && strings.TrimSpace(result.Stdout) != "" {
		return strings.TrimSpace(result.Stdout)
	}
	return ""
}

// InstallComposer downloads and installs Composer globally.
func (s *SiteService) InstallComposer() error {
	if path := s.findComposerBinary(); path != "" {
		return fmt.Errorf("composer is already installed at %s", path)
	}

	// Find a PHP binary
	phpBin := ""
	for _, candidate := range []string{"/usr/bin/php", "/usr/local/bin/php"} {
		if _, err := os.Stat(candidate); err == nil {
			phpBin = candidate
			break
		}
	}
	if phpBin == "" {
		return fmt.Errorf("PHP is not installed — install PHP first")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// Download installer
	dlResult, err := system.Exec(ctx, "curl", "-sS", "https://getcomposer.org/installer", "-o", "/tmp/composer-setup.php")
	if err != nil {
		return fmt.Errorf("failed to download composer installer: %w (%s)", err, dlResult.Stderr)
	}

	// Run installer
	installResult, err := system.Exec(ctx, phpBin, "/tmp/composer-setup.php", "--install-dir=/usr/local/bin", "--filename=composer")
	if err != nil {
		return fmt.Errorf("failed to install composer: %w (%s)", err, installResult.Stderr)
	}

	// Cleanup
	os.Remove("/tmp/composer-setup.php")

	// Verify
	if path := s.findComposerBinary(); path == "" {
		return fmt.Errorf("composer installation completed but binary not found")
	}

	return nil
}

// RunComposer executes a Composer command in the site's directory.
func (s *SiteService) RunComposer(id int64, command string, args []string) (string, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return "", err
	}

	composerPath := s.findComposerBinary()
	if composerPath == "" {
		return "", apperrors.New(apperrors.ErrValidation, "Composer is not installed. Install it first via: curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer")
	}

	// Determine PHP binary
	phpBin := "/usr/bin/php"
	if site.PHPVersion != nil && *site.PHPVersion != "" {
		candidate := fmt.Sprintf("/usr/bin/php%s", *site.PHPVersion)
		if _, statErr := os.Stat(candidate); statErr == nil {
			phpBin = candidate
		}
	}

	// Allowed commands whitelist
	allowed := map[string]bool{
		"install":         true,
		"update":          true,
		"require":         true,
		"remove":          true,
		"dump-autoload":   true,
	}
	if !allowed[command] {
		return "", apperrors.New(apperrors.ErrValidation, "unsupported composer command: "+command)
	}

	// Build command args
	cmdArgs := []string{composerPath, command, "--no-interaction", "--no-ansi", "--working-dir=" + site.Path}

	// For require/remove, append package names from args
	if (command == "require" || command == "remove") && len(args) > 0 {
		for _, a := range args {
			a = strings.TrimSpace(a)
			if a != "" {
				cmdArgs = append(cmdArgs, a)
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	result, execErr := system.Exec(ctx, phpBin, cmdArgs...)
	output := result.Stdout
	if result.Stderr != "" {
		if output != "" {
			output += "\n"
		}
		output += result.Stderr
	}

	if execErr != nil {
		return output, apperrors.Wrap(execErr, apperrors.ErrInternal, "composer "+command+" failed")
	}

	return output, nil
}

// GetComposerJSON reads the composer.json from the site directory.
func (s *SiteService) GetComposerJSON(id int64) (string, error) {
	site, err := s.GetByID(id)
	if err != nil {
		return "", err
	}

	jsonPath := filepath.Join(site.Path, "composer.json")
	data, readErr := os.ReadFile(jsonPath)
	if readErr != nil {
		if os.IsNotExist(readErr) {
			return "", apperrors.New(apperrors.ErrNotFound, "composer.json not found in "+site.Path)
		}
		return "", apperrors.Wrap(readErr, apperrors.ErrInternal, "failed to read composer.json")
	}

	return string(data), nil
}

// UpdateComposerJSON writes the composer.json to the site directory.
func (s *SiteService) UpdateComposerJSON(id int64, content string) error {
	site, err := s.GetByID(id)
	if err != nil {
		return err
	}

	jsonPath := filepath.Join(site.Path, "composer.json")
	if writeErr := os.WriteFile(jsonPath, []byte(content), 0644); writeErr != nil {
		return apperrors.Wrap(writeErr, apperrors.ErrInternal, "failed to write composer.json")
	}

	return nil
}
