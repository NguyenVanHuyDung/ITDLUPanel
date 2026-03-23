package service

import (
	"context"
	"crypto/x509"
	"database/sql"
	"encoding/pem"
	"fmt"
	"os"
	"path/filepath"
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
		"ssl_enabled": site.SSLEnabled == 1,
		"domain":      site.Domain,
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

	// Read cert to extract expiry info
	certData, err := os.ReadFile(certPath)
	if err == nil {
		block, _ := pem.Decode(certData)
		if block != nil {
			cert, err := x509.ParseCertificate(block.Bytes)
			if err == nil {
				result["issuer"] = cert.Issuer.CommonName
				result["not_before"] = cert.NotBefore
				result["not_after"] = cert.NotAfter
				result["subject"] = cert.Subject.CommonName
				result["dns_names"] = cert.DNSNames

				// Update ssl_expiry in DB
				_, _ = s.db.Exec(
					`UPDATE sites SET ssl_expiry = ? WHERE id = ?`,
					cert.NotAfter.Format("2006-01-02"), id,
				)
			}
		}
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
