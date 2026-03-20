# ITDLUPanel — System Architecture

## 1. Tổng quan

**ITDLUPanel** là một web-based Linux server management panel, thiết kế cho môi trường đại học (Đại Học Đà Lạt). Panel cho phép quản trị viên quản lý toàn diện các dịch vụ trên server Linux thông qua giao diện web hiện đại.

### 1.1 Mục tiêu chính
- Quản lý server Linux (Ubuntu 22/24, AlmaLinux) qua giao diện web
- Hỗ trợ cài đặt và quản lý LAMP/LEMP/LOMP stack
- Quản lý website, database, FTP, SSL, file, cron, firewall, Docker
- Giao diện hiện đại, màu sắc phù hợp môi trường đại học (xanh dương, xanh lá)
- Đa ngôn ngữ: Tiếng Anh & Tiếng Việt
- Hệ thống plugin mở rộng (App Store)
- Phân quyền RBAC cho nhiều user

### 1.2 Phạm vi
- Quản lý **1 server** duy nhất (panel cài trên server nào quản lý server đó)
- Hỗ trợ Docker management
- Plugin-based App Store (cộng đồng có thể đóng góp)
- Local backup trước, mở rộng remote backup (Google Drive, S3) sau
- Tự động cấp và gia hạn Let's Encrypt SSL
- Cài đặt qua bash script 1 lệnh (`curl | bash`)

### 1.3 Đối tượng sử dụng
- Quản trị hệ thống (IT Admin) của trường đại học
- Giảng viên IT quản lý server lab
- Sinh viên IT thực hành

---

## 2. Tech Stack

