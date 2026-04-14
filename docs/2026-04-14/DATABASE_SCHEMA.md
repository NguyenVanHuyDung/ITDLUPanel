# ITDLUPanel — Database Schema Reference

> **Version**: 4.0.0 · **Date**: 2026-04-14 · **Engine**: SQLite (pure Go via modernc.org/sqlite)

---

## Overview

ITDLUPanel uses a single SQLite database (`data/panel.db`) for all panel metadata. The schema is managed through 14 incremental Go migrations that run automatically on startup.

**Total Tables**: 30

---

## 1. Authentication & Authorization

### `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | User ID |
| username | TEXT | UNIQUE NOT NULL | Login username |
| password | TEXT | NOT NULL | bcrypt hash (cost 12) |
| email | TEXT | | Optional email address |
| role | TEXT | NOT NULL DEFAULT 'viewer' | Role name reference |
| totp_secret | TEXT | | TOTP secret key (encrypted) |
| totp_enabled | INTEGER | DEFAULT 0 | 2FA enabled flag |
| status | INTEGER | DEFAULT 1 | 1=active, 0=disabled |
| last_login | DATETIME | | Last login timestamp |
| last_ip | TEXT | | Last login IP address |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `roles`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | Role ID |
| name | TEXT | UNIQUE NOT NULL | Role name (e.g., admin, editor) |
| description | TEXT | | Role description |
| permissions | TEXT | NOT NULL | JSON array of permission strings |
| is_system | INTEGER | DEFAULT 0 | 1=built-in (cannot delete) |
| created_at | TEXT | DEFAULT '2025-01-01 00:00:00' | |
| updated_at | TEXT | DEFAULT '2025-01-01 00:00:00' | |

**Permissions format**: `["sites.*", "databases.read", "databases.create", "files.*"]`

### `user_roles`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | INTEGER | FK → users(id) ON DELETE CASCADE | |
| role_id | INTEGER | FK → roles(id) ON DELETE CASCADE | |
| | | PRIMARY KEY (user_id, role_id) | |

### `user_resources`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| user_id | INTEGER | NOT NULL FK → users(id) | |
| resource_type | TEXT | NOT NULL | 'site', 'database', 'ftp' |
| resource_id | INTEGER | NOT NULL | ID of the resource |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| | | UNIQUE(user_id, resource_type, resource_id) | |

**Index**: `idx_user_resources_user` ON (user_id, resource_type)

### `user_sites`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | INTEGER | NOT NULL FK → users(id) | |
| site_id | INTEGER | NOT NULL FK → sites(id) | |
| | | PRIMARY KEY (user_id, site_id) | |

**Indexes**: `idx_user_sites_user`, `idx_user_sites_site`

---

## 2. Web Infrastructure

### `sites`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | Site ID |
| name | TEXT | NOT NULL | Site display name |
| domain | TEXT | NOT NULL | Primary domain |
| path | TEXT | NOT NULL | Document root path |
| webserver | TEXT | NOT NULL | 'nginx', 'apache', 'openlitespeed' |
| php_version | TEXT | | PHP version (e.g., '8.3') |
| ssl_enabled | INTEGER | DEFAULT 0 | SSL active flag |
| ssl_type | TEXT | | 'letsencrypt', 'custom', 'self-signed' |
| ssl_expiry | DATETIME | | Certificate expiry date |
| status | INTEGER | DEFAULT 1 | 1=active, 0=stopped |
| config_extra | TEXT | | Additional config data (JSON) |
| created_by | INTEGER | FK → users(id) | Creator user |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| disk_quota | INTEGER | DEFAULT 0 | Max disk usage (bytes), 0=unlimited |
| disk_usage | INTEGER | DEFAULT 0 | Current disk usage (bytes) |
| description | TEXT | DEFAULT '' | Site description |
| site_type | TEXT | DEFAULT 'php' | 'php', 'static', 'reverse_proxy' |

**Index**: `idx_sites_domain` ON (domain)

