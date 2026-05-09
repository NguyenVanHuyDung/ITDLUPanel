# ITDLUPanel — System Architecture

> **Version:** 1.0.0 · **Go 1.25** · **React 19** · **Last updated:** 2026-05-09

---

## 1. Overview

ITDLUPanel is a **single-binary Linux server management panel** built for Dalat University. The entire stack — Go backend, React frontend, and SQLite database — is packaged into a single ~60MB executable with zero external runtime dependencies.

```
┌──────────────────────────────────────────────────────────────┐
│                   Browser (React 19 SPA)                     │
│   Ant Design v6 · Tailwind v4 · Monaco Editor · xterm.js   │
│   Recharts · Zustand · TanStack Query · i18next            │
└─────────────────────┬────────────────────────────────────────┘
                      │  REST API (~220 endpoints)  │  WebSocket (2)
                      │  HTTPS / JWT Bearer       │  PTY Terminal + Monitor
                      ▼                            ▼
┌──────────────────────────────────────────────────────────────┐
│               Single Go Binary  (go:embed SPA)                │
│                                                              │
│  ┌──────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │   Gin    │→ │ 26 REST Handlers  │→ │ 38 Services      │   │
│  │  Router  │  │                  │  │ 25 Installers     │   │
│  └──────────┘  └──────────────────┘  │ 4 Vhost Gens     │   │
│  ┌──────────┐  ┌──────────────────┐  │ WAF (HAProxy +   │   │
│  │   WS     │→ │  Terminal WS     │  │   Coraza SPOA)   │   │
│  │   Hub    │  │  Monitor WS      │  └────────┬────────┘   │
│  └──────────┘  └──────────────────┘           │            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Middleware Stack (11 layers)                          │  │
│  │  Recovery·Logger·SecurityHeaders·CORS·Compress·Lang   │  │
│  │  RateLimit·CSRF·AuditLog·Auth(JWT)·RBAC             │  │
│  └──────────────────────────────────────────────┬─────────┘  │
│  ┌──────────────────────────────────────────────┴─────────┐  │
│  │  SQLite (17 migrations → 38 tables)  modernc.org/sqlite│  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             │  systemctl · exec · /proc · Docker API
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                  Linux Host (Ubuntu / Debian)                  │
│   Nginx/Apache/OLS · PHP-FPM · MySQL/MariaDB · PostgreSQL   │
│   Redis · Memcached · Docker · Fail2ban · PureFTPd          │
│   HAProxy · Coraza WAF                                        │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### 2.1 Backend

| Component        | Technology                  | Version         |
|-----------------|-----------------------------|-----------------|
| Language        | Go                          | 1.25.0          |
| HTTP Framework   | Gin                         | 1.12.0          |
| Database        | SQLite (CGO-free)           | modernc.org/sqlite 1.47.0 |
| WebSocket       | gorilla/websocket           | 1.5.3           |
| Auth / JWT      | golang-jwt/jwt             | 5.3.1           |
| 2FA (TOTP)      | pquerna/otp                | 1.5.0           |
| Password Hash   | bcrypt (golang.org/x/crypto)| —               |
| System Monitor  | gopsutil                   | 3.24.5          |
| Terminal PTY    | creack/pty                 | 1.1.24          |
| Logging         | zerolog + lumberjack        | 1.34.0          |
| Validation      | go-playground/validator     | 10.30.1         |
| Object Storage  | minio-go                   | 7.0.100         |
| OAuth2          | golang.org/x/oauth2        | 0.36.0          |
| FTP Client      | jlaffaye/ftp              | 0.2.0           |
| TLS Multiplexing| soheilhy/cmux             | 0.1.5           |

### 2.2 Frontend

| Component       | Technology                 | Version          |
|----------------|----------------------------|-----------------|
| Framework       | React                     | 19.2.4          |
| Language        | TypeScript                | 5.9.3           |
| UI Library      | Ant Design                | 6.3.3           |
| Build Tool      | Vite                      | 8.0.1           |
| CSS             | Tailwind CSS              | 4.2.2           |
| State           | Zustand                   | 5.0.12          |
| Data Fetching   | TanStack React Query      | 5.91.2          |
| HTTP Client     | Axios                     | 1.13.6          |
| Charts          | Recharts                  | 3.8.0           |
| Code Editor     | Monaco Editor              | 4.7.0           |
| Terminal        | xterm.js                  | 6.0.0           |
| Routing         | React Router              | 6.30.3          |
| i18n            | i18next                   | 25.8.20          |
| Date            | Day.js                    | 1.11.20         |

---

## 3. Backend Architecture

### 3.1 Layered Design

```
HTTP Request
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  Middleware Stack (11 layers)                              │
│  1. Recovery    — panic recovery with stack trace          │
│  2. Logger     — structured request logging (zerolog)        │
│  3. Security   — X-Frame-Options, CSP, X-Content-Type      │
│  4. CORS      — cross-origin resource sharing              │
│  5. Compress  — gzip response compression                  │
│  6. Language   — Accept-Language detection for i18n          │
│  7. RateLimit — 300 req/min/IP (in-memory token bucket)   │
│  8. CSRF      — cookie + X-CSRF-Token validation           │
│  9. Audit     — POST/PUT/DELETE → audit_logs table          │
│ 10. Auth      — JWT token validation (HS256)               │
│ 11. RBAC     — permission-based access (5-min cache)        │
└────────────────────────────────────┬───────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────┐
│  API Handlers (26 files)                                    │
│  auth · dashboard · site · database · redis · ftp ·        │
│  file · docker · docker_cleanup · docker_compose · cron ·   │
│  security · waf · ssl · backup · ftp_storage ·              │
│  cloud_storage · software · monitor · task · user ·         │
│  role · plugin · settings · notification · log             │
└────────────────────────────────────┬───────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────┐
│  Service Layer (38 services)                               │
│  Business logic, validation, system calls, Docker API       │
│  WAF (HAProxy + Coraza SPOA), installer registry            │
└────────────────────────────────────┬───────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────┐
│  Data Layer                                                  │
│  SQLite (17 migrations → 38 tables)                         │
│  File system · Docker socket · systemctl · /proc · crontab  │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Source Layout