| Layer | Technology | Lý do |
|-------|-----------|-------|
| **Backend** | Go (Golang) 1.22+ | Single binary, cross-compile, system-level performance |
| **Frontend** | React 18 + TypeScript + Vite | SPA hiện đại, type-safe, build nhanh |
| **UI Library** | Ant Design 5 / shadcn/ui + Tailwind CSS | Component library phong phú, dễ custom theme |
| **Database** | SQLite (CGO-free via modernc.org/sqlite) | Nhẹ, zero-config, phù hợp single-server |
| **State Management** | Zustand | Nhẹ, đơn giản, ít boilerplate |
| **Terminal** | xterm.js + WebSocket | Web terminal hiện đại |
| **Charts** | Recharts / ECharts | Biểu đồ monitoring |
| **i18n** | react-i18next (FE) + go-i18n (BE) | Đa ngôn ngữ |
| **HTTP Router** | Gin / Chi | Mature, performant Go router |
| **WebSocket** | gorilla/websocket | Bi-directional realtime |
| **Process Management** | Native Go (os/exec, syscall) | Quản lý service, daemon |
| **Authentication** | JWT + bcrypt + TOTP | Stateless auth, 2FA |
| **Build/Deploy** | Bash install script | Cài 1 lệnh giống aaPanel |

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                             │
│  React SPA + TypeScript + Ant Design + xterm.js + Recharts         │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────┐            │
│  │ Dashboard │ │ Websites │ │ Terminal  │ │ Monitor   │  ...       │
│  └──────────┘ └──────────┘ └───────────┘ └───────────┘            │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTPS / WSS
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     ITDLU PANEL SERVER (Go)                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    HTTP/WS Gateway                           │   │
│  │  Gin Router + Middleware Chain                               │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌───────┐ ┌───────┐  │   │
│  │  │ Auth │ │ CORS │ │ Rate │ │ CSRF │ │Logging│ │Recovery│  │   │
│  │  │  MW  │ │  MW  │ │Limit │ │  MW  │ │  MW   │ │  MW   │  │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └───────┘ └───────┘  │   │
│  └────────────────────────┬────────────────────────────────────┘   │
│                           │                                         │
│  ┌────────────────────────┼────────────────────────────────────┐   │
│  │              API Layer (v1)                                  │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌────────┐  │   │
│  │  │ Auth │ │System│ │ Site │ │  DB  │ │ FTP  │ │Firewall│  │   │
│  │  │ API  │ │ API  │ │ API  │ │ API  │ │ API  │ │  API   │  │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └────────┘  │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌────────┐  │   │
│  │  │ File │ │ Cron │ │Docker│ │Plugin│ │Monitor│ │Settings│  │   │
│  │  │ API  │ │ API  │ │ API  │ │ API  │ │  API  │ │  API   │  │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └────────┘  │   │
│  └────────────────────────┬────────────────────────────────────┘   │
│                           │                                         │
│  ┌────────────────────────┼────────────────────────────────────┐   │
│  │            Service Layer (Business Logic)                    │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐              │   │
│  │  │  Website    │ │  Database   │ │    FTP     │              │   │
│  │  │  Service    │ │  Service    │ │  Service   │              │   │
│  │  ├────────────┤ ├────────────┤ ├────────────┤              │   │
│  │  │ Nginx Mgr  │ │ MySQL Mgr  │ │ PureFTP Mgr│              │   │
│  │  │ Apache Mgr │ │ PgSQL Mgr  │ └────────────┘              │   │
│  │  │ OLS Mgr    │ │ Redis Mgr  │                              │   │
│  │  └────────────┘ └────────────┘                              │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐              │   │
│  │  │  File      │ │  Cron      │ │  Docker    │              │   │
│  │  │  Service   │ │  Service   │ │  Service   │              │   │
│  │  └────────────┘ └────────────┘ └────────────┘              │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐              │   │
│  │  │  Security  │ │  Monitor   │ │  Backup    │              │   │
│  │  │  Service   │ │  Service   │ │  Service   │              │   │
│  │  └────────────┘ └────────────┘ └────────────┘              │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐              │   │
│  │  │  SSL/ACME  │ │  Plugin    │ │  User/RBAC │              │   │
│  │  │  Service   │ │  Engine    │ │  Service   │              │   │
│  │  └────────────┘ └────────────┘ └────────────┘              │   │
│  └────────────────────────┬────────────────────────────────────┘   │
│                           │                                         │
│  ┌────────────────────────┼────────────────────────────────────┐   │
│  │              Core Infrastructure                             │   │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐   │   │
│  │  │ SQLite  │ │  Task    │ │  Event    │ │   Config     │   │   │
│  │  │   DB    │ │  Queue   │ │   Bus     │ │  Manager     │   │   │
│  │  └─────────┘ └──────────┘ └───────────┘ └──────────────┘   │   │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐   │   │
│  │  │  Log    │ │  Shell   │ │ WebSocket │ │   i18n       │   │   │
│  │  │ Manager │ │ Executor │ │  Hub      │ │  Manager     │   │   │
│  │  └─────────┘ └──────────┘ └───────────┘ └──────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼────────────────────┐
            ▼               ▼                    ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
    │ Linux System │ │   Services   │ │   File System    │
    │   Kernel     │ │              │ │                  │
    │  - systemctl │ │ - Nginx      │ │ /ITDLUPanel/     │
    │  - iptables  │ │ - Apache     │ │  ├── server/     │
    │  - crontab   │ │ - OLS        │ │  ├── backup/     │
    │  - proc/sys  │ │ - MySQL      │ │  ├── logs/       │
    │  - users     │ │ - PHP-FPM    │ │  └── wwwroot/    │
    └──────────────┘ │ - Pure-FTPd  │ └──────────────────┘
                     │ - Redis      │
                     │ - Docker     │
                     └──────────────┘
```

---

## 4. Kiến trúc Chi tiết Các Layer

### 4.1 HTTP/WebSocket Gateway

```
Request Flow:
  HTTP Request
      ↓
  Recovery Middleware (panic recovery)
      ↓
  Logging Middleware (request/response log)
      ↓
  CORS Middleware (cross-origin control)
      ↓
  Rate Limit Middleware (per-IP throttling)
      ↓
  Auth Middleware (JWT validation + RBAC check)
      ↓
  CSRF Middleware (double-submit cookie)
      ↓
  Route Handler → Service → Response
      ↓
  Audit Middleware (log mutations)
