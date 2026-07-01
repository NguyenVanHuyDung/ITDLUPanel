package service

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/service/installer"
)

// ---------------------------------------------------------------------------
// WAF Types
// ---------------------------------------------------------------------------

// WAFStatus represents the overall WAF service status.
type WAFStatus struct {
	Installed          bool   `json:"installed"`
	Running            bool   `json:"running"`
	HAProxyInstalled   bool   `json:"haproxy_installed"`
	CorazaInstalled    bool   `json:"coraza_installed"`
	Version            string `json:"version"`
	Mode               string `json:"mode"`
	Uptime             int64  `json:"uptime"`
	TotalSites         int    `json:"total_sites"`
	ActiveSites        int    `json:"active_sites"`
	TotalRules         int    `json:"total_rules"`
	ActiveRules        int    `json:"active_rules"`
	BlockedToday       int64  `json:"blocked_today"`
	TotalRequestsToday int64  `json:"total_requests_today"`
	WebServerInstalled bool   `json:"webserver_installed"`
}

// WAFSite represents a WAF-protected site.
type WAFSite struct {
	ID              int       `json:"id"`
	Name            string    `json:"name"`
	Domain          string    `json:"domain"`
	BackendURL      string    `json:"backend_url"`
	ListenPort      int       `json:"listen_port"`
	SSLPort         int       `json:"ssl_port"`
	Enabled         bool      `json:"enabled"`
	Mode            string    `json:"mode"`
	SSLEnabled      bool      `json:"ssl_enabled"`
	SSLCertPath     *string   `json:"ssl_cert_path"`
	SSLKeyPath      *string   `json:"ssl_key_path"`
	HealthCheckPath *string   `json:"health_check_path"`
	MaxConnections  int       `json:"max_connections"`
	TimeoutClient   int       `json:"timeout_client"`
	TimeoutServer   int       `json:"timeout_server"`
	Description     *string   `json:"description"`
	RulesCount      int       `json:"rules_count"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// WAFSiteInput is used for creating/updating WAF sites.
type WAFSiteInput struct {
	Name            string  `json:"name" validate:"required,min=1,max=255"`
	Domain          string  `json:"domain" validate:"required,fqdn"`
	BackendURL      string  `json:"backend_url" validate:"required,url"`
	ListenPort      int     `json:"listen_port" validate:"required,min=1,max=65535"`
	SSLPort         int     `json:"ssl_port" validate:"omitempty,min=1,max=65535"`
	Enabled         *bool   `json:"enabled"`
	Mode            string  `json:"mode" validate:"omitempty,oneof=blocking detection"`
	SSLEnabled      *bool   `json:"ssl_enabled"`
	SSLCertPath     *string `json:"ssl_cert_path"`
	SSLKeyPath      *string `json:"ssl_key_path"`
	HealthCheckPath *string `json:"health_check_path"`
	MaxConnections  *int    `json:"max_connections" validate:"omitempty,min=100,max=50000"`
	TimeoutClient   *int    `json:"timeout_client" validate:"omitempty,min=1000,max=3600000"`
	TimeoutServer   *int    `json:"timeout_server" validate:"omitempty,min=1000,max=3600000"`
	Description     *string `json:"description" validate:"omitempty,max=1000"`
}

// WAFRule represents a WAF rule.
type WAFRule struct {
	ID           int       `json:"id"`
	Name         string    `json:"name"`
	RuleType     string    `json:"rule_type"`
	Category     string    `json:"category"`
	Phase        int       `json:"phase"`
	Action       string    `json:"action"`
	RuleContent  string    `json:"rule_content"`
	Enabled      bool      `json:"enabled"`
	Priority     int       `json:"priority"`
	LogLevel     string    `json:"log_level"`
	Description  *string   `json:"description"`
	RuleGroup    *string   `json:"rule_group"`
	OWASPRuleID  *string   `json:"owasp_rule_id"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// WAFRuleInput is used for creating/updating rules.
type WAFRuleInput struct {
	Name         string  `json:"name" validate:"required,min=1,max=255"`
	RuleType     string  `json:"rule_type" validate:"required,oneof=custom owasp ip_match"`
	Category     string  `json:"category" validate:"required,min=1,max=100"`
	Phase        *int    `json:"phase" validate:"omitempty,min=1,max=4"`
	Action       string  `json:"action" validate:"required,oneof=block allow log"`
	RuleContent  string  `json:"rule_content" validate:"required,min=1"`
	Enabled      *bool   `json:"enabled"`
	Priority     *int    `json:"priority" validate:"omitempty,min=1,max=999"`
	LogLevel     string  `json:"log_level" validate:"omitempty,oneof=alert critical error warning notice info debug"`
	Description  *string `json:"description" validate:"omitempty,max=1000"`
	RuleGroup    *string `json:"rule_group" validate:"omitempty,max=100"`
	OWASPRuleID  *string `json:"owasp_rule_id"`
}

// WAFOWASPCategory represents an OWASP rule category.
type WAFOWASPCategory struct {
	ID          int     `json:"id"`
	CategoryID  string  `json:"category_id"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Enabled     bool    `json:"enabled"`
	Severity    string  `json:"severity"`
	MitreTech   string  `json:"mitre_technique"`
}

// WAFSettings represents global WAF settings.
type WAFSettings struct {
	GlobalMode          string   `json:"global_mode"`
	OWASPRulesEnabled   bool    `json:"owasp_rules_enabled"`
	OWASPRulesetVersion string   `json:"owasp_ruleset_version"`
	ParanoiaLevel       int      `json:"paranoia_level"`
	AnomalyThreshold    float64  `json:"anomaly_threshold"`
	LogRequests         string   `json:"log_requests"`
	LogRetentionDays    int      `json:"log_retention_days"`
	LogRequestBody      bool     `json:"log_request_body"`
	GeoBlockingEnabled  bool     `json:"geo_blocking_enabled"`
	GeoBlockedCountries []string `json:"geo_blocked_countries"`
	WhitelistedIPs      []string `json:"whitelisted_ips"`
	BlacklistedIPs      []string `json:"blacklisted_ips"`
	ServiceStatus       string   `json:"service_status"`
}

// WAFLogEntry represents a WAF log entry.
type WAFLogEntry struct {
	ID              int       `json:"id"`
	Timestamp       time.Time `json:"timestamp"`
	SiteID          *int      `json:"site_id"`
	SiteName        *string   `json:"site_name"`
	ClientIP        string    `json:"client_ip"`
	Method          string    `json:"method"`
	URI             string    `json:"uri"`
	Host            string    `json:"host"`
	RuleID          *string   `json:"rule_id"`
	RuleMessage     *string   `json:"rule_message"`
	RuleSeverity    *string   `json:"rule_severity"`
	RuleCategory    *string   `json:"rule_category"`
	ActionTaken     string    `json:"action_taken"`
	AnomalyScore    *float64  `json:"anomaly_score"`
	GeoCountry      *string   `json:"geo_country"`
	UserAgent       *string   `json:"user_agent"`
	Referer         *string   `json:"referer"`
	ResponseCode    *int      `json:"response_code"`
	RequestBody     *string   `json:"request_body"`
	RequestHeaders  *string   `json:"request_headers"`
	MatchedData     *string   `json:"matched_data"`
}

// WAFStats represents aggregated WAF statistics.
type WAFStats struct {
	TotalRequests     int64   `json:"total_requests"`
	BlockedRequests   int64   `json:"blocked_requests"`
	AllowedRequests   int64   `json:"allowed_requests"`
	SQLiCount         int64   `json:"sqli_count"`
	XSSCount          int64   `json:"xss_count"`
	LFICount          int64   `json:"lfi_count"`
	RCECount          int64   `json:"rce_count"`
	OtherCount        int64   `json:"other_count"`
	BlockRate         float64 `json:"block_rate"`
	TopBlockedIPs     []IPStat `json:"top_blocked_ips"`
	TopTriggeredRules []RuleStat `json:"top_triggered_rules"`
	AvgAnomalyScore   float64 `json:"avg_anomaly_score"`
	RequestsByHour    []HourStat `json:"requests_by_hour"`
}

// IPStat represents an IP address statistic.
type IPStat struct {
	IP    string `json:"ip"`
	Count int64  `json:"count"`
}

// RuleStat represents a triggered rule statistic.
type RuleStat struct {
	RuleID   string `json:"rule_id"`
	Name     string `json:"name"`
	Category string `json:"category"`
	Count    int64  `json:"count"`
}

// HourStat represents hourly request statistics.
type HourStat struct {
	Hour    string `json:"hour"`
	Allowed int64  `json:"allowed"`
	Blocked int64  `json:"blocked"`
}

// WAFLogQuery holds query parameters for fetching logs.
type WAFLogQuery struct {
	SiteID     *int    `form:"site_id"`
	Action     string  `form:"action"`
	Category   string  `form:"category"`
	Severity   string  `form:"severity"`
	ClientIP   string  `form:"client_ip"`
	RuleID     string  `form:"rule_id"`
	StartDate  string  `form:"start_date"`
	EndDate    string  `form:"end_date"`
	Search     string  `form:"search"`
	Page       int     `form:"page,default=1"`
	PageSize   int     `form:"page_size,default=50"`
}

// WAFIPEntry represents an IP in whitelist/blacklist.
type WAFIPEntry struct {
	ID          int        `json:"id"`
	IPAddress   string     `json:"ip_address"`
	ListType    string     `json:"list_type"`
	Description *string    `json:"description"`
	ExpiresAt   *time.Time `json:"expires_at"`
	CreatedAt   time.Time  `json:"created_at"`
	HitCount    int        `json:"hit_count"`
	LastHit     *time.Time `json:"last_hit"`
	IsCIDR      bool       `json:"is_cidr"`
	Source      string     `json:"source"`
}

// WAFTrafficStats represents traffic statistics.
type WAFTrafficStats struct {
	Period            string            `json:"period"`
	PeriodKey         string            `json:"period_key"`
	TotalBytesIn      int64             `json:"total_bytes_in"`
	TotalBytesOut     int64             `json:"total_bytes_out"`
	TotalRequests     int64             `json:"total_requests"`
	BlockedRequests   int64             `json:"blocked_requests"`
	AvgResponseMs     float64           `json:"avg_response_ms"`
	MaxResponseMs     int               `json:"max_response_ms"`
	P95ResponseMs     int               `json:"p95_response_ms"`
	TopCountries      []WAFGeoEntry     `json:"top_countries"`
	TopClients        []IPStat          `json:"top_clients"`
	TrafficByHour     []WAFTrafficHour  `json:"traffic_by_hour"`
	BandwidthByHour   []WAFBandwidthHour `json:"bandwidth_by_hour"`
}

// WAFTrafficHour represents hourly traffic.
type WAFTrafficHour struct {
	Hour             string `json:"hour"`
	TotalRequests    int64  `json:"total_requests"`
	BlockedRequests  int64  `json:"blocked_requests"`
	AvgResponseMs    float64 `json:"avg_response_ms"`
}

// WAFBandwidthHour represents hourly bandwidth.
type WAFBandwidthHour struct {
	Hour        string `json:"hour"`
	BytesIn    int64  `json:"bytes_in"`
	BytesOut   int64  `json:"bytes_out"`
}

// WAFSlowRequest represents a slow request entry.
type WAFSlowRequest struct {
	ID           int        `json:"id"`
	SiteID       *int      `json:"site_id"`
	SiteName     *string   `json:"site_name"`
	ClientIP     string     `json:"client_ip"`
	GeoCountry   *string   `json:"geo_country"`
	Method       string     `json:"method"`
	URI          string     `json:"uri"`
	Host         string     `json:"host"`
	ResponseMs   int        `json:"response_ms"`
	ThresholdMs  int        `json:"threshold_ms"`
	Timestamp    time.Time  `json:"timestamp"`
}

// WAFURIEntry represents a URI whitelist/blacklist entry.
type WAFURIEntry struct {
	ID          int        `json:"id"`
	URIPattern  string     `json:"uri_pattern"`
	ListType    string     `json:"list_type"`
	Action      string     `json:"action"`
	Description *string    `json:"description"`
	Enabled     bool       `json:"enabled"`
	Priority    int        `json:"priority"`
	CreatedAt   time.Time  `json:"created_at"`
}

// WAFLuaScriptInput is used for creating/updating Lua scripts.
type WAFLuaScriptInput struct {
	Name          string  `json:"name" validate:"required,min=1,max=255"`
	Description   *string `json:"description"`
	ScriptContent string  `json:"script_content" validate:"required"`
	Enabled       *bool   `json:"enabled"`
	Priority      *int    `json:"priority"`
}

// WAFLuaScript represents a Lua script.
type WAFLuaScript struct {
	ID            int        `json:"id"`
	Name          string     `json:"name"`
	Description   *string    `json:"description"`
	ScriptContent string     `json:"script_content"`
	Enabled       bool       `json:"enabled"`
	Priority      int        `json:"priority"`
	CreatedAt     time.Time  `json:"created_at"`
}

// WAFUAEntry represents a User-Agent whitelist/blacklist entry.
type WAFUAEntry struct {
	ID          int        `json:"id"`
	UAPattern   string     `json:"ua_pattern"`
	ListType    string     `json:"list_type"`
	Description *string    `json:"description"`
	Enabled     bool       `json:"enabled"`
	CreatedAt   time.Time  `json:"created_at"`
}

// WAFGeoEntry represents a geographic statistics entry.
type WAFGeoEntry struct {
	CountryCode       string `json:"country_code"`
	CountryName       string `json:"country_name"`
	TotalRequests     int64  `json:"total_requests"`
	BlockedRequests   int64  `json:"blocked_requests"`
	UniqueIPs         int64  `json:"unique_ips"`
}

// WAFGeoStats represents geographic statistics.
type WAFGeoStats struct {
	TopCountries    []WAFGeoEntry  `json:"top_countries"`
	TotalCountries  int            `json:"total_countries"`
	BlockedByCountry []WAFGeoEntry `json:"blocked_by_country"`
}

// WAFAttackFeedEntry represents a real-time attack feed entry.
type WAFAttackFeedEntry struct {
	ID            int        `json:"id"`
	Timestamp     time.Time  `json:"timestamp"`
	ClientIP      string     `json:"client_ip"`
	GeoCountry    *string   `json:"geo_country"`
	GeoCity       *string   `json:"geo_city"`
	Method        string     `json:"method"`
	URI           string     `json:"uri"`
	Host          string     `json:"host"`
	RuleID        *string   `json:"rule_id"`
	RuleMessage   *string   `json:"rule_message"`
	RuleCategory  *string   `json:"rule_category"`
	RuleSeverity  *string   `json:"rule_severity"`
	ActionTaken   string     `json:"action_taken"`
	AnomalyScore  *float64  `json:"anomaly_score"`
	UserAgent     *string   `json:"user_agent"`
	ResponseCode  *int      `json:"response_code"`
	SiteID        *int      `json:"site_id"`
	SiteName      *string   `json:"site_name"`
	LatencyMs     *int      `json:"latency_ms"`
}

// ---------------------------------------------------------------------------
// WAFService handles WAF business logic
// ---------------------------------------------------------------------------

type WAFService struct {
	db              *sql.DB
	haproxyMgr      *HAProxyManager
	corazaMgr       *CorazaSPOAManager
	logService      *WAFLogService
}

// NewWAFService creates a new WAF service.
func NewWAFService(db *sql.DB) *WAFService {
	svc := &WAFService{db: db}
	svc.haproxyMgr = NewHAProxyManager()
	svc.corazaMgr = NewCorazaSPOAManager()
	svc.logService = NewWAFLogService(db)
	return svc
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

// GetStatus returns the current WAF service status.
func (s *WAFService) GetStatus() (*WAFStatus, error) {
	status := &WAFStatus{}

	// Check if web server is installed (nginx, apache, or openlitespeed)
	nginxInst := installer.NewNginxInstaller()
	apacheInst := installer.NewApacheInstaller()
	olsInst := installer.NewOLSInstaller()
	status.WebServerInstalled = nginxInst.IsInstalled() || apacheInst.IsInstalled() || olsInst.IsInstalled()

	// Check if WAF is installed
	haproxyInstalled := s.haproxyMgr.IsInstalled()
	corazaInstalled := s.corazaMgr.IsInstalled()
	status.HAProxyInstalled = haproxyInstalled
	status.CorazaInstalled = corazaInstalled
	status.Installed = haproxyInstalled && corazaInstalled

	if !status.Installed {
		status.Mode = "not_installed"
		return status, nil
	}

	// Check if service is running
	status.Running = s.corazaMgr.IsRunning()

	// Get version
	status.Version = s.corazaMgr.GetVersion()

	// Get mode from settings
	var mode string
	err := s.db.QueryRow("SELECT value FROM waf_settings WHERE key = 'global_mode'").Scan(&mode)
	if err == nil {
		status.Mode = mode
	}

	// Count sites
	s.db.QueryRow("SELECT COUNT(*) FROM waf_sites").Scan(&status.TotalSites)
	s.db.QueryRow("SELECT COUNT(*) FROM waf_sites WHERE enabled = 1").Scan(&status.ActiveSites)

	// Count rules
	s.db.QueryRow("SELECT COUNT(*) FROM waf_rules").Scan(&status.TotalRules)
	s.db.QueryRow("SELECT COUNT(*) FROM waf_rules WHERE enabled = 1").Scan(&status.ActiveRules)

	// Today's stats
	today := time.Now().Format("2006-01-02")
	var todayBlocked, todayTotal int64
	s.db.QueryRow(`
		SELECT COALESCE(SUM(blocked_requests),0), COALESCE(SUM(total_requests),0)
		FROM waf_stats
		WHERE period_key = ? AND site_id IS NULL
	`, today).Scan(&todayBlocked, &todayTotal)
	status.BlockedToday = todayBlocked
	status.TotalRequestsToday = todayTotal

	// Calculate uptime from process
	status.Uptime = s.corazaMgr.GetUptime()

	return status, nil
}

// ---------------------------------------------------------------------------
// Service Management
// ---------------------------------------------------------------------------

// InstallWAF installs and configures the WAF (HAProxy + Coraza SPOA).
func (s *WAFService) InstallWAF() error {
	// 1. Install HAProxy if not present
	if !s.haproxyMgr.IsInstalled() {
		if err := s.haproxyMgr.Install(); err != nil {
			return fmt.Errorf("failed to install HAProxy: %w", err)
		}
		s.updateSetting("haproxy_installed", "true")
	}

	// 2. Install Coraza SPOA
	if !s.corazaMgr.IsInstalled() {
		if err := s.corazaMgr.Install(); err != nil {
			return fmt.Errorf("failed to install Coraza SPOA: %w", err)
		}
		s.updateSetting("coraza_installed", "true")
	}

	// 3. Generate initial configurations
	if err := s.generateCorazaConfig(); err != nil {
		return fmt.Errorf("failed to generate Coraza config: %w", err)
	}

	if err := s.generateSPOEConfig(); err != nil {
		return fmt.Errorf("failed to generate SPOE config: %w", err)
	}

	// 4. Start Coraza SPOA daemon
	if err := s.corazaMgr.Start(); err != nil {
		return fmt.Errorf("failed to start Coraza SPOA: %w", err)
	}

	// 5. Generate HAProxy WAF config
	if err := s.haproxyMgr.GenerateWAFConfig(s.db); err != nil {
		return fmt.Errorf("failed to generate HAProxy config: %w", err)
	}

	// 6. Reload HAProxy
	if err := s.haproxyMgr.Reload(); err != nil {
		return fmt.Errorf("failed to reload HAProxy: %w", err)
	}

	s.updateSetting("service_status", "running")

	logger.Info().Msg("WAF installed successfully")
	return nil
}

// UninstallWAF removes the WAF installation.
func (s *WAFService) UninstallWAF() error {
	// 1. Stop Coraza SPOA
	s.corazaMgr.Stop()

	// 2. Remove Coraza installation
	s.corazaMgr.Uninstall()

	// 3. Remove HAProxy WAF config
	s.haproxyMgr.RemoveWAFConfig()

	// 4. Reload HAProxy
	s.haproxyMgr.Reload()

	s.updateSetting("service_status", "stopped")
	s.updateSetting("haproxy_installed", "false")
	s.updateSetting("coraza_installed", "false")

	logger.Info().Msg("WAF uninstalled successfully")
	return nil
}

// RestartWAF restarts the WAF service.
func (s *WAFService) RestartWAF() error {
	if !s.corazaMgr.IsInstalled() {
		return fmt.Errorf("WAF is not installed")
	}

	s.corazaMgr.Stop()
	time.Sleep(1 * time.Second)

	if err := s.corazaMgr.Start(); err != nil {
		return fmt.Errorf("failed to start Coraza SPOA: %w", err)
	}

	if err := s.haproxyMgr.Reload(); err != nil {
		return fmt.Errorf("failed to reload HAProxy: %w", err)
	}

	s.updateSetting("service_status", "running")
	return nil
}

// GetConfigPaths returns the paths to current HAProxy and Coraza configs.
func (s *WAFService) GetConfigPaths() (haproxyCfg, corazaCfg, spoaCfg string) {
	return s.haproxyMgr.GetConfigPath(), s.corazaMgr.GetConfigPath(), s.corazaMgr.GetSPOAConfigPath()
}

// GetConfigContent returns the content of config files.
func (s *WAFService) GetConfigContent(configType string) (string, error) {
	switch configType {
	case "haproxy":
		return s.haproxyMgr.ReadWAFConfig()
	case "coraza":
		return s.corazaMgr.ReadConfig()
	case "spoa":
		return s.corazaMgr.ReadSPOAConfig()
	default:
		return "", fmt.Errorf("unknown config type: %s", configType)
	}
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

// ListSites returns all WAF-protected sites.
func (s *WAFService) ListSites() ([]WAFSite, error) {
	rows, err := s.db.Query(`
		SELECT ws.id, ws.name, ws.domain, ws.backend_url, ws.listen_port, ws.ssl_port,
		       ws.enabled, ws.mode, ws.ssl_enabled, ws.ssl_cert_path, ws.ssl_key_path,
		       ws.health_check_path, ws.max_connections, ws.timeout_client, ws.timeout_server,
		       ws.description, ws.created_at, ws.updated_at,
		       (SELECT COUNT(*) FROM waf_rules WHERE enabled = 1) as rules_count
		FROM waf_sites ws
		ORDER BY ws.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sites []WAFSite
	for rows.Next() {
		var site WAFSite
		err := rows.Scan(
			&site.ID, &site.Name, &site.Domain, &site.BackendURL,
			&site.ListenPort, &site.SSLPort, &site.Enabled, &site.Mode,
			&site.SSLEnabled, &site.SSLCertPath, &site.SSLKeyPath,
			&site.HealthCheckPath, &site.MaxConnections, &site.TimeoutClient,
			&site.TimeoutServer, &site.Description, &site.CreatedAt, &site.UpdatedAt,
			&site.RulesCount,
		)
		if err != nil {
			return nil, err
		}
		sites = append(sites, site)
	}

	return sites, nil
}

// GetSite returns a single site by ID.
func (s *WAFService) GetSite(id int) (*WAFSite, error) {
	var site WAFSite
	err := s.db.QueryRow(`
		SELECT ws.id, ws.name, ws.domain, ws.backend_url, ws.listen_port, ws.ssl_port,
		       ws.enabled, ws.mode, ws.ssl_enabled, ws.ssl_cert_path, ws.ssl_key_path,
		       ws.health_check_path, ws.max_connections, ws.timeout_client, ws.timeout_server,
		       ws.description, ws.created_at, ws.updated_at,
		       (SELECT COUNT(*) FROM waf_rules WHERE enabled = 1)
		FROM waf_sites ws
		WHERE ws.id = ?
	`, id).Scan(
		&site.ID, &site.Name, &site.Domain, &site.BackendURL,
		&site.ListenPort, &site.SSLPort, &site.Enabled, &site.Mode,
		&site.SSLEnabled, &site.SSLCertPath, &site.SSLKeyPath,
		&site.HealthCheckPath, &site.MaxConnections, &site.TimeoutClient,
		&site.TimeoutServer, &site.Description, &site.CreatedAt, &site.UpdatedAt,
		&site.RulesCount,
	)
	if err != nil {
		return nil, err
	}
	return &site, nil
}

// CreateSite creates a new WAF-protected site.
func (s *WAFService) CreateSite(input WAFSiteInput) (*WAFSite, error) {
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	mode := "blocking"
	if input.Mode != "" {
		mode = input.Mode
	}
	sslEnabled := false
	if input.SSLEnabled != nil {
		sslEnabled = *input.SSLEnabled
	}
	maxConn := 2000
	if input.MaxConnections != nil {
		maxConn = *input.MaxConnections
	}
	timeoutClient := 30000
	if input.TimeoutClient != nil {
		timeoutClient = *input.TimeoutClient
	}
	timeoutServer := 30000
	if input.TimeoutServer != nil {
		timeoutServer = *input.TimeoutServer
	}

	result, err := s.db.Exec(`
		INSERT INTO waf_sites (name, domain, backend_url, listen_port, ssl_port, enabled, mode,
			ssl_enabled, ssl_cert_path, ssl_key_path, health_check_path, max_connections,
			timeout_client, timeout_server, description)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		input.Name, input.Domain, input.BackendURL, input.ListenPort, input.SSLPort,
		enabled, mode, sslEnabled, input.SSLCertPath, input.SSLKeyPath,
		input.HealthCheckPath, maxConn, timeoutClient, timeoutServer, input.Description,
	)
	if err != nil {
		return nil, err
	}

	id, _ := result.LastInsertId()
	return s.GetSite(int(id))
}

// UpdateSite updates an existing site.
func (s *WAFService) UpdateSite(id int, input WAFSiteInput) (*WAFSite, error) {
	site, err := s.GetSite(id)
	if err != nil {
		return nil, err
	}

	updates := []string{}
	args := []interface{}{}

	if input.Name != "" {
		updates = append(updates, "name = ?")
		args = append(args, input.Name)
	}
	if input.Domain != "" {
		updates = append(updates, "domain = ?")
		args = append(args, input.Domain)
	}
	if input.BackendURL != "" {
		updates = append(updates, "backend_url = ?")
		args = append(args, input.BackendURL)
	}
	if input.ListenPort > 0 {
		updates = append(updates, "listen_port = ?")
		args = append(args, input.ListenPort)
	}
	if input.SSLPort > 0 {
		updates = append(updates, "ssl_port = ?")
		args = append(args, input.SSLPort)
	}
	if input.Enabled != nil {
		updates = append(updates, "enabled = ?")
		args = append(args, *input.Enabled)
	}
	if input.Mode != "" {
		updates = append(updates, "mode = ?")
		args = append(args, input.Mode)
	}
	if input.SSLEnabled != nil {
		updates = append(updates, "ssl_enabled = ?")
		args = append(args, *input.SSLEnabled)
	}
	if input.SSLCertPath != nil {
		updates = append(updates, "ssl_cert_path = ?")
		args = append(args, *input.SSLCertPath)
	}
	if input.SSLKeyPath != nil {
		updates = append(updates, "ssl_key_path = ?")
		args = append(args, *input.SSLKeyPath)
	}
	if input.HealthCheckPath != nil {
		updates = append(updates, "health_check_path = ?")
		args = append(args, *input.HealthCheckPath)
	}
	if input.MaxConnections != nil {
		updates = append(updates, "max_connections = ?")
		args = append(args, *input.MaxConnections)
	}
	if input.TimeoutClient != nil {
		updates = append(updates, "timeout_client = ?")
		args = append(args, *input.TimeoutClient)
	}
	if input.TimeoutServer != nil {
		updates = append(updates, "timeout_server = ?")
		args = append(args, *input.TimeoutServer)
	}
	if input.Description != nil {
		updates = append(updates, "description = ?")
		args = append(args, *input.Description)
	}

	if len(updates) == 0 {
		return site, nil
	}

	updates = append(updates, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, id)

	query := fmt.Sprintf("UPDATE waf_sites SET %s WHERE id = ?", strings.Join(updates, ", "))
	_, err = s.db.Exec(query, args...)
	if err != nil {
		return nil, err
	}

	// Regenerate HAProxy config if WAF is installed
	if s.corazaMgr.IsInstalled() {
		s.haproxyMgr.GenerateWAFConfig(s.db)
		s.haproxyMgr.Reload()
	}

	return s.GetSite(id)
}

// DeleteSite removes a WAF-protected site.
func (s *WAFService) DeleteSite(id int) error {
	_, err := s.db.Exec("DELETE FROM waf_sites WHERE id = ?", id)
	if err != nil {
		return err
	}

	// Regenerate HAProxy config
	if s.corazaMgr.IsInstalled() {
		s.haproxyMgr.GenerateWAFConfig(s.db)
		s.haproxyMgr.Reload()
	}

	return nil
}

// ToggleSite enables or disables a site.
func (s *WAFService) ToggleSite(id int, enabled bool) error {
	_, err := s.db.Exec("UPDATE waf_sites SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", enabled, id)
	if err != nil {
		return err
	}

	if s.corazaMgr.IsInstalled() {
		s.haproxyMgr.GenerateWAFConfig(s.db)
		s.haproxyMgr.Reload()
	}

	return nil
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

// ListRules returns all WAF rules with optional filters.
func (s *WAFService) ListRules(ruleType, category string, enabled *bool) ([]WAFRule, error) {
	query := `
		SELECT id, name, rule_type, category, phase, action, rule_content, enabled,
		       priority, log_level, description, rule_group, owasp_rule_id,
		       created_at, updated_at
		FROM waf_rules WHERE 1=1
	`
	args := []interface{}{}

	if ruleType != "" {
		query += " AND rule_type = ?"
		args = append(args, ruleType)
	}
	if category != "" {
		query += " AND category = ?"
		args = append(args, category)
	}
	if enabled != nil {
		query += " AND enabled = ?"
		args = append(args, *enabled)
	}

	query += " ORDER BY priority ASC, created_at DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []WAFRule
	for rows.Next() {
		var rule WAFRule
		err := rows.Scan(
			&rule.ID, &rule.Name, &rule.RuleType, &rule.Category, &rule.Phase,
			&rule.Action, &rule.RuleContent, &rule.Enabled, &rule.Priority,
			&rule.LogLevel, &rule.Description, &rule.RuleGroup, &rule.OWASPRuleID,
			&rule.CreatedAt, &rule.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		rules = append(rules, rule)
	}

	return rules, nil
}

// GetRule returns a single rule by ID.
func (s *WAFService) GetRule(id int) (*WAFRule, error) {
	var rule WAFRule
	err := s.db.QueryRow(`
		SELECT id, name, rule_type, category, phase, action, rule_content, enabled,
		       priority, log_level, description, rule_group, owasp_rule_id,
		       created_at, updated_at
		FROM waf_rules WHERE id = ?
	`, id).Scan(
		&rule.ID, &rule.Name, &rule.RuleType, &rule.Category, &rule.Phase,
		&rule.Action, &rule.RuleContent, &rule.Enabled, &rule.Priority,
		&rule.LogLevel, &rule.Description, &rule.RuleGroup, &rule.OWASPRuleID,
		&rule.CreatedAt, &rule.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &rule, nil
}

// CreateRule creates a new WAF rule.
func (s *WAFService) CreateRule(input WAFRuleInput) (*WAFRule, error) {
	phase := 1
	if input.Phase != nil {
		phase = *input.Phase
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	priority := 100
	if input.Priority != nil {
		priority = *input.Priority
	}
	logLevel := "alert"
	if input.LogLevel != "" {
		logLevel = input.LogLevel
	}

	result, err := s.db.Exec(`
		INSERT INTO waf_rules (name, rule_type, category, phase, action, rule_content,
			enabled, priority, log_level, description, rule_group, owasp_rule_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		input.Name, input.RuleType, input.Category, phase, input.Action,
		input.RuleContent, enabled, priority, logLevel, input.Description,
		input.RuleGroup, input.OWASPRuleID,
	)
	if err != nil {
		return nil, err
	}

	id, _ := result.LastInsertId()
	if err := s.regenerateCorazaRules(); err != nil {
		logger.Warn().Err(err).Msg("failed to regenerate coraza rules")
	}

	return s.GetRule(int(id))
}

// UpdateRule updates an existing rule.
func (s *WAFService) UpdateRule(id int, input WAFRuleInput) (*WAFRule, error) {
	updates := []string{}
	args := []interface{}{}

	if input.Name != "" {
		updates = append(updates, "name = ?")
		args = append(args, input.Name)
	}
	if input.RuleType != "" {
		updates = append(updates, "rule_type = ?")
		args = append(args, input.RuleType)
	}
	if input.Category != "" {
		updates = append(updates, "category = ?")
		args = append(args, input.Category)
	}
	if input.Phase != nil {
		updates = append(updates, "phase = ?")
		args = append(args, *input.Phase)
	}
	if input.Action != "" {
		updates = append(updates, "action = ?")
		args = append(args, input.Action)
	}
	if input.RuleContent != "" {
		updates = append(updates, "rule_content = ?")
		args = append(args, input.RuleContent)
	}
	if input.Enabled != nil {
		updates = append(updates, "enabled = ?")
		args = append(args, *input.Enabled)
	}
	if input.Priority != nil {
		updates = append(updates, "priority = ?")
		args = append(args, *input.Priority)
	}
	if input.LogLevel != "" {
		updates = append(updates, "log_level = ?")
		args = append(args, input.LogLevel)
	}
	if input.Description != nil {
		updates = append(updates, "description = ?")
		args = append(args, *input.Description)
	}
	if input.RuleGroup != nil {
		updates = append(updates, "rule_group = ?")
		args = append(args, *input.RuleGroup)
	}

	if len(updates) == 0 {
		return s.GetRule(id)
	}

	updates = append(updates, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, id)

	query := fmt.Sprintf("UPDATE waf_rules SET %s WHERE id = ?", strings.Join(updates, ", "))
	_, err := s.db.Exec(query, args...)
	if err != nil {
		return nil, err
	}

	if err := s.regenerateCorazaRules(); err != nil {
		logger.Warn().Err(err).Msg("failed to regenerate coraza rules")
	}

	return s.GetRule(id)
}

// DeleteRule removes a WAF rule.
func (s *WAFService) DeleteRule(id int) error {
	_, err := s.db.Exec("DELETE FROM waf_rules WHERE id = ?", id)
	if err != nil {
		return err
	}

	if err := s.regenerateCorazaRules(); err != nil {
		logger.Warn().Err(err).Msg("failed to regenerate coraza rules")
	}

	return nil
}

// ToggleRule enables or disables a rule.
func (s *WAFService) ToggleRule(id int, enabled bool) error {
	_, err := s.db.Exec("UPDATE waf_rules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", enabled, id)
	if err != nil {
		return err
	}

	if err := s.regenerateCorazaRules(); err != nil {
		logger.Warn().Err(err).Msg("failed to regenerate coraza rules")
	}

	return nil
}

// ---------------------------------------------------------------------------
// OWASP Categories
// ---------------------------------------------------------------------------

// ListOWASPCategories returns all OWASP rule categories.
func (s *WAFService) ListOWASPCategories() ([]WAFOWASPCategory, error) {
	rows, err := s.db.Query(`
		SELECT id, category_id, name, description, enabled, severity, mitre_technique
		FROM waf_owasp_categories
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []WAFOWASPCategory
	for rows.Next() {
		var cat WAFOWASPCategory
		err := rows.Scan(&cat.ID, &cat.CategoryID, &cat.Name, &cat.Description,
			&cat.Enabled, &cat.Severity, &cat.MitreTech)
		if err != nil {
			return nil, err
		}
		cats = append(cats, cat)
	}

	return cats, nil
}

// UpdateOWASPCategory toggles an OWASP category.
func (s *WAFService) UpdateOWASPCategory(categoryID string, enabled bool) error {
	_, err := s.db.Exec(
		"UPDATE waf_owasp_categories SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE category_id = ?",
		enabled, categoryID,
	)
	if err != nil {
		return err
	}

	if err := s.regenerateCorazaRules(); err != nil {
		logger.Warn().Err(err).Msg("failed to regenerate coraza rules")
	}

	return nil
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// GetSettings returns global WAF settings.
func (s *WAFService) GetSettings() (*WAFSettings, error) {
	rows, err := s.db.Query("SELECT key, value FROM waf_settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := &WAFSettings{
		GeoBlockedCountries: []string{},
		WhitelistedIPs:      []string{},
		BlacklistedIPs:      []string{},
	}

	values := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			continue
		}
		values[key] = value
	}

	if v, ok := values["global_mode"]; ok {
		settings.GlobalMode = v
	}
	if v, ok := values["owasp_rules_enabled"]; ok {
		settings.OWASPRulesEnabled = v == "true" || v == "1"
	}
	if v, ok := values["owasp_ruleset_version"]; ok {
		settings.OWASPRulesetVersion = v
	}
	if v, ok := values["paranoia_level"]; ok {
		fmt.Sscanf(v, "%d", &settings.ParanoiaLevel)
	}
	if v, ok := values["anomaly_threshold"]; ok {
		fmt.Sscanf(v, "%f", &settings.AnomalyThreshold)
	}
	if v, ok := values["log_requests"]; ok {
		settings.LogRequests = v
	}
	if v, ok := values["log_retention_days"]; ok {
		fmt.Sscanf(v, "%d", &settings.LogRetentionDays)
	}
	if v, ok := values["log_request_body"]; ok {
		settings.LogRequestBody = v == "true" || v == "1"
	}
	if v, ok := values["geo_blocking_enabled"]; ok {
		settings.GeoBlockingEnabled = v == "true" || v == "1"
	}
	if v, ok := values["geo_blocked_countries"]; ok {
		json.Unmarshal([]byte(v), &settings.GeoBlockedCountries)
	}
	if v, ok := values["whitelist_ips"]; ok {
		json.Unmarshal([]byte(v), &settings.WhitelistedIPs)
	}
	if v, ok := values["blacklist_ips"]; ok {
		json.Unmarshal([]byte(v), &settings.BlacklistedIPs)
	}
	if v, ok := values["service_status"]; ok {
		settings.ServiceStatus = v
	}

	return settings, nil
}

// UpdateSettings updates global WAF settings.
func (s *WAFService) UpdateSettings(settings WAFSettings) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	updates := map[string]string{
		"global_mode":           settings.GlobalMode,
		"owasp_rules_enabled":   boolToStr(settings.OWASPRulesEnabled),
		"paranoia_level":        fmt.Sprintf("%d", settings.ParanoiaLevel),
		"anomaly_threshold":     fmt.Sprintf("%.1f", settings.AnomalyThreshold),
		"log_requests":          settings.LogRequests,
		"log_retention_days":    fmt.Sprintf("%d", settings.LogRetentionDays),
		"log_request_body":      boolToStr(settings.LogRequestBody),
		"geo_blocking_enabled":  boolToStr(settings.GeoBlockingEnabled),
		"geo_blocked_countries": toJSON(settings.GeoBlockedCountries),
		"whitelist_ips":         toJSON(settings.WhitelistedIPs),
		"blacklist_ips":          toJSON(settings.BlacklistedIPs),
	}

	for key, value := range updates {
		if _, err := tx.Exec(
			"UPDATE waf_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
			value, key,
		); err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	if err := s.regenerateCorazaRules(); err != nil {
		logger.Warn().Err(err).Msg("failed to regenerate coraza rules")
	}

	return nil
}

// ---------------------------------------------------------------------------
// IP Management
// ---------------------------------------------------------------------------

// ListIPEntries returns all IP entries for whitelist/blacklist.
func (s *WAFService) ListIPEntries(listType string) ([]WAFIPEntry, error) {
	query := `
		SELECT id, ip_address, list_type, description, expires_at, created_at
		FROM waf_ip_list WHERE 1=1
	`
	args := []interface{}{}

	if listType != "" {
		query += " AND list_type = ?"
		args = append(args, listType)
	}

	query += " ORDER BY created_at DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []WAFIPEntry
	for rows.Next() {
		var entry WAFIPEntry
		err := rows.Scan(&entry.ID, &entry.IPAddress, &entry.ListType,
			&entry.Description, &entry.ExpiresAt, &entry.CreatedAt)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}

	return entries, nil
}

// AddIPEntry adds an IP to whitelist or blacklist.
func (s *WAFService) AddIPEntry(ipAddress, listType string, description *string, expiresAt *time.Time) (*WAFIPEntry, error) {
	result, err := s.db.Exec(`
		INSERT INTO waf_ip_list (ip_address, list_type, description, expires_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(ip_address, list_type) DO UPDATE SET
			description = excluded.description, expires_at = excluded.expires_at
	`, ipAddress, listType, description, expiresAt)
	if err != nil {
		return nil, err
	}

	id, _ := result.LastInsertId()
	var entry WAFIPEntry
	s.db.QueryRow(`
		SELECT id, ip_address, list_type, description, expires_at, created_at
		FROM waf_ip_list WHERE id = ?
	`, id).Scan(&entry.ID, &entry.IPAddress, &entry.ListType,
		&entry.Description, &entry.ExpiresAt, &entry.CreatedAt)

	if err := s.regenerateCorazaRules(); err != nil {
		logger.Warn().Err(err).Msg("failed to regenerate coraza rules")
	}

	return &entry, nil
}

// RemoveIPEntry removes an IP from the list.
func (s *WAFService) RemoveIPEntry(id int) error {
	_, err := s.db.Exec("DELETE FROM waf_ip_list WHERE id = ?", id)
	if err != nil {
		return err
	}

	if err := s.regenerateCorazaRules(); err != nil {
		logger.Warn().Err(err).Msg("failed to regenerate coraza rules")
	}

	return nil
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

// GetStats returns aggregated WAF statistics.
func (s *WAFService) GetStats(siteID *int, period, periodKey string) (*WAFStats, error) {
	return s.logService.GetStats(siteID, period, periodKey)
}

// GetOverviewStats returns dashboard overview statistics.
func (s *WAFService) GetOverviewStats() (*WAFStats, error) {
	return s.logService.GetOverviewStats()
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

// GetLogs returns WAF logs with filtering and pagination.
func (s *WAFService) GetLogs(query WAFLogQuery) ([]WAFLogEntry, int, error) {
	return s.logService.GetLogs(query)
}

// ClearLogs removes WAF logs older than a specified date.
func (s *WAFService) ClearLogs(beforeDate string) error {
	_, err := s.db.Exec("DELETE FROM waf_logs WHERE timestamp < ?", beforeDate)
	return err
}

// ---------------------------------------------------------------------------
// Config Generation
// ---------------------------------------------------------------------------

// generateCorazaConfig generates the main Coraza configuration file.
func (s *WAFService) generateCorazaConfig() error {
	config, err := s.corazaMgr.GenerateConfig(s.db)
	if err != nil {
		return err
	}

	dir := filepath.Dir(s.corazaMgr.GetConfigPath())
	os.MkdirAll(dir, 0755)

	return os.WriteFile(s.corazaMgr.GetConfigPath(), []byte(config), 0644)
}

// generateSPOEConfig generates the SPOE configuration for HAProxy.
func (s *WAFService) generateSPOEConfig() error {
	config := `# Coraza SPOE Configuration for HAProxy
# Auto-generated by ITDLUPanel

[coraza]
    include /etc/coraza-spoa/coraza.conf

[messages]
    message check-request
        version 1
        args method path version query headers body

    message check-response
        version 1
        args status headers body

[actions]
    action set-variable % TX.coraza.action % VAR.action
    action set-variable % TX.coraza.fail % VAR.fail

[format option]
    option format standard

[engine]
    debug on
`

	dir := filepath.Dir(s.corazaMgr.GetSPOAConfigPath())
	os.MkdirAll(dir, 0755)

	return os.WriteFile(s.corazaMgr.GetSPOAConfigPath(), []byte(config), 0644)
}

// regenerateCorazaRules regenerates the Coraza rules config from database.
func (s *WAFService) regenerateCorazaRules() error {
	if !s.corazaMgr.IsInstalled() {
		return nil
	}

	if err := s.generateCorazaConfig(); err != nil {
		return err
	}

	// Restart Coraza to reload rules
	s.corazaMgr.Restart()
	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// countryNameFromCode maps ISO country codes to human-readable names.
func countryNameFromCode(code string) string {
	names := map[string]string{
		"CN": "China", "RU": "Russia", "KR": "South Korea", "IR": "Iran",
		"BY": "Belarus", "NG": "Nigeria", "IN": "India", "PK": "Pakistan",
		"VN": "Vietnam", "US": "United States", "DE": "Germany", "GB": "United Kingdom",
		"JP": "Japan", "SG": "Singapore", "BR": "Brazil", "ID": "Indonesia",
		"TH": "Thailand", "MY": "Malaysia", "PH": "Philippines", "AU": "Australia",
		"CA": "Canada", "FR": "France", "ES": "Spain", "IT": "Italy", "NL": "Netherlands",
		"TR": "Turkey", "MX": "Mexico", "AR": "Argentina", "PL": "Poland",
		"UA": "Ukraine", "RO": "Romania", "CZ": "Czech Republic", "HU": "Hungary",
		"SE": "Sweden", "NO": "Norway", "DK": "Denmark", "FI": "Finland",
		"AT": "Austria", "BE": "Belgium", "CH": "Switzerland", "PT": "Portugal",
		"GR": "Greece", "IL": "Israel", "AE": "UAE", "SA": "Saudi Arabia",
		"EG": "Egypt", "ZA": "South Africa", "CO": "Colombia", "CL": "Chile",
		"PE": "Peru", "TW": "Taiwan", "HK": "Hong Kong",
		"BD": "Bangladesh", "LK": "Sri Lanka", "NP": "Nepal",
		"KH": "Cambodia", "NZ": "New Zealand",
	}
	if name, ok := names[code]; ok {
		return name
	}
	return code
}

// ---------------------------------------------------------------------------
// Traffic Monitoring
// ---------------------------------------------------------------------------

// GetTrafficStats returns traffic statistics for a period.
func (s *WAFService) GetTrafficStats(siteID *int, period string) (*WAFTrafficStats, error) {
	stats := &WAFTrafficStats{Period: period}
	now := time.Now()
	var since time.Time
	switch period {
	case "hourly":
		since = now.Add(-24 * time.Hour)
		stats.PeriodKey = since.Format("15:04")
	case "daily":
		since = now.AddDate(0, 0, -30)
		stats.PeriodKey = since.Format("2006-01-02")
	default:
		since = now.Add(-24 * time.Hour)
		stats.PeriodKey = since.Format("15:04")
	}

	args := []interface{}{since}
	siteClause := ""
	if siteID != nil {
		siteClause = " AND site_id = ?"
		args = append(args, *siteID)
	}

	// Total from traffic_stats table
	row := s.db.QueryRow(`
		SELECT COALESCE(SUM(total_bytes_in),0), COALESCE(SUM(total_bytes_out),0),
		       COALESCE(SUM(total_requests),0), COALESCE(SUM(blocked_requests),0),
		       COALESCE(AVG(avg_response_ms),0)
		FROM waf_traffic_stats
		WHERE created_at >= ?`+siteClause, args...)
	row.Scan(&stats.TotalBytesIn, &stats.TotalBytesOut, &stats.TotalRequests,
		&stats.BlockedRequests, &stats.AvgResponseMs)

	// Fallback: derive from logs
	if stats.TotalRequests == 0 {
		row2 := s.db.QueryRow(`
			SELECT COUNT(*) as total, COUNT(CASE WHEN action_taken='blocked' THEN 1 END) as blocked
			FROM waf_logs WHERE timestamp >= ?`+siteClause, args...)
		row2.Scan(&stats.TotalRequests, &stats.BlockedRequests)
	}

	// Traffic by hour
	rows, err := s.db.Query(`
		SELECT COALESCE(SUM(total_requests),0), COALESCE(SUM(blocked_requests),0),
		       COALESCE(AVG(avg_response_ms),0), hour
		FROM waf_traffic_stats
		WHERE created_at >= ? AND hour IS NOT NULL`+siteClause+`
		GROUP BY hour ORDER BY hour
	`, args...)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var th WAFTrafficHour
			var hour string
			rows.Scan(&th.TotalRequests, &th.BlockedRequests, &th.AvgResponseMs, &hour)
			th.Hour = hour + ":00"
			stats.TrafficByHour = append(stats.TrafficByHour, th)
		}
	}

	// Fallback: derive hourly from logs
	if len(stats.TrafficByHour) == 0 && stats.TotalRequests > 0 {
		rows2, err2 := s.db.Query(`
			SELECT strftime('%H:00', timestamp) as hour,
			       COUNT(*) as total,
			       COUNT(CASE WHEN action_taken='blocked' THEN 1 END) as blocked
			FROM waf_logs
			WHERE timestamp >= ?`+siteClause+`
			GROUP BY hour ORDER BY hour
		`, args...)
		if err2 == nil {
			defer rows2.Close()
			for rows2.Next() {
				var th WAFTrafficHour
				rows2.Scan(&th.Hour, &th.TotalRequests, &th.BlockedRequests)
				stats.TrafficByHour = append(stats.TrafficByHour, th)
			}
		}
	}

	// Top countries
	rows3, err := s.db.Query(`
		SELECT geo_country,
		       COUNT(*) as total,
		       COUNT(CASE WHEN action_taken='blocked' THEN 1 END) as blocked,
		       COUNT(DISTINCT client_ip) as unique_ips
		FROM waf_logs
		WHERE timestamp >= ? AND geo_country IS NOT NULL AND geo_country != ''`+siteClause+`
		GROUP BY geo_country ORDER BY total DESC LIMIT 10
	`, args...)
	if err == nil {
		defer rows3.Close()
		for rows3.Next() {
			var ge WAFGeoEntry
			rows3.Scan(&ge.CountryCode, &ge.TotalRequests, &ge.BlockedRequests, &ge.UniqueIPs)
			ge.CountryName = countryNameFromCode(ge.CountryCode)
			stats.TopCountries = append(stats.TopCountries, ge)
		}
	}

	// Top clients
	rows4, err := s.db.Query(`
		SELECT client_ip, COUNT(*) as cnt
		FROM waf_logs
		WHERE timestamp >= ?`+siteClause+`
		GROUP BY client_ip ORDER BY cnt DESC LIMIT 10
	`, args...)
	if err == nil {
		defer rows4.Close()
		for rows4.Next() {
			var ip IPStat
			rows4.Scan(&ip.IP, &ip.Count)
			stats.TopClients = append(stats.TopClients, ip)
		}
	}

	return stats, nil
}

// GetSlowRequests returns slow requests.
func (s *WAFService) GetSlowRequests(siteID *int, limit int) ([]WAFSlowRequest, error) {
	args := []interface{}{}
	where := ""
	if siteID != nil {
		where = " WHERE site_id = ?"
		args = append(args, *siteID)
	}
	args = append(args, limit)

	query := fmt.Sprintf(`
		SELECT wsr.id, wsr.site_id, ws.name, wsr.client_ip, wl.geo_country,
		       wsr.method, wsr.uri, wsr.host, wsr.response_ms, wsr.threshold_ms, wsr.timestamp
		FROM waf_slow_requests wsr
		LEFT JOIN waf_sites ws ON wsr.site_id = ws.id
		LEFT JOIN waf_logs wl ON wsr.log_id = wl.id
		%s
		ORDER BY wsr.response_ms DESC LIMIT ?
	`, where)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []WAFSlowRequest
	for rows.Next() {
		var sr WAFSlowRequest
		err := rows.Scan(&sr.ID, &sr.SiteID, &sr.SiteName, &sr.ClientIP, &sr.GeoCountry,
			&sr.Method, &sr.URI, &sr.Host, &sr.ResponseMs, &sr.ThresholdMs, &sr.Timestamp)
		if err != nil {
			continue
		}
		results = append(results, sr)
	}
	return results, nil
}

// ---------------------------------------------------------------------------
// URI Management
// ---------------------------------------------------------------------------

// ListURIEntries returns URI whitelist/blacklist entries.
func (s *WAFService) ListURIEntries(listType string) ([]WAFURIEntry, error) {
	query := `SELECT id, uri_pattern, list_type, action, description, enabled, priority, created_at
	          FROM waf_uri_list WHERE 1=1`
	args := []interface{}{}
	if listType != "" {
		query += " AND list_type = ?"
		args = append(args, listType)
	}
	query += " ORDER BY priority ASC, created_at DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []WAFURIEntry
	for rows.Next() {
		var e WAFURIEntry
		err := rows.Scan(&e.ID, &e.URIPattern, &e.ListType, &e.Action,
			&e.Description, &e.Enabled, &e.Priority, &e.CreatedAt)
		if err == nil {
			entries = append(entries, e)
		}
	}
	return entries, nil
}

// AddURIEntry adds a URI to whitelist/blacklist.
func (s *WAFService) AddURIEntry(uriPattern, listType, action string, description *string, priority *int) (*WAFURIEntry, error) {
	if action == "" {
		action = "block"
	}
	p := 100
	if priority != nil {
		p = *priority
	}
	result, err := s.db.Exec(`
		INSERT INTO waf_uri_list (uri_pattern, list_type, action, description, priority)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(uri_pattern, list_type) DO UPDATE SET
			description = excluded.description, priority = excluded.priority
	`, uriPattern, listType, action, description, p)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	var entry WAFURIEntry
	s.db.QueryRow(`SELECT id, uri_pattern, list_type, action, description, enabled, priority, created_at
		FROM waf_uri_list WHERE id = ?`, id).
		Scan(&entry.ID, &entry.URIPattern, &entry.ListType, &entry.Action,
			&entry.Description, &entry.Enabled, &entry.Priority, &entry.CreatedAt)
	return &entry, nil
}

// RemoveURIEntry removes a URI entry.
func (s *WAFService) RemoveURIEntry(id int) error {
	_, err := s.db.Exec("DELETE FROM waf_uri_list WHERE id = ?", id)
	return err
}

// ToggleURIEntry enables or disables a URI entry.
func (s *WAFService) ToggleURIEntry(id int, enabled bool) error {
	_, err := s.db.Exec("UPDATE waf_uri_list SET enabled = ? WHERE id = ?", enabled, id)
	return err
}

// ---------------------------------------------------------------------------
// Lua Scripts
// ---------------------------------------------------------------------------

// ListLuaScripts returns all Lua scripts.
func (s *WAFService) ListLuaScripts() ([]WAFLuaScript, error) {
	rows, err := s.db.Query(`
		SELECT id, name, description, script_content, enabled, priority, created_at
		FROM waf_lua_scripts ORDER BY priority ASC, created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var scripts []WAFLuaScript
	for rows.Next() {
		var scr WAFLuaScript
		err := rows.Scan(&scr.ID, &scr.Name, &scr.Description, &scr.ScriptContent,
			&scr.Enabled, &scr.Priority, &scr.CreatedAt)
		if err == nil {
			scripts = append(scripts, scr)
		}
	}
	return scripts, nil
}

// CreateLuaScript creates a new Lua script.
func (s *WAFService) CreateLuaScript(input WAFLuaScriptInput) (*WAFLuaScript, error) {
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	p := 100
	if input.Priority != nil {
		p = *input.Priority
	}
	result, err := s.db.Exec(`
		INSERT INTO waf_lua_scripts (name, description, script_content, enabled, priority)
		VALUES (?, ?, ?, ?, ?)
	`, input.Name, input.Description, input.ScriptContent, enabled, p)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	var script WAFLuaScript
	s.db.QueryRow(`SELECT id, name, description, script_content, enabled, priority, created_at
		FROM waf_lua_scripts WHERE id = ?`, id).
		Scan(&script.ID, &script.Name, &script.Description, &script.ScriptContent,
			&script.Enabled, &script.Priority, &script.CreatedAt)
	return &script, nil
}

// UpdateLuaScript updates a Lua script.
func (s *WAFService) UpdateLuaScript(id int, input WAFLuaScriptInput) (*WAFLuaScript, error) {
	updates := []string{}
	args := []interface{}{}
	if input.Name != "" {
		updates = append(updates, "name = ?"); args = append(args, input.Name)
	}
	if input.Description != nil {
		updates = append(updates, "description = ?"); args = append(args, *input.Description)
	}
	if input.ScriptContent != "" {
		updates = append(updates, "script_content = ?"); args = append(args, input.ScriptContent)
	}
	if input.Enabled != nil {
		updates = append(updates, "enabled = ?"); args = append(args, *input.Enabled)
	}
	if input.Priority != nil {
		updates = append(updates, "priority = ?"); args = append(args, *input.Priority)
	}
	if len(updates) > 0 {
		updates = append(updates, "updated_at = CURRENT_TIMESTAMP")
		args = append(args, id)
		query := fmt.Sprintf("UPDATE waf_lua_scripts SET %s WHERE id = ?", strings.Join(updates, ", "))
		s.db.Exec(query, args...)
	}
	var script WAFLuaScript
	s.db.QueryRow(`SELECT id, name, description, script_content, enabled, priority, created_at
		FROM waf_lua_scripts WHERE id = ?`, id).
		Scan(&script.ID, &script.Name, &script.Description, &script.ScriptContent,
			&script.Enabled, &script.Priority, &script.CreatedAt)
	return &script, nil
}

// DeleteLuaScript deletes a Lua script.
func (s *WAFService) DeleteLuaScript(id int) error {
	_, err := s.db.Exec("DELETE FROM waf_lua_scripts WHERE id = ?", id)
	return err
}

// ToggleLuaScript enables or disables a Lua script.
func (s *WAFService) ToggleLuaScript(id int, enabled bool) error {
	_, err := s.db.Exec("UPDATE waf_lua_scripts SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", enabled, id)
	return err
}

// ---------------------------------------------------------------------------
// User-Agent List
// ---------------------------------------------------------------------------

// ListUAEntries returns User-Agent whitelist/blacklist entries.
func (s *WAFService) ListUAEntries(listType string) ([]WAFUAEntry, error) {
	query := `SELECT id, ua_pattern, list_type, description, enabled, created_at FROM waf_ua_list WHERE 1=1`
	args := []interface{}{}
	if listType != "" {
		query += " AND list_type = ?"; args = append(args, listType)
	}
	query += " ORDER BY created_at DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []WAFUAEntry
	for rows.Next() {
		var e WAFUAEntry
		err := rows.Scan(&e.ID, &e.UAPattern, &e.ListType, &e.Description, &e.Enabled, &e.CreatedAt)
		if err == nil {
			entries = append(entries, e)
		}
	}
	return entries, nil
}

// AddUAEntry adds a User-Agent to whitelist/blacklist.
func (s *WAFService) AddUAEntry(uaPattern, listType string, description *string) (*WAFUAEntry, error) {
	result, err := s.db.Exec(`
		INSERT INTO waf_ua_list (ua_pattern, list_type, description)
		VALUES (?, ?, ?)
		ON CONFLICT(ua_pattern, list_type) DO UPDATE SET description = excluded.description
	`, uaPattern, listType, description)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	var entry WAFUAEntry
	s.db.QueryRow(`SELECT id, ua_pattern, list_type, description, enabled, created_at
		FROM waf_ua_list WHERE id = ?`, id).
		Scan(&entry.ID, &entry.UAPattern, &entry.ListType, &entry.Description,
			&entry.Enabled, &entry.CreatedAt)
	return &entry, nil
}

// RemoveUAEntry removes a User-Agent entry.
func (s *WAFService) RemoveUAEntry(id int) error {
	_, err := s.db.Exec("DELETE FROM waf_ua_list WHERE id = ?", id)
	return err
}

// ToggleUAEntry enables or disables a User-Agent entry.
func (s *WAFService) ToggleUAEntry(id int, enabled bool) error {
	_, err := s.db.Exec("UPDATE waf_ua_list SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", enabled, id)
	return err
}

// ---------------------------------------------------------------------------
// Geo Statistics
// ---------------------------------------------------------------------------

// GetGeoStats returns geographic attack statistics.
func (s *WAFService) GetGeoStats(siteID *int, period string) (*WAFGeoStats, error) {
	now := time.Now()
	var since time.Time
	switch period {
	case "hourly":
		since = now.Add(-24 * time.Hour)
	case "daily":
		since = now.AddDate(0, 0, -30)
	default:
		since = now.Add(-24 * time.Hour)
	}
	args := []interface{}{since}
	siteClause := ""
	if siteID != nil {
		siteClause = " AND site_id = ?"; args = append(args, *siteID)
	}

	stats := &WAFGeoStats{}
	rows, err := s.db.Query(`
		SELECT geo_country, COUNT(*) as total,
		       COUNT(CASE WHEN action_taken='blocked' THEN 1 END) as blocked,
		       COUNT(DISTINCT client_ip) as unique_ips
		FROM waf_logs
		WHERE timestamp >= ? AND geo_country IS NOT NULL AND geo_country != ''`+siteClause+`
		GROUP BY geo_country ORDER BY total DESC LIMIT 20
	`, args...)
	if err != nil {
		return stats, nil
	}
	defer rows.Close()
	for rows.Next() {
		var ge WAFGeoEntry
		rows.Scan(&ge.CountryCode, &ge.TotalRequests, &ge.BlockedRequests, &ge.UniqueIPs)
		ge.CountryName = countryNameFromCode(ge.CountryCode)
		stats.TopCountries = append(stats.TopCountries, ge)
		stats.TotalCountries++
	}

	rows2, err := s.db.Query(`
		SELECT geo_country, COUNT(*) as blocked
		FROM waf_logs
		WHERE timestamp >= ? AND action_taken='blocked'
		      AND geo_country IS NOT NULL AND geo_country != ''`+siteClause+`
		GROUP BY geo_country ORDER BY blocked DESC LIMIT 10
	`, args...)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var ge WAFGeoEntry
			rows2.Scan(&ge.CountryCode, &ge.BlockedRequests)
			ge.CountryName = countryNameFromCode(ge.CountryCode)
			stats.BlockedByCountry = append(stats.BlockedByCountry, ge)
		}
	}
	return stats, nil
}

// ---------------------------------------------------------------------------
// Attack Feed (Real-time)
// ---------------------------------------------------------------------------

// GetAttackFeed returns the latest blocked events for real-time feed.
func (s *WAFService) GetAttackFeed(limit int) ([]WAFAttackFeedEntry, error) {
	rows, err := s.db.Query(`
		SELECT wl.id, wl.timestamp, wl.client_ip, wl.geo_country,
		       wl.method, wl.uri, wl.host, wl.rule_id, wl.rule_message,
		       wl.rule_category, wl.rule_severity, wl.action_taken,
		       wl.anomaly_score, wl.user_agent, wl.response_code,
		       wl.site_id, ws.name
		FROM waf_logs wl
		LEFT JOIN waf_sites ws ON wl.site_id = ws.id
		WHERE wl.action_taken = 'blocked'
		ORDER BY wl.timestamp DESC LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var feed []WAFAttackFeedEntry
	for rows.Next() {
		var fe WAFAttackFeedEntry
		err := rows.Scan(&fe.ID, &fe.Timestamp, &fe.ClientIP, &fe.GeoCountry,
			&fe.Method, &fe.URI, &fe.Host, &fe.RuleID, &fe.RuleMessage,
			&fe.RuleCategory, &fe.RuleSeverity, &fe.ActionTaken,
			&fe.AnomalyScore, &fe.UserAgent, &fe.ResponseCode,
			&fe.SiteID, &fe.SiteName)
		if err == nil {
			feed = append(feed, fe)
		}
	}
	return feed, nil
}

// ---------------------------------------------------------------------------
// IP Entry Updates
// ---------------------------------------------------------------------------

// UpdateIPEntry updates an IP entry description or expiry.
func (s *WAFService) UpdateIPEntry(id int, description *string, expiresAt *time.Time) (*WAFIPEntry, error) {
	_, err := s.db.Exec(`UPDATE waf_ip_list SET description = ?, expires_at = ? WHERE id = ?`,
		description, expiresAt, id)
	if err != nil {
		return nil, err
	}
	var entry WAFIPEntry
	err = s.db.QueryRow(`SELECT id, ip_address, list_type, description, expires_at, created_at,
		COALESCE(hit_count,0), last_hit, COALESCE(is_cidr,0), COALESCE(source,'manual')
		FROM waf_ip_list WHERE id = ?`, id).
		Scan(&entry.ID, &entry.IPAddress, &entry.ListType, &entry.Description,
			&entry.ExpiresAt, &entry.CreatedAt, &entry.HitCount, &entry.LastHit,
			&entry.IsCIDR, &entry.Source)
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

// ClearIPHits clears the hit count for an IP entry.
func (s *WAFService) ClearIPHits(id int) error {
	_, err := s.db.Exec("UPDATE waf_ip_list SET hit_count = 0, last_hit = NULL WHERE id = ?", id)
	return err
}

func (s *WAFService) updateSetting(key, value string) {
	s.db.Exec("UPDATE waf_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?", key, value)
}

func boolToStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func toJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}