```
cmd/panel/main.go                # Entry point, CLI sub-commands
internal/
├── api/v1/                     # 26 REST handler files
│   ├── auth.go                    Login, 2FA, token refresh, profile
│   ├── dashboard.go               System overview, software status
│   ├── site.go                   Website CRUD + 55+ sub-endpoints
│   ├── database.go               MySQL/MariaDB/PostgreSQL CRUD + backup
│   ├── redis.go                 Redis management (config, clients, memory)
│   ├── ftp.go                   FTP account CRUD + batch operations
│   ├── file.go                  File browser, editor, upload/download
│   ├── docker.go                Containers, images, networks, volumes
│   ├── docker_cleanup.go         Cleanup rules, logs, stats, dry-run
│   ├── docker_compose.go         Docker Compose projects
│   ├── cron.go                  Cron job CRUD + run/toggle
│   ├── security.go              Firewall, SSH, Fail2ban, SSH keys
│   ├── waf.go                  WAF sites, rules, logs, IP lists, stats
│   ├── ssl.go                  Cert management, Let's Encrypt, DNS-01
│   ├── backup.go               Backup CRUD, restore, download
│   ├── ftp_storage.go          FTP storage backend management
│   ├── cloud_storage.go        S3, Google Drive, OneDrive + OAuth
│   ├── software.go             70+ endpoints: install, PHP, MariaDB,
│   │                           PostgreSQL, MongoDB, Nginx, etc.
│   ├── monitor.go             System metrics, process list, disk, history
│   ├── task.go                Background task status, logs, cancel
│   ├── user.go                User CRUD + resource assignment
│   ├── role.go               RBAC role management
│   ├── plugin.go              Plugin CRUD, install/uninstall
│   ├── settings.go            Panel settings (port, SSL, language)
│   ├── notification.go         Channels, rules, templates, logs
│   └── log.go                Panel, website, SSH, audit logs
├── api/ws/                    # 2 WebSocket handlers
│   ├── terminal.go             PTY terminal (xterm.js ↔ creack/pty)
│   └── monitor.go             Real-time system metrics (2s interval)
├── app/                       # Application core
│   ├── app.go                Bootstrap, TLS multiplexing, graceful shutdown
│   ├── router.go             Route registration, service wiring
│   ├── auth_middleware.go    JWT, RBAC, CSRF, rate-limit, audit
│   └── middleware.go         Recovery, logger, CORS, compression, i18n
├── service/                   # 38 business-logic services
│   ├── auth_service.go          JWT issuance, validation, refresh
│   ├── totp_service.go          TOTP 2FA generation and verification
│   ├── jwt.go                   JWT token generation
│   ├── user_service.go          User management
│   ├── role_service.go          RBAC role and permission management
│   ├── site_service.go          Website management + vhost generation
│   ├── site_defaults.go         Default page generation
│   ├── site_statistics_service.go Access log statistics
│   ├── ssl_service.go           Certificate management, Let's Encrypt
│   ├── ssl_renewer.go          Automatic SSL renewal via cron
│   ├── database_service.go       MySQL/MariaDB operations
│   ├── redis_service.go         Redis operations
│   ├── ftp_service.go           PureFTPd account management
│   ├── file_service.go          File operations, compression, search
│   ├── cron_service.go          Cron job execution, log capture
│   ├── firewall_service.go       UFW management, port blocking
│   ├── security_service.go       SSH config, Fail2ban, SSH keys
│   ├── waf_service.go            WAF site management, HAProxy config
│   ├── waf_log_service.go        WAF log parsing and aggregation
│   ├── haproxy_manager.go         HAProxy installation and config
│   ├── coraza_spoa.go            Coraza SPOA integration
│   ├── geo_service.go            GeoIP lookups for WAF
│   ├── backup_service.go          Backup creation, restore, retention
│   ├── ftp_storage_service.go    FTP storage backup upload/download
│   ├── cloud_storage_service.go  S3/GDrive/OneDrive backup
│   ├── software_service.go        Software installation, PHP, DB tuning
│   ├── docker_service.go         Docker Engine API wrapper
│   ├── docker_compose_service.go Docker Compose management
│   ├── docker_cleanup_service.go  Container/image/volume cleanup
│   ├── monitor_service.go         System metrics via gopsutil
│   ├── metrics_collector.go       Metrics aggregation, retention policies
│   ├── notification_service.go    Email, Telegram, webhook dispatch
│   ├── email_service.go          SMTP email sending
│   ├── telegram_service.go        Telegram Bot API integration
│   ├── log_service.go            Log rotation, parsing, tail
│   ├── settings_service.go         Panel configuration management
│   ├── terminal_service.go        PTY session management
│   ├── installer/                 # 25 software installers
│   │   ├── nginx.go              Apache · OLS · PHP versions
│   │   ├── mysql.go              MariaDB · PostgreSQL · MongoDB
│   │   ├── redis.go              Memcached · Supervisor · Node.js
│   │   ├── php.go                Python · Go · Java/Tomcat
│   │   ├── elasticsearch.go       FTP · phpMyAdmin · pgAdmin
│   │   ├── ftp_storage.go         FTP storage module
│   │   ├── google_drive.go       Google Drive OAuth2 module
│   │   ├── onedrive.go           OneDrive OAuth2 module
│   │   ├── s3_storage.go         S3/MinIO module
│   │   ├── envoy.go              Envoy proxy installer
│   │   └── ...                   # All 25 installer files
│   └── vhost/                   # 4 vhost generators
│       ├── nginx.go              Apache
│       ├── apache.go             OpenLiteSpeed
│       ├── ols.go
│       └── vhost.go            Shared base vhost logic
├── database/                    # SQLite, 17 migrations, models
├── config/                    # JSON config reader/writer
├── pkg/                        # crypto · errors · logger · response · validator
├── i18n/                       # Backend EN/VI translations
├── task/                       # Background task queue with worker pool
├── websocket/                  # WS hub, broadcast, events
├── system/                     # Shell execution, OS detection
└── plugin/                     # Plugin interface and manager
```