```

**Middleware Chain chạy theo thứ tự trên cho mọi request. Auth middleware skip các route public (login, health check).**

### 4.2 API Layer

Tất cả API endpoints được prefix bằng `/api/v1/`. API layer chỉ làm:
- Parse request parameters
- Validate input
- Gọi Service layer
- Format response (chuẩn JSON)

**Không chứa business logic trong API handlers.**

### 4.3 Service Layer

Business logic tập trung ở đây. Mỗi service:
- Nhận input đã validate từ API layer
- Thực hiện logic nghiệp vụ
- Gọi Database layer hoặc Shell executor
- Return kết quả hoặc error

**Services không biết về HTTP — chỉ làm việc với Go types.**

### 4.4 Core Infrastructure

| Component | Trách nhiệm |
|-----------|-------------|
| **SQLite DB** | Lưu trữ dữ liệu (users, sites, databases, tasks...) |
| **Task Queue** | Hàng đợi tác vụ nền (install software, backup, restore) |
| **Event Bus** | Pub/sub nội bộ cho cross-service communication |
| **Config Manager** | Đọc/ghi panel.json, cache config, reload |
| **Log Manager** | Structured logging (zerolog), file rotation |
| **Shell Executor** | Chạy system commands an toàn (chống injection) |
| **WebSocket Hub** | Quản lý connections, broadcast events |
| **i18n Manager** | Load locale files, translate messages |

---

## 5. Background Task System

```
Architecture:
  ┌─────────────────────────────────────────────┐
  │              ITDLUPanel Process              │
  │                                             │
  │  ┌─────────────┐    ┌───────────────────┐   │
  │  │  HTTP Server │    │  Task Worker Pool │   │
  │  │  (Gin)      │    │  (3 goroutines)   │   │
  │  │             │    │                   │   │
  │  │  POST /task ─────▶  Pick from queue  │   │
  │  │             │    │  Execute task     │   │
  │  │  WS /events ◀────  Broadcast status  │   │
  │  └─────────────┘    └───────────────────┘   │
  │                            │                │
  │                     ┌──────┴──────┐         │
  │                     │  SQLite DB  │         │
  │                     │ (task queue)│         │
  │                     └─────────────┘         │
  └─────────────────────────────────────────────┘

Flow:
  1. API handler tạo task record (status=pending) trong DB
  2. Task worker goroutine pick pending task (FIFO)
  3. Worker execute task, cập nhật progress trong DB
  4. WebSocket hub broadcast progress tới connected clients
  5. Hoàn thành: update status=completed, gửi notification

Concurrency:
  - Max 3 concurrent tasks (configurable)
  - Queue FIFO cho pending tasks
  - Critical tasks (install software) được ưu tiên
```

---

## 6. Plugin Architecture

```
Plugin Structure:
  /ITDLUPanel/server/data/plugins/{plugin_name}/
  ├── plugin.json          # Manifest (metadata, permissions, routes, hooks)
  ├── main.so              # Go plugin binary (hoặc subprocess binary)
  ├── static/              # Plugin static assets (CSS, JS, images)
  └── templates/           # Plugin HTML templates

Plugin Interface (Go):
  type Plugin interface {
      Init(ctx PluginContext) error       // Khởi tạo plugin
      Routes() []Route                    // Đăng ký API routes
      Hooks() map[string]HookFunc         // Đăng ký event hooks
      Cleanup() error                     // Cleanup khi disable/uninstall
  }

