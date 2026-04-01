package vhost

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/template"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// olsConfBase is the symlinked base path for OLS config (/ITDLUPanel/server/openlitespeed/conf → /usr/local/lsws/conf).
const olsConfBase = "/ITDLUPanel/server/openlitespeed/conf"
const olsVhostTemplate = `docRoot                   {{ .DocRoot }}
vhDomain                  {{ .Domain }}
vhAliases                 {{ joinAliases .Aliases }}
enableGzip                1
enableIpGeo               1

errorlog {{ .DocRoot }}/logs/{{ .Domain }}.error_log {
  useServer               0
  logLevel                WARN
  rollingSize             10M
  keepDays                30
}

accesslog {{ .DocRoot }}/logs/{{ .Domain }}.access_log {
  useServer               0
  logFormat               "%h %l %u %t \"%r\" %>s %b"
  logHeaders              5
  rollingSize             10M
  keepDays                30
}

index  {
  useServer               0
  indexFiles              index.php, index.html, index.htm
  autoIndex               0
}
{{ if .PHPHandler }}
scripthandler  {
  add                     lsapi:{{ .PHPHandler }} php
}

extprocessor {{ .PHPHandler }} {
  type                    lsapi
  address                 uds://tmp/lshttpd/{{ .PHPHandler }}.sock
  maxConns                10
  env                     PHP_LSAPI_CHILDREN=10
  env                     LSAPI_AVOID_FORK=200M
  initTimeout             60
  retryTimeout            0
  persistConn             1
  respBuffer              0
  autoStart               2
  path                    /usr/local/lsws/{{ .PHPHandler }}/bin/lsphp
  backlog                 100
  instances               1
  priority                0
  memSoftLimit            2047M
  memHardLimit            2047M
  procSoftLimit           1400
  procHardLimit           1500
}
{{ end }}

phpIniOverride  {
  php_admin_value open_basedir "{{ .DocRoot }}:/tmp:/var/tmp:/usr/local/lsws/{{ .PHPHandler }}/lib/php"
}

accessControl  {
  allow                   *
}

# Forbidden files
context exp:/(\.user\.ini|\.htaccess|\.git|\.env|\.svn|LICENSE|README\.md)$ {
  location                {{ .DocRoot }}
  allowBrowse             0
}

# ACME challenge for SSL
context /.well-known/ {
  location                {{ .DocRoot }}/.well-known/
  allowBrowse             1
}

context / {
  location                {{ .DocRoot }}
  allowBrowse             1
{{ if .ForceHTTPS }}{{ if .SSLEnabled }}
  rewrite  {
    enable                1
    rules                 <<<END_rules
RewriteCond %{HTTPS} !on
RewriteCond %{REQUEST_URI} !^/\.well-known/
RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]
    END_rules
  }
{{ else }}
  rewrite  {
    enable                1
    rules                 <<<END_rules
rewriteFile {{ .DocRoot }}/.htaccess
    END_rules
  }
{{ end }}{{ else }}
  rewrite  {
    enable                1
    rules                 <<<END_rules
rewriteFile {{ .DocRoot }}/.htaccess
    END_rules
  }
{{ end }}
}

# Error pages
errorPage 403 {
  url                     /403.html
}
errorPage 404 {
  url                     /404.html
}
errorPage 502 {
  url                     /502.html
}

rewrite  {
  enable                  1
  autoLoadHtaccess        1
}

# Security headers
module cache {
  ls_enabled              1
}
{{ if .SSLEnabled }}
vhssl  {
  keyFile                 {{ .SSLKey }}
  certFile                {{ .SSLCert }}
  certChain               1
  sslProtocol             24
  ciphers                 EECDH+CHACHA20:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:!MD5
  enableECDHE             1
  renegProtection         1
  sslSessionCache         1
  sslSessionTickets       1
  enableSpdy              15
  enableQuic              1
  enableStapling          1
}
{{ end }}
{{ if .CustomConfig }}
# Custom configuration
{{ .CustomConfig }}
{{ end }}
`

const olsListenerEntry = `
member {{ .Domain }} {
  vhRoot                  /usr/local/lsws/conf/vhosts/{{ .Domain }}
}
`

// OLSGenerator generates OpenLiteSpeed virtual host configurations.
type OLSGenerator struct{}

// NewOLSGenerator creates a new OLSGenerator.
func NewOLSGenerator() *OLSGenerator {
	return &OLSGenerator{}
}

type olsTemplateData struct {
	VhostConfig
	PHPHandler string // e.g., "lsphp82"
}

// Generate renders an OpenLiteSpeed vhost config from the given VhostConfig.
func (o *OLSGenerator) Generate(cfg VhostConfig) (string, error) {
	funcMap := template.FuncMap{
		"joinAliases": func(aliases []string) string {
			if len(aliases) == 0 {
				return ""
			}
			return strings.Join(aliases, ", ")
		},
	}

	tmpl, err := template.New("ols").Funcs(funcMap).Parse(olsVhostTemplate)
	if err != nil {
		return "", fmt.Errorf("failed to parse ols template: %w", err)
	}

	phpHandler := ""
	if cfg.PHPVersion != "" {
		phpHandler = "lsphp" + strings.ReplaceAll(cfg.PHPVersion, ".", "")
	}
	data := olsTemplateData{
		VhostConfig: cfg,
		PHPHandler:  phpHandler,
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("failed to render ols template: %w", err)
	}

	// Create log directory for this vhost
	logDir := filepath.Join(cfg.DocRoot, "logs")
	_ = os.MkdirAll(logDir, 0755)

	return buf.String(), nil
}

