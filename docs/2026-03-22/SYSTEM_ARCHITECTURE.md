# ITDLUPanel — System Architecture

> **Version**: 0.1.0 | **Date**: 2026-03-22 | **Author**: ITDLUPanel Team, Đại học Đà Lạt

---

## 1. Overview

ITDLUPanel is a self-hosted Linux web server management panel built for **Đại học Đà Lạt (Dalat University)**. It provides a modern web UI to manage websites, databases, files, Docker containers, security, and system monitoring — all from a single binary.

```
┌──────────────────────────────────────────────────────┐
│                   Browser (React SPA)                │
│         React 19 · Ant Design 6 · xterm.js           │
└──────────────┬──────────────────┬────────────────────┘
               │ HTTP/REST        │ WebSocket
               ▼                  ▼
┌──────────────────────────────────────────────────────┐
│                 Go Binary (Single)                   │
│  ┌────────────┬──────────────┬────────────────────┐  │
│  │  Gin HTTP  │  WS Handlers │  Embedded Frontend │  │
│  │  Router    │  (terminal,  │  (go:embed web/    │  │
│  │            │   monitor)   │   dist)            │  │
│  └─────┬──────┴──────┬───────┴────────────────────┘  │
│        │             │                               │
│  ┌─────▼──────┐ ┌────▼─────┐ ┌──────────────────┐   │
│  │  Services  │ │  Task    │ │  Installer        │   │
│  │  (21 svc)  │ │  Queue   │ │  Registry         │   │
│  └─────┬──────┘ └──────────┘ └──────────────────┘   │
│        │                                             │
│  ┌─────▼──────────────────────────────────────────┐  │
│  │  SQLite (data/panel.db) · gopsutil · PTY/exec  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│              Linux Host (Ubuntu/Debian)               │
│  Nginx · PHP-FPM · MySQL · Redis · Docker · UFW      │
└──────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Backend** | Go | 1.22 |
| **HTTP Framework** | Gin | 1.12 |
| **Database** | SQLite (modernc.org/sqlite) | 1.47 |
| **Auth** | JWT (HS256) + bcrypt + TOTP | — |
| **System Metrics** | gopsutil | 3.24 |
| **Terminal** | creack/pty + gorilla/websocket | — |
| **Logging** | zerolog + lumberjack | — |
| **Frontend** | React + TypeScript | 19.x |
| **UI Library** | Ant Design | 6.x |
| **State** | Zustand | 5.x |
| **Build Tool** | Vite | 8.x |
| **Charts** | Recharts | 3.x |
| **Code Editor** | Monaco Editor | 4.x |
| **Terminal UI** | xterm.js | 6.x |
| **i18n** | i18next | 25.x |
| **CSS** | Tailwind CSS | 4.x |

---

## 3. Project Structure

```
ITDLUPanel/
├── cmd/panel/main.go            # Entry point, flags, graceful shutdown
├── web.go                       # //go:embed all:web/dist
├── config/panel.json            # Runtime config (auto-generated)
├── data/panel.db                # SQLite database
│
├── internal/
│   ├── api/
│   │   ├── v1/                  # REST handlers (18 files)
│   │   │   ├── auth.go          #   Login, 2FA, token refresh
│   │   │   ├── user.go          #   User CRUD
│   │   │   ├── site.go          #   Website management
│   │   │   ├── database.go      #   MySQL/MariaDB management
│   │   │   ├── file.go          #   File operations (17 endpoints)
│   │   │   ├── security.go      #   Firewall, SSH, Fail2ban
│   │   │   ├── docker.go        #   Container & image management
│   │   │   ├── cron.go          #   Cron job scheduling
│   │   │   ├── software.go      #   Software install/manage
│   │   │   ├── monitor.go       #   System metrics
│   │   │   ├── log.go           #   Log retrieval
│   │   │   ├── backup.go        #   Backup/restore
│   │   │   ├── ssl.go           #   SSL certificate management
│   │   │   ├── ftp.go           #   FTP accounts
│   │   │   ├── setting.go       #   Panel settings
│   │   │   ├── task.go          #   Background tasks
│   │   │   ├── plugin.go        #   Plugin management
│   │   │   └── dashboard.go     #   Dashboard overview
│   │   └── ws/                  # WebSocket handlers
│   │       ├── terminal.go      #   PTY terminal
│   │       └── monitor.go       #   Real-time metrics stream
│   │
│   ├── app/
│   │   ├── app.go               # Bootstrap, dependency injection
│   │   ├── router.go            # Route registration, SPA fallback
│   │   ├── middleware.go        # Recovery, Logger, CORS, gzip, i18n
│   │   └── auth_middleware.go   # JWT auth, RBAC, rate limit, CSRF, audit
│   │
│   ├── config/config.go         # JSON config loader
│   ├── database/
│   │   ├── database.go          # SQLite connection
│   │   ├── migrations/          # Schema migrations
│   │   └── models/              # User, Setting repositories
│   │
│   ├── service/                 # Business logic (21 services)
│   │   ├── auth_service.go
│   │   ├── site_service.go
│   │   ├── database_service.go
│   │   ├── file_service.go
│   │   ├── docker_service.go
│   │   ├── monitor_service.go
│   │   ├── firewall_service.go
│   │   ├── security_service.go
│   │   ├── terminal_service.go
│   │   ├── software_service.go
│   │   ├── cron_service.go
│   │   ├── log_service.go
│   │   ├── backup_service.go
│   │   ├── ssl_service.go
│   │   ├── ftp_service.go
│   │   ├── settings_service.go
│   │   ├── user_service.go
│   │   ├── jwt.go
│   │   ├── totp_service.go
│   │   ├── ssl_renewer.go
│   │   ├── installer/           # Software installers
│   │   │   ├── nginx.go
│   │   │   ├── apache.go
│   │   │   ├── php.go
│   │   │   ├── redis.go
│   │   │   ├── phpmyadmin.go
│   │   │   └── ols.go
│   │   └── vhost/               # Vhost config generators
│   │       ├── nginx.go
│   │       ├── apache.go
│   │       └── ols.go
│   │
│   ├── pkg/                     # Shared utilities
│   │   ├── crypto/              # JWT, bcrypt, password utils
│   │   ├── errors/              # Custom error types
│   │   ├── logger/              # Structured logging
│   │   ├── response/            # HTTP response helpers
│   │   └── validator/           # Input validation
│   │
│   ├── i18n/                    # Internationalization (en, vi)
│   ├── plugin/                  # Plugin system
│   ├── system/                  # OS detection, shell exec
│   ├── task/                    # Background task queue
│   └── websocket/               # WebSocket hub
│
├── web/                         # React frontend
│   ├── src/
│   │   ├── pages/               # 14 page components (~10K LOC)
│   │   ├── layouts/             # MainLayout, AuthLayout
│   │   ├── components/          # NginxManageModal, RequireSoftware
│   │   ├── stores/              # auth.ts, theme.ts (Zustand)
│   │   ├── hooks/               # useIsMobile, useBreakpoint
│   │   ├── services/api.ts      # Axios client with interceptors
│   │   ├── types/index.ts       # TypeScript interfaces
│   │   ├── router/index.tsx     # Route definitions
│   │   └── i18n/                # EN/VI translations
│   ├── vite.config.ts
│   └── package.json
│
└── docs/                        # Documentation
```

---

## 4. Database Schema (SQLite)

**16 tables** managed via migration system:

| Table | Purpose |
|-------|---------|
| `users` | User accounts with bcrypt passwords, TOTP secrets |
| `roles` | RBAC roles with JSON permission arrays |
| `user_roles` | User ↔ Role mapping |
| `sites` | Website records (domain, path, PHP, SSL status) |
| `domains` | Domain aliases per site |
| `databases` | MySQL/MariaDB database records |
| `ftps` | FTP account records |
| `crons` | Cron job definitions + execution history |
| `tasks` | Background task queue with progress tracking |
| `software` | Installed software registry |
| `plugins` | Plugin records |
| `firewall_rules` | UFW firewall rules |
| `backups` | Backup metadata |
| `audit_logs` | User action audit trail |
| `settings` | Key-value system settings |
| `docker_containers` | Docker container metadata |
| `schema_migrations` | Migration version tracking |

### Default RBAC Roles

| Role | Permissions |
|------|-------------|
| **admin** | `["*"]` — Full access |
| **operator** | `sites.*, databases.*, ftp.*, files.*, cron.*, docker.*, firewall.*, backup.*, terminal.access, monitor.read, logs.read` |
| **viewer** | `monitor.read, logs.read, dashboard.read` — Read-only |

---

## 5. Authentication & Security

### Authentication Flow

```
Login Request ──► Verify bcrypt password
                       │
              ┌────────▼────────┐
              │  2FA enabled?   │
              └───┬────────┬────┘
                  │ No     │ Yes
                  ▼        ▼
           Return JWT   Return temp_token
           (access +    ──► Verify TOTP
            refresh)        ──► Return JWT
