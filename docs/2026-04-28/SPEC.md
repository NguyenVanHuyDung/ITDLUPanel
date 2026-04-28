# ITDLUPanel — Technical Specification

> **Version:** 1.0.0 · **Last updated:** 2026-04-28

---

## 1. Database Schema (SQLite)

### 1.1 Entity Relationship Diagram

```
users ──┬── user_roles ────── roles
        ├── user_sites ────── sites ──── domains
        ├── user_resources
        └── audit_logs

sites ──┬── domains
        ├── databases
        └── backups

crons ──── tasks
software ──── plugins
firewall_rules ──── firewall_settings
audit_logs

ftp_storages    (FTP backup targets)
cloud_storages  (S3/GDrive/OneDrive)

notification_channels ──── notification_rules
                      └── notification_logs

settings              (Key-value config)
schema_migrations      (Migration tracking)
```

### 1.2 Table Definitions

#### `users`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| username | TEXT | UNIQUE NOT NULL |
| email | TEXT | UNIQUE |
| password | TEXT | NOT NULL (bcrypt cost=12) |
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
| is_system | INTEGER | DEFAULT 0 (prevents deletion) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**Default system roles:**
- `admin` — `["*"]` (full access)
- `operator` — `["sites.*","databases.*","files.*","cron.*","backup.*","terminal.access","logs.*","docker.read","docker.create"]`
- `viewer` — `["sites.read","databases.read","files.read","logs.read","docker.read"]`

#### `user_roles`

| Column | Type | Constraints |
|--------|------|-------------|
| user_id | INTEGER | FK → users.id |
| role_id | INTEGER | FK → roles.id |
| PRIMARY KEY | | (user_id, role_id) |

#### `user_sites`

| Column | Type | Constraints |
|--------|------|-------------|
| user_id | INTEGER | FK → users.id |
| site_id | INTEGER | FK → sites.id |
| PRIMARY KEY | | (user_id, site_id) |

#### `user_resources`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| user_id | INTEGER | FK → users.id, UNIQUE |
| max_sites | INTEGER | DEFAULT 0 (0=unlimited) |
| max_databases | INTEGER | DEFAULT 0 |
| max_ftp_accounts | INTEGER | DEFAULT 0 |
| max_disk_mb | INTEGER | DEFAULT 0 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `sites`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| domain | TEXT | UNIQUE NOT NULL |
| description | TEXT | |
| root_path | TEXT | NOT NULL |
| php_version | TEXT | e.g. "8.2" |
| web_server | TEXT | "nginx" / "apache" / "ols" |
| ssl_enabled | INTEGER | DEFAULT 0 |
| force_https | INTEGER | DEFAULT 0 |
| status | INTEGER | DEFAULT 1 |
| user_id | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `domains`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| site_id | INTEGER | FK → sites.id |
| domain | TEXT | NOT NULL |
| type | TEXT | "alias" / "redirect" |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `databases`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| type | TEXT | "mysql" / "mariadb" |
| username | TEXT | NOT NULL |
| password | TEXT | Encrypted |
| site_id | INTEGER | FK → sites.id (optional) |
| user_id | INTEGER | FK → users.id |
| disk_quota | INTEGER | DEFAULT 0 (bytes) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `ftps`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| username | TEXT | UNIQUE NOT NULL |
| password | TEXT | Encrypted |
| path | TEXT | NOT NULL |
| status | INTEGER | DEFAULT 1 |
| site_id | INTEGER | FK → sites.id (optional) |
| user_id | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `crons`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| schedule | TEXT | NOT NULL (cron expression) |
| command | TEXT | NOT NULL |
| type | TEXT | "shell" / "url" |
| status | INTEGER | DEFAULT 1 (1=enabled, 0=disabled) |
| last_run | DATETIME | NULL |
| last_result | TEXT | NULL |
| user_id | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `tasks`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | "install" / "backup" / "restore" / etc. |
| status | TEXT | "pending" / "running" / "done" / "failed" |
| progress | INTEGER | 0–100 |
| message | TEXT | Status message |
| error | TEXT | Error message if failed |
| log | TEXT | Task log output |
| started_at | DATETIME | NULL |
| completed_at | DATETIME | NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `software`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| version | TEXT | |
| installed | INTEGER | DEFAULT 0 |
| status | TEXT | "running" / "stopped" / "not_installed" |
| port | INTEGER | NULL |
| config_path | TEXT | NULL |
| installed_at | DATETIME | NULL |

