package vhost

import (
	"bytes"
	"context"
	"fmt"
	"path/filepath"
	"text/template"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

const apacheTemplate = `<VirtualHost *:80>
    ServerName {{ .Domain }}
{{ range .Aliases }}    ServerAlias {{ . }}
{{ end }}
    DocumentRoot {{ .DocRoot }}

    <Directory {{ .DocRoot }}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    <FilesMatch \.php$>
        SetHandler "proxy:unix:/run/php/php{{ .PHPVersion }}-fpm.sock|fcgi://localhost"
    </FilesMatch>

    ErrorLog ${APACHE_LOG_DIR}/{{ .Domain }}.error.log
    CustomLog ${APACHE_LOG_DIR}/{{ .Domain }}.access.log combined

    # Security headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "no-referrer-when-downgrade"
{{ if .CustomConfig }}
    # Custom configuration
{{ .CustomConfig }}
{{ end }}
</VirtualHost>
{{ if .SSLEnabled }}
<VirtualHost *:443>
    ServerName {{ .Domain }}
{{ range .Aliases }}    ServerAlias {{ . }}
{{ end }}
    DocumentRoot {{ .DocRoot }}

    SSLEngine on
    SSLCertificateFile {{ .SSLCert }}
    SSLCertificateKeyFile {{ .SSLKey }}
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1

    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"

    <Directory {{ .DocRoot }}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    <FilesMatch \.php$>
        SetHandler "proxy:unix:/run/php/php{{ .PHPVersion }}-fpm.sock|fcgi://localhost"
    </FilesMatch>

    ErrorLog ${APACHE_LOG_DIR}/{{ .Domain }}.ssl.error.log
    CustomLog ${APACHE_LOG_DIR}/{{ .Domain }}.ssl.access.log combined
{{ if .CustomConfig }}
    # Custom configuration
{{ .CustomConfig }}
{{ end }}
</VirtualHost>
{{ end }}
`

// ApacheGenerator generates Apache virtual host configurations.
type ApacheGenerator struct{}

// NewApacheGenerator creates a new ApacheGenerator.
func NewApacheGenerator() *ApacheGenerator {
	return &ApacheGenerator{}
}

// Generate renders an Apache vhost config from the given VhostConfig.
func (a *ApacheGenerator) Generate(cfg VhostConfig) (string, error) {
	tmpl, err := template.New("apache").Parse(apacheTemplate)
	if err != nil {
		return "", fmt.Errorf("failed to parse apache template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, cfg); err != nil {
		return "", fmt.Errorf("failed to render apache template: %w", err)
	}

	return buf.String(), nil
}

// GetConfigPath returns the path to the Apache vhost config file for a domain.
func (a *ApacheGenerator) GetConfigPath(domain string) string {
	return filepath.Join("/etc/apache2/sites-available", domain+".conf")
}

// EnableSite runs a2ensite to activate the site.
func (a *ApacheGenerator) EnableSite(domain string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	result, err := system.Exec(ctx, "a2ensite", domain+".conf")
	if err != nil {
		return fmt.Errorf("failed to enable apache site %s: %s", domain, result.Stderr)
	}

	logger.Info().Str("domain", domain).Msg("apache site enabled")
	return nil
}

// DisableSite runs a2dissite to deactivate the site.
func (a *ApacheGenerator) DisableSite(domain string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	result, err := system.Exec(ctx, "a2dissite", domain+".conf")
	if err != nil {
		return fmt.Errorf("failed to disable apache site %s: %s", domain, result.Stderr)
	}

	logger.Info().Str("domain", domain).Msg("apache site disabled")
	return nil
}

// ReloadServer tests the config and reloads Apache.
func (a *ApacheGenerator) ReloadServer() error {
	if err := a.TestConfig(); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	result, err := system.Exec(ctx, "systemctl", "reload", "apache2")
	if err != nil {
		return fmt.Errorf("failed to reload apache: %s", result.Stderr)
	}

	logger.Info().Msg("apache reloaded successfully")
	return nil
}

// TestConfig validates the current Apache configuration.
func (a *ApacheGenerator) TestConfig() error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	result, err := system.Exec(ctx, "apachectl", "configtest")
	if err != nil {
		return fmt.Errorf("apache config test failed: %s", result.Stderr)
	}
	return nil
}
