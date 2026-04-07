package vhost

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"text/template"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// apacheConfBase is the symlinked base path for apache config.
// Debian: /ITDLUPanel/server/apache/conf → /etc/apache2
// RHEL:   /ITDLUPanel/server/apache/conf → /etc/httpd
const apacheConfBase = "/ITDLUPanel/server/apache/conf"

const apacheTemplate = `<VirtualHost *:80>
    ServerName {{ .Domain }}
{{ range .Aliases }}    ServerAlias {{ . }}
{{ end }}
    DocumentRoot {{ .DocRoot }}
{{ if .SSLEnabled }}{{ if .ForceHTTPS }}
    #HTTP_TO_HTTPS_START
    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/\.well-known/
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]

    # ACME challenge for SSL certificate renewal
    Alias /.well-known {{ .DocRoot }}/.well-known
    <Directory {{ .DocRoot }}/.well-known>
        Require all granted
    </Directory>
    #HTTP_TO_HTTPS_END
{{ else }}
    <Directory {{ .DocRoot }}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
{{ if .PHPVersion }}
    #PHP-INFO-START
    <FilesMatch \.php$>
        SetHandler "proxy:unix:/run/php/php{{ .PHPVersion }}-fpm.sock|fcgi://localhost"
    </FilesMatch>
    #PHP-INFO-END
{{ end }}
    ErrorLog /ITDLUPanel/logs/{{ .Domain }}/error.log
    CustomLog /ITDLUPanel/logs/{{ .Domain }}/access.log combined

    # Security headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "no-referrer-when-downgrade"

    # Forbidden files or directories
    <DirectoryMatch "^/(\.user\.ini|\.htaccess|\.git|\.env|\.svn)">
        Require all denied
    </DirectoryMatch>

    # ACME challenge
    Alias /.well-known {{ .DocRoot }}/.well-known
    <Directory {{ .DocRoot }}/.well-known>
        Require all granted
    </Directory>

    # Gzip compression (mod_deflate)
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml font/ttf font/otf application/wasm
        DeflateCompressionLevel 5
    </IfModule>

    # Static file caching (mod_expires)
    <IfModule mod_expires.c>
        ExpiresActive On
        ExpiresByType image/jpeg "access plus 30 days"
        ExpiresByType image/png "access plus 30 days"
        ExpiresByType image/gif "access plus 30 days"
        ExpiresByType image/x-icon "access plus 30 days"
        ExpiresByType image/bmp "access plus 30 days"
        ExpiresByType image/svg+xml "access plus 30 days"
        ExpiresByType text/css "access plus 12 hours"
        ExpiresByType application/javascript "access plus 12 hours"
    </IfModule>

    # Error pages
    ErrorDocument 403 /403.html
    ErrorDocument 404 /404.html
    ErrorDocument 502 /502.html
{{ if .CustomConfig }}
    # Custom configuration
{{ .CustomConfig }}
{{ end }}
{{ end }}{{ else }}
    <Directory {{ .DocRoot }}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
{{ if .PHPVersion }}
    #PHP-INFO-START
    <FilesMatch \.php$>
        SetHandler "proxy:unix:/run/php/php{{ .PHPVersion }}-fpm.sock|fcgi://localhost"
    </FilesMatch>
    #PHP-INFO-END
{{ end }}
    ErrorLog /ITDLUPanel/logs/{{ .Domain }}/error.log
    CustomLog /ITDLUPanel/logs/{{ .Domain }}/access.log combined

    # Security headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "no-referrer-when-downgrade"

    # Forbidden files or directories
    <DirectoryMatch "^/(\.user\.ini|\.htaccess|\.git|\.env|\.svn)">
        Require all denied
    </DirectoryMatch>

    # ACME challenge
    Alias /.well-known {{ .DocRoot }}/.well-known
    <Directory {{ .DocRoot }}/.well-known>
        Require all granted
    </Directory>

    # Gzip compression (mod_deflate)
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml font/ttf font/otf application/wasm
        DeflateCompressionLevel 5
    </IfModule>

    # Static file caching (mod_expires)
    <IfModule mod_expires.c>
        ExpiresActive On
        ExpiresByType image/jpeg "access plus 30 days"
        ExpiresByType image/png "access plus 30 days"
        ExpiresByType image/gif "access plus 30 days"
        ExpiresByType image/x-icon "access plus 30 days"
        ExpiresByType image/bmp "access plus 30 days"
        ExpiresByType image/svg+xml "access plus 30 days"
        ExpiresByType text/css "access plus 12 hours"
        ExpiresByType application/javascript "access plus 12 hours"
    </IfModule>

    # Error pages
    ErrorDocument 403 /403.html
    ErrorDocument 404 /404.html
    ErrorDocument 502 /502.html
{{ if .CustomConfig }}
    # Custom configuration
{{ .CustomConfig }}
{{ end }}
{{ end }}
</VirtualHost>
{{ if .SSLEnabled }}
<VirtualHost *:443>
    ServerName {{ .Domain }}
{{ range .Aliases }}    ServerAlias {{ . }}
{{ end }}
    DocumentRoot {{ .DocRoot }}

    #SSL-START
    SSLEngine on
    SSLCertificateFile {{ .SSLCert }}
    SSLCertificateKeyFile {{ .SSLKey }}
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite EECDH+CHACHA20:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:!MD5
    SSLHonorCipherOrder on
    #SSL-END

    # Protocols
    Protocols h2 http/1.1

    <Directory {{ .DocRoot }}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
{{ if .PHPVersion }}
    #PHP-INFO-START
    <FilesMatch \.php$>
        SetHandler "proxy:unix:/run/php/php{{ .PHPVersion }}-fpm.sock|fcgi://localhost"
    </FilesMatch>
    #PHP-INFO-END
{{ end }}
    ErrorLog /ITDLUPanel/logs/{{ .Domain }}/ssl.error.log
    CustomLog /ITDLUPanel/logs/{{ .Domain }}/ssl.access.log combined

    # Security headers (HTTPS)
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "no-referrer-when-downgrade"

    # Forbidden files or directories
    <DirectoryMatch "^/(\.user\.ini|\.htaccess|\.git|\.env|\.svn)">
        Require all denied
    </DirectoryMatch>

    # ACME challenge for SSL certificate renewal
    Alias /.well-known {{ .DocRoot }}/.well-known
    <Directory {{ .DocRoot }}/.well-known>
        Require all granted
    </Directory>

    # Gzip compression (mod_deflate)
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml font/ttf font/otf application/wasm
        DeflateCompressionLevel 5
    </IfModule>

    # Static file caching (mod_expires)
    <IfModule mod_expires.c>
        ExpiresActive On
        ExpiresByType image/jpeg "access plus 30 days"
        ExpiresByType image/png "access plus 30 days"
        ExpiresByType image/gif "access plus 30 days"
        ExpiresByType image/x-icon "access plus 30 days"
        ExpiresByType image/bmp "access plus 30 days"
        ExpiresByType image/svg+xml "access plus 30 days"
        ExpiresByType text/css "access plus 12 hours"
        ExpiresByType application/javascript "access plus 12 hours"
    </IfModule>

    # Error pages
    ErrorDocument 403 /403.html
    ErrorDocument 404 /404.html
    ErrorDocument 502 /502.html
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
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		return filepath.Join(apacheConfBase, "conf.d", domain+".conf")
	}
	return filepath.Join(apacheConfBase, "sites-available", domain+".conf")
}

// EnableSite activates the site. On Debian uses a2ensite, on RHEL configs in conf.d are auto-loaded.
func (a *ApacheGenerator) EnableSite(domain string) error {
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		// RHEL: configs in conf.d are auto-loaded, nothing to do
		logger.Info().Str("domain", domain).Msg("apache site enabled (RHEL: auto-loaded from conf.d)")
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	result, err := system.Exec(ctx, "a2ensite", domain+".conf")
	if err != nil {
		return fmt.Errorf("failed to enable apache site %s: %s", domain, result.Stderr)
	}

	logger.Info().Str("domain", domain).Msg("apache site enabled")
	return nil
}

// DisableSite deactivates the site. On Debian uses a2dissite, on RHEL removes the config.
func (a *ApacheGenerator) DisableSite(domain string) error {
	osInfo := system.GetOSInfo()
	if osInfo.PkgManager == "dnf" {
		confPath := a.GetConfigPath(domain)
		disabledPath := confPath + ".disabled"
		if err := os.Rename(confPath, disabledPath); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("failed to disable apache site %s: %w", domain, err)
		}
		logger.Info().Str("domain", domain).Msg("apache site disabled (RHEL)")
		return nil
	}

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

	osInfo := system.GetOSInfo()
	serviceName := "apache2"
	if osInfo.PkgManager == "dnf" {
		serviceName = "httpd"
	}

	result, err := system.Exec(ctx, "systemctl", "reload", serviceName)
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
