# ITDLUPanel — System Architecture

> **Version:** 1.0.0 · **Go 1.25** · **React 19** · **Last updated:** 2026-04-28

---

## 1. Overview

ITDLUPanel là một **server quản trị Linux đơn khối** (single-binary) được xây dựng cho Đại học Đà Lạt. Toàn bộ stack — Go backend, React frontend, và SQLite database — được đóng gói thành một file thực thi ~60MB với zero external runtime dependencies.

```
┌──────────────────────────────────────────────────────────────┐
│                   Browser (React 19 SPA)                      │
│        Ant Design 6 · xterm.js · Monaco Editor                │
│        Recharts · Zustand · TanStack Query · i18n            │
└──────────────────┬────────────────────────┬───────────────────┘
                   │  REST API (~190)       │  WebSocket (2)
                   │  HTTPS / JWT           │  PTY Terminal + Monitor
                   ▼                        ▼
┌──────────────────────────────────────────────────────────────┐
│             Single Go Binary  (go:embed SPA)                   │
│                                                                │
│  ┌──────────┐  ┌─────────────┐  ┌───────────────────────┐    │
│  │   Gin    │→ │ 33 Handlers│→ │  38 Services           │    │
│  │  Router  │  │  (REST API)│  │  24 Installers         │    │
│  └──────────┘  └─────────────┘  │  4 Vhost Generators    │    │
│  ┌──────────┐  ┌─────────────┐  └───────────┬───────────┘    │
│  │   WS     │→ │  Terminal  │                │                 │
│  │   Hub    │  │  Monitor   │                ▼                 │
│  └──────────┘  └─────────────┘  ┌───────────────────────┐    │
│  ┌──────────────────────────────┐│  SQLite (18 tables)    │    │
│  │  Middleware Stack (11 layers)││  modernc.org/sqlite    │    │
│  │  Recovery·Logger·Security   │└───────────────────────┘    │
│  │  CORS·Compress·Lang        │                                │
│  │  RateLimit·CSRF·Audit     │                                │
│  │  Auth(JWT)·RBAC          │                                │
│  └────────────────────────────┘                               │
└──────────────────────────┬──────────────────────────────────┘
                             │  systemctl · exec · /proc
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                    Linux Host (Ubuntu/Debian)                 │
│     Nginx/Apache/OLS · PHP-FPM · MySQL/MariaDB · Redis        │
│     Docker · Fail2ban · PureFTPd · Certbot                    │
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
| TLS Multiplexing | soheilhy/cmux | 0.1.5 |

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
│  Recovery → Logger → Security│
│  CORS → Compress → Language  │
│  RateLimit → CSRF → Audit    │
│  Auth(JWT) → RBAC           │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  API Handlers (33 files)       │
│  auth · site · database ·    │
│  docker · file · security ..│
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  Service Layer (38 services)  │
│  Business logic, validation,  │
│  system calls, Docker API     │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│  Data Layer                  │
│  SQLite (18 tables)          │
│  File system · Docker socket │
│  systemctl · /proc · crontab │
└──────────────────────────────┘
```

### 3.2 Source Layout

