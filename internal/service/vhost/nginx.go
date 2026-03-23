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
    index index.php index.html index.htm;
    root {{ .DocRoot }};
{{ if .SSLEnabled }}
    #HTTP_TO_HTTPS_START
    location / {
        return 301 https://$host$request_uri;
    }

    # ACME challenge for SSL certificate renewal
    location ~ \.well-known {
        allow all;
        root {{ .DocRoot }};
    }
    #HTTP_TO_HTTPS_END
{{ else }}
    access_log /var/log/nginx/{{ .Domain }}.access.log;
    error_log  /var/log/nginx/{{ .Domain }}.error.log;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Forbidden files or directories
    location ~ ^/(\.user\.ini|\.htaccess|\.git|\.env|\.svn|\.project|LICENSE|README\.md) {
        return 404;
    }

    # ACME challenge for SSL certificate issuance
    location ~ \.well-known {
        allow all;
    }

    # Prohibit sensitive files in ACME challenge directory
    if ( $uri ~ "^/\.well-known/.*\.(php|jsp|py|js|css|lua|ts|go|zip|tar\.gz|rar|7z|sql|bak)$" ) {
        return 403;
    }

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1k;
    gzip_comp_level 5;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml font/ttf font/otf;

    #PHP-INFO-START
{{ if .PHPVersion }}    include enable-php-{{ .PHPVersion }}.conf;{{ end }}
    #PHP-INFO-END

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php{{ .PHPVersion }}-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_intercept_errors on;
        fastcgi_connect_timeout 300;
        fastcgi_send_timeout 300;
        fastcgi_read_timeout 300;
        fastcgi_buffer_size 64k;
        fastcgi_buffers 4 64k;
        fastcgi_busy_buffers_size 128k;
        fastcgi_temp_file_write_size 256k;
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Static file caching
    location ~* \.(jpg|jpeg|png|gif|ico|bmp|swf)$ {
        expires 30d;
        access_log off;
        error_log /dev/null;
    }

    location ~* \.(js|css)$ {
        expires 12h;
        access_log off;
        error_log /dev/null;
    }
{{ if .CustomConfig }}
    # Custom configuration
{{ .CustomConfig }}
{{ end }}
{{ end }}
}
{{ if .SSLEnabled }}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    listen 443 quic reuseport;
    listen [::]:443 quic reuseport;
    server_name {{ .Domain }}{{ range .Aliases }} {{ . }}{{ end }};
    index index.php index.html index.htm;
    root {{ .DocRoot }};

    #SSL-START
    ssl_certificate {{ .SSLCert }};
    ssl_certificate_key {{ .SSLKey }};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+CHACHA20-draft:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets on;
    #SSL-END

    # HTTP/3 Alt-Svc header
    add_header Alt-Svc 'h3=":443"; ma=2592000, h3-29=":443"; ma=2592000' always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    access_log /var/log/nginx/{{ .Domain }}.log;
    error_log  /var/log/nginx/{{ .Domain }}.error.log;

    # Error pages
    error_page 404 /404.html;
    error_page 502 /502.html;
    error_page 497 https://$host$request_uri;

    # Forbidden files or directories
    location ~ ^/(\.user\.ini|\.htaccess|\.git|\.env|\.svn|\.project|LICENSE|README\.md) {
        return 404;
    }

    # ACME challenge for SSL certificate renewal
    location ~ \.well-known {
        allow all;
    }

    # Prohibit sensitive files in ACME challenge directory
    if ( $uri ~ "^/\.well-known/.*\.(php|jsp|py|js|css|lua|ts|go|zip|tar\.gz|rar|7z|sql|bak)$" ) {
        return 403;
    }

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1k;
    gzip_comp_level 5;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml font/ttf font/otf;

    #PHP-INFO-START
{{ if .PHPVersion }}    include enable-php-{{ .PHPVersion }}.conf;{{ end }}
    #PHP-INFO-END

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php{{ .PHPVersion }}-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_intercept_errors on;
        fastcgi_connect_timeout 300;
        fastcgi_send_timeout 300;
        fastcgi_read_timeout 300;
        fastcgi_buffer_size 64k;
        fastcgi_buffers 4 64k;
        fastcgi_busy_buffers_size 128k;
        fastcgi_temp_file_write_size 256k;
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Static file caching
    location ~* \.(jpg|jpeg|png|gif|ico|bmp|swf)$ {
        expires 30d;
        access_log off;
        error_log /dev/null;
    }

    location ~* \.(js|css)$ {
        expires 12h;
        access_log off;
        error_log /dev/null;
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
