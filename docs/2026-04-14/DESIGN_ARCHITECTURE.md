# ITDLUPanel — Design & Architecture Document

> **Version**: 4.0.0 · **Date**: 2026-04-14

---

## 1. Design Philosophy

### 1.1 Single Binary Architecture

ITDLUPanel is compiled into a **single static Go binary** (~60 MB) with zero runtime dependencies. The React frontend is embedded using Go's `go:embed` directive, eliminating the need for a separate web server, Node.js runtime, or static file hosting.

```
┌─────────────────────────────┐
│     itdlupanel binary       │
│  ┌───────────────────────┐  │
│  │  Embedded SPA Assets  │  │  ← go:embed web/dist/
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │   Go HTTP Server      │  │  ← Gin framework
│  │   (API + Static)      │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │   SQLite (pure Go)    │  │  ← modernc.org/sqlite
│  └───────────────────────┘  │
└─────────────────────────────┘
```

**Benefits**:
- No CGO, no C dependencies → `CGO_ENABLED=0`
- Deploy with `scp` + `chmod +x`
- Works on any Linux amd64/arm64 without installing packages

### 1.2 Layered Architecture

```
┌─────────────────────────────────────────┐
│            Presentation Layer           │
│  React 19 · Ant Design · Zustand       │
├─────────────────────────────────────────┤
│             API Layer                   │
│  Gin Handlers · Validation · Response   │
├─────────────────────────────────────────┤
│           Middleware Layer              │
│  Auth · RBAC · CSRF · Rate Limit · ... │
├─────────────────────────────────────────┤
│            Service Layer               │
│  Business Logic · 33 Services          │
├─────────────────────────────────────────┤
│          Data Access Layer             │
│  SQLite · OS Commands · Docker API     │
├─────────────────────────────────────────┤
│         Infrastructure Layer           │
│  Linux OS · Nginx/Apache · MySQL/PG    │
└─────────────────────────────────────────┘
```

---

## 2. Backend Design

### 2.1 Request Lifecycle

```
Client Request
     │
     ▼
┌─── Gin Engine ────────────────────────────┐
│ Recovery → Logger → SecurityHeaders       │
│ → CORS → Compression → Language           │
│ → RateLimit → Audit → CSRF                │
│ → Auth(JWT) → RBAC(Permission)            │
│     │                                     │
│     ▼                                     │
│ Handler (validate input, call service)    │
│     │                                     │
│     ▼                                     │
│ Service (business logic, OS commands)     │
│     │                                     │
│     ▼                                     │
│ Repository / OS / Docker CLI              │
│     │                                     │
│     ▼                                     │
│ JSON Response { code, message, data }     │
└───────────────────────────────────────────┘
```

### 2.2 Service Wiring (Dependency Injection)

All services are instantiated in `router.go` with explicit constructor injection:

```go
// router.go - Service initialization
authService      := service.NewAuthService(db)
siteService      := service.NewSiteService(db)
sslService       := service.NewSSLService(db)
databaseService  := service.NewDatabaseService(db)
softwareService  := service.NewSoftwareService(db, taskQueue, installerRegistry, firewallService)

// Handler creation with dependencies
siteHandler := v1.NewSiteHandler(siteService, statsService, userResourceService)
siteHandler.RegisterRoutes(apiV1, authMW, RBACMiddleware)
```

**Key design decisions**:
- No DI framework — explicit wiring keeps the dependency graph visible
- Services receive `*sql.DB` directly (not interfaces) for simplicity
- Cross-service communication via explicit method calls or notification hooks

### 2.3 Notification Event Hooks

Services that produce events (backup completed, SSL expiring, software installed) are wired to the notification service:

```go
cronService.SetNotifier(notificationService)
backupService.SetNotifier(notificationService)
sslService.SetNotifier(notificationService)
softwareService.SetNotifier(notificationService)
siteService.SetNotifier(notificationService)
```

Events are routed to channels (email, Telegram, webhook) based on user-configured rules.

### 2.4 Background Task Queue

Long-running operations (software install, stack deployment) run through a persistent task queue:

```
┌────────────┐    ┌────────────────┐    ┌──────────────┐
│ API Request │───▶│  Task Queue    │───▶│  4 Workers   │
│ (creates    │    │  (SQLite +     │    │  (goroutines)│
│  task)      │    │   channel)     │    │              │
└────────────┘    └───────┬────────┘    └──────┬───────┘
                          │                     │
                          ▼                     ▼
                   ┌──────────────┐     ┌──────────────┐
                   │   WebSocket  │     │   SQLite     │
                   │   Hub        │     │   (persist)  │
                   │  (broadcast  │     │              │
                   │   progress)  │     │              │
                   └──────────────┘     └──────────────┘
```

