# ITDLUPanel — System Architecture

> **Version**: 4.0.0 · **Date**: 2026-04-14 · **Go**: 1.25.0 · **React**: 19

---

## 1. Overview

ITDLUPanel is a **single-binary** Linux server management panel built for Dalat University's Information Technology Department. It provides a modern web interface for managing websites, databases, Docker containers, SSL certificates, cron jobs, FTP accounts, firewall rules, and system monitoring.

### Design Principles

| Principle | Implementation |
|---|---|
| Zero runtime dependencies | Single static Go binary with embedded frontend |
| Secure by default | HTTPS with 10-year self-signed cert on first boot, JWT + TOTP 2FA |
| Multi-database | MySQL/MariaDB, PostgreSQL, Redis |
| Multi-webserver | Nginx, Apache, OpenLiteSpeed |
| Role-based access | RBAC with granular permissions per resource |
| Real-time monitoring | WebSocket-based live metrics + persistent history |

---

## 2. Technology Stack

### Backend

| Component | Technology | Purpose |
|---|---|---|
| Language | Go 1.25 | Core server, API, system management |
| HTTP Framework | Gin 1.12 | REST API router + middleware |
| Database | SQLite (modernc.org/sqlite) | Panel metadata, pure Go, no CGO |
| Auth | JWT (HS256) + bcrypt | Access/Refresh tokens, password hashing |
| 2FA | TOTP (pquerna/otp) | Time-based one-time passwords |
| WebSocket | gorilla/websocket | Terminal, real-time monitor |
| Terminal | creack/pty | PTY-backed shell sessions |
| Metrics | gopsutil v4 | CPU, RAM, disk, network collection |
| Logging | zerolog | Structured JSON logging |
| Object Storage | minio-go v7 | S3-compatible backup storage |

### Frontend

| Component | Technology | Purpose |
|---|---|---|
| Framework | React 19 + TypeScript 5.9 | SPA interface |
| Build Tool | Vite 8 | Fast bundling + HMR |
| UI Library | Ant Design 5 | Component library |
| State | Zustand | Lightweight state management |
| Styling | TailwindCSS 4 | Utility-first CSS |
| HTTP Client | Axios | API communication |
| i18n | i18next + react-i18next | Multi-language support |
| Code Editor | Monaco Editor | Config file editing |
| Charts | Chart.js + react-chartjs-2 | Dashboard metrics |

---

## 3. Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Single Go Binary                       │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Embedded SPA (go:embed)                 │ │
│  │     React 19 · Ant Design · Monaco Editor           │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │ HTTP/WS                        │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │                 Gin HTTP Engine                       │ │
│  │  ┌─── Middleware Chain ──────────────────────────┐   │ │
│  │  │ Recovery → Logger → Security Headers → CORS   │   │ │
│  │  │ → Compression → Language → Rate Limit         │   │ │
│  │  │ → Audit → CSRF → Auth (JWT) → RBAC           │   │ │
│  │  └───────────────────────────────────────────────┘   │ │
│  │                                                       │ │
│  │  ┌── API v1 (/api/v1) ─────────────────────────┐    │ │
│  │  │  24 Handler Groups · ~170 REST Endpoints     │    │ │
│  │  │  2 WebSocket Endpoints (Terminal, Monitor)    │    │ │
│  │  └──────────────────────────────────────────────┘    │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │              Service Layer (33 Services)             │ │
│  │  Auth · User · Site · SSL · Database · Docker       │ │
│  │  File · Cron · Firewall · Security · Monitor        │ │
│  │  Backup · FTP · Redis · Software · Notification     │ │
│  │  Terminal · Plugin · Settings · Log · ...           │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │            Data & Infrastructure Layer              │ │
│  │  SQLite (panel.db) · OS Commands · Docker API       │ │
│  │  Nginx/Apache/OLS Config · SSL Certs · Crontab     │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Project Structure