---

## 4. Middleware Stack

| Order | Middleware       | Purpose                                    |
|-------|-----------------|--------------------------------------------|
| 1     | Recovery        | Panic recovery with stack trace             |
| 2     | Logger          | Structured request logging (zerolog)        |
| 3     | SecurityHeaders | X-Frame-Options, CSP, X-Content-Type        |
| 4     | CORS            | Cross-origin resource sharing               |
| 5     | Compress        | gzip response compression                   |
| 6     | Language        | Accept-Language detection for i18n           |
| 7     | RateLimit       | 300 requests/minute per IP (in-memory)      |
| 8     | CSRF            | Cookie + X-CSRF-Token validation           |
| 9     | Audit           | POST/PUT/DELETE → audit_logs table         |
| 10    | Auth            | JWT token validation (HS256)                 |
| 11    | RBAC            | Permission-based access control (5-min cache) |

---

## 5. Authentication & Authorization

- **JWT tokens:** Access (15 min) + Refresh (7 days), HS256 signing
- **2FA:** TOTP (RFC 6238) via pquerna/otp with QR code provisioning
- **Password:** bcrypt cost=12
- **Three RBAC roles:** Admin (`*`), Operator (scoped), Viewer (read-only)
- **Permission namespaces:** `sites.*`, `databases.*`, `files.*`, `docker.*`, `docker.cleanup`, `cron.*`, `logs.*`, `backup.*`, `terminal.access`, `security.*`, `software.*`, `ssl.*`, `firewall.*`, `ftp.*`, `redis.*`, `waf.*`, `software.read`, `software.manage`, `docker.read`, `docker.create`, `docker.manage`, `docker.cleanup`
- **Permission cache:** In-memory, 5-minute TTL, reloads from DB on miss
- **Wildcard matching:** `sites.*` grants all `sites.X` permissions