### 2.5 WebSocket Architecture

Two WebSocket endpoints share a single hub:

```
┌─── WebSocket Hub ─────────────────────┐
│  clients map[*Client]bool             │
│  broadcast chan []byte                │
│  register/unregister chan *Client     │
├───────────────────────────────────────┤
│  /terminal       → PTY sessions      │
│  /monitor/realtime → metrics stream  │
│  Task Queue      → progress updates │
└───────────────────────────────────────┘
```

- **Terminal**: PTY-backed shell (creack/pty), bi-directional stdin/stdout
- **Monitor**: Broadcasts system metrics every 2 seconds
- **Tasks**: Progress updates for software installation, etc.

### 2.6 Metrics Collection & Aggregation

```
Every 5s: Collect raw metrics (CPU, RAM, disk, net, load)
          ↓ Write to monitor_metrics_raw
          
Every 5m: Aggregate raw → monitor_metrics_5m (average)
          ↓ Prune raw older than 1 hour
          
Every 1h: Aggregate 5m → monitor_metrics_1h (average)
          ↓ Prune 5m older than 24 hours
          
Every 1d: Aggregate 1h → monitor_metrics_1d (average)
          ↓ Prune 1h older than 30 days
```

---

## 3. Frontend Design

### 3.1 Application Structure

```
web/src/
├── main.tsx            # Entry point, React root
├── App.tsx             # Router configuration
├── layouts/
│   └── MainLayout.tsx  # Sidebar + Header + Content
├── pages/              # 17 lazy-loaded route components
├── components/         # 17+ shared modals and widgets
├── stores/             # 5 Zustand state stores
├── hooks/              # Custom React hooks
├── lib/                # Utilities (API client, datetime)
└── i18n/               # Localization (en, vi)
```

### 3.2 State Management

Zustand stores with selective subscriptions for minimal re-renders:

| Store | Key State | Persistence |
|-------|-----------|-------------|
| `auth` | user, accessToken, refreshToken | Memory (tokens in httpOnly where possible) |
| `theme` | isDark, accentColor, palette | localStorage |
| `settings` | timezone, panelName, hiddenMenuKeys | localStorage (`itdlu-settings`) |
| `task` | tasks[], activeCount | Memory (WebSocket-fed) |
| `notification` | channels[], rules[], unread | Memory (API-fed) |

### 3.3 Theming System

The `usePalette()` hook provides a unified color system:

```typescript
const { p, isDark } = usePalette();
// p.accent    — Primary accent color
// p.text      — Primary text
// p.textMuted — Secondary text
// p.bg        — Background
// p.cardBg    — Card background
// p.cardBorder — Card border
// p.green, p.red, p.amber — Semantic colors
```

Dark/light mode is controlled by the theme store with all 17 pages adapting automatically.

### 3.4 Menu Visibility System

```
Settings → Menu Tab
    ↓ toggleMenuKey(key)
Zustand settings store (hiddenMenuKeys[])
    ↓ persisted to localStorage
MainLayout reads hiddenMenuKeys
    ↓ filters menuItems array
Sidebar renders only visible items
```

- Dashboard (`/`) and Settings (`/settings`) are **always visible** (locked)
- All other menu items can be toggled on/off

### 3.5 Page Architecture Pattern

Each page follows a consistent pattern:

```tsx
// pages/Websites/index.tsx
const WebsitesPage = () => {
  // 1. State hooks (useState, useCallback)
  // 2. Data fetching (useEffect → API calls)
  // 3. Event handlers (CRUD operations)
  // 4. Table columns definition
  // 5. Render: Toolbar + Table + Modals
};
export default WebsitesPage;
```

### 3.6 Database Management UI

The Databases page has three tabs:

```
┌────────────────────────────────────────────┐
│  [MariaDB/MySQL] [PostgreSQL] [Redis]      │
├────────────────────────────────────────────┤
│  Toolbar: [Manage] [phpMyAdmin/pgAdmin]    │
│           [Backup All] [Import] [Search]   │
│           [Root Password] [Refresh]        │
│                                            │
│  ┌──┬──────┬──────┬────┬────┬───┬───────┐  │
│  │☐ │ Name │ User │ PW │Size│Qt │Actions│  │
│  ├──┼──────┼──────┼────┼────┼───┼───────┤  │
│  │☐ │mydb  │myuser│****│12M │ 0 │⊕ ✎ ✕ │  │
│  └──┴──────┴──────┴────┴────┴───┴───────┘  │
│                                            │
│  Batch: [Delete Selected] [Backup Selected]│
└────────────────────────────────────────────┘
```

