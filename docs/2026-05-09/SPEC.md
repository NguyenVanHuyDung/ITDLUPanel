# ITDLUPanel — Technical Specification

> **Version:** 1.0.0 · **Last updated:** 2026-05-09

---

## 1. Database Schema (SQLite — 38 tables)

### 1.1 Core Tables

#### `users`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| username | TEXT | UNIQUE NOT NULL |
| email | TEXT | UNIQUE |
| password | TEXT | NOT NULL (bcrypt cost=12) |
| role | TEXT | DEFAULT 'viewer' |
| totp_secret | TEXT | NULL (base32 encoded) |
| totp_enabled | INTEGER | DEFAULT 0 |
| status | INTEGER | DEFAULT 1 (1=active, 0=disabled) |
| last_login | DATETIME | NULL |
| last_ip | TEXT | NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `roles`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| description | TEXT | |
| permissions | TEXT | JSON array of permission strings |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**Default system roles:**
- `admin` — `["*"]` (full access)
- `operator` — `["sites.*","databases.*","ftp.*","files.*","cron.*","docker.*","firewall.*","backup.*","terminal.access","monitor.read","logs.read"]`
- `viewer` — `["monitor.read","logs.read","dashboard.read"]`

#### `user_roles`

| Column | Type | Constraints |
|--------|------|-------------|
| user_id | INTEGER | FK → users.id |
| role_id | INTEGER | FK → roles.id |
| PRIMARY KEY | | (user_id, role_id) |

#### `settings`

| Column | Type | Constraints |
|--------|------|-------------|
| key | TEXT | PRIMARY KEY |
| value | TEXT | NOT NULL |
| description | TEXT | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `schema_migrations`

| Column | Type | Constraints |
|--------|------|-------------|
| version | INTEGER | PRIMARY KEY |
| applied_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### 1.2 Application Tables

#### `sites`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| domain | TEXT | NOT NULL |
| path | TEXT | NOT NULL |
| webserver | TEXT | NOT NULL |
| php_version | TEXT | e.g. "8.2" |
| site_type | TEXT | DEFAULT 'php' ('php' / 'node' / 'python' / 'static') |
| ssl_enabled | INTEGER | DEFAULT 0 |
| ssl_type | TEXT | |
| ssl_expiry | DATETIME | |
| status | INTEGER | DEFAULT 1 |
| config_extra | TEXT | |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `domains`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| site_id | INTEGER | FK → sites.id ON DELETE CASCADE |
| domain | TEXT | NOT NULL |
| is_primary | INTEGER | DEFAULT 0 |
| UNIQUE | | (site_id, domain) |

#### `databases`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| db_type | TEXT | NOT NULL ('mysql' / 'mariadb' / 'postgresql' / 'mongodb') |
| username | TEXT | NOT NULL |
| password | TEXT | NOT NULL |
| charset | TEXT | DEFAULT 'utf8mb4' |
| collation | TEXT | DEFAULT 'utf8mb4_general_ci' |
| remote_access | TEXT | DEFAULT 'localhost' |
| size | INTEGER | DEFAULT 0 (bytes) |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | | (name, db_type) |