---

## 6. WAF Architecture

The WAF system provides enterprise-grade web application firewall protection using HAProxy as a reverse proxy and Coraza as the ModSecurity-compatible rule engine.

### 6.1 Components

```
Internet Traffic
      │
      ▼
┌──────────────────────────────────────────────────┐
│  HAProxy (Layer 7 Load Balancer + SSL Termination) │
│  ┌─────────────────────────────────────────────┐  │
│  │  • Transparent proxy mode                   │  │
│  │  • SSL passthrough / offload                │  │
│  │  • Health check endpoints                   │  │
│  │  • Connection limiting (maxconn)             │  │
│  │  • Timeouts (client, server)                │  │
│  │  • Lua hooks for custom logic              │  │
│  └─────────────────────────────────────────────┘  │
│                      │                             │
│                      │ SPOA (SPOE v2)              │
│                      ▼                             │
│  ┌──────────────────────────────────────────────┐ │
│  │  Coraza SPOA (Securing Processing Agent)       │ │
│  │  ┌────────────────────────────────────────┐ │ │
│  │  │  OWASP ModSecurity Core Rule Set v4.0   │ │ │
│  │  │  • SQL Injection (SQLi)                 │ │ │
│  │  │  • Cross-Site Scripting (XSS)          │ │ │
│  │  │  • Local File Inclusion (LFI)          │ │ │
│  │  │  • Remote File Inclusion (RFI)         │ │ │
│  │  │  • Remote Code Execution (RCE)         │ │ │
│  │  │  • CRLF Injection                     │ │ │
│  │  │  • Path Traversal                     │ │ │
│  │  │  • PHP/Java/Node Injection            │ │ │
│  │  │  • HTTP Protocol Violations           │ │ │
│  │  └────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────┘ │
│                      │                             │
└──────────────────────│─────────────────────────────┘
                       │ (clean/blocked traffic)
                       ▼
              Backend Application Server
```

### 6.2 Processing Phases

| Phase | Description                              | Rules Applied     |
|-------|------------------------------------------|------------------|
| 1     | Request headers + connection variables   | Phase 1 rules    |
| 2     | Request body (if applicable)             | Phase 2 rules    |
| 3     | Response headers                         | Phase 3 rules    |
| 4     | Response body                           | Phase 4 rules    |
| 5     | Logging only                            | All rules        |

### 6.3 Key WAF Features

- **15 OWASP categories** pre-seeded with severity and MITRE ATT&CK mappings
- **Custom rule builder** with phase, action, priority, and log-level
- **Geo-blocking** via MaxMind GeoIP integration
- **IP lists** with CIDR, hit tracking, auto-expiry, and manual/auto source
- **URI whitelisting/blacklisting** with priority ordering
- **User-Agent filtering** for known bots and malicious patterns
- **Attack signature auto-learning** from log analysis
- **Traffic statistics** — hourly bandwidth, p95 response times, request counts
- **Geo statistics** — per-country request and block rates
- **Slow request detection** — configurable latency thresholds
- **Lua scripting** — custom HAProxy Lua scripts deployed from DB

---

## 7. Docker Integration

Docker management communicates via Unix socket (`/var/run/docker.sock`) using Docker API v1.41:

- **40+ endpoints:** Containers (CRUD, start/stop, logs, stats, exec), Images (list, pull, remove, search), Networks, Volumes, Compose, Daemon config
- **Docker Compose:** Create, up, down, restart, remove, logs
- **Docker Cleanup:** Scheduled rules, disk-threshold triggers, dry-run mode, log history
- **System:** Disk usage, daemon config (registry mirrors), restart/stop

---

## 8. Background Task System

Long-running operations run asynchronously with real-time progress:

