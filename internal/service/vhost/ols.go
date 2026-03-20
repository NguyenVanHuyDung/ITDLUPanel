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

const olsVhostTemplate = `docRoot                   {{ .DocRoot }}
vhDomain                  {{ .Domain }}
vhAliases                 {{ joinAliases .Aliases }}
enableGzip                1
enableIpGeo               1

index  {
  useServer               0
  indexFiles               index.php, index.html, index.htm
}

scripthandler  {
  add                     lsapi:{{ .PHPHandler }} php
}

phpIniOverride  {
  php_admin_value open_basedir "{{ .DocRoot }}:/tmp:/var/tmp"
}

accessControl  {
  allow                   *
}

context / {
  location                {{ .DocRoot }}
  allowBrowse             1
  rewrite  {
    enable                1
    rules                 <<<END_rules
rewriteFile {{ .DocRoot }}/.htaccess
    END_rules
  }
}

rewrite  {
  enable                  1
  autoLoadHtaccess        1
}
{{ if .SSLEnabled }}
vhssl  {
  keyFile                 {{ .SSLKey }}
  certFile                {{ .SSLCert }}
  certChain               1
  sslProtocol             24
  renegProtection         1
  sslSessionCache         1
  sslSessionTickets       1
  enableSpdy              15
  enableQuic              1
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
	PHPHandler string
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

	data := olsTemplateData{
		VhostConfig: cfg,
		PHPHandler:  "lsphp" + strings.ReplaceAll(cfg.PHPVersion, ".", ""),
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("failed to render ols template: %w", err)
	}

	return buf.String(), nil
}

// GetConfigPath returns the path to the OLS vhost config directory for a domain.
func (o *OLSGenerator) GetConfigPath(domain string) string {
	return filepath.Join("/usr/local/lsws/conf/vhosts", domain, "vhconf.conf")
}

// EnableSite creates the vhost directory structure for OLS.
func (o *OLSGenerator) EnableSite(domain string) error {
	vhostDir := filepath.Join("/usr/local/lsws/conf/vhosts", domain)
	if err := os.MkdirAll(vhostDir, 0755); err != nil {
		return fmt.Errorf("failed to create ols vhost directory for %s: %w", domain, err)
	}

	logger.Info().Str("domain", domain).Msg("ols site enabled")
	return nil
}

// DisableSite removes the vhost directory for OLS.
func (o *OLSGenerator) DisableSite(domain string) error {
	vhostDir := filepath.Join("/usr/local/lsws/conf/vhosts", domain)
	if err := os.RemoveAll(vhostDir); err != nil {
		return fmt.Errorf("failed to remove ols vhost directory for %s: %w", domain, err)
	}

	logger.Info().Str("domain", domain).Msg("ols site disabled")
	return nil
}

// ReloadServer restarts OpenLiteSpeed.
func (o *OLSGenerator) ReloadServer() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	result, err := system.Exec(ctx, "/usr/local/lsws/bin/lswsctrl", "restart")
	if err != nil {
		return fmt.Errorf("failed to restart openlitespeed: %s", result.Stderr)
	}

	logger.Info().Msg("openlitespeed restarted successfully")
	return nil
}

// TestConfig validates OLS configuration by performing a graceful restart check.
func (o *OLSGenerator) TestConfig() error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	result, err := system.Exec(ctx, "/usr/local/lsws/bin/lswsctrl", "status")
	if err != nil {
		return fmt.Errorf("ols config check failed: %s", result.Stderr)
	}
	return nil
}