#### `ftps`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| username | TEXT | UNIQUE NOT NULL |
| password | TEXT | NOT NULL |
| path | TEXT | NOT NULL |
| status | INTEGER | DEFAULT 1 |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `crons`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | NOT NULL ('shell' / 'url') |
| schedule | TEXT | NOT NULL (cron expression) |
| command | TEXT | NOT NULL |
| status | INTEGER | DEFAULT 1 |
| last_run | DATETIME | NULL |
| last_status | TEXT | NULL |
| last_output | TEXT | NULL |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `tasks`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| type | TEXT | NOT NULL |
| name | TEXT | NOT NULL |
| status | TEXT | DEFAULT 'pending' ('pending' / 'running' / 'done' / 'failed') |
| progress | INTEGER | DEFAULT 0 (0–100) |
| log | TEXT | |
| result | TEXT | |
| error | TEXT | |
| created_by | INTEGER | FK → users.id |
| started_at | DATETIME | NULL |
| completed_at | DATETIME | NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `software`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| display_name | TEXT | NOT NULL |
| version | TEXT | NOT NULL |
| type | TEXT | NOT NULL |
| status | INTEGER | DEFAULT 1 |
| config_path | TEXT | |
| install_path | TEXT | |
| service_name | TEXT | |
| installed_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `backups`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| type | TEXT | NOT NULL ('site' / 'database' / 'panel') |
| name | TEXT | NOT NULL |
| target_id | INTEGER | NULL |
| target_name | TEXT | |
| file_path | TEXT | NOT NULL |
| file_size | INTEGER | DEFAULT 0 |
| storage | TEXT | DEFAULT 'local' |
| checksum | TEXT | |
| status | TEXT | DEFAULT 'completed' |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `firewall_rules`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| type | TEXT | NOT NULL |
| protocol | TEXT | DEFAULT 'tcp' |
| port | TEXT | |
| ip | TEXT | |
| action | TEXT | NOT NULL ('allow' / 'deny') |
| direction | TEXT | DEFAULT 'in' |
| description | TEXT | |
| status | INTEGER | DEFAULT 1 |
| sort_order | INTEGER | DEFAULT 0 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `plugins`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| display_name | TEXT | NOT NULL |
| version | TEXT | NOT NULL |
| description | TEXT | |
| author | TEXT | |
| homepage | TEXT | |
| status | INTEGER | DEFAULT 1 |
| config | TEXT | |
| installed_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `audit_logs`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| user_id | INTEGER | FK → users.id |
| username | TEXT | |
| action | TEXT | NOT NULL |
| resource | TEXT | NOT NULL |
| resource_id | TEXT | |
| detail | TEXT | |
| ip | TEXT | |
| user_agent | TEXT | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `docker_containers`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| container_id | TEXT | NOT NULL UNIQUE |
| name | TEXT | NOT NULL |
| image | TEXT | NOT NULL |
| status | TEXT | |
| ports | TEXT | |
| volumes | TEXT | |
| env | TEXT | |
| restart_policy | TEXT | DEFAULT 'no' |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `ftp_storages`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| host | TEXT | NOT NULL |
| port | INTEGER | DEFAULT 21 |
| username | TEXT | NOT NULL |
| password | TEXT | NOT NULL |
| remote_path | TEXT | DEFAULT "/" |
| is_default | INTEGER | DEFAULT 0 |
| is_active | INTEGER | DEFAULT 1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `cloud_storages`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | NOT NULL ('s3' / 'google_drive' / 'onedrive') |
| config | TEXT | JSON (encrypted credentials) |
| is_default | INTEGER | DEFAULT 0 |
| is_active | INTEGER | DEFAULT 1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `notification_channels`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | NOT NULL ('email' / 'telegram' / 'webhook') |
| config | TEXT | JSON (server, token, URL) |
| is_enabled | INTEGER | DEFAULT 1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `notification_rules`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| channel_id | INTEGER | FK → notification_channels.id |
| event_type | TEXT | NOT NULL |
| is_enabled | INTEGER | DEFAULT 1 |
| custom_subject | TEXT | NULL |
| custom_body | TEXT | NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `notification_logs`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| channel_id | INTEGER | FK → notification_channels.id |
| event_type | TEXT | |
| message | TEXT | |
| status | TEXT | ('sent' / 'failed') |
| error_message | TEXT | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `docker_cleanup_rules`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| cleanup_types | TEXT | NOT NULL DEFAULT '[]' |
| mode | TEXT | NOT NULL DEFAULT 'manual' ('manual' / 'auto') |
| schedule | TEXT | |
| threshold_pct | INTEGER | |
| enabled | INTEGER | DEFAULT 1 |
| keep_last_log | INTEGER | DEFAULT 10 |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `docker_cleanup_logs`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| rule_id | INTEGER | FK → docker_cleanup_rules.id ON DELETE SET NULL |
| triggered_by | TEXT | NOT NULL DEFAULT 'manual' |
| started_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| finished_at | DATETIME | |
| space_reclaimed | INTEGER | NOT NULL DEFAULT 0 |
| items_removed | TEXT | NOT NULL DEFAULT '{}' |
| errors | TEXT | NOT NULL DEFAULT '[]' |
| status | TEXT | NOT NULL DEFAULT 'running' |

