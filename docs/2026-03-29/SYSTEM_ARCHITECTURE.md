# ITDLUPanel — System Architecture

> **Version:** March 29, 2026  
> **Maintainer:** IT Department — Dalat University (ITDLU)

---

## Table of Contents

- [1. High-Level Architecture](#1-high-level-architecture)
- [2. Technology Stack](#2-technology-stack)
- [3. Project Structure](#3-project-structure)
- [4. Backend Architecture](#4-backend-architecture)
- [5. Frontend Architecture](#5-frontend-architecture)
- [6. Database Design](#6-database-design)
- [7. Security Architecture](#7-security-architecture)
- [8. Performance Architecture](#8-performance-architecture)
- [9. WebSocket Architecture](#9-websocket-architecture)
- [10. API Design Patterns](#10-api-design-patterns)
- [11. Deployment Architecture](#11-deployment-architecture)

---

## 1. High-Level Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                    Browser (React 19 SPA)                     │
│          Ant Design 6 · xterm.js · Monaco · Recharts          │
│          Zustand State · React Query · react-i18next           │
└──────────────┬────────────────┬───────────────────────────────┘
               │ HTTPS REST     │ WSS
               │ (245 routes)   │ (Terminal + Monitor)
               ▼                ▼
┌───────────────────────────────────────────────────────────────┐
│               Single Go Binary (~30MB)                        │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Middleware Chain                                        │ │
│  │  Recovery → Logger → SecHeaders → CORS → Gzip → Lang    │ │
│  │  → RateLimit(300/min) → Audit → CSRF → Auth(JWT) → RBAC │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          │                                    │
│  ┌───────────────┐  ┌────▼─────┐  ┌──────────────────┐       │
│  │ API Handlers  │  │ Services │  │ Installers       │       │
│  │ (18 modules)  ├──► (24 svcs)├──► (9 installers)   │       │
│  └───────────────┘  └────┬─────┘  └──────────────────┘       │
│                          │                                    │
│  ┌───────────────┐  ┌────▼─────┐  ┌──────────────────┐       │
│  │ Task Queue    │  │ SQLite   │  │ Vhost Generators │       │
│  │ (background)  │  │ (16 tbl) │  │ (Nginx/Apache/OLS)│      │
│  └───────────────┘  └──────────┘  └──────────────────┘       │
│                                                               │
│  Embedded Frontend (go:embed) · JWT Auth · WebSocket Hub      │
└───────────────────────┬───────────────────────────────────────┘
                        │ exec / systemctl / file I/O
                        ▼
┌───────────────────────────────────────────────────────────────┐
│                    Linux Host (Ubuntu/Debian)                  │
│   Nginx · Apache · OLS · PHP-FPM · MySQL/MariaDB · Redis     │
│   Docker · Pure-FTPd · UFW · Fail2ban · Let's Encrypt        │
└───────────────────────────────────────────────────────────────┘
```

### Request Flow

```
Client Request
  │
  ▼
Gin Router ─► Middleware Chain ─► API Handler ─► Service Layer ─► System Command / SQLite
  │                                                                       │
  └◄──────────────── JSON Response ◄──────────────────────────────────────┘
```

---

## 2. Technology Stack

### Backend

| Component         | Technology                          | Purpose                        |
|-------------------|-------------------------------------|--------------------------------|
| Language          | Go 1.25                             | High-performance backend       |
| Web Framework     | Gin v1.12                           | HTTP routing & middleware      |
| Database          | SQLite (modernc.org/sqlite v1.47)   | Panel data (pure Go, no CGO)  |
| Authentication    | golang-jwt/jwt v5.3                 | JWT access & refresh tokens    |
| 2FA               | pquerna/otp v1.5                    | TOTP two-factor auth           |
| WebSocket         | gorilla/websocket v1.5              | Terminal PTY & real-time data  |
| System Metrics    | gopsutil v3.24                      | CPU, RAM, disk, network stats  |
| Terminal          | creack/pty v1.1                     | PTY emulation for web terminal |
| Validation        | go-playground/validator v10.30      | Request struct validation      |
| Logging           | zerolog v1.34                       | Structured JSON logging        |
| Log Rotation      | lumberjack v2.2                     | Automatic log file rotation    |
| Compression       | gin-contrib/gzip v1.2               | Response compression           |
| UUID              | google/uuid v1.6                    | Unique ID generation           |
| Crypto            | golang.org/x/crypto v0.49           | bcrypt password hashing        |

### Frontend

| Component         | Technology                          | Purpose                        |
|-------------------|-------------------------------------|--------------------------------|
| Framework         | React 19.2                          | UI framework                   |
| Language          | TypeScript 5.9                      | Type safety                    |
| UI Library        | Ant Design 6.3                      | Component library              |
| Icons             | @ant-design/icons 6.1               | Icon set                       |
| Build Tool        | Vite 8.0                            | Fast dev/build                 |
| State Management  | Zustand 5.0                         | Lightweight stores             |
| Data Fetching     | TanStack React Query 5.91           | Server state & caching         |
| Charts            | Recharts 3.8                        | System monitoring charts       |
| Code Editor       | Monaco Editor (React) 4.7           | File editing & config editing  |
| Terminal          | xterm.js 6.0                        | Web-based terminal emulator    |
| Routing           | react-router-dom 6.30               | Client-side routing            |
| HTTP Client       | Axios 1.13                          | API communication              |
| Dates             | Day.js 1.11                         | Date formatting                |
| i18n              | i18next 25.8 + react-i18next 16.5   | English & Vietnamese           |
| CSS               | Tailwind CSS 4.2                    | Utility-first styling          |

---

## 3. Project Structure

```
ITDLUPanel/
├── cmd/panel/main.go              # Application entry point
├── web.go                         # go:embed frontend assets
├── go.mod / go.sum                # Go module dependencies
├── Makefile                       # Build targets (build, dev, test, lint)
├── Dockerfile                     # Multi-stage Docker build
│
├── internal/                      # Private application code
│   ├── api/
│   │   ├── v1/                    # REST API handlers (18 files)
│   │   │   ├── auth.go            # Login, JWT refresh, 2FA
│   │   │   ├── user.go            # User CRUD
│   │   │   ├── site.go            # Website management (58 routes)
│   │   │   ├── database.go        # MySQL/MariaDB management
│   │   │   ├── file.go            # File manager operations
│   │   │   ├── docker.go          # Container/image/network/volume
│   │   │   ├── cron.go            # Cron job scheduling
│   │   │   ├── firewall.go        # UFW rules & blocked IPs
│   │   │   ├── security.go        # SSH config & Fail2ban
│   │   │   ├── software.go        # App install/uninstall
│   │   │   ├── monitor.go         # System metrics & history
│   │   │   ├── log.go             # Log viewer
│   │   │   ├── backup.go          # Backup & restore
│   │   │   ├── ssl.go             # SSL certificates
│   │   │   ├── ftp.go             # FTP accounts
│   │   │   ├── settings.go        # Panel settings
│   │   │   ├── dashboard.go       # Dashboard overview
│   │   │   ├── task.go            # Background tasks
│   │   │   └── plugin.go          # Plugin management
│   │   └── ws/                    # WebSocket handlers
│   │       ├── terminal.go        # PTY terminal
│   │       └── monitor.go         # Real-time metrics
│   │
│   ├── app/                       # Application bootstrap
│   │   ├── router.go              # Route registration
│   │   ├── middleware.go          # 11 middleware functions
│   │   └── bootstrap.go          # App initialization
│   │
│   ├── service/                   # Business logic layer (24 services)
│   │   ├── auth_service.go        # Authentication logic
│   │   ├── jwt.go                 # Token creation/validation
│   │   ├── totp_service.go        # 2FA TOTP
│   │   ├── user_service.go        # User management
│   │   ├── site_service.go        # Website operations
│   │   ├── site_defaults.go       # Default site config templates
│   │   ├── ssl_service.go         # SSL certificate management
│   │   ├── ssl_renewer.go         # Auto-renewal background job
│   │   ├── database_service.go    # Database operations
│   │   ├── file_service.go        # File system operations
│   │   ├── ftp_service.go         # FTP account management
│   │   ├── cron_service.go        # Cron scheduling
│   │   ├── docker_service.go      # Docker management
│   │   ├── firewall_service.go    # Firewall rule management
│   │   ├── security_service.go    # SSH & Fail2ban
│   │   ├── monitor_service.go     # System metric collection
│   │   ├── metrics_collector.go   # Historical metric storage
│   │   ├── software_service.go    # Software lifecycle
│   │   ├── log_service.go         # Log operations
│   │   ├── backup_service.go      # Backup/restore
│   │   ├── terminal_service.go    # Terminal session management
│   │   ├── settings_service.go    # Panel config management
│   │   ├── installer/             # Software installers (9 files)
│   │   │   ├── installer.go       # Interface + DefaultRegistry()
│   │   │   ├── nginx.go           # Nginx installer
│   │   │   ├── apache.go          # Apache installer
│   │   │   ├── ols.go             # OpenLiteSpeed installer
│   │   │   ├── php.go             # PHP multi-version installer
│   │   │   ├── mysql.go           # MySQL/MariaDB installer
│   │   │   ├── redis.go           # Redis installer
│   │   │   ├── pureftpd.go        # Pure-FTPd installer
│   │   │   └── phpmyadmin.go      # phpMyAdmin installer
│   │   └── vhost/                 # Virtual host generators
│   │       ├── vhost.go           # Interface & routing
│   │       ├── nginx.go           # Nginx vhost configs
│   │       ├── apache.go          # Apache vhost configs
│   │       └── ols.go             # OLS vhost configs
│   │
│   ├── database/                  # Data layer
│   │   ├── database.go            # SQLite connection
│   │   ├── models/                # Data models (User, Setting, etc.)
│   │   └── migrations/            # Schema migrations (5 versions)
│   │       ├── migrations.go      # Migration runner
│   │       ├── 001_init.go        # Initial 16-table schema
│   │       ├── 002_monitor_metrics.go  # Monitor metric tables
│   │       ├── 003_firewall_settings.go # Firewall settings
│   │       ├── 004_phpmyadmin_default_port.go
│   │       └── 005_quota.go       # Disk quota columns
│   │
│   ├── config/                    # Configuration
│   │   └── config.go              # JSON config loader
│   │
│   ├── pkg/                       # Shared utilities
│   │   ├── crypto/                # Encryption helpers
│   │   ├── errors/                # Custom error types
│   │   ├── logger/                # zerolog setup
│   │   ├── response/              # Standardized JSON responses
│   │   └── validator/             # Custom validation rules
│   │
│   ├── i18n/                      # Backend translations
│   │   └── locales/               # en.json, vi.json
│   │
│   ├── plugin/                    # Plugin system
│   ├── system/                    # System-level utilities
│   ├── task/                      # Background task queue
│   └── websocket/                 # WebSocket hub management
│
├── web/                           # Frontend application
│   ├── package.json               # Node.js dependencies
│   ├── vite.config.ts             # Vite build configuration
│   ├── tsconfig.json              # TypeScript configuration
│   ├── public/                    # Static assets
│   └── src/
│       ├── main.tsx               # React entry point
│       ├── App.tsx                # Root component
│       ├── pages/                 # 16 page modules
│       │   ├── Dashboard/         # System overview
│       │   ├── Monitor/           # Real-time monitoring
│       │   ├── Websites/          # Website management
│       │   ├── Databases/         # Database management
│       │   ├── Files/             # File manager (modular)
│       │   │   ├── CodeEditor.tsx
│       │   │   ├── components/    # 12+ sub-components
│       │   │   ├── hooks/         # 4 custom hooks
│       │   │   └── modals/        # Modal dialogs
│       │   ├── FTP/               # FTP accounts
│       │   ├── Cron/              # Cron jobs
│       │   ├── Docker/            # Docker management
│       │   ├── AppStore/          # Software marketplace
│       │   ├── Security/          # Security settings
│       │   ├── Firewall/          # Firewall rules
│       │   ├── Logs/              # Log viewer
│       │   ├── Terminal/          # Web terminal
│       │   ├── Users/             # User management
│       │   ├── Settings/          # Panel settings
│       │   └── Login/             # Authentication
│       ├── layouts/               # MainLayout, AuthLayout
│       ├── components/            # Shared components
│       ├── stores/                # Zustand stores
│       │   ├── auth.ts            # Auth state
│       │   ├── theme.ts           # Theme (dark/light)
│       │   └── task.ts            # Task tracking
│       ├── hooks/                 # Custom hooks
│       │   ├── usePalette.ts      # Theming palette
│       │   ├── useIsMobile.ts     # Responsive detection
│       │   └── useTaskWebSocket.ts # Task WS connection
│       ├── services/
│       │   └── api.ts             # Axios client
│       ├── types/                 # TypeScript interfaces
│       ├── router/                # Route definitions
│       ├── lib/                   # Utility functions
│       └── i18n/                  # Frontend translations
│           ├── index.ts           # i18next config
│           └── locales/           # en.json, vi.json
│
├── config/                        # Runtime configuration
│   └── panel.json                 # Panel configuration file
├── data/                          # SQLite database files
├── scripts/                       # Deployment scripts
│   ├── build.sh                   # Multi-platform build
│   ├── install.sh                 # Installation script
│   ├── itdlupanel.sh             # Service management
│   ├── service/itdlupanel.service # systemd unit file
│   └── installers/                # Software install scripts
├── logs/                          # Runtime log files
└── bin/                           # Compiled binaries
```

---

## 4. Backend Architecture

### 4.1 Layered Architecture

The backend follows a three-layer architecture:

```
┌─────────────────────────────────────────┐
│  API Layer (internal/api/v1/)           │
│  HTTP handlers, request parsing,        │
│  response formatting, input validation  │
├─────────────────────────────────────────┤
│  Service Layer (internal/service/)      │
│  Business logic, orchestration,         │
│  data transformation, system commands   │
├─────────────────────────────────────────┤
│  Data Layer (internal/database/)        │
│  SQLite queries, models, migrations     │
│  System commands (exec, file I/O)       │
└─────────────────────────────────────────┘
```

### 4.2 Middleware Chain

All requests pass through a layered middleware chain defined in `internal/app/router.go`:

| Order | Middleware             | Scope        | Description                                    |
|-------|------------------------|--------------|------------------------------------------------|
| 1     | `RecoveryMiddleware`   | Global       | Panic recovery, returns 500                    |
| 2     | `LoggerMiddleware`     | Global       | Request logging (method, path, status, latency)|
| 3     | `SecurityHeaders`      | Global       | X-Frame-Options, HSTS, X-Content-Type-Options  |
| 4     | `CORSMiddleware`       | Global       | Cross-Origin Resource Sharing headers           |
| 5     | `CompressionMiddleware`| Global       | gzip response compression                       |
| 6     | `LanguageMiddleware`   | Global       | Detect language (query param / Accept-Language) |
| 7     | `RateLimitMiddleware`  | `/api/v1`    | 300 requests/min per IP, HTTP 429 on exceed     |
| 8     | `AuditMiddleware`      | `/api/v1`    | Log POST/PUT/DELETE to audit_logs table         |
| 9     | `CSRFMiddleware`       | `/api/v1`    | Cookie + header CSRF token validation           |
| 10    | `AuthMiddleware`       | Per-route    | JWT token validation (Bearer header / query)    |
| 11    | `RBACMiddleware`       | Per-route    | Permission check (e.g., `sites.*`, `docker.*`)  |

### 4.3 Authentication Flow

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│  Client  │                    │   Auth   │                    │  SQLite  │
│          │  POST /auth/login  │  Handler │  Verify bcrypt     │          │
│          ├───────────────────►│          ├───────────────────►│          │
│          │                    │          │◄───────────────────┤          │
│          │                    │          │                    │          │
│          │  {access, refresh} │          │  Check 2FA         │          │
│          │◄───────────────────┤          │  enabled?          │          │
│          │                    │          │                    │          │
│  ────────┼──── If 2FA ────────┼──────────┼────────────────────┼──────────│
│          │                    │          │                    │          │
│          │  POST /auth/2fa/   │          │  Validate TOTP     │          │
│          │  verify            │          │  code              │          │
│          ├───────────────────►│          ├───────────────────►│          │
│          │                    │          │◄───────────────────┤          │
│          │  {access, refresh} │          │                    │          │
│          │◄───────────────────┤          │                    │          │
└──────────┘                    └──────────┘                    └──────────┘

Token Lifecycle:
  Access Token:  HS256 JWT, 15-minute TTL, sent in Authorization header
  Refresh Token: HS256 JWT, 7-day TTL, used to obtain new access tokens
  Refresh:       POST /auth/refresh with refresh_token → new access_token
```

### 4.4 Service Registry

All services are initialized during bootstrap and injected into API handlers:

| Service                | Responsibility                                      |
|------------------------|-----------------------------------------------------|
| `AuthService`          | Login, password hashing (bcrypt cost=12)            |
| `JWTService`           | Token generation & validation                       |
| `TOTPService`          | 2FA QR code generation, TOTP verification           |
| `UserService`          | User CRUD, role assignment                          |
| `SiteService`          | Website lifecycle, vhost config, PHP switching       |
| `SiteDefaults`         | Default configuration templates for new sites        |
| `SSLService`           | Certificate management, Let's Encrypt ACME           |
| `SSLRenewer`           | Background certificate auto-renewal                  |
| `DatabaseService`      | MySQL/MariaDB CRUD, backup/restore, access control   |
| `FileService`          | File operations, compression, search, permissions    |
| `FTPService`           | Pure-FTPd account provisioning                       |
| `CronService`          | Cron job CRUD, execution, log retrieval              |
| `DockerService`        | Container/image/network/volume operations            |
| `FirewallService`      | UFW rule management, IP blocking                     |
| `SecurityService`      | SSH config, Fail2ban settings                        |
| `MonitorService`       | Real-time system metrics (CPU, RAM, disk, network)   |
| `MetricsCollector`     | Historical metric aggregation (raw → 5m → 1h → 1d)  |
| `SoftwareService`      | Software install/uninstall via installer registry     |
| `LogService`           | Log file reading, searching, clearing                |
| `BackupService`        | Backup creation, restoration, retention              |
| `TerminalService`      | PTY session management                               |
| `SettingsService`      | Panel configuration CRUD                             |

### 4.5 Installer Registry Pattern

Software installation uses a registry pattern:

```go
type Installer interface {
    Name() string
    Install(version string, task *Task) error
    Uninstall() error
    IsInstalled() bool
    GetVersions() []string
    GetConfig() (string, error)
    SetConfig(content string) error
}

func DefaultRegistry() *Registry {
    r := NewRegistry()
    r.Register("nginx", &NginxInstaller{})
    r.Register("apache", &ApacheInstaller{})
    r.Register("ols", &OLSInstaller{})
    r.Register("php", &PHPInstaller{})
    r.Register("mysql", &MySQLInstaller{})
    r.Register("redis", &RedisInstaller{})
    r.Register("pureftpd", &PureFTPdInstaller{})
    r.Register("phpmyadmin", &PhpMyAdminInstaller{})
    return r
}
```

---

## 5. Frontend Architecture

### 5.1 Page Module Structure

Each page follows a consistent pattern:

```
pages/ModuleName/
├── index.tsx              # Main page component
├── components/            # Module-specific components
│   ├── CreateModal.tsx    # Create dialog
│   ├── EditModal.tsx      # Edit dialog
│   └── DetailDrawer.tsx   # Detail view
├── hooks/                 # Module-specific hooks (if complex)
└── types.ts               # Module-specific types
```

The Files module is the most complex, with its own modular architecture:

```
pages/Files/
├── index.tsx              # File manager page
├── CodeEditor.tsx         # Monaco editor wrapper
├── components/
│   ├── BookmarkBar.tsx    # Quick navigation bookmarks
│   ├── BreadcrumbNav.tsx  # Path breadcrumb
│   ├── ContextMenu.tsx    # Right-click menu
│   ├── DragDropOverlay.tsx
│   ├── FileGrid.tsx       # Grid view
│   ├── FileTable.tsx      # Table view
│   ├── FileIcon.tsx       # Type-based icons
│   ├── FooterBar.tsx      # Selection info
│   ├── Toolbar.tsx        # Action toolbar
│   ├── SearchBar.tsx      # File search
│   ├── TerminalPopup.tsx  # Embedded terminal
│   └── modals/            # New file, compress, rename, etc.
└── hooks/
    ├── useFileManager.ts  # Core file operations
    ├── useBookmarks.ts    # Bookmark state
    ├── useDragDrop.ts     # Drag & drop
    └── useFileSelection.ts # Selection state
```

### 5.2 State Management (Zustand)

Three global stores manage application state:

```
stores/
├── auth.ts     # User session: user object, token, login/logout actions
├── theme.ts    # UI theme: dark/light mode, persisted to localStorage
└── task.ts     # Background tasks: active tasks, history, WebSocket updates
```

**Auth Store** — Manages JWT tokens, user info, and authentication state. Integrates with the Axios interceptor for automatic token refresh.

**Theme Store** — Persists dark/light preference to `localStorage`. Triggers CSS variable updates across the application.

**Task Store** — Tracks software installation and background operation progress via WebSocket.

### 5.3 Theming System (Palette)

The `usePalette()` hook provides a unified color system:

```typescript
interface Palette {
  accent: string;      // Primary brand color
  green: string;       // Success states
  red: string;         // Error/danger states
  amber: string;       // Warning states
  purple: string;      // Info/highlight
  cyan: string;        // Links/secondary actions
  text: string;        // Primary text
  textMuted: string;   // Secondary text
  textDim: string;     // Tertiary/disabled text
  card: string;        // Card background
  cardBorder: string;  // Card border color
  codeBg: string;      // Code block background
  headerBg: string;    // Page header background
  rowHover: string;    // Table row hover
  inputBg: string;     // Input field background
}

// Usage in components
const { p, isDark } = usePalette();
<div style={{ background: p.card, borderColor: p.cardBorder }}>
  <span style={{ color: p.text }}>Content</span>
</div>
```

Both light and dark themes are fully supported with automatic transitions.

### 5.4 Data Fetching (React Query + Axios)

```
┌──────────┐     ┌─────────────┐     ┌──────────┐     ┌──────────┐
│  React   │     │ React Query │     │  Axios   │     │  Go API  │
│Component ├────►│  useQuery   ├────►│ Instance ├────►│  Server  │
│          │◄────┤  useMutation│◄────┤ intercept│◄────┤          │
└──────────┘     └─────────────┘     └──────────┘     └──────────┘
                   Cache, retry,       Auto token       JSON
                   optimistic update   refresh on 401   response
```

The Axios instance (`services/api.ts`) includes:
- Automatic `Authorization: Bearer <token>` header injection
- 401 response interceptor that triggers token refresh
- CSRF token header attachment
- Rate limit (429) retry with exponential backoff

### 5.5 Internationalization

Two languages supported: **English** (en) and **Vietnamese** (vi).

Detection priority:
1. `localStorage` preference
2. Browser `navigator.language`
3. Default: English

Both frontend and backend share the same language keys for consistency.

---

## 6. Database Design

### 6.1 Schema Overview

SQLite database with **20+ tables** across 5 migration versions:

```
┌──────────────────────────────────────────────────────────┐
│                    Core Tables                            │
├──────────────┬──────────────┬──────────────┬─────────────┤
│    users     │    roles     │  user_roles  │  settings   │
├──────────────┼──────────────┼──────────────┼─────────────┤
│    sites     │   domains    │  databases   │    ftps     │
├──────────────┼──────────────┼──────────────┼─────────────┤
│    crons     │    tasks     │  software    │   plugins   │
├──────────────┼──────────────┼──────────────┼─────────────┤
│firewall_rules│firewall_sett │   backups    │ audit_logs  │
├──────────────┼──────────────┴──────────────┴─────────────┤
│docker_contain│  schema_migrations                        │
├──────────────┴───────────────────────────────────────────┤
│               Monitoring Tables                           │
├──────────────┬──────────────┬──────────────┬─────────────┤
│ metrics_raw  │ metrics_5m   │ metrics_1h   │ metrics_1d  │
└──────────────┴──────────────┴──────────────┴─────────────┘
```

### 6.2 Migration System

Migrations are Go functions registered in `migrations.go` and executed sequentially:

| Version | File                              | Changes                                       |
|---------|-----------------------------------|------------------------------------------------|
| 001     | `001_init.go`                     | 16 core tables (users, sites, databases, etc.) |
| 002     | `002_monitor_metrics.go`          | 4 monitor metric tables (raw, 5m, 1h, 1d)     |
| 003     | `003_firewall_settings.go`        | firewall_settings key-value table              |
| 004     | `004_phpmyadmin_default_port.go`  | Default phpMyAdmin port 888 firewall rule      |
| 005     | `005_quota.go`                    | disk_quota/disk_usage on sites and databases   |

The `schema_migrations` table tracks applied versions. On startup, the migration runner applies any pending migrations in order.

### 6.3 Monitoring Data Retention

```
Raw metrics (every 10s) ──► Aggregate to 5-minute ──► 1-hour ──► 1-day
      Retain: 24h                Retain: 7d           30d        365d
```

All four tables share the same schema: timestamp + CPU, memory, swap, disk, disk I/O, network I/O, and load averages.

---

## 7. Security Architecture

### 7.1 Authentication & Authorization

```
                      ┌─────────────────────────┐
                      │     JWT Auth Flow        │
                      └────────┬────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   ┌────▼────┐           ┌─────▼─────┐         ┌─────▼─────┐
   │  Login  │           │  Refresh  │         │   2FA     │
   │ bcrypt  │           │  7d token │         │  TOTP     │
   │ verify  │           │  → new    │         │  verify   │
   └────┬────┘           │  access   │         └─────┬─────┘
        │                └───────────┘               │
        └────────────────────┬───────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Access Token   │
                    │  (15 min TTL)   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  RBAC Check     │
                    │  Permission     │
                    │  Validation     │
                    └─────────────────┘
```

**Roles:**

| Role     | Permissions                        |
|----------|------------------------------------|
| Admin    | Full access to all modules          |
| Operator | Scoped: `sites.*`, `databases.*`, `files.*`, `cron.*`, `docker.*`, `ftp.*`, `backup.*`, `logs.*`, `terminal.access` |
| Viewer   | Read-only access                   |

### 7.2 Security Layers

| Layer              | Implementation                                          |
|--------------------|---------------------------------------------------------|
| Password Storage   | bcrypt with cost factor 12                              |
| Token Security     | HS256 JWT, short-lived access + long-lived refresh      |
| 2FA                | TOTP with QR code provisioning (RFC 6238)               |
| CSRF Protection    | Double-submit cookie + `X-CSRF-Token` header            |
| Rate Limiting      | 300 requests/min per IP, HTTP 429 with Retry-After      |
| Security Headers   | X-Frame-Options, X-Content-Type-Options, HSTS           |
| Audit Trail        | All state-changing operations logged with user, IP, UA  |
| HTTPS              | TLS with auto self-signed cert generation for panel      |
| Firewall           | UFW management through panel UI                         |
| Intrusion Detection| Fail2ban integration with configurable rules            |
| SSH Hardening      | Panel-managed SSH configuration                         |

### 7.3 Rate Limiting Strategy

```
Request → Check IP bucket → Under limit? → Process request
                                    │
                              Over limit?
                                    │
                              HTTP 429 + Retry-After header
                                    │
                              Client retries with backoff
```

Default: 300 requests per minute per IP address. The frontend Axios interceptor implements automatic retry with exponential backoff on 429 responses.

---

## 8. Performance Architecture

### 8.1 Nginx Optimization (Default Config)

```nginx
worker_processes auto;
worker_connections 2048;
open_file_cache max=1000 inactive=20s;
open_file_cache_valid 30s;
fastcgi_cache_path /dev/shm/fastcgi_cache levels=1:2
    keys_zone=WORDPRESS:10m max_size=64m inactive=2h;
gzip on;
gzip_types text/css application/javascript application/json image/svg+xml;
```

### 8.2 PHP-FPM Tuning

```ini
pm = dynamic
pm.max_children = 30
pm.start_servers = 5
pm.min_spare_servers = 3
pm.max_spare_servers = 10
pm.max_requests = 500

; OPcache
opcache.memory_consumption = 128
opcache.interned_strings_buffer = 16
opcache.max_accelerated_files = 10000
opcache.validate_timestamps = 0
```

### 8.3 MySQL Auto-Tuning

```ini
innodb_buffer_pool_size = <RAM / 8>    # Auto-calculated
query_cache_size = 64M
query_cache_type = 1
innodb_log_file_size = 256M
innodb_flush_method = O_DIRECT
max_connections = 150
```

### 8.4 Vhost Template (FastCGI Cache)

New websites are created with a performance-optimized vhost template:

```
                    ┌───────────┐
    Request ──────► │   Nginx   │
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐     ┌──────────┐
                    │  Cache    │ HIT │  Return   │
                    │  Lookup   ├────►│  Cached   │
                    └─────┬─────┘     └──────────┘
                     MISS │
                    ┌─────▼─────┐
                    │  PHP-FPM  │
                    │  Process  │
                    └─────┬─────┘
                          │ Store in cache
                    ┌─────▼─────┐
                    │  Response │
                    └───────────┘

Skip cache rules: logged-in users, POST requests, query strings,
WooCommerce cart/checkout, WordPress admin
```

### 8.5 Frontend Performance

- **Vite 8** with tree-shaking and code splitting
- **React Query** caching prevents redundant API calls
- **Lazy loading** for page modules
- **gzip compression** on all API responses

---

## 9. WebSocket Architecture

### 9.1 Terminal WebSocket

```
┌──────────┐    WebSocket     ┌──────────┐    PTY     ┌──────────┐
│ xterm.js │ ◄──────────────► │  WS Hub  │ ◄────────► │  /bin/sh │
│ (browser)│    stdin/stdout   │ (Go)     │  creack/pty│ (server) │
└──────────┘                  └──────────┘            └──────────┘
```

- **Endpoint:** `GET /api/v1/terminal?token=<jwt>`
- **Authentication:** JWT token passed as query parameter
- **Permission:** Requires `terminal.access` permission
- **Features:** Full PTY emulation, window resize, multi-session

### 9.2 Real-time Monitor WebSocket

```
┌──────────┐    WebSocket     ┌──────────┐    gopsutil  ┌──────────┐
│ Recharts │ ◄──────────────► │  WS Hub  │ ◄──────────► │  /proc   │
│ (browser)│    JSON metrics   │ (Go)     │  polling     │ (kernel) │
└──────────┘                  └──────────┘              └──────────┘
```

- **Endpoint:** `GET /api/v1/monitor/realtime`
- **Data:** CPU%, RAM%, disk I/O, network I/O, load averages
- **Interval:** ~2 second push cycle
- **Format:** JSON objects with timestamp

---

## 10. API Design Patterns

### 10.1 Response Format

All API responses follow a standardized JSON structure:

```json
// Success
{
  "success": true,
  "data": { ... },
  "message": "Operation completed"
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Field 'name' is required"
  }
}

// Paginated
{
  "success": true,
  "data": {
    "items": [ ... ],
    "total": 100,
    "page": 1,
    "per_page": 20
  }
}
```

### 10.2 Error Codes

| HTTP Status | Code                | Description              |
|-------------|---------------------|--------------------------|
| 400         | `VALIDATION_ERROR`  | Invalid input            |
| 401         | `UNAUTHORIZED`      | Missing/invalid token    |
| 403         | `FORBIDDEN`         | Insufficient permissions |
| 404         | `NOT_FOUND`         | Resource not found       |
| 409         | `CONFLICT`          | Duplicate resource       |
| 429         | `RATE_LIMITED`      | Too many requests        |
| 500         | `INTERNAL_ERROR`    | Server error             |

### 10.3 Route Naming Convention

```
GET    /api/v1/{module}              # List resources
POST   /api/v1/{module}              # Create resource
GET    /api/v1/{module}/:id          # Get resource
PUT    /api/v1/{module}/:id          # Update resource
DELETE /api/v1/{module}/:id          # Delete resource
POST   /api/v1/{module}/:id/{action} # Perform action
```

---

## 11. Deployment Architecture

### 11.1 Single Binary Deployment

```go
// web.go — Frontend embedded into Go binary
//go:embed web/dist/*
var frontendFS embed.FS
```

The entire React frontend is compiled by Vite into `web/dist/` and embedded into the Go binary at compile time using `go:embed`. This produces a single, self-contained binary (~30MB) with zero external runtime dependencies.

### 11.2 Build Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  npm build  │     │  go build    │     │  Single     │
│  (Vite 8)   ├────►│  (go:embed)  ├────►│  Binary     │
│  → web/dist │     │  CGO_ENABLED │     │  ~30MB      │
└─────────────┘     │  =0          │     └─────────────┘
                    └──────────────┘
```

### 11.3 systemd Service

```ini
[Unit]
Description=ITDLUPanel - Linux Server Management
After=network.target

[Service]
Type=simple
ExecStart=/ITDLUPanel/bin/itdlupanel
WorkingDirectory=/ITDLUPanel
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 11.4 Docker Deployment

Multi-stage Dockerfile:

1. **Stage 1 (node:20-alpine):** Build frontend with `npm run build`
2. **Stage 2 (golang:1.24-alpine):** Build Go binary with embedded frontend
3. **Stage 3 (alpine:3.20):** Minimal runtime with bash, curl, ca-certificates

### 11.5 Configuration File

Located at `config/panel.json`:

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
    "setup_completed": false,
    "version": "0.1.0"
  }
}
```

---

*Last updated: March 29, 2026*