```

- **Access Token**: HS256 JWT, 15min TTL, claims: `{user_id, username, role}`
- **Refresh Token**: HS256 JWT, 7-day TTL
- **WebSocket Auth**: Query param `?token=<JWT>` (WS can't set headers)
- **Password Hashing**: bcrypt cost=12
- **CSRF**: Cookie + X-CSRF-Token header validation
- **Rate Limiting**: 60 req/min per IP

---

## 6. Middleware Stack

```
Request ──► Recovery ──► Logger ──► CORS ──► Gzip ──► Language
                                                         │
                                              ┌──────────▼──────────┐
                                              │   /api/v1/* routes  │
                                              └──────────┬──────────┘
                                                         │
                                    RateLimit ──► CSRF ──► Audit ──► AuthMiddleware
                                                                        │
                                                              Permission Check (RBAC)
                                                                        │
                                                                    Handler
```

---

## 7. Build & Deployment

### Single Binary Architecture

The frontend is embedded into the Go binary at compile time:

```go
//go:embed all:web/dist
var WebDistFS embed.FS
```

### Build Commands

```bash
# Frontend
cd web && npm run build

# Backend (includes embedded frontend)
export PATH=/usr/local/go/bin:$PATH
CGO_ENABLED=0 go build -o bin/itdlupanel ./cmd/panel

# Run
./bin/itdlupanel --config config/panel.json
```

### SPA Routing

The router serves `index.html` for all non-API, non-file routes with `Cache-Control: no-cache, no-store, must-revalidate` headers to prevent stale cached frontends.

---

## 8. WebSocket Architecture

### Terminal WebSocket (`/api/v1/terminal`)

```
Browser (xterm.js) ◄──── WebSocket ────► Go Handler ◄──── PTY ────► bash
         │                                    │
    resize events ──► {"type":"resize",  ──► pty.Setsize()
    keystrokes    ──► raw bytes          ──► ptmx.Write()
    display       ◄── raw bytes          ◄── ptmx.Read()
```

- Supports `?cwd=<path>` for starting directory
- Defaults to `$HOME` when no cwd specified

### Monitor WebSocket (`/api/v1/monitor/realtime`)

```
Browser (Recharts) ◄──── WebSocket ────► Hub ────► gopsutil
                              │                    (2s interval)
                         Multi-client
                         broadcast
```

---

## 9. Software Management

### Installer Registry

| Software | Installer | Versions |
|----------|-----------|----------|
| Nginx | `installer/nginx.go` | System package |
| Apache | `installer/apache.go` | System package |
| PHP | `installer/php.go` | 7.4, 8.0, 8.1, 8.2, 8.3 |
| Redis | `installer/redis.go` | System package |
| phpMyAdmin | `installer/phpmyadmin.go` | Latest |
| OpenLiteSpeed | `installer/ols.go` | System package |

### Vhost Generators

| Web Server | Generator | Config Path |
|------------|-----------|-------------|
| Nginx | `vhost/nginx.go` | `/etc/nginx/sites-available/` |
| Apache | `vhost/apache.go` | `/etc/apache2/sites-available/` |
| OpenLiteSpeed | `vhost/ols.go` | OLS vhost dir |

---

## 10. Frontend Architecture

### State Management

| Store | Purpose | Persistence |
|-------|---------|-------------|
| `auth` | JWT token, user object, auth status | localStorage (`itdlupanel-auth`) |
| `theme` | Light/dark mode | localStorage (`itdlu_theme`) |

### API Client

- Base: `axios` with `/api/v1` prefix
- Auto-attaches JWT Bearer token
- Auto-refresh on 401 → retry original request
- Auto-logout on refresh failure

### Responsive Design

- `useIsMobile()`: `< 768px`
- `useIsSmallMobile()`: `< 480px`
- `useBreakpoint()`: returns `{xs, sm, md, lg, width}`
- Mobile: drawer sidebar, compact layouts
- Desktop: fixed sidebar, full layouts

### i18n

- **Languages**: English (en), Vietnamese (vi)
- **Detection**: localStorage → browser language → fallback en
- **Framework**: i18next + react-i18next

---

## 11. Configuration

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8888,
    "ssl": false,
    "ssl_cert": "",
    "ssl_key": ""
  },
  "database": {
    "path": "data/panel.db"
  },
  "auth": {
    "jwt_secret": "<auto-generated>",
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
    "language": "en",
    "admin_path": "/",
    "version": "0.1.0"
  }
}
```