```
cmd/panel/main.go              # Entry point, CLI sub-commands
internal/
├── api/v1/                   # 33 REST handler files
│   ├── auth.go                  Login, 2FA, token refresh, profile
│   ├── dashboard.go             System overview, software status
│   ├── site.go                 Website CRUD + 55+ sub-endpoints
│   ├── database.go              MySQL/MariaDB CRUD + backup/restore
│   ├── redis.go                Redis management (config, clients, memory)
│   ├── ftp.go                  FTP account CRUD + batch operations
│   ├── file.go                File browser, editor, upload/download
│   ├── docker.go               Containers, images, networks, volumes
│   ├── docker_compose.go        Docker Compose projects
│   ├── cron.go                 Cron job CRUD + run/toggle
│   ├── security.go             Firewall, SSH, Fail2ban, SSH keys
│   ├── ssl.go                  Cert management, Let's Encrypt, DNS-01
│   ├── backup.go               Backup CRUD, restore, download
│   ├── ftp_storage.go          FTP storage backend management
│   ├── cloud_storage.go        S3, Google Drive, OneDrive + OAuth
│   ├── software.go             70+ endpoints: install, PHP, MariaDB,
│   │                            PostgreSQL, MongoDB, Nginx, etc.
│   ├── monitor.go              System metrics, process list, disk, history
│   ├── task.go                 Background task status, logs, cancel
│   ├── user.go                 User CRUD + resource assignment
│   ├── role.go                 RBAC role management
│   ├── plugin.go               Plugin CRUD, install/uninstall
│   ├── settings.go             Panel settings (port, SSL, language)
│   ├── notification.go         Channels, rules, templates, logs
│   └── log.go                  Panel, website, SSH, audit logs
├── api/ws/                   # 2 WebSocket handlers
│   ├── terminal.go             PTY terminal (xterm.js ↔ creack/pty)
│   └── monitor.go              Real-time system metrics (2s interval)
├── app/                      # Application core
│   ├── app.go                 Bootstrap, TLS multiplexing, shutdown
│   ├── router.go              Route registration, service wiring
│   ├── auth_middleware.go     JWT, RBAC, CSRF, rate-limit, audit
│   └── middleware.go          Recovery, logger, CORS, compression, i18n
├── service/                  # 38 business-logic services
│   ├── auth_service.go          JWT issuance, validation, refresh
│   ├── totp_service.go          TOTP 2FA generation and verification
│   ├── user_service.go         User management
│   ├── role_service.go         RBAC role and permission management
│   ├── site_service.go         Website management + vhost generation
│   ├── ssl_service.go          Certificate management, Let's Encrypt
│   ├── database_service.go      MySQL/MariaDB operations
│   ├── redis_service.go        Redis operations
│   ├── ftp_service.go          PureFTPd account management
│   ├── file_service.go         File operations, compression, search
│   ├── cron_service.go         Cron job execution, log capture
│   ├── firewall_service.go      UFW management, port blocking
│   ├── security_service.go     SSH config, Fail2ban, SSH keys
│   ├── backup_service.go        Backup creation, restore, retention
│   ├── ftp_storage_service.go  FTP storage backup upload/download
│   ├── cloud_storage_service.go S3/GDrive/OneDrive backup
│   ├── software_service.go      Software installation, PHP, DB tuning
│   ├── docker_service.go        Docker Engine API wrapper
│   ├── docker_compose_service.go Docker Compose management
│   ├── monitor_service.go      System metrics via gopsutil
│   ├── metrics_collector.go   Metrics aggregation, retention policies
│   ├── notification_service.go Email, Telegram, webhook dispatch
│   ├── log_service.go         Log rotation, parsing, tail
│   ├── settings_service.go     Panel configuration management
│   ├── terminal_service.go     PTY session management
│   ├── jwt.go                  JWT token generation
│   ├── installer/              24 software installers
│   │   ├── nginx.go             Apache · OLS · PHP versions
│   │   ├── mysql.go              MariaDB · PostgreSQL · MongoDB
│   │   ├── redis.go             Memcached · Supervisor · Node.js
│   │   ├── php.go               Python · Go · Java/Tomcat
│   │   ├── elasticsearch.go     FTP · phpMyAdmin · pgAdmin
│   │   └── ... (16 more)
│   └── vhost/                  4 vhost generators
│       ├── nginx.go             Apache
│       ├── apache.go            OpenLiteSpeed
│       ├── ols.go
│       └── vhost.go            Shared base
├── database/                 # SQLite, 14 migrations, models
├── config/                  # JSON config reader/writer
├── pkg/                     # crypto · errors · logger · response · validator
├── i18n/                    # Backend EN/VI translations
├── task/                    # Background task queue with worker pool
├── websocket/               # WS hub, broadcast, events
├── system/                  # Shell execution, OS detection
└── plugin/                  # Plugin interface and manager
```