### 1.3 WAF Tables (migrations 016 & 017)

#### `waf_sites`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| domain | TEXT | NOT NULL |
| backend_url | TEXT | NOT NULL |
| listen_port | INTEGER | NOT NULL DEFAULT 80 |
| ssl_port | INTEGER | NOT NULL DEFAULT 443 |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| mode | TEXT | NOT NULL DEFAULT 'blocking' |
| ssl_enabled | INTEGER | NOT NULL DEFAULT 0 |
| ssl_cert_path | TEXT | |
| ssl_key_path | TEXT | |
| health_check_path | TEXT | |
| max_connections | INTEGER | NOT NULL DEFAULT 2000 |
| timeout_client | INTEGER | NOT NULL DEFAULT 30000 |
| timeout_server | INTEGER | NOT NULL DEFAULT 30000 |
| description | TEXT | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_rules`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| rule_type | TEXT | NOT NULL DEFAULT 'custom' |
| category | TEXT | NOT NULL DEFAULT 'custom' |
| phase | INTEGER | NOT NULL DEFAULT 1 |
| action | TEXT | NOT NULL DEFAULT 'block' |
| rule_content | TEXT | NOT NULL |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| priority | INTEGER | NOT NULL DEFAULT 100 |
| log_level | TEXT | NOT NULL DEFAULT 'alert' |
| description | TEXT | |
| rule_group | TEXT | |
| owasp_rule_id | TEXT | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_owasp_categories`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| category_id | TEXT | NOT NULL UNIQUE |
| name | TEXT | NOT NULL |
| description | TEXT | |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| severity | TEXT | NOT NULL DEFAULT 'warning' |
| mitre_technique | TEXT | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_logs`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| timestamp | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| site_id | INTEGER | REFERENCES waf_sites(id) ON DELETE SET NULL |
| client_ip | TEXT | NOT NULL |
| method | TEXT | |
| uri | TEXT | |
| host | TEXT | |
| rule_id | TEXT | |
| rule_message | TEXT | |
| rule_severity | TEXT | |
| rule_category | TEXT | |
| action_taken | TEXT | NOT NULL DEFAULT 'allowed' |
| anomaly_score | REAL | |
| geo_country | TEXT | |
| user_agent | TEXT | |
| referer | TEXT | |
| response_code | INTEGER | |
| request_body | TEXT | |
| request_headers | TEXT | |
| matched_data | TEXT | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_stats`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| period | TEXT | NOT NULL |
| period_key | TEXT | NOT NULL |
| site_id | INTEGER | REFERENCES waf_sites(id) ON DELETE CASCADE |
| total_requests | INTEGER | NOT NULL DEFAULT 0 |
| blocked_requests | INTEGER | NOT NULL DEFAULT 0 |
| allowed_requests | INTEGER | NOT NULL DEFAULT 0 |
| sqli_count | INTEGER | NOT NULL DEFAULT 0 |
| xss_count | INTEGER | NOT NULL DEFAULT 0 |
| lfi_count | INTEGER | NOT NULL DEFAULT 0 |
| rce_count | INTEGER | NOT NULL DEFAULT 0 |
| other_count | INTEGER | NOT NULL DEFAULT 0 |
| top_blocked_ips | TEXT | |
| top_triggered_rules | TEXT | |
| avg_anomaly_score | REAL | |
| attack_types | TEXT | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | | (period, period_key, site_id) |

#### `waf_settings`

