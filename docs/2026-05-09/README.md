# ITDLUPanel — Linux Server Management Panel

[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-University_Project-blue)](#license)

An **open-source single-binary Linux server management panel** developed by **Dalat University (DLU)** for IT infrastructure management. ITDLUPanel provides a modern web interface and comprehensive integrations to manage Ubuntu/Debian servers — from website hosting and database administration to Docker containers, WAF protection, and security hardening.

---

## Highlights

- **Single-file deployment** — Go backend with embedded React SPA; zero external runtime dependencies
- **SQLite database** — WAL-mode storage with zero-configuration setup
- **Multi-user RBAC** — three built-in roles (admin / operator / viewer) with granular permissions
- **Two-factor authentication** — TOTP-based 2FA with JWT session management
- **WAF protection** — HAProxy + Coraza Web Application Firewall with OWASP ruleset
- **Docker auto-cleanup** — intelligent container/image/volume cleanup with scheduling and dry-run
- **Built for Dalat University** — designed for university IT infrastructure and educational environments

### Supported Platforms

| OS       | Version  |
|----------|----------|
| Ubuntu   | 20.04+   |
| Debian   | 11+      |

---

## Features

### Web Application Firewall (WAF)

- **HAProxy + Coraza integration** — full proxy WAF stack with transparent mode and SSL passthrough
- **OWASP ruleset** — 15 attack categories pre-seeded: SQLi, XSS, LFI, RFI, RCE, CRLF, Path Traversal, PHP Injection, Java Injection, Node.js Injection, and more
- **Custom rules** — create phase-1 and phase-2 rules with blocking or log-only actions
- **Geo-blocking** — block/allow traffic by country using MaxMind GeoIP
- **IP lists** — whitelists, blacklists with CIDR support, hit tracking, and auto-expiry
- **URI lists** — whitelist or blacklist specific URL patterns
- **User-Agent lists** — filter by known bot or malicious UA patterns
- **Attack signatures** — auto-learned patterns from WAF log analysis
- **Real-time traffic stats** — hourly bandwidth, request counts, response-time percentiles (p95)
- **Geo statistics** — per-country request and block rates
- **Slow request detection** — identify requests exceeding configurable latency thresholds
- **Lua scripting** — custom HAProxy Lua scripts stored in database and deployed on restart

### Server Management

- **Real-time dashboard** — live CPU, RAM, disk, and network metrics via WebSocket (2-second interval)
- **Historical metrics** — 1-day, 7-day, or 30-day trends with automatic data aggregation (raw → 5-min → 1-hour → 1-day rollups)
- **Process manager** — view full process table, send signals, or kill processes directly from the UI
- **Software installer** — one-click install for nginx, Apache, OpenLiteSpeed, PHP (multiple versions), MySQL/MariaDB, PostgreSQL, MongoDB, Redis, Memcached, Supervisor, and more

### Website Hosting

- **Multi-site management** — create and manage virtual hosts for nginx, Apache, and OpenLiteSpeed
- **Site types** — PHP, Node.js, Python, and Static site profiles
- **PHP version switching** — change PHP version per site without manual configuration
- **Domain & alias management** — add domains, subdomains, and server aliases
- **SSL certificates** — Let's Encrypt auto-provisioning, DNS-01 challenge support, custom certificate upload
- **Vhost editor** — direct browser editing with Monaco Editor (syntax highlighting, autocomplete)
- **Rewrite rules** — URL rewriting, hotlink protection, redirect rules, reverse proxy (HTTP/WebSocket)
- **Subdirectory bindings** — host multiple subdirectories under the same domain
- **Access control** — password protection, IP allow/deny lists, per-URL limit
- **Site statistics** — access log parsing with bandwidth and request counts per time period
- **Composer integration** — run `composer install/update/require/dump-autoload` directly from the panel
- **Maintenance mode** — serve a custom maintenance page with built-in templates

### File Management

- **Full-featured file browser** — list and grid views, drag-and-drop upload, breadcrumb navigation
- **Code editor** — Monaco-based editor for direct server-side file editing
- **Terminal integration** — open a terminal session at the current directory path
- **Bookmarks & search** — bookmark frequently accessed paths; search by filename or file content
- **Compression** — compress and extract zip, tar, and tar.gz archives
- **Remote download** — fetch files from URL directly to the server
- **Batch operations** — select multiple files for copy, move, delete, and permission changes
- **Permission management** — set file/directory permissions (chmod) and ownership (chown)

### Databases & FTP

- **Database CRUD** — create, manage, and delete MySQL/MariaDB/PostgreSQL/MongoDB databases and users
- **phpMyAdmin / pgAdmin** — one-click access to database administration tools
- **Backup & restore** — on-demand and scheduled database backups
- **Import SQL** — upload and import `.sql` or `.sql.gz` files directly
- **Quota & access control** — disk quotas and remote host access restrictions
- **FTP accounts** — manage FTP users via PureFTPd with directory control and per-user quotas
- **Redis management** — in-browser Redis CLI with config editing, client list, memory analysis, slowlog

### Docker

- **Container lifecycle** — start, stop, restart, remove, pause/unpause, and view logs of Docker containers
- **Image management** — pull new images, list existing ones, remove unused images, search Docker Hub
- **Networks & volumes** — create, connect, and manage Docker networks and volumes
- **Docker Compose** — create, up, down, restart, remove, and tail logs for compose projects
- **System info** — view Docker daemon info, disk usage, and global statistics
- **Registry mirrors** — configure custom Docker registry mirrors
- **Auto-cleanup** — intelligent cleanup rules with scheduled execution, disk-threshold triggers, and dry-run mode

### Security

- **Firewall management** — UFW rules for ports and IPs, ICMP blocking, listening port overview
- **SSH hardening** — manage SSH daemon settings, root password, and SSH users
- **Fail2ban integration** — view and manage Fail2ban jails, banned IPs, and jail configuration
- **SSH key management** — add, remove, generate (ED25519/RSA), and download SSH public keys per user
- **2FA (TOTP)** — enable/disable two-factor authentication with QR code provisioning

### Monitoring

- **Real-time metrics via WebSocket** — CPU, memory, disk I/O, and network throughput pushed every 2 seconds
- **Historical data aggregation** — raw → 5-minute averages → 1-hour averages → 1-day averages
- **Configurable retention** — set retention periods per aggregation level
- **Process table** — sortable process list with CPU/memory sorting and kill-signal capability
- **Service status** — at-a-glance overview of all managed services (nginx, mysql, etc.)

### Other

- **Cron jobs** — visual cron builder with presets and manual expression support
- **Backup & restore** — full and partial backup of websites and databases; backup to local, FTP, S3, Google Drive, or OneDrive
- **Audit logging** — every user action recorded with timestamp, IP, and details
- **Panel SSL** — secure the panel itself with HTTPS
- **Internationalization (i18n)** — English and Vietnamese UI
- **Themes** — dark and light mode with optional system-preference auto-detection
- **Multi-tab terminal** — xterm.js with WebSocket PTY and multi-session tabs

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│              Browser (React 19 SPA)                         │
│   Ant Design v6 · Tailwind v4 · Monaco Editor · xterm.js    │
│   Recharts · Zustand · TanStack Query · i18next             │
└───────────────────┬─────────────────────────────────────────┘
                    │  REST API (~220 endpoints)  │  WebSocket (2)
                    │  HTTPS / JWT Bearer         │  PTY Terminal + Monitor
                    ▼                            ▼
┌──────────────────────────────────────────────────────────────┐
│               Single Go Binary  (go:embed SPA)               │
│                                                              │
│  ┌──────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │   Gin    │→ │ 26 REST Handlers  │→ │ 38 Services      │   │
│  │  Router  │  │                  │  │ 25 Installers     │   │
│  └──────────┘  └──────────────────┘  │ 4 Vhost Gens     │   │
│  ┌──────────┐  ┌──────────────────┐  │ WAF (HAProxy +   │   │
│  │   WS     │→ │  Terminal WS     │  │   Coraza SPOA)   │   │
│  │   Hub    │  │  Monitor WS      │  └────────┬────────┘   │
│  └──────────┘  └──────────────────┘           │            │
│  ┌──────────────────────────────────────────────┴────────┐  │
│  │  Middleware Stack (11 layers)                          │  │
│  │  Recovery·Logger·SecurityHeaders·CORS·Compress·Lang  │  │
│  │  RateLimit·CSRF·AuditLog·Auth(JWT)·RBAC              │  │
│  └──────────────────────────────────────────────┬─────────┘  │
│  ┌──────────────────────────────────────────────┴─────────┐  │
│  │  SQLite (18 tables, WAL mode)  modernc.org/sqlite       │  │
│  │  17 migrations · 38 database tables total             │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────┬───────────────────────────────────┘
                             │  systemctl · exec · /proc · Docker API
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                 Linux Host (Ubuntu / Debian)                  │
│   Nginx/Apache/OLS · PHP-FPM · MySQL/MariaDB · PostgreSQL    │
│   Redis · Memcached · Docker · Fail2ban · PureFTPd · Certbot │
│   HAProxy · Coraza WAF                                       │
└──────────────────────────────────────────────────────────────┘
```

### Technology Stack

#### Backend

| Component       | Technology                  | Version       |
|-----------------|----------------------------|---------------|
| Language        | Go                         | 1.25.0        |
| HTTP Framework  | Gin                        | 1.12.0        |
| Database        | SQLite (CGO-free)          | modernc.org/sqlite 1.47.0 |
| WebSocket       | gorilla/websocket          | 1.5.3         |
| Auth / JWT      | golang-jwt/jwt            | 5.3.1         |
| 2FA (TOTP)      | pquerna/otp               | 1.5.0         |
| Password Hash   | bcrypt (golang.org/x/crypto) | —           |
| System Monitor  | gopsutil                  | 3.24.5        |
| Terminal PTY    | creack/pty                | 1.1.24        |
| Logging         | zerolog + lumberjack       | 1.34.0        |
| Validation      | go-playground/validator   | 10.30.1       |
| Object Storage  | minio-go                  | 7.0.100       |
| OAuth2          | golang.org/x/oauth2       | 0.36.0        |
| FTP Client      | jlaffaye/ftp              | 0.2.0         |
| TLS Multiplexing| soheilhy/cmux             | 0.1.5         |

#### Frontend

| Component      | Technology                 | Version        |
|----------------|----------------------------|----------------|
| Framework      | React                      | 19.2.4         |
| Language       | TypeScript                 | 5.9.3          |
| UI Library     | Ant Design                 | 6.3.3          |
| Build Tool     | Vite                       | 8.0.1          |
| CSS            | Tailwind CSS               | 4.2.2          |
| State          | Zustand                    | 5.0.12         |
| Data Fetching  | TanStack React Query       | 5.91.2         |
| HTTP Client    | Axios                      | 1.13.6         |
| Charts         | Recharts                   | 3.8.0          |
| Code Editor    | Monaco Editor              | 4.7.0          |
| Terminal       | xterm.js                   | 6.0.0          |
| Routing        | React Router               | 6.30.3         |
| i18n           | i18next                    | 25.8.20        |
| Date           | Day.js                     | 1.11.20        |

---

## Quick Start

### Build from Source

```bash
# Clone the repository
git clone https://github.com/itdlu/ITDLUPanel.git
cd ITDLUPanel

# Build (compiles Go binary + embeds React frontend)
make build

# Output binary: ./bin/itdlupanel
```

### Run

```bash
# Start the panel with default configuration
./bin/itdlupanel -config config/panel.json
```

### Access

```
URL:       https://<server-ip>:8888
Username:  admin
Password:  admin@123456
```

> **Important:** Change the default credentials immediately after first login.

---

## API Overview

ITDLUPanel exposes **~220 REST endpoints** under the `/api/v1/` prefix, organized by resource:

| Category       | Prefix                  | Description                              |
|----------------|-------------------------|------------------------------------------|
| Auth           | `/api/v1/auth/`         | Login, logout, 2FA, token refresh        |
| Dashboard      | `/api/v1/dashboard/`    | System overview, software status          |
| Sites          | `/api/v1/sites/`        | Website CRUD, domains, PHP switching      |
| SSL            | `/api/v1/ssl/`          | Certificate management                   |
| Databases      | `/api/v1/databases/`    | MySQL/MariaDB/PostgreSQL CRUD + backup  |
| Redis          | `/api/v1/redis/`        | Redis CLI, config, clients, memory       |
| Files          | `/api/v1/files/`        | File operations, upload, download        |
| FTP            | `/api/v1/ftp/`          | FTP account management                   |
| Docker         | `/api/v1/docker/`       | Containers, images, networks, volumes    |
| Docker Cleanup | `/api/v1/docker/cleanup/` | Cleanup rules, logs, stats, dry-run     |
| Docker Compose | `/api/v1/docker/compose/` | Compose project management              |
| Cron           | `/api/v1/crons/`        | Cron job management                      |
| Firewall       | `/api/v1/firewall/`     | Port/IP rules, UFW management           |
| WAF            | `/api/v1/waf/`          | WAF sites, rules, logs, IP lists, stats |
| Software       | `/api/v1/software/`      | Software install/uninstall               |
| Monitor        | `/api/v1/monitor/`      | System metrics, history, processes       |
| Security       | `/api/v1/security/`     | SSH, Fail2ban, SSH keys                  |
| Backup         | `/api/v1/backups/`      | Backup management and restore            |
| FTP Storage    | `/api/v1/ftp-storages/` | FTP backup destination management        |
| Cloud Storage  | `/api/v1/cloud-storages/` | S3, Google Drive, OneDrive backends    |
| Settings       | `/api/v1/settings/`     | Panel configuration                      |
| Notifications  | `/api/v1/notifications/` | Alert channels, rules, templates        |
| Logs           | `/api/v1/logs/`         | Panel, website, SSH, audit logs          |
| Users          | `/api/v1/users/`        | User and role management                 |
| Roles          | `/api/v1/roles/`        | RBAC role management                     |
| Tasks          | `/api/v1/tasks/`        | Background task status and logs         |
| Plugins        | `/api/v1/plugins/`       | Plugin management                        |

### WebSocket Endpoints

| Endpoint                        | Description                               |
|---------------------------------|-------------------------------------------|
| `/api/v1/terminal`              | Interactive shell session (xterm.js)      |
| `/api/v1/monitor/realtime`      | Real-time system metrics (2-second cycle) |

### Authentication & Security

- **JWT Bearer token** — pass via `Authorization: Bearer <token>` header
- **Rate limiting** — 300 requests/minute per IP (in-memory)
- **CSRF protection** — cookie + `X-CSRF-Token` header validation
- **Audit logging** — all API mutations recorded with user, IP, and timestamp

> Full API reference with all endpoints, request/response examples is available in [API.md](./API.md).

---

## Project Structure

```
ITDLUPanel/
├── cmd/panel/main.go               # Entry point, CLI sub-commands
├── internal/
│   ├── app/                        # Bootstrap, router, TLS multiplexing
│   ├── api/v1/                     # 26 REST handler files
│   │   ├── auth.go · dashboard.go · site.go · database.go
│   │   ├── redis.go · ftp.go · file.go · docker.go
│   │   ├── docker_cleanup.go · docker_compose.go · cron.go
│   │   ├── security.go · waf.go · ssl.go · backup.go
│   │   ├── ftp_storage.go · cloud_storage.go · software.go
│   │   ├── monitor.go · task.go · user.go · role.go
│   │   ├── plugin.go · settings.go · notification.go · log.go
│   ├── api/ws/                     # 2 WebSocket handlers
│   │   ├── terminal.go             # xterm.js ↔ creack/pty bridge
│   │   └── monitor.go              # Real-time metrics push
│   ├── service/                    # 38 business-logic services
│   │   ├── auth_service.go · totp_service.go · jwt.go
│   │   ├── user_service.go · role_service.go
│   │   ├── site_service.go · ssl_service.go · ssl_renewer.go
│   │   ├── site_defaults.go · site_statistics_service.go
│   │   ├── database_service.go · redis_service.go
│   │   ├── ftp_service.go · file_service.go
│   │   ├── cron_service.go
│   │   ├── firewall_service.go · security_service.go
│   │   ├── waf_service.go · waf_log_service.go
│   │   ├── haproxy_manager.go · coraza_spoa.go · geo_service.go
│   │   ├── backup_service.go · ftp_storage_service.go
│   │   ├── cloud_storage_service.go
│   │   ├── software_service.go
│   │   ├── docker_service.go · docker_compose_service.go
│   │   ├── docker_cleanup_service.go
│   │   ├── monitor_service.go · metrics_collector.go
│   │   ├── notification_service.go · email_service.go
│   │   ├── telegram_service.go · log_service.go
│   │   ├── settings_service.go · terminal_service.go
│   │   ├── installer/              # 25 software installers
│   │   │   ├── nginx.go · apache.go · ols.go
│   │   │   ├── php.go · mysql.go · postgresql.go · mongodb.go
│   │   │   ├── redis.go · memcached.go · supervisor.go
│   │   │   ├── nodejs.go · python.go · golang.go · tomcat.go
│   │   │   ├── pureftpd.go · phpmyadmin.go · pgadmin.go
│   │   │   ├── elasticsearch.go · ftp_storage.go
│   │   │   ├── google_drive.go · onedrive.go · s3_storage.go
│   │   │   └── envoy.go
│   │   └── vhost/                  # 4 vhost generators
│   │       ├── nginx.go · apache.go · ols.go · vhost.go
│   ├── database/                   # SQLite connection, migrations
│   │   ├── migrations/             # 17 migrations → 38 total tables
│   │   └── models/                 # Database models
│   ├── middleware/                  # Auth, CORS, rate limiter, audit, CSRF
│   ├── websocket/                  # WS hub, broadcast, events
│   ├── system/                     # Shell execution, OS detection
│   ├── plugin/                     # Plugin interface and manager
│   ├── config/                     # JSON config loader
│   ├── i18n/                       # Backend EN/VI translations
│   ├── pkg/                        # crypto · errors · logger · response
│   └── task/                       # Background task queue (4 workers)
├── web/
│   └── src/
│       ├── pages/                  # 17 page modules (lazy-loaded)
│       ├── components/            # Shared UI components
│       ├── stores/                 # Zustand state stores
│       ├── services/              # Axios API client layer
│       └── hooks/                  # Shared React hooks
├── docs/                           # Documentation
├── Makefile                        # Build targets
└── go.mod                          # Go module definition
```

---

## Configuration

The panel is configured via `config/panel.json`. Default values:

```jsonc
{
  "server": {
    "host": "0.0.0.0",       // Listen address
    "port": 8888,             // Listen port
    "mode": "release"         // Gin mode: debug | release
  },
  "database": {
    "path": "data/panel.db",  // SQLite file path
    "max_connections": 10     // Connection pool size
  },
  "auth": {
    "jwt_secret": "",         // JWT signing key (auto-generated if empty)
    "token_expire": 24,       // Token expiry in hours
    "max_login_attempts": 5,  // Account lockout threshold
    "lockout_duration": 15    // Lockout duration in minutes
  },
  "paths": {
    "backup_dir": "data/backups",
    "temp_dir": "data/tmp",
    "log_dir": "data/logs"
  },
  "panel": {
    "name": "ITDLUPanel",     // Panel display name
    "language": "en",          // Default language: en | vi
    "ssl_enabled": false,       // Enable HTTPS for the panel
    "ssl_cert": "",             // SSL certificate path
    "ssl_key": ""              // SSL private key path
  }
}
```

---

## System Requirements

### Runtime Environment

| Resource   | Minimum    | Recommended     |
|------------|------------|-----------------|
| OS         | Ubuntu 20.04 / Debian 11 | Ubuntu 22.04+ / Debian 12+ |
| RAM        | 512 MB     | 1 GB+           |
| Disk       | 1 GB free  | 10 GB+ free     |
| Network    | Public or internal IP | Public IP with DNS |

### Build Dependencies

| Tool     | Version | Purpose                  |
|----------|---------|--------------------------|
| Go       | 1.25+   | Backend compiler         |
| Node.js  | 18+     | Frontend build           |
| Make     | any     | Build automation         |

> **Note:** Build dependencies are only needed when compiling from source. The compiled binary has no external runtime dependencies.

---

## Development

```bash
# Start backend in development mode
go run cmd/panel/main.go -config config/panel.json

# Start frontend dev server (in a separate terminal)
cd web
npm install
npm run dev
```

The Vite dev server proxies API requests to the Go backend, enabling hot-reload during frontend development.

---

## Contributing

We welcome contributions! Please follow these guidelines:

1. Fork the repository and create a feature branch
2. Follow the existing code style and conventions
3. Write clear commit messages
4. Test changes on supported platforms
5. Submit a pull request with a description of your changes

---

## License

This is a university project developed at **Dalat University (DLU)**, Vietnam.

---

<p align="center">
  Built with care by the IT team at <strong>Dalat University (DLU)</strong>
</p>