### `domains`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| site_id | INTEGER | NOT NULL FK → sites(id) ON DELETE CASCADE | |
| domain | TEXT | NOT NULL | Domain name |
| is_primary | INTEGER | DEFAULT 0 | Primary domain flag |
| | | UNIQUE(site_id, domain) | |

**Index**: `idx_domains_site` ON (site_id)

### `ssl_certificates`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| domain | TEXT | PRIMARY KEY | Domain name |
| cert_type | TEXT | NOT NULL DEFAULT 'custom' | 'letsencrypt', 'custom', 'self-signed' |
| auto_renew | INTEGER | NOT NULL DEFAULT 0 | Auto-renewal flag |
| email | TEXT | DEFAULT '' | Let's Encrypt email |
| updated_at | DATETIME | DEFAULT datetime('now') | |

---

## 3. Databases & FTP

### `databases`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | NOT NULL | Database name |
| db_type | TEXT | NOT NULL | 'mysql', 'mariadb', 'postgresql' |
| username | TEXT | NOT NULL | Database user |
| password | TEXT | NOT NULL | Encrypted password |
| charset | TEXT | DEFAULT 'utf8mb4' | Character set |
| collation | TEXT | DEFAULT 'utf8mb4_general_ci' | Collation |
| remote_access | TEXT | DEFAULT 'localhost' | '%', 'localhost', or IP |
| size | INTEGER | DEFAULT 0 | Current size (bytes) |
| created_by | INTEGER | FK → users(id) | Creator |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| disk_quota | INTEGER | DEFAULT 0 | Max size (bytes), 0=unlimited |
| | | UNIQUE(name, db_type) | |

### `ftps`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| username | TEXT | UNIQUE NOT NULL | FTP username |
| password | TEXT | NOT NULL | Encrypted password |
| path | TEXT | NOT NULL | Home directory |
| status | INTEGER | DEFAULT 1 | 1=active, 0=disabled |
| created_by | INTEGER | FK → users(id) | Creator |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

---

## 4. Scheduling & Tasks

### `crons`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | NOT NULL | Job display name |
| type | TEXT | NOT NULL | 'shell', 'url', 'backup' |
| schedule | TEXT | NOT NULL | Cron expression (e.g., '0 2 * * *') |
| command | TEXT | NOT NULL | Command or URL to execute |
| status | INTEGER | DEFAULT 1 | 1=enabled, 0=disabled |
| last_run | DATETIME | | Last execution time |
| last_status | TEXT | | 'success', 'failed' |
| last_output | TEXT | | Last execution stdout/stderr |
| created_by | INTEGER | FK → users(id) | Creator |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `tasks`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| type | TEXT | NOT NULL | Task type (e.g., 'install', 'backup') |
| name | TEXT | NOT NULL | Display name |
| status | TEXT | DEFAULT 'pending' | 'pending', 'running', 'completed', 'failed' |
| progress | INTEGER | DEFAULT 0 | 0-100 percent |
| log | TEXT | | Execution log output |
| result | TEXT | | Result data (JSON) |
| error | TEXT | | Error message if failed |
| created_by | INTEGER | FK → users(id) | |
| started_at | DATETIME | | |
| completed_at | DATETIME | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Index**: `idx_tasks_status` ON (status)

---

## 5. Docker

### `docker_containers`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| container_id | TEXT | NOT NULL UNIQUE | Docker container ID |
| name | TEXT | NOT NULL | Container name |
| image | TEXT | NOT NULL | Docker image |
| status | TEXT | | Running/stopped/exited |
| ports | TEXT | | Port mappings (JSON) |
| volumes | TEXT | | Volume mounts (JSON) |
| env | TEXT | | Environment variables (JSON) |
| restart_policy | TEXT | DEFAULT 'no' | Restart policy |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

---

## 6. Security