```
ITDLUPanel/
├── cmd/panel/              # Application entry point (main.go)
├── internal/
│   ├── app/                # App bootstrap, router, middleware
│   │   ├── app.go          # Server startup, SSL auto-gen
│   │   ├── router.go       # Route registration, service wiring
│   │   └── middleware_*.go # Auth, RBAC, CSRF, rate limit, audit, etc.
│   ├── api/
│   │   ├── v1/             # 24 REST handler files
│   │   └── ws/             # WebSocket handlers (terminal, monitor)
│   ├── service/            # 33 business logic services
│   │   └── installer/      # Software installers (PHP, pgAdmin, etc.)
│   ├── database/
│   │   ├── sqlite.go       # DB connection + migration runner
│   │   ├── models/         # User, Role, Setting models + repositories
│   │   └── migrations/     # 14 incremental schema migrations
│   ├── pkg/
│   │   ├── crypto/         # bcrypt, AES-256-GCM, JWT secret gen
│   │   ├── logger/         # zerolog configuration
│   │   └── validator/      # Request validation helpers
│   ├── task/               # Background task queue (4 workers)
│   ├── plugin/             # Plugin manager
│   └── websocket/          # WebSocket hub (broadcast/subscribe)
├── web/                    # Frontend React application
│   ├── src/
│   │   ├── pages/          # 17 page components (lazy-loaded)
│   │   ├── components/     # 17+ shared components
│   │   ├── stores/         # 5 Zustand stores
│   │   ├── layouts/        # MainLayout (sidebar + content)
│   │   ├── hooks/          # Custom React hooks (usePalette, etc.)
│   │   ├── lib/            # Utilities (datetime, API client)
│   │   └── i18n/           # Localization files (en, vi)
│   └── dist/               # Build output (embedded into Go binary)
├── config/panel.json       # Runtime configuration
├── data/panel.db           # SQLite database
├── scripts/                # Installation & utility scripts
├── Makefile                # Build targets
├── Dockerfile              # Multi-stage Docker build
└── web.go                  # go:embed directive for frontend
```

---

## 5. Backend Architecture

### 5.1 Middleware Chain

Requests flow through these middleware layers in order:

| # | Middleware | Purpose |
|---|---|---|
| 1 | Recovery | Panic recovery, returns 500 |
| 2 | Logger | Request logging with zerolog |
| 3 | Security Headers | X-Frame-Options, CSP, HSTS, etc. |
| 4 | CORS | Cross-origin resource sharing |
| 5 | Compression | Gzip response compression |
| 6 | Language | Accept-Language header parsing |
| 7 | Rate Limit | 300 requests/minute per IP |
| 8 | Audit | State-changing operation logging |
| 9 | CSRF | Cross-site request forgery protection |
| 10 | Auth (JWT) | Token validation, user context |
| 11 | RBAC | Permission-based access control |

### 5.2 Authentication Flow

```
Login Request → Brute-force Check (10 failures = 15 min lock)
             → User Lookup (SQLite)
             → bcrypt Password Verify (cost 12)
             → Generate Access Token (JWT, 15 min TTL)
             → Generate Refresh Token (7 day TTL)
             → Return tokens + user info
```

**2FA Flow**: After password verification, if TOTP is enabled, client must call `/auth/2fa/verify` with the 6-digit code before receiving tokens.

### 5.3 Service Layer