---

## 4. Middleware Stack

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | Recovery | Panic recovery with stack trace |
| 2 | Logger | Structured request logging (zerolog) |
| 3 | SecurityHeaders | X-Frame-Options, CSP, X-Content-Type |
| 4 | CORS | Cross-origin resource sharing |
| 5 | Compression | gzip response compression |
| 6 | Language | Accept-Language detection for i18n |
| 7 | RateLimit | 300 requests/minute per IP (in-memory) |
| 8 | CSRF | Cookie + X-CSRF-Token validation |
| 9 | Audit | POST/PUT/DELETE → audit_logs table |
| 10 | Auth | JWT token validation (HS256) |
| 11 | RBAC | Permission-based access control (5-min cache) |

---

## 5. Authentication & Authorization

- **JWT tokens**: Access (15 min) + Refresh (7 days), HS256 signing
- **2FA**: TOTP (RFC 6238) via pquerna/otp with QR code provisioning
- **Password**: bcrypt cost=12
- **Three RBAC roles**: Admin (`*`), Operator (scoped), Viewer (read-only)
- **Permission namespaces**: `sites.*`, `databases.*`, `files.*`, `docker.*`, `cron.*`, `logs.*`, `backup.*`, `terminal.access`, `security.*`, `software.*`, `ssl.*`, `firewall.*`, `ftp.*`, `redis.*`, `software.read`, `software.manage`, `docker.read`, `docker.create`, `docker.manage`
- **Permission cache**: In-memory, 5-minute TTL, reloads from DB on miss
- **Wildcard matching**: `sites.*` grants all `sites.X` permissions

---

## 6. Docker Integration

Docker management communicates via Unix socket (`/var/run/docker.sock`) using Docker API v1.41:

- **40+ endpoints**: Containers (CRUD, start/stop, logs, stats, exec), Images (list, pull, remove, search), Networks, Volumes, Compose, Daemon config
- **Docker Compose**: Create, up, down, restart, remove, logs
- **System**: Disk usage, daemon config (registry mirrors), restart/stop

---

## 7. Background Task System

Long-running operations run asynchronously with real-time progress:

```
API Request → Create Task (SQLite) → Push to Queue → Worker executes
                                                          │
                                                          ▼
                                              WebSocket progress updates
                                              → Browser progress bar
```

- **Worker pool**: 4 concurrent workers
- **Persistence**: Tasks stored in SQLite
- **Cancellation**: Tasks can be cancelled mid-execution
- **Task types**: install, uninstall, backup, restore, extension install, stack install

---

## 8. WebSocket Architecture

```
Hub (in-memory broadcast hub)
  ├── Terminal WS  → creack/pty → bash shell → xterm.js
  └── Monitor WS  → gopsutil metrics → 2s ticker → Browser charts
```

- **Terminal**: JWT auth via `?token=<jwt>` query param; PTY resize via JSON `{type:"resize",cols,rows}`
- **Monitor**: Reads from hub's broadcast channel; pushes metrics every 2 seconds

---

## 9. Frontend Architecture

### 9.1 Page Modules (lazy-loaded)

| Page | Description |
|------|-------------|
| Dashboard | System overview, live charts, quick actions |
| Websites | Site CRUD, domain aliases, PHP switching, batch ops |
| Databases | MySQL/MariaDB/PostgreSQL/MongoDB CRUD, backup/restore, tuning |
| Files | File browser, Monaco editor, bookmarks, compress/decompress |
| Terminal | Multi-tab xterm.js via WebSocket |
| Docker | Containers, images, networks, volumes, compose |
| Security | SSH config, Fail2ban, IP blocking, SSH keys |
| Firewall | UFW rules, port statuses |
| Monitor | Real-time + historical system metrics |
| Cron | Cron CRUD with schedule builder |
| Logs | Panel, website, SSH, audit logs |
| AppStore | Software install/uninstall with progress |
| FTP / FTP Storage | FTP accounts, remote FTP backup destinations |
| Cloud Storage | S3, Google Drive, OneDrive backup backends |
| Backups | Backup management, restore, retention |
| Users | User management with RBAC |
| Settings | Panel settings, notifications, SSL |
| Login | Auth + 2FA |