| Column | Type | Constraints |
|--------|------|-------------|
| key | TEXT | PRIMARY KEY |
| value | TEXT | NOT NULL |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_ip_list`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| ip_address | TEXT | NOT NULL |
| list_type | TEXT | NOT NULL DEFAULT 'whitelist' |
| description | TEXT | |
| expires_at | DATETIME | |
| created_by | INTEGER | REFERENCES users(id) |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| hit_count | INTEGER | NOT NULL DEFAULT 0 |
| last_hit | DATETIME | |
| is_cidr | INTEGER | NOT NULL DEFAULT 0 |
| source | TEXT | DEFAULT 'manual' |
| UNIQUE | | (ip_address, list_type) |

#### `waf_traffic_stats`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| site_id | INTEGER | REFERENCES waf_sites(id) ON DELETE CASCADE |
| period | TEXT | NOT NULL |
| period_key | TEXT | NOT NULL |
| hour | INTEGER | |
| date_key | TEXT | |
| total_bytes_in | INTEGER | NOT NULL DEFAULT 0 |
| total_bytes_out | INTEGER | NOT NULL DEFAULT 0 |
| total_requests | INTEGER | NOT NULL DEFAULT 0 |
| blocked_requests | INTEGER | NOT NULL DEFAULT 0 |
| avg_response_ms | REAL | NOT NULL DEFAULT 0 |
| max_response_ms | INTEGER | NOT NULL DEFAULT 0 |
| min_response_ms | INTEGER | NOT NULL DEFAULT 0 |
| p95_response_ms | INTEGER | NOT NULL DEFAULT 0 |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | | (period, period_key, site_id, hour, date_key) |

#### `waf_uri_list`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| uri_pattern | TEXT | NOT NULL |
| list_type | TEXT | NOT NULL DEFAULT 'whitelist' |
| action | TEXT | NOT NULL DEFAULT 'block' |
| description | TEXT | |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| priority | INTEGER | NOT NULL DEFAULT 100 |
| created_by | INTEGER | REFERENCES users(id) |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | | (uri_pattern, list_type) |

#### `waf_lua_scripts`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| description | TEXT | |
| script_content | TEXT | NOT NULL |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| priority | INTEGER | NOT NULL DEFAULT 100 |
| created_by | INTEGER | REFERENCES users(id) |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_ua_list`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| ua_pattern | TEXT | NOT NULL |
| list_type | TEXT | NOT NULL DEFAULT 'whitelist' |
| description | TEXT | |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| created_by | INTEGER | REFERENCES users(id) |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | | (ua_pattern, list_type) |

#### `waf_attack_signatures`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| signature | TEXT | NOT NULL UNIQUE |
| attack_type | TEXT | NOT NULL |
| severity | TEXT | NOT NULL DEFAULT 'warning' |
| pattern | TEXT | NOT NULL |
| description | TEXT | |
| match_count | INTEGER | NOT NULL DEFAULT 0 |
| last_seen | DATETIME | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_slow_requests`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| log_id | INTEGER | REFERENCES waf_logs(id) ON DELETE CASCADE |
| site_id | INTEGER | REFERENCES waf_sites(id) ON DELETE SET NULL |
| client_ip | TEXT | NOT NULL |
| method | TEXT | |
| uri | TEXT | |
| host | TEXT | |
| response_ms | INTEGER | NOT NULL |
| threshold_ms | INTEGER | NOT NULL DEFAULT 5000 |
| timestamp | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_geo_stats`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| site_id | INTEGER | REFERENCES waf_sites(id) ON DELETE CASCADE |
| country_code | TEXT | NOT NULL |
| total_requests | INTEGER | NOT NULL DEFAULT 0 |
| blocked_requests | INTEGER | NOT NULL DEFAULT 0 |
| period | TEXT | NOT NULL |
| period_key | TEXT | NOT NULL |
| UNIQUE | | (country_code, period, period_key, site_id) |

---

## 2. Configuration

### 2.1 Panel Configuration (`config/panel.json`)

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8888,
    "mode": "release"
  },
  "database": {
    "path": "data/panel.db",
    "max_connections": 10
  },
  "auth": {
    "jwt_secret": "",
    "token_expire": 24,
    "max_login_attempts": 5,
    "lockout_duration": 15,
    "bcrypt_cost": 12
  },
  "paths": {
    "base": "/ITDLUPanel",
    "backup_dir": "data/backups",
    "temp_dir": "data/tmp",
    "log_dir": "data/logs"
  },
  "panel": {
    "name": "ITDLUPanel",
    "language": "en",
    "ssl_enabled": false,
    "ssl_cert": "",
    "ssl_key": "",
    "admin_path": "/"
  }
}
```

### 2.2 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PANEL_PORT` | HTTP port | 8888 |
| `PANEL_HOST` | Bind address | 0.0.0.0 |
| `PANEL_CONFIG` | Config file path | config/panel.json |
| `GIN_MODE` | Gin mode (release/debug) | debug |