| Service | File | Responsibilities |
|---|---|---|
| AuthService | auth_service.go | Login, logout, JWT, password change, default admin creation |
| UserService | user_service.go | User CRUD, listing, profile management |
| TOTPService | totp_service.go | 2FA QR code generation, enable/disable, verify |
| SiteService | site_service.go | Website CRUD, vhost generation, PHP switching, domains, SSL per-site |
| SSLService | ssl_service.go | Certificate management, Let's Encrypt, self-signed, renewal |
| SSLRenewer | ssl_renewer.go | Background auto-renewal worker |
| DatabaseService | database_service.go | MySQL/MariaDB/PostgreSQL database CRUD, backup, restore |
| RedisService | redis_service.go | Redis info, config, clients, flush, slow log, persistence |
| DockerService | docker_service.go | Containers, images, networks, volumes, system management |
| DockerComposeService | docker_compose_service.go | Compose project management (up, down, restart, logs) |
| FileService | file_service.go | File browser, upload, download, permissions, compress/decompress |
| CronService | cron_service.go | Cron job CRUD, scheduling, execution, log |
| FirewallService | firewall_service.go | UFW rules, port management, IP blocking |
| SecurityService | security_service.go | SSH config, Fail2ban, root password, SSH keys |
| BackupService | backup_service.go | Site/database backups, restore, download |
| FTPService | ftp_service.go | PureFTPd account CRUD, batch operations |
| FTPStorageService | ftp_storage_service.go | Remote FTP storage for backups |
| CloudStorageService | cloud_storage_service.go | S3, Google Drive, OneDrive backup storage |
| SoftwareService | software_service.go | Software install/uninstall/config, phpMyAdmin, pgAdmin, PHP extensions |
| MonitorService | monitor_service.go | Real-time system metrics (CPU, RAM, disk, network, processes) |
| MetricsCollector | metrics_collector.go | Periodic metrics collection + aggregation (5m, 1h, 1d) |
| LogService | log_service.go | Panel/website/SSH/audit log viewing, rotation |
| NotificationService | notification_service.go | Email, Telegram, webhook notifications |
| TelegramService | telegram_service.go | Telegram bot API integration |
| EmailService | email_service.go | SMTP email delivery |
| TerminalService | terminal_service.go | PTY terminal sessions via WebSocket |
| SettingsService | settings_service.go | Panel settings CRUD, timezone, panel name |
| RoleService | role_service.go | Role CRUD, permission management |
| UserResourceService | user_resource_service.go | Per-user resource assignment (sites, DBs, FTP) |
| SiteStatisticsService | site_statistics_service.go | Per-site traffic and disk usage stats |
| PluginManager | plugin/manager.go | Plugin install/uninstall/config |

### 5.4 Task Queue

Background operations (software install/uninstall, stack deployment) run through a **task queue** with 4 parallel workers. Tasks are persisted in SQLite and broadcast progress over WebSocket.

```
Task Created → SQLite (status: pending)
            → Worker picks up → status: running → progress updates via WS
            → Completion → status: completed/failed → WS notification
```

---

## 6. Frontend Architecture

### 6.1 Pages (17 lazy-loaded routes)

| Page | Route | Description |
|---|---|---|
| Dashboard | `/` | System overview, resource cards, charts |
| Websites | `/websites` | Site management, domains, SSL, config |
| Databases | `/databases` | MySQL/MariaDB, PostgreSQL, Redis tabs |
| FTP | `/ftp` | PureFTPd account management |
| Files | `/files` | File manager with editor |
| Docker | `/docker` | Containers, images, networks, volumes, compose |
| Cron | `/cron` | Cron job management with templates |
| Firewall | `/firewall` | UFW rules, port management |
| Security | `/security` | SSH, Fail2ban, SSH keys |
| Monitor | `/monitor` | Real-time metrics, process manager |
| Logs | `/logs` | Panel, website, SSH, audit logs |
| Storage | `/storage` | Backup storage (FTP, S3, GDrive, OneDrive) |
| Terminal | `/terminal` | Web terminal (xterm.js via WebSocket) |
| AppStore | `/appstore` | Software management + one-click installs |
| Users | `/users` | User and role management |
| Settings | `/settings` | General, Server, SSL, Security, Notifications, Menu, Danger Zone |
| Login | `/login` | Authentication page |

### 6.2 Zustand Stores (5)

| Store | File | State |
|---|---|---|
| Auth | auth.ts | user, tokens, login/logout actions |
| Theme | theme.ts | darkMode, accent color, palette |
| Settings | settings.ts | timezone, panelName, hiddenMenuKeys + persistence |
| Task | task.ts | background tasks, progress tracking |
| Notification | notification.ts | notification channels, rules, unread count |