### `firewall_rules`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| type | TEXT | NOT NULL | 'port', 'ip' |
| protocol | TEXT | DEFAULT 'tcp' | 'tcp', 'udp', 'tcp/udp' |
| port | TEXT | | Port number or range |
| ip | TEXT | | Source/destination IP |
| action | TEXT | NOT NULL | 'allow', 'deny' |
| direction | TEXT | DEFAULT 'in' | 'in', 'out' |
| description | TEXT | | Rule description |
| status | INTEGER | DEFAULT 1 | 1=active, 0=disabled |
| sort_order | INTEGER | DEFAULT 0 | Rule ordering |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| is_default | INTEGER | DEFAULT 0 | Built-in rule flag |

### `firewall_settings`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| key | TEXT | PRIMARY KEY | Setting key |
| value | TEXT | NOT NULL | Setting value |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `audit_logs`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| user_id | INTEGER | FK → users(id) | Acting user |
| username | TEXT | | Username (denormalized) |
| action | TEXT | NOT NULL | Action performed |
| resource | TEXT | NOT NULL | Resource type |
| resource_id | TEXT | | Affected resource ID |
| detail | TEXT | | Additional context (JSON) |
| ip | TEXT | | Client IP |
| user_agent | TEXT | | Browser user agent |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Indexes**: `idx_audit_user`, `idx_audit_action`, `idx_audit_created`

---

## 7. Backups & Storage

### `backups`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| type | TEXT | NOT NULL | 'site', 'database' |
| name | TEXT | NOT NULL | Backup filename |
| target_id | INTEGER | | Site or database ID |
| target_name | TEXT | | Site or database name |
| file_path | TEXT | NOT NULL | Local file path |
| file_size | INTEGER | DEFAULT 0 | Size in bytes |
| storage | TEXT | DEFAULT 'local' | 'local', 'ftp', 's3', 'gdrive', 'onedrive' |
| storage_id | INTEGER | FK → ftp_storages(id) | Remote storage reference |
| checksum | TEXT | | File hash |
| status | TEXT | DEFAULT 'completed' | 'completed', 'failed', 'in_progress' |
| created_by | INTEGER | FK → users(id) | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `ftp_storages`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | NOT NULL | Storage display name |
| host | TEXT | NOT NULL | FTP server hostname |
| port | INTEGER | DEFAULT 21 | FTP port |
| username | TEXT | NOT NULL | FTP username |
| password | TEXT | NOT NULL | FTP password (encrypted) |
| remote_path | TEXT | DEFAULT '/' | Remote directory |
| is_default | INTEGER | DEFAULT 0 | Default storage flag |
| is_active | INTEGER | DEFAULT 1 | Active flag |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `cloud_storages`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | NOT NULL | Storage display name |
| type | TEXT | NOT NULL | 's3', 'gdrive', 'onedrive' |
| config | TEXT | NOT NULL DEFAULT '{}' | Provider-specific config (JSON, AES-encrypted) |
| is_default | INTEGER | DEFAULT 0 | Default storage flag |
| is_active | INTEGER | DEFAULT 1 | Active flag |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**S3 config**: `{ "endpoint", "region", "bucket", "access_key", "secret_key", "use_ssl" }`
**GDrive config**: `{ "client_id", "client_secret", "access_token", "refresh_token", "folder_id" }`
**OneDrive config**: `{ "client_id", "client_secret", "access_token", "refresh_token", "folder_path" }`

---

## 8. Monitoring

### `monitor_metrics_raw`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| timestamp | DATETIME NOT NULL | Collection time |
| cpu_percent | REAL | CPU usage % |
| mem_percent | REAL | Memory usage % |
| mem_used | INTEGER | Memory used (bytes) |
| mem_total | INTEGER | Memory total (bytes) |
| swap_percent | REAL | Swap usage % |
| disk_percent | REAL | Disk usage % |
| disk_used | INTEGER | Disk used (bytes) |
| disk_total | INTEGER | Disk total (bytes) |
| disk_read | INTEGER | Disk read bytes |
| disk_write | INTEGER | Disk write bytes |
| net_sent | INTEGER | Network sent bytes |
| net_recv | INTEGER | Network received bytes |
| load1 | REAL | 1-minute load average |
| load5 | REAL | 5-minute load average |
| load15 | REAL | 15-minute load average |

