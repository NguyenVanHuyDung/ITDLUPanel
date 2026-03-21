package service

import (
	"context"
	"database/sql"
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

	// 3. Create default index.html
	indexPath := filepath.Join(docRoot, "index.html")
	if _, err := os.Stat(indexPath); os.IsNotExist(err) {
		indexContent := defaultIndexHTML(req.Domain)
		if err := os.WriteFile(indexPath, []byte(indexContent), 0644); err != nil {
			return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create index.html")
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

	// Delete DB record (domains cascade)
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
			return "", apperrors.New(apperrors.ErrNotFound, "vhost config file not found")
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

// defaultIndexHTML returns a welcome page for newly created sites.
func defaultIndexHTML(domain string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to %s</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               display: flex; justify-content: center; align-items: center;
               min-height: 100vh; margin: 0; background: #f5f5f5; color: #333; }
        .container { text-align: center; padding: 2rem; }
        h1 { font-size: 2rem; margin-bottom: 0.5rem; }
        p  { color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to %s</h1>
        <p>This site is managed by ITDLUPanel.</p>
    </div>
</body>
</html>`, domain, domain)
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