### 9.2 State Management (Zustand)

| Store | Purpose |
|-------|---------|
| `auth` | JWT tokens, user profile, login/logout |
| `theme` | Dark/light mode, palette colors |
| `settings` | Panel config (language, port, paths) |
| `task` | Background task progress tracking |
| `notification` | Notification channels, unread count |

---

## 10. Database Schema (SQLite — 18 tables)

### Core

| Table | Purpose |
|-------|---------|
| `users` | Accounts (username, email, bcrypt hash, 2FA secret) |
| `roles` | RBAC roles with JSON permissions array |
| `user_roles` | User ↔ Role mapping |
| `user_sites` | User ↔ Site access scoping |
| `user_resources` | Per-user resource quotas (sites, DBs, FTP, disk) |
| `settings` | Key-value panel settings |
| `schema_migrations` | Migration tracking |

### Application

| Table | Purpose |
|-------|---------|
| `sites` | Websites (domain, root, PHP version, web server, SSL) |
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
| `notification_channels` | Email/Telegram/Webhook channels |
| `notification_rules` | Alert rules and triggers |
| `notification_logs` | Notification delivery history |

---

## 11. Security Features

| Feature | Implementation |
|---------|---------------|
| Authentication | JWT HS256 (15-min access + 7-day refresh) |
| 2FA | TOTP (RFC 6238) |
| Password | bcrypt cost=12 |
| CSRF | Cookie + X-CSRF-Token header |
| Rate Limiting | 300 req/min per IP (in-memory) |
| Audit Trail | All writes → `audit_logs` |
| RBAC | Admin / Operator / Viewer |
| Security Headers | X-Frame-Options, CSP, X-Content-Type-Options |
| TLS | Built-in HTTPS (cmux HTTP+HTTPS same port) |
| Path Traversal Protection | All file paths validated before access |

---

## 12. CLI Sub-commands

| Command | Description |
|---------|-------------|
| `itdlupanel -config <path>` | Start the panel server |
| `itdlupanel reset-password -user <u> -password <p>` | Reset user password |
| `itdlupanel backup -type=site -all` | CLI backup all sites |
| `itdlupanel backup -type=database -target <name>` | Backup a specific DB |
| `itdlupanel backup -type=panel` | Backup entire panel |
| `itdlupanel cron-run -id <n>` | Execute a cron job by ID |

---

## 13. Build & Deployment

### 13.1 Build Process

```
Phase 1: Frontend Build
  cd web && npm install && npx vite build → web/dist/

Phase 2: Go Embed + Compile
  go generate (embed web/dist/) → web.go
  CGO_ENABLED=0 go build → bin/itdlupanel (~60MB)

Result: Single static binary with embedded SPA
```

### 13.2 Makefile Targets

| Target | Description |
|--------|-------------|
| `make build` | Build for current platform |
| `make dev` | Development mode (`go run`) |
| `make build-linux-amd64` | Cross-compile for Linux amd64 |
| `make build-linux-arm64` | Cross-compile for Linux arm64 |
| `make test` | Run tests with coverage |
| `make lint` | Run golangci-lint |
| `make clean` | Remove build artifacts |

### 13.3 Docker Build (multi-stage)

```dockerfile
FROM node:22-alpine AS frontend
COPY web/ . && npm ci && npx vite build

FROM golang:1.25-alpine AS backend
COPY --from=frontend /dist web/dist
RUN CGO_ENABLED=0 go build -o itdlupanel ./cmd/panel

FROM alpine:3.21
COPY --from=backend /itdlupanel /usr/local/bin/
EXPOSE 8888
CMD ["itdlupanel"]
```
