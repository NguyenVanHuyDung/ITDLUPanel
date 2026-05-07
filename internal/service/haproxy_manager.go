package service

import (
	"database/sql"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

const (
	haproxyConfigPath = "/etc/haproxy/haproxy.cfg"
	haproxyWAFConfigPath = "/etc/haproxy/waf-frontend.cfg"
)

// HAProxyManager handles HAProxy configuration and management.
type HAProxyManager struct{}

// NewHAProxyManager creates a new HAProxy manager.
func NewHAProxyManager() *HAProxyManager {
	return &HAProxyManager{}
}

// GetConfigPath returns the main HAProxy config path.
func (m *HAProxyManager) GetConfigPath() string {
	return haproxyConfigPath
}

// IsInstalled checks if HAProxy is installed.
func (m *HAProxyManager) IsInstalled() bool {
	_, err := exec.LookPath("haproxy")
	return err == nil
}

// Install installs HAProxy.
func (m *HAProxyManager) Install() error {
	logger.Info().Msg("Installing HAProxy...")

	cmds := []string{
		"apt-get update -qq",
		"DEBIAN_FRONTEND=noninteractive apt-get install -y -qq haproxy",
	}

	for _, cmd := range cmds {
		c := exec.Command("sh", "-c", cmd)
		if out, err := c.CombinedOutput(); err != nil {
			logger.Error().Err(err).Str("output", string(out)).Msg("HAProxy install failed")
			return fmt.Errorf("failed to install HAProxy: %w", err)
		}
	}

	// Create default config if not exists
	if _, err := os.Stat(haproxyConfigPath); os.IsNotExist(err) {
		m.createDefaultConfig()
	}

	logger.Info().Msg("HAProxy installed successfully")
	return nil
}

// createDefaultConfig creates a basic HAProxy configuration.
func (m *HAProxyManager) createDefaultConfig() {
	config := `global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    timeout connect 5000
    timeout client  50000
    timeout server  50000
    errorfile 400 /etc/haproxy/errors/400.http
    errorfile 403 /etc/haproxy/errors/403.http
    errorfile 408 /etc/haproxy/errors/408.http
    errorfile 500 /etc/haproxy/errors/500.http
    errorfile 502 /etc/haproxy/errors/502.http
    errorfile 503 /etc/haproxy/errors/503.http
    errorfile 504 /etc/haproxy/errors/504.http
`
	os.WriteFile(haproxyConfigPath, []byte(config), 0644)
}

// Reload reloads HAProxy configuration with zero-downtime.
func (m *HAProxyManager) Reload() error {
	if !m.IsInstalled() {
		return fmt.Errorf("HAProxy is not installed")
	}

	// Validate config first
	if err := m.ValidateConfig(); err != nil {
		logger.Error().Err(err).Msg("HAProxy config validation failed")
		return fmt.Errorf("invalid HAProxy configuration: %w", err)
	}

	// Try reload first (graceful)
	cmd := exec.Command("systemctl", "reload", "haproxy")
	if _, err := cmd.CombinedOutput(); err != nil {
		// If systemctl fails, try haproxy reload directly
		reloadCmd := exec.Command("haproxy", "-f", haproxyConfigPath, "-sf", m.getRunningPID())
		if out2, err2 := reloadCmd.CombinedOutput(); err2 != nil {
			logger.Error().Err(err2).Str("output", string(out2)).Msg("HAProxy reload failed")
			return fmt.Errorf("failed to reload HAProxy: %w", err2)
		}
	}

	logger.Info().Msg("HAProxy reloaded successfully")
	return nil
}

// ValidateConfig validates the HAProxy configuration.
func (m *HAProxyManager) ValidateConfig() error {
	cmd := exec.Command("haproxy", "-c", "-f", haproxyConfigPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("config validation failed: %s", string(out))
	}
	_ = out // suppress unused warning
	return nil
}

// getRunningPID returns the PID of the running HAProxy process.
func (m *HAProxyManager) getRunningPID() string {
	cmd := exec.Command("pidof", "haproxy")
	out, _ := cmd.Output()
	return strings.TrimSpace(string(out))
}

// GenerateWAFConfig generates the WAF frontend configuration.
func (m *HAProxyManager) GenerateWAFConfig(db *sql.DB) error {
	sites, err := m.getEnabledSites(db)
	if err != nil {
		return fmt.Errorf("failed to get enabled sites: %w", err)
	}

	var buf strings.Builder

	// Global settings
	buf.WriteString(`global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon
    maxconn 10000

`)
	// Default settings
	buf.WriteString(`defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    timeout connect 5000
    timeout client  50000
    timeout server  50000
    errorfile 400 /etc/haproxy/errors/400.http
    errorfile 403 /etc/haproxy/errors/403.http
    errorfile 408 /etc/haproxy/errors/408.http
    errorfile 500 /etc/haproxy/errors/500.http
    errorfile 502 /etc/haproxy/errors/502.http
    errorfile 503 /etc/haproxy/errors/503.http
    errorfile 504 /etc/haproxy/errors/504.http

`)

	// Stats page
	buf.WriteString(`# WAF Statistics
listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 10s
    stats auth admin:wafstats

`)

	// SPOE Configuration for WAF
	buf.WriteString(`# SPOE Agent for Coraza WAF
listen coraza-spoa
    bind 127.0.0.1:9000
    mode tcp
    option tcplog
    balance roundrobin

`)

	// HTTP frontend with WAF
	if len(sites) > 0 {
		buf.WriteString(`# WAF HTTP Frontend
frontend waf_http
    bind *:80
    mode http
    option httplog
    option dontlognull

    # SPOE filter for WAF inspection
    filter spoe engine coraza config /etc/coraza-spoa/spoe.cfg

    # Block requests if WAF triggered
    http-request deny if { var(txn.coraza.fail) -m int eq 1 }

    # Add WAF headers
    http-request set-header X-WAF-Status active
    http-request set-header X-WAF-Version 4.0

    # Route to appropriate backend
`)
		for _, site := range sites {
			// Use health check path
			hc := "/"
			if site.HealthCheckPath != nil && *site.HealthCheckPath != "" {
				hc = *site.HealthCheckPath
			}
			_ = hc // used in backend section
			buf.WriteString(fmt.Sprintf(`    use_backend %s_backend if { hdr(host) -i %s }
`, sanitizeBackendName(site.Domain), site.Domain))
		}

		// Default backend
		buf.WriteString(`    default_backend waf_default_backend

`)

		// HTTPS frontend with WAF (if SSL enabled)
		hasSSL := false
		for _, site := range sites {
			if site.SSLEnabled {
				hasSSL = true
				break
			}
		}
		if hasSSL {
			buf.WriteString(`# WAF HTTPS Frontend
frontend waf_https
    bind *:443 ssl crt /etc/haproxy/certs/
    mode http
    option httplog
    option dontlognull

    # SPOE filter for WAF inspection
    filter spoe engine coraza config /etc/coraza-spoa/spoe.cfg

    # Block requests if WAF triggered
    http-request deny if { var(txn.coraza.fail) -m int eq 1 }

    # Add WAF headers
    http-request set-header X-WAF-Status active
    http-request set-header X-WAF-Version 4.0

    # Route to appropriate backend
`)
			for _, site := range sites {
				if site.SSLEnabled {
					hc := "/"
					if site.HealthCheckPath != nil && *site.HealthCheckPath != "" {
						hc = *site.HealthCheckPath
					}
					_ = hc
					buf.WriteString(fmt.Sprintf(`    use_backend %s_backend if { hdr(host) -i %s }
`, sanitizeBackendName(site.Domain), site.Domain))
				}
			}

			buf.WriteString(`    default_backend waf_default_backend

`)
		}

		// Backends
		for _, site := range sites {
			hc := "/"
			if site.HealthCheckPath != nil && *site.HealthCheckPath != "" {
				hc = *site.HealthCheckPath
			}

			// Remove protocol from backend URL
			backend := strings.TrimPrefix(site.BackendURL, "http://")
			backend = strings.TrimPrefix(backend, "https://")
			backendHost := backend
			if idx := strings.Index(backend, ":"); idx > 0 {
				backendHost = backend[:idx]
			} else if idx := strings.Index(backend, "/"); idx > 0 {
				backendHost = backend[:idx]
			}

			backendPort := "80"
			if idx := strings.Index(backend, ":"); idx > 0 {
				rest := backend[idx+1:]
				if slashIdx := strings.Index(rest, "/"); slashIdx > 0 {
					backendPort = rest[:slashIdx]
				} else {
					backendPort = rest
				}
			}

			timeoutConn := site.TimeoutClient / 1000
			if timeoutConn < 5 {
				timeoutConn = 30
			}

			buf.WriteString(fmt.Sprintf(`# Backend for %s
backend %s_backend
    mode http
    balance roundrobin
    option httpchk GET %s
    http-check expect status 200
    timeout server %ds
    server %s %s:%s maxconn %d check inter 5s fall 3 rise 2

`,
				site.Domain,
				sanitizeBackendName(site.Domain),
				hc,
				timeoutConn,
				sanitizeServerName(site.Domain),
				backendHost,
				backendPort,
				site.MaxConnections,
			))
		}
	}

	// Default backend
	buf.WriteString(`# Default backend (fallback)
backend waf_default_backend
    mode http
    balance roundrobin
    server localhost 127.0.0.1:8080 check inter 5s fall 3 rise 2

`)

	config := buf.String()

	// Write to file
	os.MkdirAll(filepath.Dir(haproxyWAFConfigPath), 0755)
	if err := os.WriteFile(haproxyWAFConfigPath, []byte(config), 0644); err != nil {
		return fmt.Errorf("failed to write WAF config: %w", err)
	}

	// Include in main config
	if err := m.includeWAFConfig(); err != nil {
		return err
	}

	logger.Info().Int("sites", len(sites)).Msg("Generated WAF HAProxy config")
	return nil
}

// getEnabledSites retrieves enabled WAF sites from database.
func (m *HAProxyManager) getEnabledSites(db *sql.DB) ([]struct {
	ID              int
	Name            string
	Domain          string
	BackendURL      string
	SSLEnabled      bool
	MaxConnections  int
	TimeoutClient   int
	HealthCheckPath *string
}, error) {
	rows, err := db.Query(`
		SELECT id, name, domain, backend_url, ssl_enabled, max_connections, timeout_client, health_check_path
		FROM waf_sites
		WHERE enabled = 1
		ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sites []struct {
		ID              int
		Name            string
		Domain          string
		BackendURL      string
		SSLEnabled      bool
		MaxConnections  int
		TimeoutClient   int
		HealthCheckPath *string
	}
	for rows.Next() {
		var s struct {
			ID              int
			Name            string
			Domain          string
			BackendURL      string
			SSLEnabled      bool
			MaxConnections  int
			TimeoutClient   int
			HealthCheckPath *string
		}
		if err := rows.Scan(&s.ID, &s.Name, &s.Domain, &s.BackendURL, &s.SSLEnabled,
			&s.MaxConnections, &s.TimeoutClient, &s.HealthCheckPath); err != nil {
			return nil, err
		}
		sites = append(sites, s)
	}

	return sites, nil
}

// includeWAFConfig adds WAF config include to main HAProxy config.
func (m *HAProxyManager) includeWAFConfig() error {
	content, err := os.ReadFile(haproxyConfigPath)
	if err != nil {
		// Create new config if not exists
		m.createDefaultConfig()
		content, _ = os.ReadFile(haproxyConfigPath)
	}

	if !strings.Contains(string(content), "waf-frontend.cfg") {
		content = append(content, []byte("\n# WAF Frontend Configuration\n")...)
		content = append(content, []byte(fmt.Sprintf("include %s\n", haproxyWAFConfigPath))...)
		if err := os.WriteFile(haproxyConfigPath, content, 0644); err != nil {
			return err
		}
	}

	return nil
}

// RemoveWAFConfig removes WAF configuration from HAProxy.
func (m *HAProxyManager) RemoveWAFConfig() error {
	// Remove from main config
	content, err := os.ReadFile(haproxyConfigPath)
	if err == nil {
		lines := strings.Split(string(content), "\n")
		var newLines []string
		for _, line := range lines {
			if strings.Contains(line, "waf-frontend.cfg") {
				continue
			}
			if strings.Contains(line, "# WAF Frontend Configuration") {
				continue
			}
			newLines = append(newLines, line)
		}
		os.WriteFile(haproxyConfigPath, []byte(strings.Join(newLines, "\n")), 0644)
	}

	// Remove WAF config file
	os.Remove(haproxyWAFConfigPath)

	return nil
}

// ReadWAFConfig reads the current WAF configuration.
func (m *HAProxyManager) ReadWAFConfig() (string, error) {
	content, err := os.ReadFile(haproxyWAFConfigPath)
	if err != nil {
		return "", fmt.Errorf("WAF config not found: %w", err)
	}
	return string(content), nil
}

// GetStartTime returns when HAProxy was started (approximation).
func (m *HAProxyManager) GetStartTime() time.Time {
	cmd := exec.Command("systemctl", "show", "haproxy", "--property=ActiveEnterTimestamp")
	out, err := cmd.Output()
	if err != nil {
		return time.Now()
	}

	// Parse the timestamp
	tstr := strings.TrimSpace(string(out))
	tstr = strings.TrimPrefix(tstr, "ActiveEnterTimestamp=")

	t, err := time.Parse("Mon 2006-01-02 15:04:05 MST", tstr)
	if err != nil {
		// Try alternate format
		t, _ = time.Parse("2006-01-02 15:04:05", tstr)
	}
	return t
}

func sanitizeBackendName(domain string) string {
	name := strings.ReplaceAll(domain, ".", "_")
	name = strings.ReplaceAll(name, "-", "_")
	name = strings.ReplaceAll(name, "*", "wildcard")
	return "waf_" + name
}

func sanitizeServerName(domain string) string {
	name := strings.ReplaceAll(domain, ".", "_")
	name = strings.ReplaceAll(name, "-", "_")
	name = strings.ReplaceAll(name, "*", "wildcard")
	return "srv_" + name
}