```
API Request → Create Task (SQLite) → Push to Queue → Worker executes
                                                          │
                                                          ▼
                                              WebSocket progress updates
                                              → Browser progress bar
```

- **Worker pool:** 4 concurrent workers
- **Persistence:** Tasks stored in SQLite
- **Cancellation:** Tasks can be cancelled mid-execution
- **Task types:** install, uninstall, backup, restore, extension install, stack install

---

## 9. WebSocket Architecture

```
Hub (in-memory broadcast hub)
  ├── Terminal WS  → creack/pty → bash shell → xterm.js
  └── Monitor WS  → gopsutil metrics → 2s ticker → Browser charts
```

- **Terminal:** JWT auth via `?token=<jwt>` query param; PTY resize via JSON `{type:"resize",cols,rows}`
- **Monitor:** Reads from hub's broadcast channel; pushes metrics every 2 seconds

---

## 10. Frontend Architecture

### 10.1 Page Modules (lazy-loaded)

| Page          | Description                                        |
|---------------|---------------------------------------------------|
| Dashboard     | System overview, live charts, quick actions         |
| Websites      | Site CRUD, domain aliases, PHP switching, batch ops|
| Databases     | MySQL/MariaDB/PostgreSQL/MongoDB CRUD, backup/restore|
| Files         | File browser, Monaco editor, bookmarks, compress    |
| Terminal      | Multi-tab xterm.js via WebSocket                  |
| Docker        | Containers, images, networks, volumes, compose    |
| Docker Cleanup| Cleanup rules, logs, stats, dry-run               |
| Security      | SSH config, Fail2ban, IP blocking, SSH keys         |
| WAF           | Sites, rules, logs, IP lists, statistics          |
| Firewall      | UFW rules, port statuses                           |
| Monitor       | Real-time + historical system metrics              |
| Cron          | Cron CRUD with schedule builder                    |
| Logs          | Panel, website, SSH, audit logs                   |
| AppStore      | Software install/uninstall with progress           |
| FTP / FTP Storage | FTP accounts, remote FTP backup destinations   |
| Cloud Storage | S3, Google Drive, OneDrive backup backends        |
| Backups       | Backup management, restore, retention              |
| Notifications | Alert channels, rules, templates                   |
| Users         | User management with RBAC                          |
| Settings      | Panel settings, SSL, notifications                 |
| Login         | Auth + 2FA                                        |

### 10.2 State Management (Zustand)

| Store           | Purpose                                    |
|-----------------|--------------------------------------------|
| `auth`          | JWT tokens, user profile, login/logout     |
| `theme`         | Dark/light mode, palette colors            |
| `settings`      | Panel config (language, port, paths)        |
| `task`          | Background task progress tracking           |
| `notification`   | Notification channels, unread count        |

---

## 11. Database Schema (SQLite — 38 tables)

### Core

| Table           | Purpose                                           |
|-----------------|---------------------------------------------------|
| `users`         | Accounts (username, email, bcrypt hash, 2FA secret)|
| `roles`         | RBAC roles with JSON permissions array           |
| `user_roles`     | User ↔ Role mapping                             |
| `settings`      | Key-value panel settings                        |
| `schema_migrations`| Migration tracking                            |

### Application

| Table           | Purpose                                           |
|-----------------|---------------------------------------------------|
| `sites`         | Websites (domain, root, PHP version, web server, SSL)|
| `domains`       | Domain aliases per site                          |
| `databases`     | MySQL/MariaDB/PostgreSQL/MongoDB databases       |
| `ftps`          | FTP accounts                                     |
| `crons`         | Cron jobs (schedule, command, status)            |
| `tasks`         | Background tasks                                |
| `software`      | Installed software registry                      |
| `plugins`       | Plugin metadata                                 |
| `backups`       | Backup records                                 |
| `firewall_rules`| Firewall rules                                 |
| `audit_logs`     | Write operation audit trail                     |
| `docker_containers`| Docker container records                     |
| `docker_cleanup_rules`| Cleanup rules with schedule              |
| `docker_cleanup_logs`| Cleanup execution history                 |
| `ftp_storages`   | FTP storage configs                            |
| `cloud_storages`  | S3/GDrive/OneDrive configs                   |
| `notification_channels`| Email/Telegram/Webhook channels       |
| `notification_rules`| Alert rules and triggers                 |
| `notification_logs`| Notification delivery history                 |

### WAF (migrations 016 & 017)

