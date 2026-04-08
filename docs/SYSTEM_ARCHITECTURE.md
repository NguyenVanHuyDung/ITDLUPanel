# ITDLUPanel — System Architecture

> **Version:** 0.1.0 · **Go 1.25** · **React 19** · **Last updated:** 2026-04-08

---

## 1. Overview

ITDLUPanel is a **single-binary Linux server management panel** built for Đại học Đà Lạt (Dalat University). The entire stack — Go backend, React frontend, and SQLite database — ships as one ~60 MB executable with zero external runtime dependencies.

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser (React 19 SPA)                     │
│          Ant Design 6 · xterm.js · Monaco Editor              │
│          Recharts · Zustand · React Query · i18n              │
└────────────────┬──────────────────────┬──────────────────────┘
                 │  REST API (~160)      │  WebSocket (2)
                 │  HTTPS / JWT          │  PTY Terminal + Monitor
                 ▼                       ▼
┌──────────────────────────────────────────────────────────────┐
│              Single Go Binary (go:embed)                      │
│                                                               │
│  ┌─────────┐  ┌──────────────┐  ┌──────────────────────┐     │
│  │   Gin   │→ │  24 Handlers │→ │  33+ Services         │     │
│  │  Router  │  │  (REST API)  │  │  14 Installers        │     │
│  └─────────┘  └──────────────┘  │  4 Vhost Generators   │     │
│  ┌─────────┐  ┌──────────────┐  └──────────┬───────────┘     │
│  │   WS    │→ │  Terminal    │              │                  │
│  │   Hub   │  │  Monitor     │              ▼                  │
│  └─────────┘  └──────────────┘  ┌──────────────────────┐     │
│  ┌─────────────────────────┐    │  SQLite (25 tables)   │     │
│  │  Middleware Stack (11)  │    │  modernc.org/sqlite    │     │
│  │  JWT·RBAC·Rate·CSRF·   │    └──────────────────────┘     │
│  │  Audit·CORS·Compress   │                                   │
│  └─────────────────────────┘                                  │
└──────────────────────────┬───────────────────────────────────┘
                           │  systemctl · exec · /proc
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   Linux Host (Ubuntu/Debian)                   │
│    Nginx/Apache/OLS · PHP-FPM · MySQL/MariaDB · Redis         │
│    Docker · Fail2ban · PureFTPd · Certbot                     │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

### 2.1 Backend

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | Go | 1.25.0 |
| HTTP Framework | Gin | 1.12.0 |
| Database | SQLite (CGO-free) | modernc.org/sqlite 1.47.0 |
| WebSocket | gorilla/websocket | 1.5.3 |
| Auth / JWT | golang-jwt/jwt | 5.3.1 |
| 2FA (TOTP) | pquerna/otp | 1.5.0 |
| Password Hash | bcrypt | golang.org/x/crypto |
| System Monitor | gopsutil | 3.24.5 |
| Terminal PTY | creack/pty | 1.1.24 |
| Logging | zerolog + lumberjack | 1.34.0 |
| Validation | go-playground/validator | 10.30.1 |
| Object Storage | minio-go | 7.0.100 |
| OAuth2 | golang.org/x/oauth2 | 0.36.0 |
| FTP Client | jlaffaye/ftp | 0.2.0 |

### 2.2 Frontend

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React | 19.2.4 |
| Language | TypeScript | 5.9.3 |
| UI Library | Ant Design | 6.3.3 |
| Build Tool | Vite | 8.0.1 |
| CSS | Tailwind CSS | 4.2.2 |
| State | Zustand | 5.0.12 |
| Data Fetching | TanStack React Query | 5.91.2 |
| HTTP Client | Axios | 1.13.6 |
| Charts | Recharts | 3.8.0 |
| Code Editor | Monaco Editor | 4.7.0 |
| Terminal | xterm.js | 6.0.0 |
| Routing | React Router | 6.30.3 |
| i18n | i18next | 25.8.20 |
| Date | Day.js | 1.11.20 |

---

## 3. Backend Architecture

### 3.1 Layered Design

```
HTTP Request
    │
    ▼
┌──────────────────────────────┐
│  Middleware Stack (11 layers) │
│  Recovery → Logger → Security │
│  CORS → Compress → Language   │
│  RateLimit → CSRF → Audit     │
│  Auth(JWT) → RBAC             │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  API Handlers (24 files)      │
│  auth · site · database ·     │
│  docker · file · security ... │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  Service Layer (33 services)  │
│  Business logic, validation,  │
│  system calls, Docker API     │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  Data Layer                   │
│  SQLite (25 tables)           │
│  File system · Docker socket  │
│  systemctl · /proc · crontab  │
└──────────────────────────────┘
```

### 3.2 Source Layout