Plugin Manifest (plugin.json):
  {
    "name": "my-plugin",
    "version": "1.0.0",
    "description": "Mô tả plugin",
    "author": "Author",
    "min_panel_version": "1.0.0",
    "permissions": ["files.read", "sites.read"],
    "routes": [
      { "method": "GET", "path": "/my-endpoint", "handler": "MyHandler" }
    ],
    "hooks": ["on_site_created", "on_backup_completed"],
    "settings": {
      "key1": { "type": "string", "default": "value", "label": "Setting 1" }
    }
  }

Loading Strategy:
  - Ưu tiên: Go plugin (.so) cho performance
  - Fallback: REST-based subprocess cho tính tương thích
  - Plugin routes được mount tại /api/v1/plugins/{name}/...
  - Hooks được gọi qua Event Bus khi sự kiện xảy ra
```

---

## 7. Security Architecture

```
Authentication Flow:
  ┌────────┐     POST /auth/login      ┌──────────┐
  │ Client │ ──────────────────────▶  │  Server  │
  │        │   {username, password}    │          │
  │        │                           │ 1. Rate limit check
  │        │                           │ 2. bcrypt verify
  │        │                           │ 3. Check 2FA enabled?
  │        │ ◀──────────────────────── │          │
  │        │   {require_2fa: true}     │          │
  │        │                           │          │
  │        │  POST /auth/2fa/verify    │          │
  │        │ ──────────────────────▶  │          │
  │        │   {totp_code}             │ 4. Verify TOTP
  │        │ ◀──────────────────────── │          │
  │        │   {access_token,          │ 5. Issue JWT pair
  │        │    refresh_token(cookie)} │          │
  └────────┘                           └──────────┘

Token Strategy:
  - Access Token:  JWT, 15 min TTL, in Authorization header
  - Refresh Token: JWT, 7 day TTL, in httpOnly secure cookie
  - CSRF Token:    Random hex, in X-CSRF-Token header

Security Layers (Defense in Depth):
  Layer 1: TLS 1.2+ (HTTPS cho panel)
  Layer 2: Rate limiting (per-IP, exponential backoff)
  Layer 3: JWT authentication (short-lived access tokens)
  Layer 4: RBAC authorization (role-based permission check)
  Layer 5: CSRF protection (double-submit cookie)
  Layer 6: Input validation & sanitization (every endpoint)
  Layer 7: Path traversal prevention (file operations)
  Layer 8: SQL injection prevention (parameterized queries only)
  Layer 9: XSS prevention (React auto-escaping + CSP headers)
  Layer 10: Audit logging (all mutations tracked)
  Layer 11: IP whitelist (optional, configurable)

Password Storage: bcrypt (cost=12)
2FA: TOTP RFC 6238 (30-second window)
Shell Execution: Allowlist-based, no string interpolation
```

---

## 8. RBAC Permission Model

```
Roles:
  ┌──────────┬──────────────────────────────────────────────────────┐
  │  admin   │ Toàn quyền: system, software, users, settings,     │
  │          │ plugins + tất cả quyền của operator                  │
  ├──────────┼──────────────────────────────────────────────────────┤
  │ operator │ Quản lý: sites, databases, ftp, files, cron,       │
  │          │ docker, firewall, backup, terminal                   │
  ├──────────┼──────────────────────────────────────────────────────┤
  │  viewer  │ Chỉ xem: dashboard, monitor, logs                   │
  └──────────┴──────────────────────────────────────────────────────┘

Granular Permissions:
  system.*           → admin only
  software.*         → admin only
  users.*            → admin only
  settings.*         → admin only
  plugins.*          → admin only
  sites.read / sites.write / sites.delete
  databases.read / databases.write / databases.delete
  ftp.read / ftp.write / ftp.delete
  files.read / files.write / files.delete
  cron.read / cron.write / cron.delete
  docker.read / docker.write / docker.delete
  firewall.read / firewall.write
  monitor.read
  logs.read / logs.delete
  backup.read / backup.write / backup.delete
  terminal.access