### 6.3 Key Components (17+)

| Component | Purpose |
|---|---|
| NginxManageModal | Nginx service management (config, performance, vhosts) |
| ApacheManageModal | Apache management |
| OLSManageModal | OpenLiteSpeed management |
| MariadbManageModal | MariaDB/MySQL service management |
| PostgresqlManageModal | PostgreSQL service management (config, connections, DBs) |
| RedisManageModal | Redis service management |
| PHPManageModal | PHP version management (extensions, config, FPM) |
| PhpMyAdminManageModal | phpMyAdmin configuration |
| PgAdminManageModal | pgAdmin web interface management |
| FTPManageModal | FTP storage management |
| S3StorageManageModal | S3/MinIO/R2 storage configuration |
| GoogleDriveManageModal | Google Drive OAuth setup |
| OneDriveManageModal | OneDrive OAuth setup |
| FTPStorageManageModal | Remote FTP backup storage |
| PermissionTree | RBAC permission tree selector |
| RequireSoftware | Software dependency checker |
| MessagesBox | Notification messages display |

### 6.4 Menu Visibility System

Users can toggle sidebar menu items on/off from **Settings → Menu** tab. This uses:
- `hiddenMenuKeys` in the Zustand settings store (persisted to localStorage)
- `MainLayout.tsx` filters `menuItems` based on hidden keys
- Dashboard and Settings are always visible (locked)

---

## 7. Database Schema

### 7.1 Core Tables (30 tables)

```sql
-- Authentication & Authorization
users              -- Panel user accounts (id, username, password, email, role, totp, status)
roles              -- RBAC roles (id, name, permissions JSON, is_system)
user_roles         -- Many-to-many user↔role mapping
user_resources     -- Per-user resource assignment (sites, databases, FTP)
user_sites         -- Legacy user↔site mapping

-- Web Infrastructure
sites              -- Websites (domain, path, webserver, php_version, ssl, quota)
domains            -- Site domains (site_id, domain, is_primary)
ssl_certificates   -- SSL cert metadata (domain, cert_type, auto_renew)

-- Databases & FTP
databases          -- Panel-managed databases (name, db_type, username, password, charset)
ftps               -- PureFTPd accounts (username, password, path, status)

-- Scheduling & Tasks
crons              -- Cron jobs (name, type, schedule, command, status, last_run)
tasks              -- Background task queue (type, status, progress, log)

-- Docker
docker_containers  -- Docker container tracking

-- Security
firewall_rules     -- UFW firewall rules (type, protocol, port, ip, action)
firewall_settings  -- Firewall configuration key-value
audit_logs         -- All state-changing operations (user, action, resource, IP)

-- Backups & Storage
backups            -- Backup records (type, file_path, size, storage)
ftp_storages       -- Remote FTP backup destinations
cloud_storages     -- S3/GDrive/OneDrive backup destinations

-- Monitoring
monitor_metrics_raw -- Raw metrics (every collection cycle)
monitor_metrics_5m  -- 5-minute aggregated metrics
monitor_metrics_1h  -- 1-hour aggregated metrics
monitor_metrics_1d  -- 1-day aggregated metrics

-- Notifications
notification_channels  -- Email, Telegram, Webhook channels
notification_rules     -- Event→Channel routing rules
notification_logs      -- Notification delivery history

-- System
software           -- Installed software registry
plugins            -- Plugin registry
settings           -- Panel key-value settings
schema_migrations  -- Migration version tracking
```

---

## 8. Security Architecture

### 8.1 Authentication

| Feature | Implementation |
|---|---|
| Password Hashing | bcrypt cost 12 |
| JWT Access Token | HS256, 15-minute TTL |
| JWT Refresh Token | 7-day TTL |
| Brute-force Protection | 5 failures → 30s lock, 10 failures → 15 min lock |
| 2FA | TOTP (RFC 6238) with QR code provisioning |
| Session Timeout | Configurable via settings |