Both MySQL/MariaDB and PostgreSQL tabs share the same CRUD architecture through the unified `/databases` API with a `db_type` filter.

---

## 4. Database Design

### 4.1 Schema Overview

```
users ──┬── user_roles ──── roles
        ├── user_resources
        └── user_sites ──── sites ──── domains
                              │
                              └── ssl_certificates

databases (mysql/mariadb/postgresql)
ftps
crons
tasks

docker_containers
firewall_rules
firewall_settings
backups ──── ftp_storages
         └── cloud_storages

audit_logs
settings
software
plugins

notification_channels ──── notification_rules
                       └── notification_logs

monitor_metrics_raw/5m/1h/1d
schema_migrations
```

### 4.2 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| SQLite (pure Go) | Zero-config, single-file, no CGO, embedded in binary |
| 14 incremental migrations | Forward-only versioned schema evolution |
| Unified `databases` table | Single table with `db_type` column for MySQL/MariaDB/PostgreSQL |
| 4-tier metrics tables | Automatic aggregation reduces storage while preserving history |
| JSON permissions in `roles` | Flexible permission list without join table complexity |
| `is_system` flag on roles | Prevent deletion of built-in admin/viewer roles |

### 4.3 Migration System

Migrations are Go functions registered in order:

```go
// migrations/migrations.go
var All = []Migration{
    {Version: 1,  Name: "init",                   Up: Up001},
    {Version: 2,  Name: "monitor_metrics",         Up: Up002},
    {Version: 3,  Name: "firewall_settings",       Up: Up003},
    // ... through version 14
}
```

The `sqlite.go` driver runs pending migrations on startup, tracking applied versions in `schema_migrations`.

---

## 5. Security Design

### 5.1 Authentication Architecture

```
┌─────────────────────────────────────────────┐
│              Authentication Flow             │
│                                             │
│  POST /auth/login                           │
│    ├─ Brute-force check (in-memory tracker) │
│    ├─ User lookup (SQLite)                  │
│    ├─ bcrypt verify (cost 12)               │
│    ├─ If 2FA enabled → require TOTP verify  │
│    ├─ Generate access token (JWT HS256)     │
│    │   └─ Claims: user_id, username, role   │
│    │   └─ TTL: 15 minutes                  │
│    ├─ Generate refresh token                │
│    │   └─ TTL: 7 days                      │
│    └─ Return tokens + user info             │
│                                             │
│  Subsequent requests                        │
│    ├─ Authorization: Bearer <access_token>  │
│    ├─ JWT validation middleware             │
│    └─ RBAC permission check                 │
└─────────────────────────────────────────────┘
```

### 5.2 Brute-Force Protection

```go
// In-memory tracker per username
type loginTracker struct {
    failures    int
    lastAttempt time.Time
    lockedUntil time.Time
}

// Thresholds:
//  5 failures → 30 second lockout
// 10 failures → 15 minute lockout
// Successful login → reset counter
```

### 5.3 SSL Architecture

```
Panel SSL (auto-generated on first boot):
  ├─ Algorithm: ECDSA P-256
  ├─ Validity: 10 years
  ├─ SANs: hostname, localhost, all IPs
  └─ Path: /ITDLUPanel/server/data/ssl/panel/

Website SSL:
  ├─ Let's Encrypt (HTTP-01)
  │   └─ Automatic challenge via /.well-known/acme-challenge/
  ├─ Let's Encrypt (DNS-01)
  │   └─ Manual DNS TXT record verification
  ├─ Custom Upload (PEM cert + key)
  └─ Auto-renewal (background SSLRenewer worker)
```

---

## 6. Software Management Design

### 6.1 Installer Registry

```go
type InstallerRegistry struct {
    installers map[string]Installer
}

type Installer interface {
    Name() string
    Install(version string) error
    Uninstall() error
    IsInstalled() (bool, string, error)
    GetServiceName() string
}
```

**Registered installers**: Nginx, Apache, OpenLiteSpeed, PHP (5.6-8.4), MySQL, MariaDB, PostgreSQL, Redis, phpMyAdmin, pgAdmin, PureFTPd, Docker

### 6.2 Software Lifecycle

```
Install Request → Task Queue → Installer.Install()
                                  ├─ Package manager (apt/dnf)
                                  ├─ Configuration files
                                  ├─ Service registration
                                  └─ Firewall port opening

Start/Stop/Restart → Direct systemctl call
Config Update → Write config file → Reload service
Uninstall → Stop service → Purge package → Clean config
```

---

## 7. Backup & Storage Design

### 7.1 Backup Architecture