```
internal/
├── api/v1/               # 24 REST handler files (9,814 LOC)
│   ├── auth.go              Login, register, 2FA, token refresh
│   ├── backup.go            Backup CRUD, restore, download
│   ├── cloud_storage.go     S3, Google Drive, OneDrive
│   ├── cron.go              Cron job CRUD, run, toggle
│   ├── dashboard.go         System stats aggregation
│   ├── database.go          MySQL/MariaDB management
│   ├── docker.go            Containers, images, networks, volumes, daemon
│   ├── docker_compose.go    Docker Compose projects
│   ├── file.go              File browser, editor, upload/download
│   ├── ftp.go               FTP account management
│   ├── ftp_storage.go       FTP storage backends
│   ├── log.go               System & access logs
│   ├── monitor.go           Metrics API
│   ├── notification.go      Notification channels & rules
│   ├── plugin.go            Plugin management
│   ├── redis.go             Redis management
│   ├── role.go              RBAC role management
│   ├── security.go          Firewall, SSH, Fail2ban
│   ├── settings.go          Panel settings
│   ├── site.go              Website management
│   ├── software.go          Software install/uninstall
│   ├── ssl.go               SSL certificates
│   ├── task.go              Background task status
│   └── user.go              User CRUD, profile, 2FA
├── api/ws/                # 2 WebSocket handlers
│   ├── terminal.go          PTY terminal sessions
│   └── monitor.go           Real-time system metrics
├── app/                   # Application core
│   ├── app.go               Bootstrap, initialization, shutdown
│   ├── router.go            Route registration & service wiring
│   ├── auth_middleware.go   JWT verification, RBAC enforcement
│   └── middleware.go        CORS, security, rate limit, compression
├── service/               # Business logic (33 services, 23,437 LOC)
│   ├── installer/           14 software installers
│   └── vhost/               4 vhost generators (Nginx, Apache, OLS)
├── database/              # SQLite, models, 14 migrations
├── config/                # JSON config reader/writer
├── pkg/                   # Shared utilities (crypto, logger, errors, etc.)
├── i18n/                  # Backend EN/VI translations
├── task/                  # Background task queue with progress tracking
├── websocket/             # WS connection hub & events
├── system/                # Shell execution, OS detection
└── plugin/                # Plugin interface & manager
```

**Total: 112 Go files · 43,314 lines of code**

### 3.3 Middleware Stack

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | Recovery | Panic recovery with stack trace |
| 2 | Logger | Structured request logging (zerolog) |
| 3 | SecurityHeaders | X-Frame-Options, CSP, X-Content-Type |
| 4 | CORS | Cross-origin resource sharing |
| 5 | Compression | gzip response compression |
| 6 | Language | Accept-Language detection for i18n |
| 7 | RateLimit | 300 requests/minute per IP |
| 8 | CSRF | Cookie + header token validation |
| 9 | Audit | Write operation audit logging |
| 10 | Auth | JWT token validation (HS256) |
| 11 | RBAC | Permission-based access control |

### 3.4 Authentication & Authorization

- **JWT tokens**: Access (15 min) + Refresh (7 days), HS256 signing
- **2FA**: TOTP (RFC 6238) via pquerna/otp with QR code provisioning
- **Password**: bcrypt cost=12
- **Three RBAC roles**: Admin (full), Operator (scoped), Viewer (read-only)
- **Permission namespaces**: `sites.*`, `databases.*`, `files.*`, `docker.*`, `cron.*`, `logs.*`, `backup.*`, `terminal.access`, `security.*`, `software.*`, `ssl.*`

### 3.5 Docker Integration

Docker management communicates via Unix socket (`/var/run/docker.sock`) using Docker API v1.41:

- **46+ endpoints**: Containers (CRUD, start/stop, logs, stats, exec), Images (list, pull, remove, search), Networks, Volumes, Compose, Daemon config
- **OneClick Install**: 38 pre-configured application templates
- **Cloud Image**: 24 featured Docker Hub images with category filter + search

### 3.6 Background Task System

Long-running operations run asynchronously with real-time progress:

```
API Request → Create Task (SQLite) → Push to Queue → Worker executes
                                                          │
                                                          ▼
                                              WebSocket progress updates
                                              → Browser progress bar
```

---

## 4. Frontend Architecture

### 4.1 Page Modules (17 pages, lazy-loaded)

| Page | Components | Description |
|------|-----------|-------------|
| Dashboard | 1 | System overview, live charts, quick actions |
| Websites | 2 | Site CRUD, domain aliases, PHP switching, statistics |
| Databases | 1 | MySQL/MariaDB CRUD, backup/restore |
| Files | 15 | File browser, Monaco editor, bookmarks, compress/decompress |
| Terminal | 1 | Multi-tab xterm.js terminal via WebSocket |
| Docker | 10 | Containers, images, networks, volumes, compose, one-click, cloud |
| Security | 1 | SSH config, Fail2ban, security hardening |
| Firewall | 1 | Firewall rules management |
| Monitor | 3 | Real-time + historical system metrics |
| Cron | 1 | Cron CRUD with 30 templates, schedule builder |
| Logs | 1 | Panel, SSH, website, audit logs |
| AppStore | 2 | Software install/uninstall with progress |
| Storage | 1 | Storage backend management |
| FTP | 1 | FTP account CRUD |
| Users | 1 | User management with RBAC |
| Settings | 2 | Panel settings, notifications |
| Login | 1 | Authentication + 2FA |