#### `backups`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | "site" / "database" / "panel" |
| target_id | INTEGER | NULL (site_id or database_id) |
| file_path | TEXT | NOT NULL |
| file_size | INTEGER | Bytes |
| storage_type | TEXT | "local" / "ftp" / "s3" / "google_drive" / "onedrive" |
| storage_id | INTEGER | FK to storage tables |
| status | TEXT | "completed" / "failed" |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `firewall_rules`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| port | TEXT | NOT NULL |
| protocol | TEXT | "tcp" / "udp" / "tcp/udp" |
| source | TEXT | IP or CIDR (default: "0.0.0.0/0") |
| action | TEXT | "allow" / "deny" |
| enabled | INTEGER | DEFAULT 1 |
| description | TEXT | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `firewall_settings`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| enabled | INTEGER | DEFAULT 0 |
| ping_enabled | INTEGER | DEFAULT 1 |
| ssh_port | INTEGER | DEFAULT 22 |

#### `ftp_storages`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| host | TEXT | NOT NULL |
| port | INTEGER | DEFAULT 21 |
| username | TEXT | NOT NULL |
| password | TEXT | Encrypted |
| remote_path | TEXT | DEFAULT "/" |
| is_default | INTEGER | DEFAULT 0 |
| is_active | INTEGER | DEFAULT 1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `cloud_storages`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | "s3" / "google_drive" / "onedrive" |
| config | TEXT | JSON (encrypted credentials) |
| is_default | INTEGER | DEFAULT 0 |
| is_active | INTEGER | DEFAULT 1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `audit_logs`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| user_id | INTEGER | FK → users.id |
| username | TEXT | |
| action | TEXT | NOT NULL |
| resource | TEXT | API path |
| resource_id | TEXT | |
| detail | TEXT | JSON |
| ip | TEXT | |
| user_agent | TEXT | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `notification_channels`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | "email" / "telegram" / "webhook" |
| config | TEXT | JSON (server, token, URL) |
| is_enabled | INTEGER | DEFAULT 1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `notification_rules`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| channel_id | INTEGER | FK → notification_channels.id |
| event_type | TEXT | Event name |
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
| status | TEXT | "sent" / "failed" |
| error_message | TEXT | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `settings`

| Column | Type | Constraints |
|--------|------|-------------|
| key | TEXT | PRIMARY KEY |
| value | TEXT | |

#### `plugins`

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| version | TEXT | |
| is_enabled | INTEGER | DEFAULT 1 |
| config | TEXT | JSON |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `schema_migrations`

| Column | Type | Constraints |
|--------|------|-------------|
| version | INTEGER | PRIMARY KEY |
| applied_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

---

## 2. Configuration

### 2.1 Panel Configuration (`config/panel.json`)

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8888,
    "ssl": true,
    "ssl_cert": "/ITDLUPanel/server/data/ssl/panel/fullchain.pem",
    "ssl_key": "/ITDLUPanel/server/data/ssl/panel/privkey.pem"
  },
  "database": {
    "path": "data/panel.db"
  },
  "auth": {
    "jwt_secret": "a42118ba7ed475a99967fc19cfaa687c356a6fc00d9ea7faa21742d74859c9d6",
    "access_token_ttl": 900,
    "refresh_token_ttl": 604800,
    "bcrypt_cost": 12
  },
  "paths": {
    "base": "/ITDLUPanel",
    "backup": "/ITDLUPanel/backup",
    "logs": "/ITDLUPanel/logs",
    "wwwroot": "/ITDLUPanel/wwwroot",
    "vhost": "/ITDLUPanel/server/vhost"
  },
  "panel": {
    "name": "DevPanel",
    "language": "en",
    "admin_path": "/",
    "setup_completed": false,
    "version": "1.0.0"
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

---

## 4. Supported Software & Versions

### Web Servers

| Software | Install | Configure | Monitor | Versions |
|----------|--------|-----------|---------|----------|
| Nginx | ✅ | ✅ | ✅ | Latest + specific |
| Apache | ✅ | ✅ | ✅ | 2.4.x |
| OpenLiteSpeed | ✅ | ✅ | ✅ | Latest |

### Databases

| Software | Install | Configure | Monitor | Versions |
|----------|--------|-----------|---------|----------|
| MySQL | ✅ | ✅ | ✅ | 5.7, 8.0 |
| MariaDB | ✅ | ✅ | ✅ | 10.x, 11.x |
| PostgreSQL | ✅ | ✅ | ✅ | Latest |
| MongoDB | ✅ | ✅ | ✅ | Latest |
| Redis | ✅ | ✅ | ✅ | Latest |

### Runtimes

| Software | Install | Configure | Monitor |
|----------|--------|-----------|---------|
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
elasticsearch
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
| GCC (for CGO-free SQLite) | Any |

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
|-------|-----------|----------------|
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