| Table              | Purpose                                        |
|--------------------|------------------------------------------------|
| `waf_sites`        | Protected site configurations                  |
| `waf_rules`        | Custom and OWASP rules                        |
| `waf_owasp_categories`| Toggleable OWASP rule categories          |
| `waf_logs`         | Full audit trail of WAF decisions             |
| `waf_stats`        | Aggregated attack statistics                  |
| `waf_traffic_stats`| Hourly bandwidth and latency statistics       |
| `waf_settings`     | Global WAF configuration                     |
| `waf_ip_list`      | Whitelists, blacklists, CIDR, hit tracking  |
| `waf_uri_list`     | URI whitelist/blacklist                      |
| `waf_ua_list`      | User-Agent whitelist/blacklist               |
| `waf_attack_signatures`| Auto-learned attack patterns             |
| `waf_slow_requests`| Slow request detection records               |
| `waf_geo_stats`   | Per-country request and block statistics      |
| `waf_lua_scripts`  | Custom HAProxy Lua scripts                   |

---

## 12. Security Features

| Feature           | Implementation                                  |
|-------------------|-------------------------------------------------|
| Authentication    | JWT HS256 (15-min access + 7-day refresh)      |
| 2FA               | TOTP (RFC 6238)                                |
| Password          | bcrypt cost=12                                 |
| CSRF             | Cookie + X-CSRF-Token header                  |
| Rate Limiting     | 300 req/min per IP (in-memory)                |
| Audit Trail       | All writes → `audit_logs`                     |
| RBAC             | Admin / Operator / Viewer + custom roles       |
| Security Headers  | X-Frame-Options, CSP, X-Content-Type-Options  |
| TLS              | Built-in HTTPS (cmux HTTP+HTTPS same port)     |
| Path Traversal   | All file paths validated before access        |
| WAF              | HAProxy + Coraza OWASP ruleset                |

---

## 13. CLI Sub-commands

| Command                                      | Description                        |
|----------------------------------------------|------------------------------------|
| `itdlupanel -config <path>`                   | Start the panel server             |
| `itdlupanel reset-password -user <u> -password <p>` | Reset user password       |
| `itdlupanel backup -type=site -all`           | CLI backup all sites               |
| `itdlupanel backup -type=database -target <name>` | Backup a specific DB      |
| `itdlupanel backup -type=panel`                | Backup entire panel                |
| `itdlupanel backup -type=site -target example.com -storage=ftp -storage-id=1` | Backup with remote upload |
| `itdlupanel cron-run -id <n>`                 | Execute a cron job by ID          |

---

## 14. Build & Deployment

### 14.1 Build Process

```
Phase 1: Frontend Build
  cd web && npm install && npx vite build → web/dist/

Phase 2: Go Embed + Compile
  go generate (embed web/dist/) → web.go
  CGO_ENABLED=0 go build → bin/itdlupanel (~60MB)

Result: Single static binary with embedded SPA
```

### 14.2 Makefile Targets

| Target              | Description                              |
|---------------------|------------------------------------------|
| `make build`        | Build for current platform               |
| `make dev`          | Development mode (`go run`)             |
| `make build-linux-amd64` | Cross-compile for Linux amd64       |
| `make build-linux-arm64` | Cross-compile for Linux arm64       |
| `make test`         | Run tests with coverage                  |
| `make lint`         | Run golangci-lint                        |
| `make clean`         | Remove build artifacts                   |

### 14.3 Docker Build (multi-stage)

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

---

## 15. Deployment Paths

| Resource            | Path                                           |
|---------------------|------------------------------------------------|
| Panel binary        | `/usr/local/bin/itdlupanel`                   |
| Panel config        | `/ITDLUPanel/server/config/panel.json`      |
| Panel database      | `/ITDLUPanel/server/data/panel.db`           |
| SSL (panel)         | `/ITDLUPanel/server/data/ssl/panel/`        |
| SSL (sites)         | `/ITDLUPanel/server/data/ssl/sites/<domain>/`|
| Vhost (nginx)       | `/etc/nginx/sites-enabled/`                   |
| Vhost (apache)      | `/etc/apache2/sites-enabled/`                  |
| Vhost (OLS)         | `/usr/local/lsws/conf/vhosts/`              |
| Backup storage      | `/ITDLUPanel/backup/`                       |
| Log storage         | `/ITDLUPanel/logs/`                         |
| Wwwroot             | `/ITDLUPanel/wwwroot/`                       |
