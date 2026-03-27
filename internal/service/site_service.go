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
	"os"
	"path/filepath"
	"strings"
	"time"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/service/vhost"
	"github.com/ITDLUPanel/panel/internal/system"
)

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

// CreateSiteRequest holds the data needed to create a new site.
type CreateSiteRequest struct {
	Name       string `json:"name" validate:"required,min=1,max=128"`
	Domain     string `json:"domain" validate:"required,min=1,max=253"`
	Webserver  string `json:"webserver" validate:"required,oneof=nginx apache openlitespeed"`
	PHPVersion string `json:"php_version" validate:"omitempty"`
	CreateDB   bool   `json:"create_db"`
	DBName     string `json:"db_name" validate:"omitempty,min=1,max=64"`
	DBUser     string `json:"db_user" validate:"omitempty,min=1,max=32"`
	DBPass     string `json:"db_pass" validate:"omitempty,min=1"`
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
	db *sql.DB
}

// NewSiteService creates a new SiteService.
func NewSiteService(db *sql.DB) *SiteService {
	return &SiteService{db: db}
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
	if err := os.MkdirAll(docRoot, 0755); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create document root")
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
		`INSERT INTO sites (name, domain, path, webserver, php_version, status, created_by, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		req.Name, req.Domain, docRoot, req.Webserver, req.PHPVersion, userID,
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

	logger.Info().Int64("id", id).Str("domain", req.Domain).Msg("site created")

	return s.GetByID(id)
}

// List returns a paginated list of sites.
func (s *SiteService) List(page, pageSize int) ([]*Site, int, error) {
	var total int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM sites").Scan(&total); err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to count sites")
	}

	offset := (page - 1) * pageSize
	rows, err := s.db.Query(
		`SELECT id, name, domain, path, webserver, php_version, ssl_enabled,
		        ssl_type, ssl_expiry, status, config_extra, created_by, created_at, updated_at
		 FROM sites ORDER BY id DESC LIMIT ? OFFSET ?`, pageSize, offset,
	)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list sites")
	}
	defer rows.Close()

	var sites []*Site
	for rows.Next() {
		site := &Site{}
		if err := rows.Scan(
			&site.ID, &site.Name, &site.Domain, &site.Path, &site.Webserver,
			&site.PHPVersion, &site.SSLEnabled, &site.SSLType, &site.SSLExpiry,
			&site.Status, &site.ConfigExtra, &site.CreatedBy,
			&site.CreatedAt, &site.UpdatedAt,
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
		`SELECT id, name, domain, path, webserver, php_version, ssl_enabled,
		        ssl_type, ssl_expiry, status, config_extra, created_by, created_at, updated_at
		 FROM sites WHERE id = ?`, id,
	).Scan(
		&site.ID, &site.Name, &site.Domain, &site.Path, &site.Webserver,
		&site.PHPVersion, &site.SSLEnabled, &site.SSLType, &site.SSLExpiry,
		&site.Status, &site.ConfigExtra, &site.CreatedBy,
		&site.CreatedAt, &site.UpdatedAt,
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
	if req.PHPVersion != "" {
		phpVersion = &req.PHPVersion
	}

	_, err = s.db.Exec(
		"UPDATE sites SET name = ?, php_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		name, phpVersion, id,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update site")
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
	certBase := "/ITDLUPanel/server/data/ssl"
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
	certBase := "/ITDLUPanel/server/data/ssl"
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
				newLines = append(newLines, strings.Replace(line, "#access_log off;", fmt.Sprintf("access_log /ITDLU/logs/%s.access.log;", site.Domain), 1))
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
	htpasswdDir := "/ITDLUPanel/server/nginx/htpasswd"
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

	htpasswdFile := filepath.Join("/ITDLUPanel/server/nginx/htpasswd", site.Domain)
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
	return "/ITDLUPanel/server/config/sites"
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

// ---------------------------------------------------------------------------
// Feature 1: Sub Directory Binding
// ---------------------------------------------------------------------------

// SubdirBinding represents a domain-to-subdirectory binding.
type SubdirBinding struct {
	Domain string `json:"domain"`
	Subdir string `json:"subdir"`
}

func subdirBindingsPath(id int64) string {
	return filepath.Join(siteConfigDir(), fmt.Sprintf("%d_subdir.json", id))
}

func subdirNginxConfPath(bindingDomain string) string {
	return filepath.Join("/etc/nginx/sites-available", bindingDomain+"_subdir.conf")
}

func subdirNginxEnabledPath(bindingDomain string) string {
	return filepath.Join("/etc/nginx/sites-enabled", bindingDomain+"_subdir.conf")
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
	b.WriteString(fmt.Sprintf("    access_log /ITDLUPanel/logs/%s.access.log;\n", bindingDomain))
	b.WriteString(fmt.Sprintf("    error_log /ITDLUPanel/logs/%s.error.log;\n", bindingDomain))
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
	htpasswdDir := "/ITDLUPanel/server/nginx/htpasswd"
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
	htpasswdFile := filepath.Join("/ITDLUPanel/server/nginx/htpasswd", fmt.Sprintf("%s_%s", site.Domain, removed.Name))
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
		htpasswdFile := filepath.Join("/ITDLUPanel/server/nginx/htpasswd", fmt.Sprintf("%s_%s", site.Domain, r.Name))
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
	confPath := "/etc/nginx/conf.d/rate_limit.conf"
	if _, err := os.Stat(confPath); err == nil {
		return nil
	}

	content := "limit_conn_zone $binary_remote_addr zone=addr:10m;\nlimit_req_zone $binary_remote_addr zone=one:10m rate=25r/s;\n"
	_ = os.MkdirAll("/etc/nginx/conf.d", 0755)
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

	var rules []ReverseProxyRule
	_ = readJSONFile(reverseProxyPath(id), &rules)

	// Check for duplicate name
	for _, r := range rules {
		if r.Name == rule.Name {
			return apperrors.New(apperrors.ErrValidation, "rule with this name already exists")
		}
	}

	rules = append(rules, rule)

	if err := writeJSONFile(reverseProxyPath(id), rules); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save reverse proxy rules")
	}

	if err := s.rebuildReverseProxyNginx(site, rules); err != nil {
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

	rules[index] = rule

	if err := writeJSONFile(reverseProxyPath(id), rules); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to save reverse proxy rules")
	}

	if err := s.rebuildReverseProxyNginx(site, rules); err != nil {
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

	gen := generatorFor(site.Webserver)
	confPath := gen.GetConfigPath(site.Domain)

	if len(rules) == 0 {
		if err := s.removeNginxBlock(confPath, "#REVERSE_PROXY_START", "#REVERSE_PROXY_END"); err != nil {
			return err
		}
	} else {
		if err := s.rebuildReverseProxyNginx(site, rules); err != nil {
			return err
		}
	}

	if err := gen.ReloadServer(); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to reload webserver")
	}

	logger.Info().Int64("id", id).Str("name", removed.Name).Msg("reverse proxy rule removed")
	return nil
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
		blockLines = append(blockLines, fmt.Sprintf("location %s {", dir))

		// URL rewrite rules (before proxy_pass)
		for _, rw := range r.URLRewrite {
			if rw.Pattern != "" && rw.Replacement != "" {
				blockLines = append(blockLines, fmt.Sprintf("    rewrite %s %s break;", rw.Pattern, rw.Replacement))
			}
		}

		blockLines = append(blockLines, fmt.Sprintf("    proxy_pass %s;", r.TargetURL))
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
					blockLines = append(blockLines, fmt.Sprintf("    sub_filter '%s' '%s';", cr.Search, cr.Replace))
				}
			}
		}

		blockLines = append(blockLines, "}")
	}

	return s.insertNginxBlock(confPath, "#REVERSE_PROXY_START", "#REVERSE_PROXY_END", blockLines)
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
		switch r.Type {
		case "domain":
			// Domain redirect: if the request host matches, redirect
			if r.KeepURI {
				blockLines = append(blockLines,
					fmt.Sprintf("if ($host = %s) {", r.Source),
					fmt.Sprintf("    return %d %s$request_uri;", r.Mode, strings.TrimRight(r.TargetURL, "/")),
					"}",
				)
			} else {
				blockLines = append(blockLines,
					fmt.Sprintf("if ($host = %s) {", r.Source),
					fmt.Sprintf("    return %d %s;", r.Mode, r.TargetURL),
					"}",
				)
			}
		case "path":
			// Path redirect
			if r.KeepURI {
				blockLines = append(blockLines,
					fmt.Sprintf("location ^~ %s {", r.Source),
					fmt.Sprintf("    return %d %s$request_uri;", r.Mode, strings.TrimRight(r.TargetURL, "/")),
					"}",
				)
			} else {
				blockLines = append(blockLines,
					fmt.Sprintf("location ^~ %s {", r.Source),
					fmt.Sprintf("    return %d %s;", r.Mode, r.TargetURL),
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

	var referers []string
	if config.AllowEmpty {
		referers = append(referers, "none", "blocked")
	}
	referers = append(referers, site.Domain, "*."+site.Domain)
	for _, d := range config.AllowedDomains {
		d = strings.TrimSpace(d)
		if d != "" {
			referers = append(referers, d)
		}
	}

	var blockLines []string
	blockLines = append(blockLines, fmt.Sprintf("location ~* \\.(%s)$ {", suffix))
	blockLines = append(blockLines, fmt.Sprintf("    valid_referers %s;", strings.Join(referers, " ")))
	blockLines = append(blockLines, "    if ($invalid_referer) {")

	response := strings.TrimSpace(config.Response)
	if response == "" || response == "403" {
		blockLines = append(blockLines, "        return 403;")
	} else if response == "404" {
		blockLines = append(blockLines, "        return 404;")
	} else {
		blockLines = append(blockLines, fmt.Sprintf("        return 301 %s;", response))
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
	return "/ITDLUPanel/server/config/maintenance"
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

		if err := s.insertNginxBlock(confPath, "#MAINTENANCE_MODE_START", "#MAINTENANCE_MODE_END", blockLines); err != nil {
			return err
		}
	} else {
		if err := s.removeNginxBlock(confPath, "#MAINTENANCE_MODE_START", "#MAINTENANCE_MODE_END"); err != nil {
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