---

## 3. Notification Event Types

| Event Type | Severity | Description |
|------------|----------|-------------|
| `backup_failed` | high | Backup operation failed |
| `backup_success` | low | Backup completed successfully |
| `ssl_expiring` | high | SSL certificate expiring soon |
| `ssl_expired` | critical | SSL certificate expired |
| `disk_full` | critical | Disk usage above 90% |
| `disk_warning` | medium | Disk usage above 80% |
| `cpu_high` | medium | CPU usage above threshold |
| `memory_high` | medium | Memory usage above threshold |
| `service_down` | critical | Managed service stopped |
| `login_failed` | low | Failed login attempt |
| `login_success` | low | Successful login |
| `cron_failed` | high | Cron job execution failed |
| `cron_success` | low | Cron job completed |
| `docker_crash` | high | Container exited unexpectedly |
| `security_alert` | critical | Security-related event |
| `waf_blocked` | medium | WAF blocked a request |
| `waf_attack_detected` | high | WAF detected an attack pattern |

---

## 4. Supported Software & Versions

### Web Servers

| Software | Install | Configure | Monitor | Versions |
|----------|---------|-----------|---------|----------|
| Nginx | ✅ | ✅ | ✅ | Latest + specific |
| Apache | ✅ | ✅ | ✅ | 2.4.x |
| OpenLiteSpeed | ✅ | ✅ | ✅ | Latest |

### Databases

| Software | Install | Configure | Monitor | Versions |
|----------|---------|-----------|---------|----------|
| MySQL | ✅ | ✅ | ✅ | 5.7, 8.0 |
| MariaDB | ✅ | ✅ | ✅ | 10.x, 11.x |
| PostgreSQL | ✅ | ✅ | ✅ | Latest |
| MongoDB | ✅ | ✅ | ✅ | Latest |
| Redis | ✅ | ✅ | ✅ | Latest |

### Runtimes

| Software | Install | Configure | Monitor |
|----------|---------|-----------|---------|
| PHP (multiple) | ✅ | ✅ | ✅ |
| Node.js | ✅ | ✅ | — |
| Python | ✅ | ✅ | — |
| Go | ✅ | — | — |
| Java/Tomcat | ✅ | — | — |

### Management Tools

| Tool | Install | Configure |
|------|---------|-----------|
| phpMyAdmin | ✅ | — |
| pgAdmin | ✅ | — |
| Supervisor | ✅ | ✅ |
| Memcached | ✅ | ✅ |
| Elasticsearch | ✅ | — |
| FTP (PureFTPd) | ✅ | ✅ |

### WAF / Proxy

| Software | Install | Configure |
|----------|---------|-----------|
| HAProxy | ✅ | ✅ |
| Coraza SPOA | ✅ | ✅ |

### Storage Modules

| Module | Purpose |
|--------|---------|
| FTP Storage | Remote FTP backup destination |
| S3 / MinIO | S3-compatible object storage |
| Google Drive | Google Drive backup via OAuth2 |
| OneDrive | OneDrive backup via OAuth2 |

---

## 5. Software Installer Registry

The `installerRegistry` supports the following software:

```
nginx · apache · openlitespeed
php (7.4, 8.0, 8.1, 8.2, 8.3, 8.4)
mysql · mariadb · postgresql · mongodb
redis · memcached · supervisor
python · nodejs · golang · java-tomcat
pureftpd · phpmyadmin · pgadmin
elasticsearch · envoy
ftp_storage · s3_storage · google_drive · onedrive
```

Each installer implements:
- `IsInstalled() bool`
- `Install(ctx, version) error`
- `Uninstall() error`
- `GetVersion() (string, error)`
- `Start() error`
- `Stop() error`
- `Restart() error`
- `Reload() error`
- `GetConfig() (string, error)`
- `UpdateConfig(content) error`
- `Status() (string, error)`