```

---

## 9. Directory Structure

### 9.1 Runtime (Production)

```
/ITDLUPanel/                          # Root installation
├── server/                           # Core application
│   ├── itdlupanel                    # Main binary (Go compiled)
│   ├── panel.pid                     # PID file
│   ├── config/                       # Configuration
│   │   ├── panel.json                # Main config (port, SSL, language...)
│   │   ├── admin_path.conf           # Custom admin path
│   │   └── firewall.json             # Firewall rules
│   ├── data/                         # Runtime data
│   │   ├── panel.db                  # SQLite database
│   │   ├── ssl/                      # Panel SSL certs
│   │   │   ├── private.key
│   │   │   └── certificate.pem
│   │   └── plugins/                  # Installed plugins
│   │       └── {plugin_name}/
│   │           ├── plugin.json       # Plugin manifest
│   │           ├── main.so           # Plugin binary
│   │           └── static/           # Plugin assets
│   ├── web/                          # Frontend static files (React build)
│   │   ├── index.html
│   │   ├── assets/
│   │   └── locales/
│   │       ├── en.json
│   │       └── vi.json
│   ├── vhost/                        # Web server virtual host configs
│   │   ├── nginx/
│   │   ├── apache/
│   │   └── openlitespeed/
│   └── scripts/                      # Shell scripts for service management
│       ├── install_nginx.sh
│       ├── install_mysql.sh
│       └── ...
├── backup/                           # Backups storage
│   ├── site/
│   ├── database/
│   └── panel/
├── logs/                             # All logs
│   ├── panel.log
│   ├── task.log
│   └── audit.log
└── wwwroot/                          # Website document roots
    ├── example.com/
    └── default/
```

### 9.2 Source Code (Development)

```
ITDLUPanel/
├── cmd/                              # Entry points
│   └── panel/
│       └── main.go                   # Main entry point
├── internal/                         # Private application code
│   ├── app/                          # Application bootstrap
│   │   ├── app.go                    # App initialization
│   │   ├── router.go                 # Route registration
│   │   └── middleware.go             # Middleware chain
│   ├── config/                       # Configuration management
│   │   └── config.go
│   ├── database/                     # Database layer
│   │   ├── sqlite.go
│   │   ├── migrations/               # Schema migrations
│   │   └── models/                   # Data models
│   ├── api/                          # HTTP handlers (controllers)
│   │   ├── v1/                       # API version 1
│   │   │   ├── auth.go
│   │   │   ├── dashboard.go
│   │   │   ├── site.go
│   │   │   ├── database.go
│   │   │   ├── ftp.go
│   │   │   ├── file.go
│   │   │   ├── cron.go
│   │   │   ├── firewall.go
│   │   │   ├── docker.go
│   │   │   ├── monitor.go
│   │   │   ├── security.go
│   │   │   ├── log.go
│   │   │   ├── terminal.go
│   │   │   ├── backup.go
│   │   │   ├── plugin.go
│   │   │   ├── settings.go
│   │   │   └── user.go
│   │   └── ws/                       # WebSocket handlers
│   │       ├── terminal.go
│   │       └── monitor.go
│   ├── service/                      # Business logic
│   │   ├── auth_service.go
│   │   ├── site_service.go
│   │   ├── database_service.go
│   │   ├── ftp_service.go
│   │   ├── file_service.go
│   │   ├── cron_service.go
│   │   ├── firewall_service.go
│   │   ├── docker_service.go
│   │   ├── monitor_service.go
│   │   ├── security_service.go
│   │   ├── backup_service.go
│   │   ├── ssl_service.go
│   │   ├── plugin_service.go
│   │   ├── task_service.go
│   │   ├── user_service.go
│   │   └── log_service.go
│   ├── system/                       # System-level operations
│   │   ├── shell.go                  # Safe shell command executor
│   │   ├── process.go                # Process management
│   │   ├── service_manager.go        # systemctl wrapper
│   │   ├── package_manager.go        # apt/yum wrapper
│   │   ├── network.go                # Network utilities
│   │   └── os_detect.go              # OS detection
│   ├── task/                         # Background task system
│   │   ├── worker.go
│   │   ├── queue.go
│   │   └── scheduler.go
│   ├── plugin/                       # Plugin engine
│   │   ├── loader.go
│   │   ├── manager.go
│   │   ├── registry.go
│   │   └── api.go
│   ├── websocket/                    # WebSocket management
│   │   ├── hub.go
│   │   ├── terminal.go
│   │   └── events.go
│   ├── i18n/                         # Internationalization
│   │   ├── i18n.go
│   │   └── locales/
│   └── pkg/                          # Shared utilities
│       ├── logger/
│       ├── crypto/
│       ├── validator/
│       ├── response/
│       └── errors/
├── web/                              # Frontend (React)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── router/
│       ├── layouts/
│       │   ├── MainLayout.tsx
│       │   └── AuthLayout.tsx
│       ├── pages/
│       │   ├── Login/
│       │   ├── Dashboard/
│       │   ├── Website/
│       │   ├── Database/
│       │   ├── FTP/
│       │   ├── Files/
│       │   ├── Docker/
│       │   ├── Monitor/
│       │   ├── Security/
│       │   ├── Logs/
│       │   ├── Terminal/
│       │   ├── Cron/
│       │   ├── AppStore/
│       │   ├── Settings/
│       │   └── Users/
│       ├── components/
│       ├── hooks/
│       ├── stores/
│       ├── services/
│       ├── i18n/
│       ├── types/
│       └── utils/
├── scripts/                          # Build & install scripts
│   ├── install.sh
│   ├── build.sh
│   ├── service/
│   │   └── itdlupanel.service
│   └── installers/
│       ├── nginx.sh
│       ├── apache.sh
│       ├── mysql.sh
│       ├── php.sh
│       └── ...
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

