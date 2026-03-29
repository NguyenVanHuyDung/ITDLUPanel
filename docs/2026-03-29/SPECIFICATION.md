# ITDLUPanel — Feature Specification

> **Version:** March 29, 2026  
> **Maintainer:** IT Department — Dalat University (ITDLU)

---

## Table of Contents

- [1. Product Overview](#1-product-overview)
- [2. Functional Modules](#2-functional-modules)
- [3. Complete API Route Listing](#3-complete-api-route-listing)
- [4. Database Schema](#4-database-schema)
- [5. User Roles & Permissions](#5-user-roles--permissions)
- [6. Configuration Reference](#6-configuration-reference)
- [7. Supported Software Matrix](#7-supported-software-matrix)
- [8. Frontend Pages](#8-frontend-pages)
- [9. Recent Changelog — March 2026](#9-recent-changelog--march-2026)

---

## 1. Product Overview

**ITDLUPanel** is a modern, open-source Linux server management panel built for the IT Department of Dalat University. It provides a comprehensive web-based interface for managing every aspect of a Linux server — from websites and databases to Docker containers and system security.

### Key Metrics

| Metric                  | Value                          |
|-------------------------|--------------------------------|
| Total API Routes        | 245 across 18 modules          |
| Backend Services        | 24 services (~476KB code)      |
| Frontend Page Modules   | 16 pages                       |
| Database Migrations     | 5 versions (20+ tables)        |
| Go Dependencies         | 13 direct                      |
| Frontend Dependencies   | 18 production + dev deps       |
| Languages Supported     | English, Vietnamese            |
| Supported OS            | Ubuntu 20.04+, Debian 11+      |

### Design Principles

1. **Single Binary** — Frontend embedded via `go:embed` for zero-dependency deployment
2. **Security First** — JWT + 2FA + RBAC + CSRF + rate limiting + audit logging
3. **Performance Defaults** — Auto-tuned MySQL, Nginx, PHP-FPM on installation
4. **Bilingual** — Full English and Vietnamese interface support
5. **Modern Stack** — Go 1.25, React 19, TypeScript 5.9, Ant Design 6

---

## 2. Functional Modules

### 2.1 Authentication (9 routes)

Full authentication system with multi-factor support.

- **Login/Logout** — Username/password authentication with bcrypt verification
- **JWT Tokens** — Short-lived access tokens (15 min) + long-lived refresh tokens (7 days)
- **Token Refresh** — Automatic token renewal without re-authentication
- **2FA (TOTP)** — Time-based one-time password with QR code provisioning
  - Enable/disable 2FA per user
  - QR code generation for authenticator apps
  - TOTP verification on login
- **Profile** — View current user info, change password

### 2.2 Users (5 routes)

User account management with role-based access control.

- **CRUD Operations** — Create, read, update, delete user accounts
- **Role Assignment** — Assign admin/operator/viewer roles
- **Password Reset** — Admin-initiated password reset for any user
- **Status Management** — Enable/disable user accounts
- **Admin-only** — Full module restricted to admin role

### 2.3 Dashboard (2 routes)

System overview with real-time metrics.

- **System Overview** — CPU, RAM, disk, network, uptime, OS info, load averages
- **Software Status** — Running status of installed services (Nginx, MySQL, PHP, etc.)
- **Quick Stats** — Website count, database count, cron job count
- **Security Overview** — Firewall status, blocked IPs, recent audit events

### 2.4 Websites (58 routes)

Comprehensive website/virtual host management — the largest module.

- **Site CRUD** — Create, list, get, update, delete websites
- **Start/Stop** — Enable/disable individual sites
- **Batch Operations** — Batch delete, batch PHP switch, batch SSL apply
- **PHP Version Switching** — Per-site PHP version selection
- **Vhost Config Editor** — Direct Nginx/Apache/OLS config editing

#### Domain Management
- Add/remove domain aliases
- Primary domain designation

#### SSL Integration
- Enable/disable SSL per site
- Apply certificate (Let's Encrypt or uploaded)

#### Site Configuration
- **Running Directory** — Set web root subdirectory
- **open_basedir** — PHP path restriction
- **Access Logging** — Enable/disable access logs
- **Password Protection** — HTTP Basic Auth for site or subdirectories
- **Disk Quota** — Per-site disk quota with usage tracking
- **Default Document** — Configure index file priority

#### Subdirectory Bindings
- Bind PHP applications to specific subdirectories
- Independent PHP version per subdirectory

#### Access Control
- **Limit Access** — Allow/deny rules by IP or CIDR
- **Deny Access** — Block specific paths or patterns

#### Traffic Control
- Bandwidth limiting per site
- Connection rate limiting

#### Reverse Proxy
- CRUD for reverse proxy rules
- Backend server configuration
- Header forwarding

#### Hotlink Protection
- Enable/disable hotlink protection
- Configure allowed referrer domains
- File extension filtering

#### Maintenance Mode
- Toggle maintenance mode
- Customizable maintenance page templates

#### Backup Management
- Site-level backup and restore (via Backup module)

### 2.5 Databases (13 routes)

MySQL/MariaDB database management.

- **CRUD** — Create, list, get, delete databases
- **Password Management** — Change database user passwords
- **Backup/Restore** — Per-database backup and restore
- **SQL Import** — Import SQL files directly
- **Remote Access** — Configure access permissions:
  - `localhost` — Local only
  - `%` — All remote hosts (Everyone)
  - Specific IP addresses
- **Disk Quota** — Per-database quota with size tracking
- **Database Size** — Real-time size calculation
- **Version Info** — Display MySQL/MariaDB version
- **Service Control** — Restart, reload, stop database service

### 2.6 Files (18 routes)

Full-featured file manager with code editor.

- **Browse** — Directory listing with metadata (size, permissions, owner, dates)
- **Read/Write** — File content editing with Monaco code editor
- **Upload/Download** — File upload (multipart) and download
- **Create** — New files and directories
- **Rename/Copy/Move** — File operations with conflict detection
- **Delete** — File and directory deletion (recursive)
- **Permissions** — Change file/directory permissions (chmod)
- **Ownership** — Change file/directory owner (chown)
- **Compress/Decompress** — zip, tar.gz, tar.bz2 archive operations
- **Search** — File name search with glob patterns
- **Content Search** — grep-like content search across files
- **Size Calculation** — Calculate directory size recursively

#### Frontend Features
- Grid and table view modes
- Breadcrumb navigation
- Quick-access bookmark bar
- Right-click context menu
- Drag-and-drop file operations
- Inline terminal popup
- Monaco code editor with syntax highlighting

### 2.7 Security (16 routes)

#### Firewall (12 routes)
- **Rule CRUD** — Add, list, delete firewall rules
- **Rule Toggle** — Enable/disable individual rules
- **Settings** — Global firewall configuration
- **Port Status** — Check which ports are open/closed
- **Blocked IPs** — Block/unblock IP addresses
- **UFW Status** — Firewall running status
- **Install UFW** — Install UFW if not present

#### SSH & Fail2ban (4 routes)
- **SSH Config** — View and modify SSH daemon configuration
  - Port, root login, password auth, key-only auth
- **Fail2ban** — View status and configure Fail2ban rules
  - Ban time, find time, max retry, jails

### 2.8 Docker (15 routes)

Docker container and resource management.

- **Info** — Docker daemon information
- **Containers** — List, create, get, remove containers
- **Lifecycle** — Start, stop, restart containers
- **Logs** — View container log output
- **Stats** — Real-time container resource usage
- **Images** — List, pull, remove images
- **Networks** — List Docker networks
- **Volumes** — List Docker volumes

### 2.9 Cron Jobs (8 routes)

Scheduled task management.

- **CRUD** — Create, list, get, update, delete cron jobs
- **Status Toggle** — Enable/disable individual jobs
- **Execution Log** — View output of past executions
- **Run Now** — Trigger immediate execution
- **Schedule Builder** — Frontend UI for building cron expressions
- **Templates** — Pre-built cron job templates

### 2.10 Software / App Store (35 routes)

Software lifecycle management with installation progress tracking.

#### Core Operations (13 routes)
- **List** — Installed software with status
- **Install/Uninstall** — Background task-based installation
- **Stack Install** — Install complete LEMP/LAMP stacks
- **Service Control** — Start, stop, restart, reload services
- **Status** — Service running status
- **Config** — View/edit software configuration
- **Metrics** — Service performance metrics
- **Error Log** — Service error logs

#### PHP Management (16 routes)
- **Multi-version** — Install/manage PHP 7.4, 8.0, 8.1, 8.2, 8.3
- **Extensions** — Install/uninstall PHP extensions
- **Config Files** — View/edit php.ini
- **FPM Config** — View/edit PHP-FPM pool configuration
- **Disabled Functions** — Manage disable_functions list
- **FPM Status** — Real-time FPM pool status and load
- **Slow Log** — View/configure PHP-FPM slow log
- **phpinfo** — Full PHP information display

#### Web Server & Others (6 routes)
- **Nginx Versions** — Available stable/mainline versions
- **phpMyAdmin Manager** — Configure phpMyAdmin settings, PHP version
- **Optimization** — View/edit performance optimization settings

### 2.11 Monitor (10 routes + 1 WebSocket)

System monitoring with historical data.

- **System Metrics** — Current CPU, RAM, disk, network, load averages
- **Process List** — Running processes with resource usage
- **Kill Process** — Terminate processes by PID
- **Service Status** — Status of managed services
- **Network Stats** — Interface statistics
- **Disk Usage** — Per-partition disk usage
- **Historical Metrics** — CPU, RAM, disk, network charts over time
  - Raw data (24h retention)
  - 5-minute aggregation (7-day retention)
  - 1-hour aggregation (30-day retention)
  - 1-day aggregation (365-day retention)
- **History Cleanup** — Clear historical data
- **Monitor Settings** — Configure collection interval, retention (admin)
- **Real-time WebSocket** — Live metric streaming (~2s interval)

### 2.12 Logs (10 routes)

Centralized log viewer.

- **Panel Log** — ITDLUPanel application log
- **Website Logs** — Per-site access and error logs
- **Log Dates** — Available log dates for a site
- **Clear Logs** — Delete website logs by type
- **Site List** — Sites available for log viewing
- **SSH Log** — SSH authentication log
- **Audit Log** — Panel audit trail (user actions)
- **Clear by Type** — Clear panel, SSH, or audit logs
- **Search** — Full-text search across logs

### 2.13 Backup (8 routes)

Website and database backup management.

- **List** — All backups with metadata
- **Create** — New backup (site or database)
- **Get/Delete** — Backup details and removal
- **Restore** — Restore from backup
- **Download** — Download backup archive
- **Backup Counts** — Per-site and per-database backup counts
- **Retention** — Automatic cleanup of old backups

### 2.14 SSL Certificates (9 routes)

SSL/TLS certificate management.

- **List Certificates** — All managed certificates
- **Get/Delete** — Certificate details and removal
- **Let's Encrypt** — Automatic certificate issuance via ACME
- **Custom Upload** — Upload PEM certificate + private key
- **Renew** — Manual certificate renewal
- **Panel SSL** — Configure HTTPS for the panel itself
- **Self-Signed** — Generate self-signed certificate for panel

### 2.15 FTP (7 routes)

Pure-FTPd account management.

- **CRUD** — Create, list, get, update, delete FTP accounts
- **Password** — Change FTP account password
- **Status** — Enable/disable FTP accounts
- **Path** — Set home directory per account

### 2.16 Settings (7 routes)

Panel configuration management.

- **Get/Update** — View and modify panel settings
- **Panel Port** — Change the panel listening port
- **Panel SSL** — Enable/disable HTTPS for panel
- **Panel Info** — Panel version and system info
- **Admin Path** — Custom admin URL path (security through obscurity)
- **Language** — Switch panel language (en/vi)

### 2.17 Tasks (5 routes)

Background task monitoring.

- **List** — Active and completed tasks
- **Summary** — Task count by status
- **Details** — Individual task info
- **Log** — Task execution log
- **Cancel** — Cancel running task

### 2.18 Plugins (7 routes)

Plugin system for extensibility.

- **List Installed** — Currently installed plugins
- **Store** — Available plugins for installation
- **Install/Uninstall** — Plugin lifecycle
- **Enable/Disable** — Toggle plugin status
- **Config** — View/edit plugin configuration

### 2.19 WebSocket Endpoints (2 routes)

- **Terminal** — Full PTY terminal via xterm.js (`/api/v1/terminal`)
- **Monitor** — Real-time system metrics (`/api/v1/monitor/realtime`)

### 2.20 Health (1 route)

- **Health Check** — `GET /api/v1/health` (no auth required)

---

## 3. Complete API Route Listing

### 3.1 Authentication — `/api/v1/auth` (9 routes)

| Method | Path                     | Auth     | Description              |
|--------|--------------------------|----------|--------------------------|
| POST   | `/auth/login`            | None     | User login               |
| POST   | `/auth/refresh`          | None     | Refresh access token     |
| POST   | `/auth/2fa/verify`       | None     | Verify 2FA TOTP code     |
| POST   | `/auth/logout`           | JWT      | User logout              |
| GET    | `/auth/me`               | JWT      | Get current user         |
| PUT    | `/auth/password`         | JWT      | Change password          |
| GET    | `/auth/2fa/qrcode`       | JWT      | Get 2FA QR code          |
| POST   | `/auth/2fa/enable`       | JWT      | Enable 2FA               |
| POST   | `/auth/2fa/disable`      | JWT      | Disable 2FA              |

### 3.2 Users — `/api/v1/users` (5 routes)

| Method | Path                     | Auth        | Description           |
|--------|--------------------------|-------------|-----------------------|
| GET    | `/users`                 | JWT + Admin | List users (paginated)|
| POST   | `/users`                 | JWT + Admin | Create user           |
| PUT    | `/users/:id`             | JWT + Admin | Update user           |
| PUT    | `/users/:id/password`    | JWT + Admin | Reset user password   |
| DELETE | `/users/:id`             | JWT + Admin | Delete user           |

### 3.3 Dashboard — `/api/v1/dashboard` (2 routes)

| Method | Path                     | Auth | Description           |
|--------|--------------------------|------|-----------------------|
| GET    | `/dashboard`             | JWT  | System overview       |
| GET    | `/dashboard/software`    | JWT  | Software status       |

### 3.4 Monitor — `/api/v1/monitor` (11 routes)

| Method | Path                     | Auth        | Description              |
|--------|--------------------------|-------------|--------------------------|
| GET    | `/monitor/system`        | JWT         | System metrics           |
| GET    | `/monitor/processes`     | JWT         | Process list             |
| POST   | `/monitor/processes/kill`| JWT         | Kill process             |
| GET    | `/monitor/services`      | JWT         | Service status           |
| GET    | `/monitor/network`       | JWT         | Network stats            |
| GET    | `/monitor/disk`          | JWT         | Disk usage               |
| GET    | `/monitor/history`       | JWT         | Historical metrics       |
| DELETE | `/monitor/history`       | JWT         | Clean history            |
| GET    | `/monitor/settings`      | JWT + Admin | Monitor settings         |
| PUT    | `/monitor/settings`      | JWT + Admin | Update settings          |
| GET    | `/monitor/realtime`      | JWT (WS)    | WebSocket real-time      |

### 3.5 Software — `/api/v1/software` (35 routes)

| Method | Path                                              | Auth        | Description              |
|--------|----------------------------------------------------|-------------|--------------------------|
| GET    | `/software`                                        | JWT + Admin | List software            |
| POST   | `/software/install`                                | JWT + Admin | Install software         |
| POST   | `/software/install-stack`                          | JWT + Admin | Install stack            |
| DELETE | `/software/:name`                                  | JWT + Admin | Uninstall software       |
| POST   | `/software/:name/start`                            | JWT + Admin | Start service            |
| POST   | `/software/:name/stop`                             | JWT + Admin | Stop service             |
| POST   | `/software/:name/restart`                          | JWT + Admin | Restart service          |
| GET    | `/software/:name/status`                           | JWT + Admin | Service status           |
| GET    | `/software/:name/config`                           | JWT + Admin | Get config               |
| PUT    | `/software/:name/config`                           | JWT + Admin | Update config            |
| POST   | `/software/:name/reload`                           | JWT + Admin | Reload service           |
| GET    | `/software/:name/metrics`                          | JWT + Admin | Service metrics          |
| GET    | `/software/:name/error-log`                        | JWT + Admin | Error log                |
| GET    | `/software/:name/optimization`                     | JWT + Admin | Optimization settings    |
| PUT    | `/software/:name/optimization`                     | JWT + Admin | Update optimization      |
| GET    | `/software/nginx/available-versions`               | JWT + Admin | Nginx versions           |
| GET    | `/software/phpmyadmin/php-versions`                | JWT + Admin | phpMyAdmin PHP versions  |
| GET    | `/software/phpmyadmin/manager`                     | JWT + Admin | phpMyAdmin config        |
| PUT    | `/software/phpmyadmin/manager`                     | JWT + Admin | Update phpMyAdmin        |
| GET    | `/software/php/:version/extensions`                | JWT + Admin | List PHP extensions      |
| POST   | `/software/php/:version/extensions/install`        | JWT + Admin | Install extension        |
| POST   | `/software/php/:version/extensions/uninstall`      | JWT + Admin | Uninstall extension      |
| GET    | `/software/php/:version/config`                    | JWT + Admin | PHP config               |
| PUT    | `/software/php/:version/config`                    | JWT + Admin | Update PHP config        |
| GET    | `/software/php/:version/config-file`               | JWT + Admin | PHP config file          |
| PUT    | `/software/php/:version/config-file`               | JWT + Admin | Update config file       |
| GET    | `/software/php/:version/error-log`                 | JWT + Admin | PHP error log            |
| GET    | `/software/php/:version/fpm-config`                | JWT + Admin | FPM config               |
| PUT    | `/software/php/:version/fpm-config`                | JWT + Admin | Update FPM config        |
| GET    | `/software/php/:version/disable-functions`         | JWT + Admin | Disabled functions       |
| PUT    | `/software/php/:version/disable-functions`         | JWT + Admin | Update disabled funcs    |
| GET    | `/software/php/:version/fpm-status`                | JWT + Admin | FPM status               |
| GET    | `/software/php/:version/slow-log`                  | JWT + Admin | Slow log                 |
| PUT    | `/software/php/:version/slow-log-config`           | JWT + Admin | Slow log config          |
| GET    | `/software/php/:version/phpinfo`                   | JWT + Admin | PHP info                 |

### 3.6 Websites — `/api/v1/sites` (58 routes)

| Method | Path                                        | Auth              | Description                |
|--------|----------------------------------------------|-------------------|----------------------------|
| GET    | `/sites`                                     | JWT + `sites.*`   | List sites                 |
| POST   | `/sites`                                     | JWT + `sites.*`   | Create site                |
| GET    | `/sites/:id`                                 | JWT + `sites.*`   | Get site                   |
| PUT    | `/sites/:id`                                 | JWT + `sites.*`   | Update site                |
| DELETE | `/sites/:id`                                 | JWT + `sites.*`   | Delete site                |
| POST   | `/sites/:id/start`                           | JWT + `sites.*`   | Start site                 |
| POST   | `/sites/:id/stop`                            | JWT + `sites.*`   | Stop site                  |
| GET    | `/sites/php-versions`                        | JWT + `sites.*`   | List PHP versions          |
| POST   | `/sites/batch/delete`                        | JWT + `sites.*`   | Batch delete               |
| PUT    | `/sites/batch/php`                           | JWT + `sites.*`   | Batch PHP switch           |
| POST   | `/sites/batch/ssl`                           | JWT + `sites.*`   | Batch SSL apply            |
| GET    | `/sites/:id/config`                          | JWT + `sites.*`   | Get vhost config           |
| PUT    | `/sites/:id/config`                          | JWT + `sites.*`   | Update vhost config        |
| PUT    | `/sites/:id/php`                             | JWT + `sites.*`   | Switch PHP version         |
| PUT    | `/sites/:id/directory`                       | JWT + `sites.*`   | Update directory           |
| GET    | `/sites/:id/subdirs`                         | JWT + `sites.*`   | List subdirectories        |
| PUT    | `/sites/:id/running-directory`               | JWT + `sites.*`   | Set running directory      |
| GET    | `/sites/:id/open-basedir`                    | JWT + `sites.*`   | Get open_basedir           |
| PUT    | `/sites/:id/open-basedir`                    | JWT + `sites.*`   | Set open_basedir           |
| GET    | `/sites/:id/access-log`                      | JWT + `sites.*`   | Get access log config      |
| PUT    | `/sites/:id/access-log`                      | JWT + `sites.*`   | Update access log          |
| GET    | `/sites/:id/password-access`                 | JWT + `sites.*`   | Get password protection    |
| PUT    | `/sites/:id/password-access`                 | JWT + `sites.*`   | Set password protection    |
| PUT    | `/sites/:id/quota`                           | JWT + `sites.*`   | Set disk quota             |
| GET    | `/sites/:id/disk-usage`                      | JWT + `sites.*`   | Get disk usage             |
| GET    | `/sites/:id/domains`                         | JWT + `sites.*`   | List domains               |
| POST   | `/sites/:id/domains`                         | JWT + `sites.*`   | Add domain                 |
| DELETE | `/sites/:id/domains/:did`                    | JWT + `sites.*`   | Remove domain              |
| GET    | `/sites/:id/ssl`                             | JWT + `sites.*`   | Get SSL info               |
| POST   | `/sites/:id/ssl/enable`                      | JWT + `sites.*`   | Enable SSL                 |
| POST   | `/sites/:id/ssl/disable`                     | JWT + `sites.*`   | Disable SSL                |
| POST   | `/sites/:id/ssl/apply`                       | JWT + `sites.*`   | Apply certificate          |
| GET    | `/sites/:id/subdir-bindings`                 | JWT + `sites.*`   | Get subdir bindings        |
| POST   | `/sites/:id/subdir-bindings`                 | JWT + `sites.*`   | Add subdir binding         |
| DELETE | `/sites/:id/subdir-bindings/:index`          | JWT + `sites.*`   | Remove subdir binding      |
| GET    | `/sites/:id/limit-access`                    | JWT + `sites.*`   | Get limit access           |
| POST   | `/sites/:id/limit-access`                    | JWT + `sites.*`   | Add limit access rule      |
| DELETE | `/sites/:id/limit-access/:index`             | JWT + `sites.*`   | Remove limit access rule   |
| GET    | `/sites/:id/deny-access`                     | JWT + `sites.*`   | Get deny access            |
| POST   | `/sites/:id/deny-access`                     | JWT + `sites.*`   | Add deny access rule       |
| DELETE | `/sites/:id/deny-access/:index`              | JWT + `sites.*`   | Remove deny access rule    |
| GET    | `/sites/:id/traffic-control`                 | JWT + `sites.*`   | Get traffic control        |
| PUT    | `/sites/:id/traffic-control`                 | JWT + `sites.*`   | Set traffic control        |
| GET    | `/sites/:id/default-doc`                     | JWT + `sites.*`   | Get default document       |
| PUT    | `/sites/:id/default-doc`                     | JWT + `sites.*`   | Set default document       |
| GET    | `/sites/:id/hotlink`                         | JWT + `sites.*`   | Get hotlink config         |
| PUT    | `/sites/:id/hotlink`                         | JWT + `sites.*`   | Set hotlink config         |
| GET    | `/sites/:id/maintenance`                     | JWT + `sites.*`   | Get maintenance config     |
| PUT    | `/sites/:id/maintenance`                     | JWT + `sites.*`   | Set maintenance config     |
| GET    | `/sites/:id/maintenance/templates`           | JWT + `sites.*`   | Get maintenance templates  |
| GET    | `/sites/:id/reverse-proxy`                   | JWT + `sites.*`   | Get reverse proxy rules    |
| POST   | `/sites/:id/reverse-proxy`                   | JWT + `sites.*`   | Add reverse proxy rule     |
| PUT    | `/sites/:id/reverse-proxy/:index`            | JWT + `sites.*`   | Update reverse proxy rule  |
| DELETE | `/sites/:id/reverse-proxy/:index`            | JWT + `sites.*`   | Remove reverse proxy rule  |

*Note: Remaining 4 routes come from the Backup module's site-related endpoints.*

### 3.7 SSL Certificates — `/api/v1/ssl` (9 routes)

| Method | Path                        | Auth        | Description              |
|--------|-----------------------------|-------------|--------------------------|
| GET    | `/ssl/certificates`         | JWT + Admin | List certificates        |
| GET    | `/ssl/certificates/:domain` | JWT + Admin | Get certificate          |
| DELETE | `/ssl/certificates/:domain` | JWT + Admin | Delete certificate       |
| POST   | `/ssl/letsencrypt`          | JWT + Admin | Issue Let's Encrypt cert |
| POST   | `/ssl/upload`               | JWT + Admin | Upload custom cert       |
| POST   | `/ssl/renew/:domain`        | JWT + Admin | Renew certificate        |
| GET    | `/ssl/panel`                | JWT + Admin | Get panel SSL config     |
| POST   | `/ssl/panel`                | JWT + Admin | Configure panel SSL      |
| POST   | `/ssl/panel/self-signed`    | JWT + Admin | Generate self-signed     |

### 3.8 Databases — `/api/v1/databases` (13 routes)

| Method | Path                        | Auth                | Description           |
|--------|-----------------------------|---------------------|-----------------------|
| GET    | `/databases`                | JWT + `databases.*` | List databases        |
| POST   | `/databases`                | JWT + `databases.*` | Create database       |
| GET    | `/databases/:id`            | JWT + `databases.*` | Get database          |
| DELETE | `/databases/:id`            | JWT + `databases.*` | Delete database       |
| PUT    | `/databases/:id/password`   | JWT + `databases.*` | Change password       |
| POST   | `/databases/:id/backup`     | JWT + `databases.*` | Backup database       |
| POST   | `/databases/:id/restore`    | JWT + `databases.*` | Restore database      |
| POST   | `/databases/:id/import`     | JWT + `databases.*` | Import SQL file       |
| PUT    | `/databases/:id/access`     | JWT + `databases.*` | Set remote access     |
| GET    | `/databases/:id/size`       | JWT + `databases.*` | Get database size     |
| PUT    | `/databases/:id/quota`      | JWT + `databases.*` | Set disk quota        |
| GET    | `/databases/version`        | JWT + `databases.*` | Get DB version        |
| POST   | `/databases/service`        | JWT + `databases.*` | Control service       |

### 3.9 FTP — `/api/v1/ftp` (7 routes)

| Method | Path                   | Auth            | Description        |
|--------|------------------------|-----------------|--------------------|
| GET    | `/ftp`                 | JWT + `ftp.*`   | List accounts      |
| POST   | `/ftp`                 | JWT + `ftp.*`   | Create account     |
| GET    | `/ftp/:id`             | JWT + `ftp.*`   | Get account        |
| PUT    | `/ftp/:id`             | JWT + `ftp.*`   | Update account     |
| DELETE | `/ftp/:id`             | JWT + `ftp.*`   | Delete account     |
| PUT    | `/ftp/:id/password`    | JWT + `ftp.*`   | Change password    |
| PUT    | `/ftp/:id/status`      | JWT + `ftp.*`   | Enable/disable     |

### 3.10 Files — `/api/v1/files` (18 routes)

| Method | Path                   | Auth             | Description        |
|--------|------------------------|------------------|--------------------|
| GET    | `/files`               | JWT + `files.*`  | List files         |
| GET    | `/files/content`       | JWT + `files.*`  | Read file          |
| PUT    | `/files/content`       | JWT + `files.*`  | Write file         |
| POST   | `/files/upload`        | JWT + `files.*`  | Upload file        |
| GET    | `/files/download`      | JWT + `files.*`  | Download file      |
| POST   | `/files/mkdir`         | JWT + `files.*`  | Create directory   |
| POST   | `/files/create`        | JWT + `files.*`  | Create file        |
| POST   | `/files/rename`        | JWT + `files.*`  | Rename             |
| POST   | `/files/copy`          | JWT + `files.*`  | Copy               |
| POST   | `/files/move`          | JWT + `files.*`  | Move               |
| DELETE | `/files`               | JWT + `files.*`  | Delete             |
| PUT    | `/files/permissions`   | JWT + `files.*`  | Change permissions |
| PUT    | `/files/owner`         | JWT + `files.*`  | Change owner       |
| POST   | `/files/compress`      | JWT + `files.*`  | Compress           |
| POST   | `/files/decompress`    | JWT + `files.*`  | Decompress         |
| GET    | `/files/search`        | JWT + `files.*`  | Search files       |
| GET    | `/files/search-content`| JWT + `files.*`  | Search content     |
| POST   | `/files/calculate-size`| JWT + `files.*`  | Calculate size     |

### 3.11 Cron Jobs — `/api/v1/crons` (8 routes)

| Method | Path                   | Auth            | Description        |
|--------|------------------------|-----------------|--------------------|
| GET    | `/crons`               | JWT + `cron.*`  | List jobs          |
| POST   | `/crons`               | JWT + `cron.*`  | Create job         |
| GET    | `/crons/:id`           | JWT + `cron.*`  | Get job            |
| PUT    | `/crons/:id`           | JWT + `cron.*`  | Update job         |
| DELETE | `/crons/:id`           | JWT + `cron.*`  | Delete job         |
| PUT    | `/crons/:id/status`    | JWT + `cron.*`  | Enable/disable     |
| GET    | `/crons/:id/log`       | JWT + `cron.*`  | Get log            |
| POST   | `/crons/:id/run`       | JWT + `cron.*`  | Run immediately    |

### 3.12 Firewall — `/api/v1/firewall` (12 routes)

| Method | Path                       | Auth        | Description        |
|--------|----------------------------|-------------|--------------------|
| GET    | `/firewall/rules`          | JWT + Admin | List rules         |
| POST   | `/firewall/rules`          | JWT + Admin | Add rule           |
| DELETE | `/firewall/rules/:id`      | JWT + Admin | Delete rule        |
| PUT    | `/firewall/rules/:id/status`| JWT + Admin| Toggle rule        |
| GET    | `/firewall/settings`       | JWT + Admin | Get settings       |
| PUT    | `/firewall/settings`       | JWT + Admin | Update settings    |
| GET    | `/firewall/port-status`    | JWT + Admin | Port statuses      |
| GET    | `/firewall/blocked-ips`    | JWT + Admin | Blocked IPs        |
| POST   | `/firewall/blocked-ips`    | JWT + Admin | Block IP           |
| DELETE | `/firewall/blocked-ips`    | JWT + Admin | Unblock IP         |
| GET    | `/firewall/status`         | JWT + Admin | Firewall status    |
| POST   | `/firewall/install`        | JWT + Admin | Install UFW        |

### 3.13 Security — `/api/v1/security` (4 routes)

| Method | Path                   | Auth        | Description        |
|--------|------------------------|-------------|--------------------|
| GET    | `/security/ssh`        | JWT + Admin | Get SSH config     |
| PUT    | `/security/ssh`        | JWT + Admin | Update SSH config  |
| GET    | `/security/fail2ban`   | JWT + Admin | Get Fail2ban       |
| PUT    | `/security/fail2ban`   | JWT + Admin | Configure Fail2ban |

### 3.14 Docker — `/api/v1/docker` (15 routes)

| Method | Path                              | Auth              | Description       |
|--------|-----------------------------------|-------------------|-------------------|
| GET    | `/docker/info`                    | JWT + `docker.*`  | Docker info       |
| GET    | `/docker/containers`              | JWT + `docker.*`  | List containers   |
| POST   | `/docker/containers`              | JWT + `docker.*`  | Create container  |
| GET    | `/docker/containers/:id`          | JWT + `docker.*`  | Get container     |
| DELETE | `/docker/containers/:id`          | JWT + `docker.*`  | Remove container  |
| POST   | `/docker/containers/:id/start`    | JWT + `docker.*`  | Start container   |
| POST   | `/docker/containers/:id/stop`     | JWT + `docker.*`  | Stop container    |
| POST   | `/docker/containers/:id/restart`  | JWT + `docker.*`  | Restart container |
| GET    | `/docker/containers/:id/logs`     | JWT + `docker.*`  | Container logs    |
| GET    | `/docker/containers/:id/stats`    | JWT + `docker.*`  | Container stats   |
| GET    | `/docker/images`                  | JWT + `docker.*`  | List images       |
| POST   | `/docker/images/pull`             | JWT + `docker.*`  | Pull image        |
| DELETE | `/docker/images/:id`              | JWT + `docker.*`  | Remove image      |
| GET    | `/docker/networks`                | JWT + `docker.*`  | List networks     |
| GET    | `/docker/volumes`                 | JWT + `docker.*`  | List volumes      |

### 3.15 Logs — `/api/v1/logs` (10 routes)

| Method | Path                            | Auth            | Description        |
|--------|---------------------------------|-----------------|--------------------|
| GET    | `/logs/panel`                   | JWT + `logs.*`  | Panel log          |
| GET    | `/logs/website/:id/access`      | JWT + `logs.*`  | Website access log |
| GET    | `/logs/website/:id/error`       | JWT + `logs.*`  | Website error log  |
| GET    | `/logs/website/:id/dates`       | JWT + `logs.*`  | Log dates          |
| DELETE | `/logs/website/:id/:logType`    | JWT + `logs.*`  | Clear website log  |
| GET    | `/logs/sites`                   | JWT + `logs.*`  | List sites         |
| GET    | `/logs/ssh`                     | JWT + `logs.*`  | SSH log            |
| GET    | `/logs/audit`                   | JWT + `logs.*`  | Audit log          |
| DELETE | `/logs/:type`                   | JWT + `logs.*`  | Clear log          |
| GET    | `/logs/search`                  | JWT + `logs.*`  | Search logs        |

### 3.16 Backup — `/api/v1/backups` (8 routes)

| Method | Path                        | Auth              | Description        |
|--------|-----------------------------|-----------------  |--------------------|
| GET    | `/backups`                  | JWT + `backup.*`  | List backups       |
| POST   | `/backups`                  | JWT + `backup.*`  | Create backup      |
| GET    | `/backups/site-counts`      | JWT + `backup.*`  | Site backup counts |
| GET    | `/backups/database-counts`  | JWT + `backup.*`  | DB backup counts   |
| GET    | `/backups/:id`              | JWT + `backup.*`  | Get backup         |
| DELETE | `/backups/:id`              | JWT + `backup.*`  | Delete backup      |
| POST   | `/backups/:id/restore`      | JWT + `backup.*`  | Restore backup     |
| GET    | `/backups/:id/download`     | JWT + `backup.*`  | Download backup    |

### 3.17 Tasks — `/api/v1/tasks` (5 routes)

| Method | Path               | Auth | Description        |
|--------|---------------------|------|--------------------|
| GET    | `/tasks`            | JWT  | List tasks         |
| GET    | `/tasks/summary`    | JWT  | Task summary       |
| GET    | `/tasks/:id`        | JWT  | Get task           |
| GET    | `/tasks/:id/log`    | JWT  | Get task log       |
| DELETE | `/tasks/:id`        | JWT  | Cancel task        |

### 3.18 Plugins — `/api/v1/plugins` (7 routes)

| Method | Path                       | Auth        | Description        |
|--------|----------------------------|-------------|--------------------|
| GET    | `/plugins`                 | JWT + Admin | List plugins       |
| GET    | `/plugins/store`           | JWT + Admin | Plugin store       |
| POST   | `/plugins/:name/install`   | JWT + Admin | Install plugin     |
| DELETE | `/plugins/:name`           | JWT + Admin | Uninstall plugin   |
| PUT    | `/plugins/:name/status`    | JWT + Admin | Toggle plugin      |
| GET    | `/plugins/:name/config`    | JWT + Admin | Plugin config      |
| PUT    | `/plugins/:name/config`    | JWT + Admin | Update config      |

### 3.19 Settings — `/api/v1/settings` (7 routes)

| Method | Path                       | Auth        | Description        |
|--------|----------------------------|-------------|--------------------|
| GET    | `/settings`                | JWT + Admin | Get settings       |
| PUT    | `/settings`                | JWT + Admin | Update settings    |
| PUT    | `/settings/panel-port`     | JWT + Admin | Change port        |
| PUT    | `/settings/panel-ssl`      | JWT + Admin | Configure SSL      |
| GET    | `/settings/panel-info`     | JWT + Admin | Panel info         |
| PUT    | `/settings/admin-path`     | JWT + Admin | Set admin path     |
| PUT    | `/settings/language`       | JWT + Admin | Set language       |

### 3.20 WebSocket (2 routes)

| Method | Path                       | Auth        | Description        |
|--------|----------------------------|-------------|--------------------|
| GET    | `/terminal`                | JWT (query) | Terminal PTY       |
| GET    | `/monitor/realtime`        | JWT         | Real-time monitor  |

### 3.21 Health (1 route)

| Method | Path                       | Auth | Description   |
|--------|----------------------------|------|---------------|
| GET    | `/health`                  | None | Health check  |

---

## 4. Database Schema

### 4.1 Core Tables

#### `users`
| Column       | Type     | Constraints                        |
|--------------|----------|------------------------------------|
| id           | INTEGER  | PRIMARY KEY AUTOINCREMENT          |
| username     | TEXT     | UNIQUE NOT NULL                    |
| password     | TEXT     | NOT NULL (bcrypt hash)             |
| email        | TEXT     |                                    |
| role         | TEXT     | NOT NULL DEFAULT 'viewer'          |
| totp_secret  | TEXT     |                                    |
| totp_enabled | INTEGER  | DEFAULT 0                          |
| status       | INTEGER  | DEFAULT 1                          |
| last_login   | DATETIME |                                    |
| last_ip      | TEXT     |                                    |
| created_at   | DATETIME | DEFAULT CURRENT_TIMESTAMP          |
| updated_at   | DATETIME | DEFAULT CURRENT_TIMESTAMP          |

#### `roles`
| Column       | Type     | Constraints                        |
|--------------|----------|------------------------------------|
| id           | INTEGER  | PRIMARY KEY AUTOINCREMENT          |
| name         | TEXT     | UNIQUE NOT NULL                    |
| description  | TEXT     |                                    |
| permissions  | TEXT     | NOT NULL (JSON array)              |

#### `user_roles`
| Column    | Type    | Constraints                               |
|-----------|---------|-------------------------------------------|
| user_id   | INTEGER | REFERENCES users(id) ON DELETE CASCADE    |
| role_id   | INTEGER | REFERENCES roles(id) ON DELETE CASCADE    |
| _(PK)_    |         | PRIMARY KEY (user_id, role_id)            |

#### `sites`
| Column       | Type     | Constraints                        |
|--------------|----------|------------------------------------|
| id           | INTEGER  | PRIMARY KEY AUTOINCREMENT          |
| name         | TEXT     | NOT NULL                           |
| domain       | TEXT     | NOT NULL                           |
| path         | TEXT     | NOT NULL                           |
| webserver    | TEXT     | NOT NULL                           |
| php_version  | TEXT     |                                    |
| ssl_enabled  | INTEGER  | DEFAULT 0                          |
| ssl_type     | TEXT     |                                    |
| ssl_expiry   | DATETIME |                                    |
| status       | INTEGER  | DEFAULT 1                          |
| config_extra | TEXT     |                                    |
| disk_quota   | INTEGER  | DEFAULT 0                          |
| disk_usage   | INTEGER  | DEFAULT 0                          |
| created_by   | INTEGER  | REFERENCES users(id)               |
| created_at   | DATETIME | DEFAULT CURRENT_TIMESTAMP          |
| updated_at   | DATETIME | DEFAULT CURRENT_TIMESTAMP          |

#### `domains`
| Column     | Type    | Constraints                               |
|------------|---------|-------------------------------------------|
| id         | INTEGER | PRIMARY KEY AUTOINCREMENT                 |
| site_id    | INTEGER | NOT NULL, REFERENCES sites(id) ON DELETE CASCADE |
| domain     | TEXT    | NOT NULL                                  |
| is_primary | INTEGER | DEFAULT 0                                 |
| _(UQ)_     |         | UNIQUE(site_id, domain)                   |

#### `databases`
| Column        | Type     | Constraints                       |
|---------------|----------|-----------------------------------|
| id            | INTEGER  | PRIMARY KEY AUTOINCREMENT         |
| name          | TEXT     | NOT NULL                          |
| db_type       | TEXT     | NOT NULL                          |
| username      | TEXT     | NOT NULL                          |
| password      | TEXT     | NOT NULL                          |
| charset       | TEXT     | DEFAULT 'utf8mb4'                 |
| collation     | TEXT     | DEFAULT 'utf8mb4_general_ci'      |
| remote_access | TEXT     | DEFAULT 'localhost'               |
| size          | INTEGER  | DEFAULT 0                         |
| disk_quota    | INTEGER  | DEFAULT 0                         |
| created_by    | INTEGER  | REFERENCES users(id)              |
| created_at    | DATETIME | DEFAULT CURRENT_TIMESTAMP         |
| _(UQ)_        |          | UNIQUE(name, db_type)             |

#### `ftps`
| Column     | Type     | Constraints                       |
|------------|----------|-----------------------------------|
| id         | INTEGER  | PRIMARY KEY AUTOINCREMENT         |
| username   | TEXT     | UNIQUE NOT NULL                   |
| password   | TEXT     | NOT NULL                          |
| path       | TEXT     | NOT NULL                          |
| status     | INTEGER  | DEFAULT 1                         |
| created_by | INTEGER  | REFERENCES users(id)              |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP         |

#### `crons`
| Column      | Type     | Constraints                      |
|-------------|----------|----------------------------------|
| id          | INTEGER  | PRIMARY KEY AUTOINCREMENT        |
| name        | TEXT     | NOT NULL                         |
| type        | TEXT     | NOT NULL                         |
| schedule    | TEXT     | NOT NULL                         |
| command     | TEXT     | NOT NULL                         |
| status      | INTEGER  | DEFAULT 1                        |
| last_run    | DATETIME |                                  |
| last_status | TEXT     |                                  |
| last_output | TEXT     |                                  |
| created_by  | INTEGER  | REFERENCES users(id)             |
| created_at  | DATETIME | DEFAULT CURRENT_TIMESTAMP        |
| updated_at  | DATETIME | DEFAULT CURRENT_TIMESTAMP        |

#### `tasks`
| Column       | Type     | Constraints                     |
|--------------|----------|---------------------------------|
| id           | INTEGER  | PRIMARY KEY AUTOINCREMENT       |
| type         | TEXT     | NOT NULL                        |
| name         | TEXT     | NOT NULL                        |
| status       | TEXT     | DEFAULT 'pending'               |
| progress     | INTEGER  | DEFAULT 0                       |
| log          | TEXT     |                                 |
| result       | TEXT     |                                 |
| error        | TEXT     |                                 |
| created_by   | INTEGER  | REFERENCES users(id)            |
| started_at   | DATETIME |                                 |
| completed_at | DATETIME |                                 |
| created_at   | DATETIME | DEFAULT CURRENT_TIMESTAMP       |

#### `software`
| Column       | Type     | Constraints                     |
|--------------|----------|---------------------------------|
| id           | INTEGER  | PRIMARY KEY AUTOINCREMENT       |
| name         | TEXT     | UNIQUE NOT NULL                 |
| display_name | TEXT     | NOT NULL                        |
| version      | TEXT     | NOT NULL                        |
| type         | TEXT     | NOT NULL                        |
| status       | INTEGER  | DEFAULT 1                       |
| config_path  | TEXT     |                                 |
| install_path | TEXT     |                                 |
| service_name | TEXT     |                                 |
| installed_at | DATETIME | DEFAULT CURRENT_TIMESTAMP       |
| updated_at   | DATETIME | DEFAULT CURRENT_TIMESTAMP       |

#### `plugins`
| Column       | Type     | Constraints                     |
|--------------|----------|---------------------------------|
| id           | INTEGER  | PRIMARY KEY AUTOINCREMENT       |
| name         | TEXT     | UNIQUE NOT NULL                 |
| display_name | TEXT     | NOT NULL                        |
| version      | TEXT     | NOT NULL                        |
| description  | TEXT     |                                 |
| author       | TEXT     |                                 |
| homepage     | TEXT     |                                 |
| status       | INTEGER  | DEFAULT 1                       |
| config       | TEXT     |                                 |
| installed_at | DATETIME | DEFAULT CURRENT_TIMESTAMP       |
| updated_at   | DATETIME | DEFAULT CURRENT_TIMESTAMP       |

#### `firewall_rules`
| Column      | Type     | Constraints                     |
|-------------|----------|---------------------------------|
| id          | INTEGER  | PRIMARY KEY AUTOINCREMENT       |
| type        | TEXT     | NOT NULL                        |
| protocol    | TEXT     | DEFAULT 'tcp'                   |
| port        | TEXT     |                                 |
| ip          | TEXT     |                                 |
| action      | TEXT     | NOT NULL                        |
| direction   | TEXT     | DEFAULT 'in'                    |
| description | TEXT     |                                 |
| status      | INTEGER  | DEFAULT 1                       |
| sort_order  | INTEGER  | DEFAULT 0                       |
| is_default  | INTEGER  | DEFAULT 0                       |
| created_at  | DATETIME | DEFAULT CURRENT_TIMESTAMP       |

#### `firewall_settings`
| Column     | Type     | Constraints                      |
|------------|----------|----------------------------------|
| key        | TEXT     | PRIMARY KEY                      |
| value      | TEXT     | NOT NULL                         |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP        |

#### `backups`
| Column      | Type     | Constraints                     |
|-------------|----------|---------------------------------|
| id          | INTEGER  | PRIMARY KEY AUTOINCREMENT       |
| type        | TEXT     | NOT NULL                        |
| name        | TEXT     | NOT NULL                        |
| target_id   | INTEGER  |                                 |
| target_name | TEXT     |                                 |
| file_path   | TEXT     | NOT NULL                        |
| file_size   | INTEGER  | DEFAULT 0                       |
| storage     | TEXT     | DEFAULT 'local'                 |
| checksum    | TEXT     |                                 |
| status      | TEXT     | DEFAULT 'completed'             |
| created_by  | INTEGER  | REFERENCES users(id)            |
| created_at  | DATETIME | DEFAULT CURRENT_TIMESTAMP       |

#### `audit_logs`
| Column      | Type     | Constraints                     |
|-------------|----------|---------------------------------|
| id          | INTEGER  | PRIMARY KEY AUTOINCREMENT       |
| user_id     | INTEGER  | REFERENCES users(id)            |
| username    | TEXT     |                                 |
| action      | TEXT     | NOT NULL                        |
| resource    | TEXT     | NOT NULL                        |
| resource_id | TEXT     |                                 |
| detail      | TEXT     |                                 |
| ip          | TEXT     |                                 |
| user_agent  | TEXT     |                                 |
| created_at  | DATETIME | DEFAULT CURRENT_TIMESTAMP       |

#### `settings`
| Column      | Type     | Constraints                     |
|-------------|----------|---------------------------------|
| key         | TEXT     | PRIMARY KEY                     |
| value       | TEXT     | NOT NULL                        |
| description | TEXT     |                                 |
| updated_at  | DATETIME | DEFAULT CURRENT_TIMESTAMP       |

#### `docker_containers`
| Column         | Type     | Constraints                  |
|----------------|----------|------------------------------|
| id             | INTEGER  | PRIMARY KEY AUTOINCREMENT    |
| container_id   | TEXT     | NOT NULL UNIQUE              |
| name           | TEXT     | NOT NULL                     |
| image          | TEXT     | NOT NULL                     |
| status         | TEXT     |                              |
| ports          | TEXT     |                              |
| volumes        | TEXT     |                              |
| env            | TEXT     |                              |
| restart_policy | TEXT     | DEFAULT 'no'                 |
| created_at     | DATETIME | DEFAULT CURRENT_TIMESTAMP    |
| updated_at     | DATETIME | DEFAULT CURRENT_TIMESTAMP    |

#### `schema_migrations`
| Column     | Type     | Constraints                     |
|------------|----------|---------------------------------|
| version    | INTEGER  | PRIMARY KEY                     |
| applied_at | DATETIME | DEFAULT CURRENT_TIMESTAMP       |

### 4.2 Monitoring Tables

Four tables with identical schemas, different retention periods:

- `monitor_metrics_raw` — 10s intervals, 24h retention
- `monitor_metrics_5m` — 5-minute aggregation, 7-day retention
- `monitor_metrics_1h` — 1-hour aggregation, 30-day retention
- `monitor_metrics_1d` — 1-day aggregation, 365-day retention

| Column       | Type     | Constraints                  |
|--------------|----------|------------------------------|
| id           | INTEGER  | PRIMARY KEY AUTOINCREMENT    |
| timestamp    | DATETIME | NOT NULL                     |
| cpu_percent  | REAL     | DEFAULT 0                    |
| mem_percent  | REAL     | DEFAULT 0                    |
| mem_used     | INTEGER  | DEFAULT 0                    |
| mem_total    | INTEGER  | DEFAULT 0                    |
| swap_percent | REAL     | DEFAULT 0                    |
| disk_percent | REAL     | DEFAULT 0                    |
| disk_used    | INTEGER  | DEFAULT 0                    |
| disk_total   | INTEGER  | DEFAULT 0                    |
| disk_read    | INTEGER  | DEFAULT 0                    |
| disk_write   | INTEGER  | DEFAULT 0                    |
| net_sent     | INTEGER  | DEFAULT 0                    |
| net_recv     | INTEGER  | DEFAULT 0                    |
| load1        | REAL     | DEFAULT 0                    |
| load5        | REAL     | DEFAULT 0                    |
| load15       | REAL     | DEFAULT 0                    |

---

## 5. User Roles & Permissions

### 5.1 Role Definitions

| Role     | Access Level | Description                               |
|----------|--------------|-------------------------------------------|
| Admin    | Full         | Unrestricted access to all modules        |
| Operator | Scoped       | Access to permitted modules only          |
| Viewer   | Read-only    | Can view but not modify resources         |

### 5.2 Permission Matrix

| Permission          | Admin | Operator | Viewer |
|---------------------|-------|----------|--------|
| `sites.*`           | ✅    | ✅       | 👁️     |
| `databases.*`       | ✅    | ✅       | 👁️     |
| `files.*`           | ✅    | ✅       | 👁️     |
| `cron.*`            | ✅    | ✅       | 👁️     |
| `docker.*`          | ✅    | ✅       | 👁️     |
| `ftp.*`             | ✅    | ✅       | 👁️     |
| `backup.*`          | ✅    | ✅       | 👁️     |
| `logs.*`            | ✅    | ✅       | 👁️     |
| `terminal.access`   | ✅    | ✅       | ❌     |
| `software.*`        | ✅    | ❌       | ❌     |
| `security.*`        | ✅    | ❌       | ❌     |
| `users.*`           | ✅    | ❌       | ❌     |
| `settings.*`        | ✅    | ❌       | ❌     |
| `plugins.*`         | ✅    | ❌       | ❌     |

✅ = Full access · 👁️ = Read-only · ❌ = No access

---

## 6. Configuration Reference

### `config/panel.json`

```json
{
  "server": {
    "host": "0.0.0.0",           // Listen address
    "port": 8888,                 // Listen port
    "ssl": true,                  // Enable HTTPS
    "ssl_cert": "path/to/cert",  // SSL certificate path
    "ssl_key": "path/to/key"     // SSL private key path
  },
  "database": {
    "path": "data/panel.db"      // SQLite database path
  },
  "auth": {
    "jwt_secret": "<auto>",      // Auto-generated JWT signing key
    "access_token_ttl": 900,     // Access token TTL in seconds (15 min)
    "refresh_token_ttl": 604800, // Refresh token TTL in seconds (7 days)
    "bcrypt_cost": 12            // bcrypt hash cost factor
  },
  "paths": {
    "base": "/ITDLUPanel",           // Base installation path
    "backup": "/ITDLUPanel/backup",  // Backup storage
    "logs": "/ITDLUPanel/logs",      // Log files
    "wwwroot": "/ITDLUPanel/wwwroot",// Website document roots
    "vhost": "/ITDLUPanel/server/vhost" // Virtual host configs
  },
  "panel": {
    "language": "en",            // Default language (en/vi)
    "admin_path": "/",           // Admin URL path
    "setup_completed": false,    // First-run setup flag
    "version": "0.1.0"          // Panel version
  }
}
```

---

## 7. Supported Software Matrix

| Software       | Versions              | Install | Config | Monitor | Uninstall |
|----------------|-----------------------|---------|--------|---------|-----------|
| Nginx          | Stable / Mainline     | ✅      | ✅     | ✅      | ✅        |
| Apache         | 2.4.x                | ✅      | ✅     | ✅      | ✅        |
| OpenLiteSpeed  | Latest                | ✅      | ✅     | ✅      | ✅        |
| PHP            | 7.4, 8.0, 8.1, 8.2, 8.3 | ✅  | ✅     | ✅      | ✅        |
| MySQL          | 5.7, 8.0             | ✅      | ✅     | ✅      | ✅        |
| MariaDB        | 10.x, 11.x           | ✅      | ✅     | ✅      | ✅        |
| Redis          | Latest                | ✅      | ✅     | ✅      | ✅        |
| phpMyAdmin     | Latest                | ✅      | ✅     | —       | ✅        |
| Pure-FTPd      | Latest                | ✅      | ✅     | ✅      | ✅        |
| Docker         | (System detect)       | —       | ✅     | ✅      | —         |

### PHP Extension Management

For each installed PHP version, the panel can manage:
- Extension installation and removal
- php.ini configuration editing
- FPM pool configuration
- disable_functions list
- OPcache tuning
- FPM status monitoring
- Slow log analysis
- phpinfo display

---

## 8. Frontend Pages

### 8.1 Page List

| Page        | Route           | Components | Description                          |
|-------------|-----------------|------------|--------------------------------------|
| Login       | `/login`        | 1          | Authentication form with 2FA         |
| Dashboard   | `/`             | ~5         | System overview, stats, charts       |
| Websites    | `/websites`     | ~10        | Site management with config panels   |
| Databases   | `/databases`    | ~8         | Database CRUD with backup/restore    |
| Files       | `/files`        | 16+        | Full file manager with editor        |
| FTP         | `/ftp`          | ~4         | FTP account management               |
| Cron        | `/cron`         | ~6         | Job scheduling with log viewer       |
| Docker      | `/docker`       | ~8         | Container/image management           |
| AppStore    | `/appstore`     | ~6         | Software installation marketplace    |
| Monitor     | `/monitor`      | ~8         | Real-time & historical monitoring    |
| Security    | `/security`     | ~5         | SSH config, Fail2ban                 |
| Firewall    | `/firewall`     | ~5         | UFW rule management                  |
| Logs        | `/logs`         | ~6         | Multi-source log viewer              |
| Terminal    | `/terminal`     | ~3         | xterm.js web terminal                |
| Users       | `/users`        | ~4         | User account management              |
| Settings    | `/settings`     | ~5         | Panel configuration                  |

### 8.2 Files Page Architecture (Modular)

The Files page is the most complex module with a fully modular architecture:

```
Files/
├── index.tsx                    # Main orchestrator
├── CodeEditor.tsx               # Monaco editor integration
├── components/
│   ├── BookmarkBar.tsx          # Quick-access bookmarks
│   ├── BreadcrumbNav.tsx        # Path navigation
│   ├── ContextMenu.tsx          # Right-click actions
│   ├── DragDropOverlay.tsx      # Drag & drop UI
│   ├── FileGrid.tsx             # Grid view mode
│   ├── FileTable.tsx            # Table view mode
│   ├── FileIcon.tsx             # File type icons
│   ├── FooterBar.tsx            # Selection status
│   ├── Toolbar.tsx              # Action buttons
│   ├── SearchBar.tsx            # File search
│   ├── TerminalPopup.tsx        # Inline terminal
│   └── modals/                  # New, compress, rename, etc.
└── hooks/
    ├── useFileManager.ts        # Core file operations
    ├── useBookmarks.ts          # Bookmark state
    ├── useDragDrop.ts           # Drag & drop logic
    └── useFileSelection.ts      # Selection management
```

### 8.3 Shared Components & Hooks

| Component/Hook      | Description                              |
|----------------------|------------------------------------------|
| `usePalette()`       | Theme color palette (light/dark)         |
| `useIsMobile()`      | Responsive breakpoint detection          |
| `useTaskWebSocket()` | WebSocket connection for task progress   |
| `NginxManageModal`   | Nginx configuration management           |
| `RequireSoftware`    | Software dependency check wrapper        |

---

## 9. Recent Changelog — March 2026

### New Features

- **Files Page Rewrite** — Complete modular rewrite with grid/table views, bookmarks, drag-drop, inline terminal, context menu, and search
- **Monitor Historical Charts** — CPU, RAM, disk, network charts with configurable time ranges (24h/7d/30d/1y) and multi-tier data aggregation
- **Cron Page Redesign** — New UI with schedule builder, templates, execution history, and run-now functionality
- **Website Config Expansion:**
  - Backup management per site
  - Maintenance mode with customizable templates
  - Reverse proxy rule CRUD
  - URL redirect management
  - Hotlink protection configuration
  - Traffic control (bandwidth & rate limiting)
  - Subdirectory bindings with independent PHP versions
  - Disk quota per site with usage tracking
- **SSL Improvements:**
  - Let's Encrypt automatic issuance
  - Custom certificate upload
  - Panel SSL with self-signed certificate support
  - Auto-renewal background service
- **phpMyAdmin Manager** — Dedicated phpMyAdmin configuration interface
- **Dashboard Enhancements** — Security overview widget, software status grid
- **HTTPS Panel** — Self-signed certificate auto-generation for panel access
- **Nginx Multi-Version** — Support for stable and mainline Nginx versions
- **PHP Management Modal:**
  - Extension install/uninstall
  - php.ini config editor
  - disable_functions management
  - FPM pool configuration
  - FPM load/status monitoring
  - Slow log viewer and configuration
  - phpinfo display
- **Database Enhancements:**
  - Per-database backup management
  - Multi-select batch operations
  - SQL file import
  - Permission management (Everyone/Local/Specific IP)
  - Disk quota per database
  - MySQL/MariaDB version display
  - Service controls (restart/reload/stop)

### Performance Improvements

- **MySQL Auto-Tuning** — InnoDB buffer pool auto-calculated as RAM/8, query cache 64MB
- **Nginx Optimization** — worker_connections 2048, open_file_cache, FastCGI cache
- **PHP-FPM Tuning** — max_children 30, OPcache 128MB, interned_strings 16MB
- **Vhost Template** — FastCGI cache with WordPress-aware skip_cache rules
- **Performance defaults embedded in software installers** — Optimal configurations applied automatically on install

### Security Enhancements

- **Security Audit & Hardening** — Comprehensive security review and fixes
- **Rate Limiting** — 300 req/min with HTTP 429 and automatic retry backoff
- **CSRF Protection** — Double-submit cookie pattern
- **Audit Logging** — All state-changing operations recorded
- **HTTPS by Default** — Auto self-signed certificate on first run
- **Fail2ban Integration** — Configurable through panel UI
- **SSH Hardening** — Panel-managed SSH daemon configuration

### Infrastructure

- **Migration 005** — Added disk_quota and disk_usage columns
- **5 database migrations** across 20+ tables
- **Monitoring data aggregation** — Raw → 5m → 1h → 1d with automatic retention cleanup
- **Plugin system** — Framework for future extensibility

---

*Last updated: March 29, 2026*
