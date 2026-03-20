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

const nginxTemplate = `server {
    listen 80;
    listen [::]:80;
    server_name {{ .Domain }}{{ range .Aliases }} {{ . }}{{ end }};
    root {{ .DocRoot }};
    index index.php index.html index.htm;

    access_log /var/log/nginx/{{ .Domain }}.access.log;
    error_log  /var/log/nginx/{{ .Domain }}.error.log;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php{{ .PHPVersion }}-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_intercept_errors on;
        fastcgi_buffer_size 16k;
        fastcgi_buffers 4 16k;
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Static file caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
{{ if .CustomConfig }}
    # Custom configuration
{{ .CustomConfig }}
{{ end }}
}
{{ if .SSLEnabled }}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name {{ .Domain }}{{ range .Aliases }} {{ . }}{{ end }};
    root {{ .DocRoot }};
    index index.php index.html index.htm;

    ssl_certificate {{ .SSLCert }};
    ssl_certificate_key {{ .SSLKey }};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    access_log /var/log/nginx/{{ .Domain }}.ssl.access.log;
    error_log  /var/log/nginx/{{ .Domain }}.ssl.error.log;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php{{ .PHPVersion }}-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_intercept_errors on;
        fastcgi_buffer_size 16k;
        fastcgi_buffers 4 16k;
    }

    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
{{ if .CustomConfig }}
    # Custom configuration
{{ .CustomConfig }}
{{ end }}
}
{{ end }}
`

// NginxGenerator generates Nginx virtual host configurations.
type NginxGenerator struct{}

// NewNginxGenerator creates a new NginxGenerator.
func NewNginxGenerator() *NginxGenerator {
	return &NginxGenerator{}
}

// Generate renders an Nginx vhost config from the given VhostConfig.
func (n *NginxGenerator) Generate(cfg VhostConfig) (string, error) {
	tmpl, err := template.New("nginx").Parse(nginxTemplate)
	if err != nil {
		return "", fmt.Errorf("failed to parse nginx template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, cfg); err != nil {
		return "", fmt.Errorf("failed to render nginx template: %w", err)
	}

	return buf.String(), nil
}

// GetConfigPath returns the path to the Nginx vhost config file for a domain.
func (n *NginxGenerator) GetConfigPath(domain string) string {
	return filepath.Join("/etc/nginx/sites-available", domain+".conf")
}

// EnableSite creates a symlink in sites-enabled to activate the site.
func (n *NginxGenerator) EnableSite(domain string) error {
	available := n.GetConfigPath(domain)
	enabled := filepath.Join("/etc/nginx/sites-enabled", domain+".conf")

	// Remove existing symlink if present
	_ = os.Remove(enabled)

	if err := os.Symlink(available, enabled); err != nil {
		return fmt.Errorf("failed to enable nginx site %s: %w", domain, err)
	}

	logger.Info().Str("domain", domain).Msg("nginx site enabled")
	return nil
}

// DisableSite removes the symlink from sites-enabled.
func (n *NginxGenerator) DisableSite(domain string) error {
	enabled := filepath.Join("/etc/nginx/sites-enabled", domain+".conf")

	if err := os.Remove(enabled); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to disable nginx site %s: %w", domain, err)
	}

	logger.Info().Str("domain", domain).Msg("nginx site disabled")
	return nil
}

// ReloadServer tests the config and reloads Nginx.
func (n *NginxGenerator) ReloadServer() error {
	if err := n.TestConfig(); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	result, err := system.Exec(ctx, "systemctl", "reload", "nginx")
	if err != nil {
		return fmt.Errorf("failed to reload nginx: %s", result.Stderr)
	}

	logger.Info().Msg("nginx reloaded successfully")
	return nil
}

// TestConfig validates the current Nginx configuration.
func (n *NginxGenerator) TestConfig() error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	result, err := system.Exec(ctx, "nginx", "-t")
	if err != nil {
		return fmt.Errorf("nginx config test failed: %s", result.Stderr)
	}
	return nil
}