### 4.2 State Management (Zustand)

| Store | Purpose |
|-------|---------|
| `auth` | JWT tokens, user profile, login/logout |
| `theme` | Dark/light mode, palette colors |
| `settings` | Panel config (language, port, paths) |
| `task` | Background task progress tracking |
| `notification` | Notification channels, unread count |

### 4.3 Shared Components (15)

12 software management modals (PHP, Nginx, Apache, OLS, MariaDB, Redis, phpMyAdmin, FTP, S3, Google Drive, OneDrive, FTP Storage) + RequireSoftware, PermissionTree, MessagesBox.

### 4.4 Theming

Inline CSS-in-JS via `usePalette()` hook. No CSS files — all components use the palette object:
```typescript
{ text, textMuted, accent, card, cardBorder, headerBg, green, red, purple, cyan, amber }
```

---

## 5. Database Schema

**SQLite** with **25 tables** across 14 migrations:

### Core

| Table | Purpose |
|-------|---------|
| `users` | Accounts (username, email, bcrypt hash, 2FA secret) |
| `roles` | RBAC roles with JSON permissions |
| `user_roles` | User ↔ Role mapping |
| `user_sites` | User ↔ Site access scoping |
| `user_resources` | Per-user resource quotas |
| `settings` | Key-value panel settings |
| `schema_migrations` | Migration tracking |

### Application

| Table | Purpose |
|-------|---------|
| `sites` | Websites (domain, root, PHP version, web server) |
| `domains` | Domain aliases per site |
| `databases` | MySQL/MariaDB databases |
| `ftps` | FTP accounts |
| `crons` | Cron jobs (schedule, command, status) |
| `tasks` | Background tasks |
| `software` | Installed software registry |
| `plugins` | Plugin metadata |
| `backups` | Backup records |
| `firewall_rules` | Firewall rules |
| `firewall_settings` | Firewall global settings |
| `ftp_storages` | FTP storage configs |
| `cloud_storages` | S3/GDrive/OneDrive configs |
| `audit_logs` | Write operation audit trail |
| `docker_containers` | Docker container metadata |
| `notification_channels` | Email/Telegram/Webhook channels |
| `notification_rules` | Alert rules and triggers |
| `notification_logs` | Notification delivery history |

---

## 6. API Summary

**~160 REST endpoints** + **2 WebSocket endpoints**:

| Module | Endpoints | Permission |
|--------|-----------|------------|
| Auth | 9 | Public + JWT |
| Dashboard | 2 | JWT |
| Sites | 14 | `sites.*` |
| Databases | 8 | `databases.*` |
| Files | 17 | `files.*` |
| Docker | 46+ | `docker.*` |
| Security | 12 | `security.*` |
| Software | 14 | `software.*` |
| Monitor | 5 + WS | JWT |
| Terminal | WS | `terminal.access` |
| Cron | 8 | `cron.*` |
| Logs | 7 | `logs.*` |
| SSL | 9 | `ssl.*` |
| Backups | 6 | `backup.*` |
| Storage | 8 | Admin |
| Users/Roles | 11 | Admin |
| Notifications | 8 | Admin |
| Settings/Tasks | 7 | JWT |

---

## 7. Security

| Feature | Implementation |
|---------|---------------|
| Authentication | JWT HS256 (15-min access + 7-day refresh) |
| 2FA | TOTP (RFC 6238) |
| Password | bcrypt cost=12 |
| CSRF | Cookie + X-CSRF-Token header |
| Rate Limiting | 300 req/min per IP |
| Audit Trail | All writes → `audit_logs` |
| RBAC | Admin / Operator / Viewer |
| Security Headers | X-Frame-Options, CSP, X-Content-Type-Options |
| TLS | Built-in HTTPS |

---

## 8. Supported Software

| Software | Install | Configure | Monitor | Versions |
|----------|---------|-----------|---------|----------|
| Nginx | ✅ | ✅ | ✅ | Latest |
| Apache | ✅ | ✅ | ✅ | 2.4 |
| OpenLiteSpeed | ✅ | ✅ | ✅ | Latest |
| PHP | ✅ | ✅ | ✅ | 7.4, 8.0–8.4 |
| MySQL | ✅ | ✅ | ✅ | 5.7, 8.0 |
| MariaDB | ✅ | ✅ | ✅ | 10.x, 11.x |
| Redis | ✅ | ✅ | ✅ | Latest |
| phpMyAdmin | ✅ | — | — | Latest |
| PureFTPd | ✅ | ✅ | — | Latest |
| Docker | Detect | ✅ | ✅ | Engine |

### Storage Modules

| Module | Purpose |
|--------|---------|
| FTP Storage | Remote FTP backup destination |
| S3 / MinIO | S3-compatible object storage |
| Google Drive | Google Drive backup via OAuth2 |
| OneDrive | OneDrive backup via OAuth2 |