```
Backup Request
     ├─ Site backup: tar.gz of document root + nginx config
     └─ Database backup: mysqldump / pg_dump

Storage Targets:
     ├─ Local: /ITDLUPanel/backup/
     ├─ FTP: Remote FTP server
     └─ Cloud: S3 / Google Drive / OneDrive
         ├─ S3: minio-go SDK (AWS, MinIO, Wasabi, R2, DO Spaces)
         ├─ Google Drive: OAuth2 + REST API
         └─ OneDrive: OAuth2 + Microsoft Graph API
```

### 7.2 Cloud Storage OAuth Flow

```
1. GET /cloud-storages/:id/auth-url
   → Returns OAuth authorization URL

2. User authorizes in browser
   → Redirected to callback

3. GET /cloud-storages/oauth/callback
   → Exchanges code for tokens
   → Stores encrypted tokens in cloud_storages.config

4. Backup upload uses stored tokens
   → Auto-refresh on expiry
```

---

## 8. Build Pipeline Design

### 8.1 Two-Phase Build

```
Phase 1: Frontend (Node.js 18+)
  ┌───────────────────────────────────────────┐
  │  TypeScript → Vite 8 → web/dist/         │
  │    ├─ index.html                          │
  │    ├─ assets/*.js (code-split chunks)     │
  │    └─ assets/*.css                        │
  └───────────────────────────────────────────┘

Phase 2: Backend (Go 1.25+)
  ┌───────────────────────────────────────────┐
  │  web.go: //go:embed web/dist/*            │
  │    ↓                                      │
  │  go build -ldflags "..." -o bin/itdlupanel│
  │    ├─ Static binary (no CGO)              │
  │    ├─ Version + build time injected       │
  │    └─ ~60 MB output                       │
  └───────────────────────────────────────────┘
```

### 8.2 Docker Build (Multi-Stage)

```dockerfile
# Stage 1: Frontend build
FROM node:18-alpine AS frontend
WORKDIR /app/web
COPY web/ .
RUN npm ci && npx vite build

# Stage 2: Backend build
FROM golang:1.25-alpine AS backend
WORKDIR /app
COPY . .
COPY --from=frontend /app/web/dist web/dist
RUN CGO_ENABLED=0 go build -o itdlupanel ./cmd/panel

# Stage 3: Runtime
FROM alpine:3.20
COPY --from=backend /app/itdlupanel /usr/local/bin/
ENTRYPOINT ["itdlupanel"]
```

---

## 9. Deployment Architecture

### 9.1 File System Layout

```
/ITDLUPanel/
├── server/
│   ├── bin/itdlupanel      # Binary
│   ├── config/panel.json   # Configuration
│   ├── data/
│   │   ├── panel.db        # SQLite database
│   │   └── ssl/panel/      # Panel SSL certs
│   └── logs/               # Application logs
├── wwwroot/                # Website document roots
│   └── example.com/
├── backup/                 # Local backup storage
├── server/vhost/           # Web server virtual hosts
│   ├── nginx/
│   ├── apache/
│   └── ols/
└── logs/                   # Panel & website logs
```

### 9.2 Network Ports

| Port | Service | Notes |
|------|---------|-------|
| 8888 | Panel (HTTPS) | Default, configurable |
| 80 | HTTP | Web server |
| 443 | HTTPS | Web server + SSL |
| 21 | FTP | PureFTPd |
| 3306 | MySQL/MariaDB | Database |
| 5432 | PostgreSQL | Database |
| 6379 | Redis | Cache |
| 5050 | pgAdmin | Web interface |
| 22 | SSH | Remote access |

---

## 10. Cross-OS Compatibility

| Feature | Ubuntu 22/24 | Debian 11/12 | AlmaLinux 8/9 | Rocky 8/9 |
|---------|-------------|-------------|---------------|-----------|
| Nginx | ✅ | ✅ | ✅ | ✅ |
| Apache | ✅ | ✅ | ✅ | ✅ |
| OpenLiteSpeed | ✅ | ✅ | ✅ | ✅ |
| PHP 5.6-8.4 | ✅ | ✅ | ✅ (Remi) | ✅ (Remi) |
| MySQL/MariaDB | ✅ | ✅ | ✅ | ✅ |
| PostgreSQL | ✅ | ✅ | ✅ | ✅ |
| Redis | ✅ | ✅ | ✅ | ✅ |
| Docker | ✅ | ✅ | ✅ | ✅ |
| UFW Firewall | ✅ | ✅ | ✅ | ✅ |
| Fail2ban | ✅ | ✅ | ✅ | ✅ |
| PureFTPd | ✅ | ✅ | ✅ | ✅ |