**Indexes**: `idx_monitor_metrics_raw_ts` ON (timestamp)

> Tables `monitor_metrics_5m`, `monitor_metrics_1h`, `monitor_metrics_1d` have identical schemas with different granularity.

---

## 9. Notifications

### `notification_channels`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| type | TEXT | NOT NULL | 'email', 'telegram', 'webhook' |
| name | TEXT | NOT NULL | Channel display name |
| config | TEXT | NOT NULL DEFAULT '{}' | Provider config (JSON) |
| is_enabled | INTEGER | DEFAULT 1 | Active flag |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Email config**: `{ "smtp_host", "smtp_port", "username", "password", "from", "to" }`
**Telegram config**: `{ "bot_token", "chat_id" }`
**Webhook config**: `{ "url", "method", "headers" }`

### `notification_rules`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| event_type | TEXT | NOT NULL | Event type identifier |
| channel_id | INTEGER | NOT NULL FK → notification_channels(id) | |
| is_enabled | INTEGER | DEFAULT 1 | Rule active flag |
| custom_subject | TEXT | DEFAULT '' | Custom template subject |
| custom_body | TEXT | DEFAULT '' | Custom template body |
| | | UNIQUE(event_type, channel_id) | |

### `notification_logs`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| event_type | TEXT | NOT NULL | |
| channel_type | TEXT | NOT NULL | 'email', 'telegram', 'webhook' |
| recipient | TEXT | | Delivery target |
| subject | TEXT | | Message subject |
| message | TEXT | | Message body |
| status | TEXT | DEFAULT 'pending' | 'pending', 'sent', 'failed' |
| error | TEXT | | Error message if failed |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

---

## 10. System

### `software`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | UNIQUE NOT NULL | Package name |
| display_name | TEXT | NOT NULL | Friendly name |
| version | TEXT | NOT NULL | Installed version |
| type | TEXT | NOT NULL | 'webserver', 'runtime', 'database', 'tool' |
| status | INTEGER | DEFAULT 1 | 1=running, 0=stopped |
| config_path | TEXT | | Config file path |
| install_path | TEXT | | Installation directory |
| service_name | TEXT | | systemd service name |
| installed_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `plugins`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | UNIQUE NOT NULL | Plugin identifier |
| display_name | TEXT | NOT NULL | Friendly name |
| version | TEXT | NOT NULL | Plugin version |
| description | TEXT | | Plugin description |
| author | TEXT | | Plugin author |
| homepage | TEXT | | Plugin URL |
| status | INTEGER | DEFAULT 1 | 1=enabled, 0=disabled |
| config | TEXT | | Plugin config (JSON) |
| installed_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `settings`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| key | TEXT | PRIMARY KEY | Setting key |
| value | TEXT | NOT NULL | Setting value |
| description | TEXT | | Setting description |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `schema_migrations`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| version | INTEGER | PRIMARY KEY | Migration number |
| applied_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | When applied |

---

## Migration History

| Version | Name | Description |
|---------|------|-------------|
| 1 | init | Core tables (users, roles, sites, databases, ftps, crons, tasks, software, plugins, firewall, backups, audit, settings, docker, ssl) |
| 2 | monitor_metrics | Add 4-tier monitoring metrics tables |
| 3 | firewall_settings | Add firewall_settings key-value table |
| 4 | phpmyadmin_default_port | Set default phpMyAdmin port setting |
| 5 | quota | Add disk_quota/disk_usage to sites and databases |
| 6 | site_description | Add description and site_type to sites |
| 7 | permissions | Add is_system, timestamps to roles; create user_sites |
| 8 | panel_settings | Add default panel settings |
| 9 | ftp_storage | Add ftp_storages table |
| 10 | cloud_storages | Add cloud_storages table |
| 11 | user_resources | Add user_resources table |
| 12 | notifications | Add notification_channels, notification_rules, notification_logs |
| 13 | notification_templates | Add custom_subject, custom_body to notification_rules |
| 14 | site_type | Add site_type column to sites |