### 8.2 Authorization (RBAC)

Granular permissions organized by resource:

```
sites.read, sites.create, sites.edit, sites.delete, sites.config, sites.ssl
databases.read, databases.create, databases.edit, databases.delete, databases.backup
ftp.read, ftp.create, ftp.edit, ftp.delete
files.read, files.write, files.delete
docker.read, docker.create, docker.manage
cron.read, cron.create, cron.edit, cron.delete
firewall.read, firewall.manage
security.manage
logs.read, logs.manage
backup.read, backup.create, backup.delete, backup.restore
software.read, software.manage
```

### 8.3 Network Security

- **HTTPS by default**: 10-year ECDSA P-256 self-signed certificate generated on first boot
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, CSP, HSTS, Referrer-Policy
- **CSRF Protection**: Token-based CSRF middleware on state-changing requests
- **Rate Limiting**: 300 requests/minute per IP
- **Firewall**: UFW integration for port/IP management
- **Fail2ban**: Jail configuration and IP banning
- **SSH Hardening**: SSH config management, key-based auth, user management

---

## 9. SSL Management

### 9.1 Panel SSL

- **Auto-generated**: Self-signed ECDSA P-256 certificate on first boot (10-year validity)
- **SANs**: Includes hostname, localhost, and all detected network IPs
- **Storage**: `/ITDLUPanel/server/data/ssl/panel/{fullchain,privkey}.pem`
- **Management**: Via Settings → SSL tab (generate, upload custom cert)

### 9.2 Website SSL

| Method | Description |
|---|---|
| Let's Encrypt (HTTP) | Automated HTTP-01 challenge |
| Let's Encrypt (DNS) | DNS-01 challenge for wildcards |
| Custom Upload | PEM cert + key upload |
| Self-Signed | Per-site self-signed generation |

### 9.3 Auto-Renewal

Background worker (`SSLRenewer`) periodically checks certificate expiry and auto-renews Let's Encrypt certificates.

---

## 10. Supported Software

| Category | Software | Features |
|---|---|---|
| Web Server | Nginx | Config, performance tuning, vhost management, version switching |
| Web Server | Apache | Config, modules, vhost management |
| Web Server | OpenLiteSpeed | Config, listeners, virtual hosts |
| PHP | PHP 5.6 – 8.4 | Extensions, php.ini, FPM config, OPcache, disable functions |
| Database | MySQL / MariaDB | CRUD, backup/restore, phpMyAdmin, slow log, binary logs, RAM plans |
| Database | PostgreSQL | CRUD, backup/restore, pgAdmin, connections monitoring |
| Cache | Redis | Config, clients, flush, slow log, memory stats, persistence |
| FTP | PureFTPd | Account management, batch operations |
| DB Admin | phpMyAdmin | Port config, PHP version, SSL |
| DB Admin | pgAdmin | Web interface management |
| Container | Docker + Compose | Full container lifecycle, images, networks, volumes |

---

## 11. Build & Deployment

### 11.1 Build Pipeline

```
Phase 1: Frontend Build
  TypeScript → Vite 8 → web/dist/ (HTML + JS chunks + CSS)

Phase 2: Backend Build
  go:embed web/dist/ → Static Go binary (~60 MB)
  CGO_ENABLED=0 → Pure Go, no C dependencies
  ldflags → Version + build time injection
```

### 11.2 Build Commands

```bash
# Frontend
cd web && npx vite build

# Backend (requires Go 1.25+)
export PATH=/usr/local/go/bin:$PATH
make build
# Output: bin/itdlupanel

# Docker
docker build -t itdlupanel .
```

### 11.3 Runtime

```bash
# Start server
./bin/itdlupanel -config config/panel.json

# Default: https://server-ip:8888
# Default credentials: admin / admin@123456
```

---

## 12. Configuration

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
    "jwt_secret": "<auto-generated-64-hex>",
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
    "version": "4.0.0"
  }
}
```