---

## 10. UI/UX Architecture

### 10.1 Design System

```
Color Palette (DLU University Theme):
  Primary:    #1565C0 (Xanh dương đậm)
  Secondary:  #2E7D32 (Xanh lá đậm)
  Accent:     #0288D1 (Xanh dương nhạt)
  Background: #F5F7FA (Xám nhạt)
  Sidebar:    #1B2A4A (Xanh đen)
  Surface:    #FFFFFF (Trắng)
  Success:    #4CAF50
  Warning:    #FF9800
  Error:      #F44336
  Text:       #1A1A2E (primary), #64748B (secondary)

Typography:
  Font: Inter (UI), JetBrains Mono (code/terminal)
  Headings: 600 weight
  Body: 400 weight

Spacing: 4px base unit (4, 8, 12, 16, 24, 32, 48)
Border Radius: 6px (cards), 8px (modals), 4px (buttons)
```

### 10.2 Layout Structure

```
┌─────────────────────────────────────────────┐
│ 🎓 ITDLUPanel   │  Search  │ 🌐 │ 👤 Admin │
├────────────┬────────────────────────────────┤
│            │                                │
│  🏠 Home   │    Page Title                  │
│  🌐 Sites  │    ┌──────────────────────┐    │
│  💾 DB     │    │                      │    │
│  📁 FTP    │    │    Page Content      │    │
│  📂 Files  │    │                      │    │
│  🐳 Docker │    │                      │    │
│  📊 Monitor│    │                      │    │
│  🔒 Security│   │                      │    │
│  📋 Logs   │    │                      │    │
│  💻 Terminal│   │                      │    │
│  ⏰ Cron   │    │                      │    │
│  🏪 Store  │    └──────────────────────┘    │
│  ⚙️ Settings│                               │
│  👥 Users  │                                │
│  🚪 Logout │                                │
└────────────┴────────────────────────────────┘

Sidebar: 250px (desktop), collapsible (tablet), hidden (mobile)
Header: 56px height
Content: flex-grow, with padding 24px
```