---

## 6. RBAC Permission Reference

### Permission Tree

```
sites.*
  sites.read
  sites.create
  sites.edit
  sites.delete
  sites.config
  sites.ssl
databases.*
  databases.read
  databases.create
  databases.edit
  databases.delete
  databases.backup
files.*
  files.read
  files.write
  files.delete
docker.*
  docker.read
  docker.create
  docker.manage
  docker.cleanup
cron.*
  cron.read
  cron.create
  cron.edit
  cron.delete
logs.*
  logs.read
  logs.manage
backup.*
  backup.read
  backup.create
  backup.delete
  backup.restore
terminal.access
security.*
  security.manage
firewall.*
  firewall.read
  firewall.manage
software.*
  software.read
  software.manage
ssl.*
ftp.*
  ftp.read
  ftp.create
  ftp.edit
  ftp.delete
redis.*
  redis.read
  redis.manage
waf.*
  waf.read
  waf.manage
*
```

---

## 7. Build Specification

### 7.1 Build Requirements

| Requirement | Version |
|-------------|---------|
| Go | 1.25.0+ |
| Node.js | 18+ |
| npm | 9+ |

### 7.2 Build Process

```
npm install
npx vite build       → web/dist/
go generate          → embeds web/dist/ into web.go
CGO_ENABLED=0 go build → bin/itdlupanel (~60MB single binary)
```

### 7.3 Docker Build (multi-stage)

```dockerfile
FROM node:22-alpine AS frontend
WORKDIR /app
COPY web/ .
RUN npm ci && npx vite build

FROM golang:1.25-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
COPY . .
COPY --from=frontend /app/web/dist web/dist/
RUN CGO_ENABLED=0 go build -ldflags "-s -w" -o itdlupanel ./cmd/panel

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
COPY --from=backend /app/itdlupanel /usr/local/bin/
EXPOSE 8888
ENTRYPOINT ["itdlupanel"]
```

### 7.4 CLI Commands Reference

| Command | Description |
|---------|-------------|
| `itdlupanel -config config/panel.json` | Start server |
| `itdlupanel -version` | Print version |
| `itdlupanel reset-password -user admin -password secret123` | Reset password |
| `itdlupanel backup -type=site -all -max-keep=10` | Backup all sites |
| `itdlupanel backup -type=database -target=mydb` | Backup specific DB |
| `itdlupanel backup -type=panel` | Backup panel (DB + config) |
| `itdlupanel backup -type=site -target=example.com -storage=ftp -storage-id=1` | Backup with remote upload |
| `itdlupanel cron-run -id=5` | Run cron job #5 manually |

---

## 8. Metrics Retention Policy

The `MetricsCollector` stores metrics in SQLite with time-based retention:

| Table | Resolution | Default Retention |
|-------|-----------|-------------------|
| `metrics_raw` | Every `interval` seconds (default 60s) | 7 days |
| `metrics_5m` | 5-minute aggregates | 30 days |
| `metrics_1h` | Hourly aggregates | 90 days |
| `metrics_1d` | Daily aggregates | 365 days |

---

## 9. SSL Certificate Storage

| Type | Path |
|------|------|
| Panel cert | `/ITDLUPanel/server/data/ssl/panel/fullchain.pem` |
| Panel key | `/ITDLUPanel/server/data/ssl/panel/privkey.pem` |
| Domain certs | `/ITDLUPanel/server/data/ssl/sites/<domain>/fullchain.pem` |
| Domain keys | `/ITDLUPanel/server/data/ssl/sites/<domain>/privkey.pem` |

---

## 10. Vhost Paths

| Web Server | Config Path |
|-----------|-------------|
| Nginx | `/etc/nginx/sites-enabled/` + `/etc/nginx/sites-available/` |
| Apache | `/etc/apache2/sites-enabled/` + `/etc/apache2/sites-available/` |
| OLS | `/usr/local/lsws/conf/vhosts/` |

---

## 11. CLI Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (invalid args, failed operation) |
| 2 | Config file not found |
| 3 | Database error |
| 4 | Backup failed |
