# ITDLUPanel — System Architecture

> **Version:** 2026-03-24  
> **Stack:** Go 1.25 + React 19 · SQLite · WebSocket  
> **Purpose:** Linux server management panel

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Backend Architecture](#2-backend-architecture)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Data Flow Diagrams](#4-data-flow-diagrams)
5. [Configuration](#5-configuration)
6. [Key Dependencies](#6-key-dependencies)

---

## 1. System Overview

ITDLUPanel is a self-hosted Linux server management panel distributed as a **single Go binary** with an **embedded React SPA**. It provides web-based management of websites, databases, FTP, Docker, SSL certificates, cron jobs, firewalls, file systems, and system monitoring.

### Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│                        Single Go Binary                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Embedded    │  │  Gin HTTP    │  │  Background Workers    │ │
│  │  React SPA   │  │  Router      │  │                        │ │
│  │  (Vite build)│  │  + Middleware│  │  • Task Queue (4)      │ │
│  └──────┬───────┘  └──────┬───────┘  │  • MetricsCollector    │ │
│         │                 │          │  • SSL Renewer          │ │
│         │   ┌─────────────┤          └────────────┬───────────┘ │
│         │   │             │                       │             │
│         ▼   ▼             ▼                       ▼             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Static File │  │  REST API    │  │  WebSocket             │ │
│  │  Serving     │  │  /api/v1/*   │  │  /api/v1/terminal      │ │
│  │              │  │  (18 handler │  │  /api/v1/monitor/      │ │
│  │              │  │   groups)    │  │       realtime          │ │
│  └──────────────┘  └──────┬───────┘  └────────────┬───────────┘ │
│                           │                       │             │
│                    ┌──────▼───────────────────────▼┐            │
│                    │       Service Layer            │            │
│                    │       (20+ services)           │            │
│                    └──────────────┬─────────────────┘            │
│                                  │                              │
│                    ┌─────────────▼─────────────────┐            │
│                    │   SQLite (WAL mode)            │            │
│                    │   data/panel.db                │            │
│                    │   • Foreign keys enabled       │            │
│                    │   • 5s busy timeout            │            │
│                    │   • 21 tables                  │            │
│                    └───────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### Core Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single binary | Zero-dependency deployment; embed React build via `go:embed` |
| SQLite (WAL mode) | No external DB server; WAL enables concurrent reads during writes |
| Foreign keys enabled | Referential integrity at the database level |
| 5s busy timeout | Prevents immediate `SQLITE_BUSY` under contention |
| WebSocket | Real-time terminal and system metrics without polling |
| Task queue (4 workers) | Bounded concurrency for long-running operations (installs, backups) |
| Gin framework | High-performance HTTP routing with middleware composition |

---

## 2. Backend Architecture

### 2.1 Entry Point & Bootstrap

**File:** `cmd/panel/main.go` (123 lines)

```
main()
  ├─ Parse CLI flags (-version, -config, reset-password)
  ├─ config.Load()            → Load config/panel.json
  ├─ logger.Init()            → Zerolog structured logging → logs/
  ├─ system.DetectOS()        → Detect OS, arch, package manager
  ├─ database.Open()          → SQLite at data/panel.db (WAL, FK, 5s timeout)
  │   └─ database.Migrate()   → Run schema migrations (001 → 003)
  ├─ i18n.Init()              → Load locales (en, vi) from internal/i18n/locales/
  ├─ CreateDefaultAdmin()     → Ensure admin user exists (bcrypt password)
  ├─ app.New()                → Wire services → handlers → router → middleware
  │   └─ SetupRouter()        → Mount middleware chain + API routes + static files
  └─ server.Run()             → Listen on host:port (HTTP or HTTPS)
      └─ Graceful shutdown on SIGINT/SIGTERM → Close DB, stop workers
```

**CLI Subcommands:**

| Command | Description |
|---------|-------------|
| `itdlupanel` | Start the panel server |
| `itdlupanel -version` | Print version and build time |
| `itdlupanel -config <path>` | Specify config file (default: `config/panel.json`) |
| `itdlupanel reset-password -password <pw> [-user admin]` | Reset user password (min 6 chars, bcrypt) |

---

### 2.2 Middleware Chain

Middleware is applied in strict order. Global middleware runs on all requests; per-route middleware is mounted on `/api/v1`.

```
Request
  │
  ▼ ──────── Global Middleware ────────
  │
  ├─ 1. Recovery        Catches panics → logs stack trace → returns 500 JSON
  ├─ 2. Logger          Logs method, path, status, duration, IP, response size
  ├─ 3. CORS            Reflects origin in production; allows all in debug mode
  ├─ 4. Compression     Gzip via gin-contrib/gzip
  ├─ 5. Language         Extracts lang from ?lang= or Accept-Language header (en/vi)
  │
  ▼ ──── Per-Route Middleware (/api/v1) ────
  │
  ├─ 6. Rate Limit      60 requests/min per IP; in-memory store with cleanup
  ├─ 7. Audit            Logs POST/PUT/DELETE → audit_logs table (user, action, IP)
  ├─ 8. CSRF             Validates X-CSRF-Token header vs csrf_token cookie
  │                      Skips: GET/HEAD/OPTIONS, Bearer auth, login/refresh/2fa
  │
  ▼ ──── Protected Routes ────
  │
  ├─ 9. Auth (JWT)       Validates token from Authorization header or ?token= param
  │                      Sets user_id, username, role in Gin context
  └─ 10. Permission (RBAC) Checks role permissions with wildcard support
                          Admin has "*"; patterns like "sites.*" match "sites.read"
                          5-minute TTL permission cache from DB
```

**Files:** `internal/app/middleware.go`, `internal/app/auth_middleware.go`

---

### 2.3 Handler Layer

**Location:** `internal/api/v1/` (REST) and `internal/api/ws/` (WebSocket)

#### REST API Handlers

| Handler | Lines | Responsibilities |
|---------|------:|------------------|
| `auth.go` | 380 | Login, logout, token refresh, TOTP 2FA setup/verify, CSRF token endpoint |
| `user.go` | 219 | User CRUD, role assignment, list users, profile updates |
| `dashboard.go` | 49 | System overview, summary statistics |
| `monitor.go` | 299 | CPU/memory/disk/network metrics, historical trends, process list |
| `task.go` | 118 | Task queue status, summary, running tasks, cancel operations |
| `site.go` | 501 | Website CRUD, domain management, SSL/PHP config, enable/disable |
| `software.go` | 329 | List available software, get versions, install, uninstall, upgrade |
| `ssl.go` | 351 | SSL cert CRUD, generation, validation, auto-renewal, expiry checks |
| `database.go` | 232 | Database CRUD (MySQL/PostgreSQL), users, backup/restore |
| `ftp.go` | 222 | FTP account management, add/delete/enable/disable, password change |
| `file.go` | 750 | File manager: list, upload, download, delete, rename, chmod, edit |
| `docker.go` | 271 | Container management: list, create, start, stop, logs, exec |
| `cron.go` | 223 | Cron job CRUD, schedule validation, execution history |
| `backup.go` | 187 | Backup creation, listing, restore, storage management |
| `security.go` | 336 | Firewall rules, brute-force protection, malware scanning |
| `log.go` | 179 | Log file retrieval, filtering, searching |
| `settings.go` | 173 | Panel settings: language, ports, paths, SSL config |
| `plugin.go` | 175 | Plugin management: list, install, enable, disable, config |

#### WebSocket Handlers

| Handler | Lines | Description |
|---------|------:|-------------|
| `ws/terminal.go` | 4189 | PTY terminal over WebSocket; xterm.js compatible; JWT via query param |
| `ws/monitor.go` | 1969 | Real-time system metrics broadcast every 2 seconds |

---

### 2.4 Service Layer

**Location:** `internal/service/`

#### Core Services

| Service | Lines | Responsibilities |
|---------|------:|------------------|
| `auth_service.go` | 152 | User authentication, password verification (bcrypt), default admin creation |
| `user_service.go` | 164 | User CRUD operations, role management, profile updates |
| `jwt.go` | 114 | JWT access/refresh token generation and validation |
| `totp_service.go` | 104 | TOTP 2FA secret generation, QR code rendering, code verification |
| `site_service.go` | 880 | Website CRUD, domain management, vhost generation, SSL binding, PHP config |
| `site_defaults.go` | 316 | Default PHP versions, webserver configs, template management |
| `database_service.go` | 369 | MySQL/PostgreSQL CRUD, user permissions, backup/restore via shell |
| `ftp_service.go` | 284 | Pure-FTPd account management (PAM), filesystem isolation |
| `cron_service.go` | 410 | Cron job CRUD, crontab parsing, schedule validation, execution tracking |
| `file_service.go` | 1202 | File operations: list, read, write, upload, download, delete, rename, chmod, compress, search |
| `ssl_service.go` | 624 | SSL cert generation (OpenSSL), Let's Encrypt ACME automation, renewal, expiry checks |
| `ssl_renewer.go` | 94 | Background SSL renewal: 24-hour check interval, 30-day expiry threshold |
| `firewall_service.go` | 779 | UFW/iptables rule management, DDoS protection, brute-force detection |
| `monitor_service.go` | 521 | System metrics collection: CPU, memory, disk, I/O, network, load average, processes |
| `metrics_collector.go` | 509 | Background data collection, multi-resolution aggregation (raw → 5m → 1h → 1d) |
| `software_service.go` | 816 | Software installation orchestration via task queue, version management |
| `docker_service.go` | 891 | Docker Engine API integration: containers, images, volumes, networks |
| `backup_service.go` | 457 | Backup creation (tar.gz), remote storage (S3), verification, retention policies |
| `log_service.go` | 239 | Log aggregation from system, web server, and application sources |
| `security_service.go` | 427 | SSL verification, certificate chain validation, security scanning |
| `terminal_service.go` | 207 | PTY session lifecycle management, MOTD rendering, stdin/stdout piping |
| `settings_service.go` | 210 | Panel settings CRUD (key-value), language, ports, paths, feature toggles |

#### Dependency Injection

Services are instantiated in `app.New()` and injected into handlers:

```go
monitorSvc  := service.NewMonitorService()
siteSvc     := service.NewSiteService(db, taskQueue)
sslSvc      := service.NewSSLService(db)
// ...
siteHandler := v1.NewSiteHandler(siteSvc, sslSvc)
```

---

### 2.5 Database Schema

**Location:** `internal/database/migrations/` (3 migrations)

#### Migration 001 — Core Schema (17 tables)

```sql
-- User Management
users           (id, username, password, email, role, totp_secret, totp_enabled,
                 status, last_login, last_ip, created_at, updated_at)
roles           (id, name, description, permissions [JSON])
user_roles      (user_id, role_id)

-- Website Management
sites           (id, name, domain, path, webserver, php_version, ssl_enabled,
                 ssl_type, ssl_expiry, status, config_extra, created_by,
                 created_at, updated_at)
domains         (id, site_id, domain, is_primary)

-- Services
databases       (id, name, db_type, username, password, charset, collation,
                 remote_access, size, created_by, created_at)
ftps            (id, username, password, path, status, created_by, created_at)
crons           (id, name, type, schedule, command, status, last_run,
                 last_status, last_output, created_by, created_at, updated_at)

-- Infrastructure
tasks           (id, type, name, status, progress, log, result, error,
                 created_by, started_at, completed_at, created_at)
software        (id, name, display_name, version, type, status, config_path,
                 install_path, service_name, installed_at, updated_at)
plugins         (id, name, display_name, version, description, author,
                 homepage, status, config, installed_at, updated_at)
docker_containers (id, container_id, name, image, status, ports, volumes,
                   env, restart_policy, created_at, updated_at)

-- Security & Logging
firewall_rules  (id, type, protocol, port, ip, action, direction,
                 description, status, sort_order, created_at)
backups         (id, type, name, target_id, target_name, file_path,
                 file_size, storage, checksum, status, created_by, created_at)
audit_logs      (id, user_id, username, action, resource, resource_id,
                 detail, ip, user_agent, created_at)
settings        (key, value, description, updated_at)
schema_migrations (version, applied_at)
```

#### Migration 002 — Monitor Metrics (4 tables)

All metric tables share the same column structure:

```sql
-- Columns: id, timestamp, cpu_percent, mem_percent, mem_used, mem_total,
--          swap_percent, disk_percent, disk_used, disk_total, disk_read,
--          disk_write, net_sent, net_recv, load1, load5, load15

monitor_metrics_raw   -- 1-minute granularity     (retention: 2 days)
monitor_metrics_5m    -- 5-minute aggregation      (retention: 7 days)
monitor_metrics_1h    -- 1-hour aggregation        (retention: 90 days)
monitor_metrics_1d    -- 1-day aggregation         (retention: 365 days)
```

#### Migration 003 — Firewall Settings (1 table)

```sql
firewall_settings  (key, value, updated_at)
```

**Total: 22 tables across 3 migrations.**

---

### 2.6 Software Installer System

**Location:** `internal/service/installer/`

#### Interface

```go
type Installer interface {
    Name() string
    Install(ctx context.Context, version string, progress func(int)) error
    Uninstall(ctx context.Context) error
    IsInstalled() bool
    GetVersions() ([]string, error)
    GetStatus() (map[string]string, error)
}
```

#### Registry Pattern

`DefaultRegistry()` returns all 8 installers. Each installer uses `SetupServerDir()` to create a consistent directory structure:

```
/ITDLUPanel/server/<software>/
  ├── conf → /etc/<software>/          (symlink)
  ├── logs → /var/log/<software>/      (symlink)
  └── data → /var/lib/<software>/      (symlink)
```

#### Installers

| Installer | File | Lines | Description |
|-----------|------|------:|-------------|
| **Nginx** | `nginx.go` | 8262 | Official repo, stable/mainline version switching |
| **Apache** | `apache.go` | 3353 | Apache2 with module management |
| **OpenLiteSpeed** | `ols.go` | 3544 | Alternative web server |
| **PHP** | `php.go` | 5150 | PHP-FPM, multiple versions, extension configuration |
| **MySQL** | `mysql.go` | 4034 | MySQL/MariaDB, user creation, DB initialization |
| **Redis** | `redis.go` | 2965 | In-memory cache, configuration, persistence |
| **Pure-FTPd** | `pureftpd.go` | 2511 | FTP server with PAM integration |
| **phpMyAdmin** | `phpmyadmin.go` | 5150 | Database UI, security hardening |

---

### 2.7 VHost Generation

**Location:** `internal/service/vhost/`

#### Interface

```go
type VhostGenerator interface {
    Generate(cfg VhostConfig) (string, error)
    GetConfigPath(domain string) string
    EnableSite(domain string) error
    DisableSite(domain string) error
    ReloadServer() error
    TestConfig() error
}

type VhostConfig struct {
    Domain       string
    Aliases      []string
    DocRoot      string
    PHPVersion   string
    SSLEnabled   bool
    SSLCert      string
    SSLKey       string
    CustomConfig string
}
```

#### Implementations

| Generator | Lines | Config Path | Features |
|-----------|------:|-------------|----------|
| **Nginx** | 349 | `/etc/nginx/sites-available/<domain>` | HTTP→HTTPS redirect, PHP-FPM upstream, security headers (X-Frame-Options, X-Content-Type-Options, CSP), ACME challenge support, forbidden paths (.env, .git, .htaccess) |
| **Apache** | 164 | `/etc/apache2/sites-available/<domain>.conf` | VirtualHost directives, SSL module, PHP module config, .htaccess support |
| **OpenLiteSpeed** | 173 | OLS listener config | Listener + context configuration, static/dynamic routing |

---

### 2.8 WebSocket Architecture

**Location:** `internal/websocket/` (Hub) and `internal/api/ws/` (handlers)

#### Hub Pattern

```go
type Hub struct {
    clients    map[string]*Client
    broadcast  chan []byte
    register   chan *Client
    unregister chan *Client
    mu         sync.RWMutex
}
```

The Hub runs a main event loop handling register/unregister/broadcast operations. It provides `ClientCount()` and `BroadcastJSON()` for connected client management.

#### Terminal WebSocket

| Aspect | Detail |
|--------|--------|
| **Path** | `/api/v1/terminal` |
| **Auth** | JWT via `?token=<jwt>` query param |
| **Permission** | Requires `terminal.access` role |
| **Protocol** | xterm.js compatible; bidirectional stdin/stdout |
| **Resize** | `{"type":"resize","cols":80,"rows":24}` |
| **PTY** | Allocated via `creack/pty`; one Bash shell per session |
| **Features** | MOTD on connect, optional `?cwd=` param, session cleanup on disconnect |

#### Monitor WebSocket

| Aspect | Detail |
|--------|--------|
| **Path** | `/api/v1/monitor/realtime` |
| **Auth** | JWT Bearer token in Authorization header |
| **Interval** | Metrics broadcast every **2 seconds** |
| **Payload** | CPU%, memory%, disk%, network I/O, load average |
| **Event** | `websocket.EventMetrics` |
| **Lifecycle** | Register on connect → ticker loop → unregister on disconnect |

---

### 2.9 Background Systems

#### Task Queue

**File:** `internal/task/queue.go` (420 lines)

```
                    ┌─────────────────────┐
                    │   Task Queue        │
                    │   max 4 workers     │
                    ├─────────────────────┤
   Enqueue() ──────►│  pending tasks DB   │
                    │         │            │
                    │    ┌────▼────┐       │
                    │    │ Worker 1│       │    ┌──────────┐
                    │    │ Worker 2│───────────►│ WebSocket│
                    │    │ Worker 3│  progress  │ broadcast│
                    │    │ Worker 4│            └──────────┘
                    │    └─────────┘       │
                    └─────────────────────┘
```

| Method | Description |
|--------|-------------|
| `Start()` / `Stop()` | Lifecycle control |
| `RegisterHandler(type, fn)` | Register task type handlers |
| `Enqueue(task)` | Add task to queue (status: pending) |
| `Cancel(id)` | Cancel running task |
| `GetTask(id)` | Get single task |
| `ListTasks()` | List all tasks |
| `GetTaskSummary()` | Counts by status |
| `GetTaskLog(id)` | Retrieve execution log |

**Task Statuses:** `pending` → `running` → `completed` | `failed` | `cancelled`

**Used for:** Software installation, SSL renewal, backups, database operations.

#### Metrics Collector

**File:** `internal/service/metrics_collector.go` (509 lines)

Spawns two background goroutines:

1. **Collection loop** — Polls `MonitorService` every 60 seconds → inserts into `monitor_metrics_raw`
2. **Aggregation loop** — Rolls up raw data into 5m/1h/1d summaries

**Retention policy:**

| Resolution | Retention |
|------------|-----------|
| Raw (1-min) | 2 days |
| 5-minute | 7 days |
| 1-hour | 90 days |
| 1-day | 365 days |

Settings are read from the `settings` DB table and configurable by admin.

#### SSL Auto-Renewer

**File:** `internal/service/ssl_renewer.go` (94 lines)

| Parameter | Value |
|-----------|-------|
| Check interval | 24 hours |
| Expiry threshold | 30 days |
| Respects per-cert `AutoRenew` flag | ✓ |
| Let's Encrypt ACME automation | ✓ |

Runs on startup and then on a periodic ticker until context cancellation.

---

## 3. Frontend Architecture

### 3.1 Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.4 | UI framework |
| TypeScript | 5.9.3 | Type safety |
| Vite | 8.0.1 | Build tooling, HMR |
| Ant Design | 6.3.3 | UI component library |
| Tailwind CSS | 4.2.2 | Utility-first styling |
| Zustand | 5.0.12 | State management |
| Monaco Editor | 4.7.0 | Code editing |
| xterm.js | 6.0.0 | Terminal emulation |
| Recharts | 3.8.0 | Charts and graphs |
| Axios | 1.13.6 | HTTP client |
| React Router | 6.30.3 | Client-side routing |
| i18next | 25.8.20 | Internationalization (en, vi) |

### 3.2 Directory Structure

```
web/src/
├── main.tsx                 Entry point
├── App.tsx                  Root component with RouterProvider
├── router/
│   └── index.tsx            Route definitions (74 lines)
├── layouts/
│   ├── MainLayout.tsx       App shell: sidebar, task modal, user dropdown
│   └── AuthLayout.tsx       Login page wrapper
├── pages/                   17 page components
│   ├── Login/
│   ├── Dashboard/
│   ├── Websites/
│   ├── Databases/
│   ├── FTP/
│   ├── Files/               index.tsx + CodeEditor + 7 sub-components
│   ├── Docker/
│   ├── Monitor/             index.tsx + HistoricalMonitor + ProcessTable
│   ├── Security/
│   ├── Firewall/
│   ├── Logs/
│   ├── Terminal/
│   ├── Cron/
│   ├── AppStore/            Software installer UI + SoftwareIcons
│   ├── Settings/
│   └── Users/
├── stores/                  3 Zustand stores
│   ├── auth.ts
│   ├── theme.ts
│   └── task.ts
├── components/              Shared components (MessagesBox, NginxManageModal, RequireSoftware)
├── services/
│   └── api.ts               Axios instance, auth headers, CSRF, error handling
├── hooks/
│   ├── usePalette.ts        Theme palette hook
│   ├── useIsMobile.ts       Responsive breakpoint hook
│   └── useTaskWebSocket.ts  Task event WebSocket hook
├── lib/
│   └── monaco-setup.ts      Monaco editor configuration
├── types/                   TypeScript interfaces
└── i18n/                    Translation files (en, vi)
```

### 3.3 State Management (Zustand)

#### `authStore` (33 lines)

```typescript
interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth(token: string, user: User): void;
  setAccessToken(token: string): void;
  logout(): void;
}
// Persisted to localStorage as "itdlupanel-auth"
```

#### `themeStore` (23 lines)

```typescript
interface ThemeState {
  mode: 'light' | 'dark';
  toggle(): void;
  setMode(mode: 'light' | 'dark'): void;
}
// Persisted to localStorage as "itdlu_theme"
```

#### `taskStore` (179 lines)

```typescript
interface TaskState {
  tasks: Task[];
  summary: TaskSummary;
  selectedTaskId: string | null;
  modalOpen: boolean;
  activeTab: string;
  // Actions
  updateTask(task: Task): void;
  addTask(task: Task): void;
  removeTask(id: string): void;
  fetchSummary(): Promise<void>;
  fetchAllTasks(): Promise<void>;
  fetchTaskLog(id: string): Promise<string>;
  cancelTask(id: string): Promise<void>;
}
// WebSocket connection tracking for real-time task updates
```

### 3.4 Theme System

The `usePalette()` hook provides a consistent color system across light and dark modes:

```typescript
function usePalette(): { p: Palette; isDark: boolean }

interface Palette {
  card, cardBorder, headerBg, colHeaderBg,       // Layout
  rowHover, rowAlt,                               // Tables
  text, textMuted, textDim,                       // Typography
  barTrack, expandBg, codeBg, inputBg,            // Surfaces
  accent, green, greenDim, amber, amberDim,       // Semantic
  red, redDim, purple, cyan                       // Accents
}
```

| Mode | Card BG | Accent | Text |
|------|---------|--------|------|
| Dark | `#111827` | `#38BDF8` | `#E2E8F0` |
| Light | `#FFFFFF` | `#2563EB` | `#1E293B` |

Monospace font stack: `"JetBrains Mono", "Fira Code", "Cascadia Code", monospace`

Ant Design's theme API is used for component-level theming. The `useThemeStore()` mode value drives both the palette selection and Ant Design's `algorithm` (dark/light).

### 3.5 Page Modules

| Page | Route | Size | Key Features |
|------|-------|-----:|--------------|
| **Login** | `/login` | 5.7 KB | Username/password, TOTP verification, remember me |
| **Dashboard** | `/` | 36.4 KB | System stats, server info, quick actions, activity chart |
| **Websites** | `/websites` | 45.2 KB | Site CRUD, domain management, PHP selection, SSL binding |
| **Databases** | `/databases` | 23.5 KB | DB CRUD, user permissions, backup/restore dialogs |
| **FTP** | `/ftp` | 9.7 KB | FTP account management, password reset |
| **Files** | `/files` | 15.7 KB + 43 KB editor | File browser, inline Monaco editor, upload/download |
| **Docker** | `/docker` | 17.2 KB | Container list, create, start/stop, logs, exec terminal |
| **Monitor** | `/monitor` | 1.8 KB + 29.6 KB + 25 KB | Real-time metrics, historical charts, process table |
| **Security** | `/security` | 9.1 KB | SSL management, brute-force settings |
| **Firewall** | `/firewall` | 38.2 KB | UFW rule management, IP/port filtering |
| **Logs** | `/logs` | 22 KB | Log viewing, filtering, search |
| **Terminal** | `/terminal` | 13.4 KB | Terminal emulator via WebSocket + xterm.js |
| **Cron** | `/cron` | 29.8 KB | Cron job scheduler, execution history |
| **AppStore** | `/appstore` | 41.1 KB | Software installer, version selection, status tracking |
| **Settings** | `/settings` | 15.6 KB | Panel config: language, ports, paths, SSL |
| **Users** | `/users` | 11.8 KB | User CRUD, role assignment, 2FA management |

### 3.6 Routing

**File:** `web/src/router/index.tsx` (74 lines)

```
/login              AuthRoute → LoginPage
                    (redirects authenticated users away)

/                   ProtectedRoute → MainLayout
  ├── /             Dashboard
  ├── /websites     Websites
  ├── /databases    Databases
  ├── /ftp          FTP
  ├── /files        Files
  ├── /docker       Docker
  ├── /monitor      Monitor
  ├── /security     Security
  ├── /firewall     Firewall
  ├── /logs         Logs
  ├── /terminal     Terminal
  ├── /cron         Cron
  ├── /appstore     AppStore
  ├── /settings     Settings
  └── /users        Users

*                   404 → Redirect to /
```

**Route Guards:**
- `ProtectedRoute` — Checks `authStore.isAuthenticated`; redirects to `/login` if false
- `AuthRoute` — Redirects authenticated users away from the login page
- 404 fallback redirects to `/`

### 3.7 API Client

**File:** `web/src/services/api.ts` (41 lines)

```typescript
const api = axios.create({
  baseURL: '/api/v1',
});

// Request interceptor: adds Authorization header + X-CSRF-Token
// Response interceptor: global error handling (401 → logout)
```

---

## 4. Data Flow Diagrams

### 4.1 HTTP Request Flow

```
Client (Browser)
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│                    Gin HTTP Server                       │
│                                                         │
│  Recovery → Logger → CORS → GZIP → Language             │
│       │                                                 │
│       ▼                                                 │
│  RateLimit → Audit → CSRF → Auth (JWT) → Permission    │
│       │                                                 │
│       ▼                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Handler  │───►│   Service    │───►│   SQLite DB  │  │
│  │  (validate│    │  (business   │    │  (WAL mode)  │  │
│  │   input)  │    │   logic)     │    │              │  │
│  └──────────┘    └──────────────┘    └──────────────┘  │
│       │                                                 │
│       ▼                                                 │
│  JSON Response                                          │
└─────────────────────────────────────────────────────────┘
  │
  ▼
Client (Browser)
```

### 4.2 Background Task Flow

```
User Action (e.g., "Install Nginx")
  │
  ▼
Handler.Install()
  │
  ├─ Creates task record in DB (status: pending)
  ├─ Enqueues task in Task Queue
  │
  ▼
Task Queue (4 worker goroutines)
  │
  ├─ Worker picks up task (status: running)
  ├─ Calls registered handler (e.g., NginxInstaller.Install)
  │   │
  │   ├─ Progress callback: progress(25) → progress(50) → progress(100)
  │   │   │
  │   │   ▼
  │   │ DB update (progress %) + WebSocket broadcast
  │   │   │
  │   │   ▼
  │   │ taskStore receives update → UI re-renders
  │   │
  │   └─ Returns result or error
  │
  ├─ Success → status: completed
  └─ Failure → status: failed + error message
```

### 4.3 WebSocket Flow (Terminal)

```
Client (xterm.js)                            Server
     │                                         │
     ├── WS upgrade /api/v1/terminal ─────────►│
     │   ?token=<jwt>&cwd=/home                │
     │                                         ├── Validate JWT
     │                                         ├── Check terminal.access permission
     │                                         ├── Allocate PTY (creack/pty)
     │                                         ├── Start /bin/bash
     │◄──────── MOTD message ─────────────────┤
     │                                         │
     ├── keystroke (stdin) ───────────────────►│── Write to PTY
     │◄──────── output (stdout) ──────────────┤── Read from PTY
     │                                         │
     ├── {"type":"resize","cols":120,"rows":40}►│── PTY resize
     │                                         │
     │◄──────── [connection closed] ──────────┤── Kill PTY process
     │                                         │   Cleanup session
```

### 4.4 WebSocket Flow (Monitor)

```
Client (Recharts)                            Server
     │                                         │
     ├── WS upgrade /api/v1/monitor/realtime ─►│
     │   Authorization: Bearer <jwt>           │
     │                                         ├── Validate JWT
     │                                         ├── Register client in Hub
     │                                         │
     │                              ┌──────────┤ Ticker: every 2s
     │                              │          │
     │                              ▼          │
     │◄── {"type":"metrics",  ─────────────────┤
     │     "cpu":45.2,                         │
     │     "mem":62.1,                         │
     │     "disk":38.5,                        │
     │     "net_sent":1024,                    │
     │     "net_recv":2048,                    │
     │     "load1":1.25}                       │
     │                                         │
     │  (repeats every 2 seconds)              │
     │                                         │
     ├── [disconnect] ───────────────────────►│── Unregister from Hub
                                               │   Stop ticker
```

### 4.5 Metrics Collection & Aggregation

```
MonitorService.Collect()
  │  (every 60 seconds)
  ▼
monitor_metrics_raw
  │
  ├─ Aggregation goroutine
  │  │
  │  ├─ AVG(raw) over 5 min ──► monitor_metrics_5m
  │  ├─ AVG(5m) over 1 hour ──► monitor_metrics_1h
  │  └─ AVG(1h) over 1 day ───► monitor_metrics_1d
  │
  └─ Retention purge
     ├─ raw  > 2 days   → DELETE
     ├─ 5m   > 7 days   → DELETE
     ├─ 1h   > 90 days  → DELETE
     └─ 1d   > 365 days → DELETE
```

---

## 5. Configuration

**File:** `config/panel.json`

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
    "jwt_secret": "<256-bit hex string>",
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
    "setup_completed": false,
    "version": ""
  }
}
```

| Section | Key | Default | Description |
|---------|-----|---------|-------------|
| `server.host` | string | `0.0.0.0` | Bind address |
| `server.port` | int | `8888` | HTTP/HTTPS port |
| `server.ssl` | bool | `false` | Enable HTTPS |
| `server.ssl_cert` | string | `""` | TLS certificate path |
| `server.ssl_key` | string | `""` | TLS private key path |
| `database.path` | string | `data/panel.db` | SQLite database path |
| `auth.jwt_secret` | string | — | JWT signing key (auto-generated) |
| `auth.access_token_ttl` | int | `900` | Access token TTL (15 min) |
| `auth.refresh_token_ttl` | int | `604800` | Refresh token TTL (7 days) |
| `auth.bcrypt_cost` | int | `12` | bcrypt hashing cost factor |
| `paths.base` | string | `/ITDLUPanel` | Installation root |
| `paths.backup` | string | `/ITDLUPanel/backup` | Backup storage |
| `paths.logs` | string | `/ITDLUPanel/logs` | Application logs |
| `paths.wwwroot` | string | `/ITDLUPanel/wwwroot` | Website document roots |
| `paths.vhost` | string | `/ITDLUPanel/server/vhost` | Generated vhost configs |
| `panel.language` | string | `en` | Default language (en/vi) |
| `panel.admin_path` | string | `/` | Admin panel URL path |
| `panel.setup_completed` | bool | `false` | Initial setup flag |

---

## 6. Key Dependencies

### Go Dependencies (`go.mod` — Go 1.25.0)

| Package | Version | Purpose |
|---------|---------|---------|
| `github.com/gin-gonic/gin` | 1.12.0 | HTTP routing framework |
| `github.com/gorilla/websocket` | 1.5.3 | WebSocket support |
| `github.com/golang-jwt/jwt/v5` | 5.3.1 | JWT token handling |
| `golang.org/x/crypto` | 0.49.0 | bcrypt password hashing |
| `modernc.org/sqlite` | 1.47.0 | Pure-Go embedded SQLite |
| `github.com/creack/pty` | 1.1.24 | PTY terminal emulation |
| `github.com/rs/zerolog` | 1.34.0 | Structured JSON logging |
| `github.com/shirou/gopsutil/v3` | 3.24.5 | System metrics (CPU, RAM, disk, network) |
| `github.com/pquerna/otp` | 1.5.0 | TOTP 2FA implementation |
| `github.com/google/uuid` | 1.6.0 | UUID generation |
| `github.com/go-playground/validator/v10` | 10.30.1 | Input validation |
| `gopkg.in/natefinch/lumberjack.v2` | 2.2.1 | Log file rotation |
| `github.com/gin-contrib/gzip` | — | Response compression middleware |

### Frontend Dependencies (`web/package.json`)

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | 19.2.4 | UI framework |
| `react-router-dom` | 6.30.3 | Client-side routing |
| `zustand` | 5.0.12 | State management |
| `antd` | 6.3.3 | UI component library |
| `@xterm/xterm` | 6.0.0 | Terminal emulator |
| `@monaco-editor/react` | 4.7.0 | Code editor |
| `recharts` | 3.8.0 | Charts and graphs |
| `axios` | 1.13.6 | HTTP client |
| `i18next` | 25.8.20 | Internationalization |
| `tailwindcss` | 4.2.2 | Utility CSS framework |
| `vite` | 8.0.1 | Build tool with HMR |
| `typescript` | 5.9.3 | Type safety |

---

## Appendix: Statistics

| Metric | Count |
|--------|------:|
| Go source files | ~60 |
| TypeScript/TSX files | ~65 |
| Backend service lines | ~9,769 |
| Backend handler lines | ~4,994 |
| Installer lines | ~34,867 |
| Database tables | 22 |
| REST API handler groups | 18 |
| WebSocket endpoints | 2 |
| Middleware layers | 10 |
| Software installers | 8 |
| VHost generators | 3 |
| Zustand stores | 3 |
| Frontend pages | 17 (16 routes) |
| Supported languages | 2 (en, vi) |
| Go direct dependencies | 20+ |
| NPM direct dependencies | 10+ |