### 10.3 First-Time Setup Wizard

```
Step 1: Chọn Web Server Stack
  ┌─────────────────────────────────────────┐
  │  Chọn stack cho server của bạn:         │
  │                                         │
  │  [✓] LEMP (Linux + Nginx + MySQL + PHP) │  ← Recommended
  │  [ ] LAMP (Linux + Apache + MySQL + PHP)│
  │  [ ] LOMP (Linux + OLS + MySQL + PHP)   │
  └─────────────────────────────────────────┘

Step 2: Chọn phiên bản
  ┌─────────────────────────────────────────┐
  │  Webserver: Nginx 1.24                  │
  │  Database:  [MariaDB 10.11 ▾]           │
  │  PHP:       [PHP 8.2 ▾]                 │
  │  ☑ phpMyAdmin                           │
  │  ☑ Pure-FTPd                            │
  │  ☐ Redis                                │
  └─────────────────────────────────────────┘

Step 3: Xác nhận & Cài đặt
  ┌─────────────────────────────────────────┐
  │  Installing LEMP Stack...               │
  │  ████████████░░░░░░░░ 62%               │
  │                                         │
  │  ✅ Nginx 1.24         installed        │
  │  ✅ MariaDB 10.11      installed        │
  │  🔄 PHP 8.2            installing...    │
  │  ⏳ phpMyAdmin          waiting         │
  │  ⏳ Pure-FTPd           waiting         │
  └─────────────────────────────────────────┘
```

---

## 11. Deployment & Distribution

### 11.1 Build Strategy

```
Build Process:
  1. Frontend: npm run build → web/dist/ (static files)
  2. Backend: go build → embed web/dist/ vào binary (Go embed.FS)
  3. Output: single binary "itdlupanel" (~30-50MB)

Cross-Compile Targets:
  - linux/amd64 (Ubuntu, AlmaLinux trên x86_64)
  - linux/arm64 (Ubuntu trên ARM)

Distribution:
  - Binary + install script hosted trên release server
  - Install: curl -sSO https://install.itdlupanel.com/install.sh && bash install.sh
```

### 11.2 Systemd Integration

```ini
[Unit]
Description=ITDLUPanel - Linux Server Management Panel
After=network.target

[Service]
Type=simple
ExecStart=/ITDLUPanel/server/itdlupanel
WorkingDirectory=/ITDLUPanel/server
Restart=always
RestartSec=5
User=root
Environment=PANEL_ENV=production

[Install]
WantedBy=multi-user.target
```

### 11.3 OS Compatibility

```
┌──────────────┬──────────────┬───────────────┐
│   Feature    │ Ubuntu 22/24 │  AlmaLinux    │
├──────────────┼──────────────┼───────────────┤
│ Pkg Manager  │ apt          │ dnf/yum       │
│ Firewall     │ ufw/iptables │ firewalld     │
│ Service Mgr  │ systemctl    │ systemctl     │
│ PHP Repo     │ ppa:ondrej   │ remi-release  │
│ MySQL/MariaDB│ apt install  │ dnf install   │
│ Init System  │ systemd      │ systemd       │
└──────────────┴──────────────┴───────────────┘

Strategy: OS detection at startup → load OS-specific config/scripts
```

---

## 12. Performance Considerations

| Aspect | Strategy |
|--------|----------|
| **Concurrency** | Go goroutine-per-request (~100K concurrent) |
| **Database** | SQLite WAL mode, connection pooling, prepared statements |
| **API Response** | Gzip compression middleware |
| **Static Files** | Embedded in binary, served with cache headers (1 year) |
| **Real-time** | WebSocket (no HTTP polling) |
| **System Metrics** | Cached with 2-second refresh interval |
| **File Operations** | Streaming (no full file in memory for large files) |
| **Background Tasks** | Goroutine pool (max 3), prevents overload |