// GetConfigPath returns the path to the OLS vhost config directory for a domain.
func (o *OLSGenerator) GetConfigPath(domain string) string {
	return filepath.Join(olsConfBase, "vhosts", domain, "vhconf.conf")
}

// EnableSite creates the vhost directory structure and registers it in httpd_config.conf.
func (o *OLSGenerator) EnableSite(domain string) error {
	vhostDir := filepath.Join(olsConfBase, "vhosts", domain)
	if err := os.MkdirAll(vhostDir, 0755); err != nil {
		return fmt.Errorf("failed to create ols vhost directory for %s: %w", domain, err)
	}

	// Register vhost in httpd_config.conf if not present
	o.registerVhostInConfig(domain)

	logger.Info().Str("domain", domain).Msg("ols site enabled")
	return nil
}

// DisableSite removes the vhost directory and unregisters from httpd_config.conf.
func (o *OLSGenerator) DisableSite(domain string) error {
	vhostDir := filepath.Join(olsConfBase, "vhosts", domain)
	if err := os.RemoveAll(vhostDir); err != nil {
		return fmt.Errorf("failed to remove ols vhost directory for %s: %w", domain, err)
	}

	// Unregister vhost from httpd_config.conf
	o.unregisterVhostFromConfig(domain)

	logger.Info().Str("domain", domain).Msg("ols site disabled")
	return nil
}

// ReloadServer performs a graceful restart of OpenLiteSpeed.
func (o *OLSGenerator) ReloadServer() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// OLS supports graceful restart which preserves connections
	result, err := system.Exec(ctx, "/usr/local/lsws/bin/lswsctrl", "restart")
	if err != nil {
		// Fallback to systemctl
		result, err = system.Exec(ctx, "systemctl", "restart", "lsws")
		if err != nil {
			return fmt.Errorf("failed to restart openlitespeed: %s", result.Stderr)
		}
	}

	logger.Info().Msg("openlitespeed restarted successfully")
	return nil
}

// TestConfig validates OLS configuration.
func (o *OLSGenerator) TestConfig() error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	result, err := system.Exec(ctx, "/usr/local/lsws/bin/lswsctrl", "status")
	if err != nil {
		return fmt.Errorf("ols config check failed: %s", result.Stderr)
	}
	return nil
}

// registerVhostInConfig adds a virtual host definition to httpd_config.conf.
func (o *OLSGenerator) registerVhostInConfig(domain string) {
	configPath := filepath.Join(olsConfBase, "httpd_config.conf")
	data, err := os.ReadFile(configPath)
	if err != nil {
		logger.Warn().Err(err).Msg("failed to read httpd_config.conf for vhost registration")
		return
	}

	content := string(data)

	// Check if vhost is already registered
	if strings.Contains(content, fmt.Sprintf("vhDomain %s", domain)) ||
		strings.Contains(content, fmt.Sprintf("vhost %s", domain)) {
		return
	}

	// Build the virtualhost block
	vhostBlock := fmt.Sprintf(`
virtualhost %s {
  vhRoot                  %s/vhosts/%s
  configFile              $VH_ROOT/vhconf.conf
  allowSymbolLink         1
  enableScript            1
  restrained              0
}
`, domain, olsConfBase, domain)

	// Append to config
	content += vhostBlock

	// Also ensure the domain is added to listener
	if !strings.Contains(content, fmt.Sprintf("map                     %s", domain)) {
		// Find the default listener block and add mapping
		listenerMarker := "listener Default {"
		if idx := strings.Index(content, listenerMarker); idx >= 0 {
			// Find closing brace of listener
			braceCount := 0
			insertPos := -1
			for i := idx + len(listenerMarker); i < len(content); i++ {
				if content[i] == '{' {
					braceCount++
				} else if content[i] == '}' {
					if braceCount == 0 {
						insertPos = i
						break
					}
					braceCount--
				}
			}
			if insertPos > 0 {
				mapLine := fmt.Sprintf("  map                     %s %s\n", domain, domain)
				content = content[:insertPos] + mapLine + content[insertPos:]
			}
		}
	}

	if err := os.WriteFile(configPath, []byte(content), 0644); err != nil {
		logger.Warn().Err(err).Msg("failed to write httpd_config.conf")
	}
}

// unregisterVhostFromConfig removes a virtual host definition from httpd_config.conf.
func (o *OLSGenerator) unregisterVhostFromConfig(domain string) {
	configPath := filepath.Join(olsConfBase, "httpd_config.conf")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return
	}

	content := string(data)

	// Remove virtualhost block
	vhostStart := fmt.Sprintf("virtualhost %s {", domain)
	if idx := strings.Index(content, vhostStart); idx >= 0 {
		braceCount := 0
		endIdx := idx + len(vhostStart)
		for i := endIdx; i < len(content); i++ {
			if content[i] == '{' {
				braceCount++
			} else if content[i] == '}' {
				if braceCount == 0 {
					endIdx = i + 1
					// Include trailing newline
					if endIdx < len(content) && content[endIdx] == '\n' {
						endIdx++
					}
					break
				}
				braceCount--
			}
		}
		// Also remove leading newlines
		for idx > 0 && content[idx-1] == '\n' {
			idx--
		}
		content = content[:idx] + content[endIdx:]
	}

	// Remove listener map entry
	mapLine := fmt.Sprintf("  map                     %s %s", domain, domain)
	content = strings.ReplaceAll(content, mapLine+"\n", "")

	_ = os.WriteFile(configPath, []byte(content), 0644)
}
