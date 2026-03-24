# Kiến Trúc Hệ Thống ITDLUPanel

> **Phiên bản:** 2026-03-24  
> **Công nghệ:** Go 1.25 + React 19 · SQLite · WebSocket  
> **Mục đích:** Bảng điều khiển quản lý máy chủ Linux

---

## Mục Lục

1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Kiến Trúc Backend](#2-kiến-trúc-backend)
3. [Kiến Trúc Frontend](#3-kiến-trúc-frontend)
4. [Sơ Đồ Luồng Dữ Liệu](#4-sơ-đồ-luồng-dữ-liệu)
5. [Cấu Hình](#5-cấu-hình)
6. [Thư Viện Phụ Thuộc Chính](#6-thư-viện-phụ-thuộc-chính)

---

## 1. Tổng Quan Hệ Thống

ITDLUPanel là một bảng điều khiển quản lý máy chủ Linux tự lưu trữ (self-hosted), được phân phối dưới dạng **một file nhị phân Go duy nhất** với **ứng dụng React SPA được nhúng sẵn**. Hệ thống cung cấp giao diện web để quản lý website, cơ sở dữ liệu, FTP, Docker, chứng chỉ SSL, cron job, tường lửa, hệ thống file và giám sát hệ thống.

### Kiến Trúc Tổng Quát

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

### Các Quyết Định Thiết Kế Chính

| Quyết định | Lý do |
|------------|-------|
| File nhị phân duy nhất | Triển khai không phụ thuộc; nhúng bản build React qua `go:embed` |
| SQLite (chế độ WAL) | Không cần máy chủ DB bên ngoài; WAL cho phép đọc đồng thời trong khi ghi |
| Bật khóa ngoại (Foreign keys) | Đảm bảo tính toàn vẹn tham chiếu ở cấp cơ sở dữ liệu |
| Thời gian chờ bận 5 giây | Ngăn lỗi `SQLITE_BUSY` xảy ra ngay lập tức khi có tranh chấp |
| WebSocket | Terminal thời gian thực và chỉ số hệ thống không cần polling |
| Hàng đợi tác vụ (4 worker) | Giới hạn số lượng tác vụ chạy đồng thời cho các thao tác lâu (cài đặt, sao lưu) |
| Framework Gin | Định tuyến HTTP hiệu năng cao với khả năng kết hợp middleware |

---

## 2. Kiến Trúc Backend

### 2.1 Điểm Khởi Đầu & Quá Trình Khởi Tạo

**File:** `cmd/panel/main.go` (123 dòng)

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

**Các lệnh CLI:**

| Lệnh | Mô tả |
|-------|--------|
| `itdlupanel` | Khởi động máy chủ panel |
| `itdlupanel -version` | In phiên bản và thời gian build |
| `itdlupanel -config <path>` | Chỉ định file cấu hình (mặc định: `config/panel.json`) |
| `itdlupanel reset-password -password <pw> [-user admin]` | Đặt lại mật khẩu người dùng (tối thiểu 6 ký tự, bcrypt) |

---

### 2.2 Chuỗi Middleware

Middleware được áp dụng theo thứ tự nghiêm ngặt. Middleware toàn cục chạy trên tất cả các request; middleware theo route được gắn trên `/api/v1`.

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

**File:** `internal/app/middleware.go`, `internal/app/auth_middleware.go`

---

### 2.3 Tầng Handler

**Vị trí:** `internal/api/v1/` (REST) và `internal/api/ws/` (WebSocket)

#### Các Handler REST API

| Handler | Số dòng | Chức năng |
|---------|--------:|-----------|
| `auth.go` | 380 | Đăng nhập, đăng xuất, làm mới token, thiết lập/xác minh TOTP 2FA, endpoint CSRF token |
| `user.go` | 219 | CRUD người dùng, gán vai trò, danh sách người dùng, cập nhật hồ sơ |
| `dashboard.go` | 49 | Tổng quan hệ thống, thống kê tóm tắt |
| `monitor.go` | 299 | Chỉ số CPU/bộ nhớ/ổ đĩa/mạng, xu hướng lịch sử, danh sách tiến trình |
| `task.go` | 118 | Trạng thái hàng đợi tác vụ, tóm tắt, tác vụ đang chạy, hủy thao tác |
| `site.go` | 501 | CRUD website, quản lý domain, cấu hình SSL/PHP, bật/tắt |
| `software.go` | 329 | Danh sách phần mềm khả dụng, lấy phiên bản, cài đặt, gỡ cài đặt, nâng cấp |
| `ssl.go` | 351 | CRUD chứng chỉ SSL, tạo, xác thực, tự động gia hạn, kiểm tra hết hạn |
| `database.go` | 232 | CRUD cơ sở dữ liệu (MySQL/PostgreSQL), người dùng, sao lưu/khôi phục |
| `ftp.go` | 222 | Quản lý tài khoản FTP, thêm/xóa/bật/tắt, đổi mật khẩu |
| `file.go` | 750 | Quản lý file: liệt kê, tải lên, tải xuống, xóa, đổi tên, chmod, chỉnh sửa |
| `docker.go` | 271 | Quản lý container: liệt kê, tạo, khởi động, dừng, xem log, exec |
| `cron.go` | 223 | CRUD cron job, xác thực lịch trình, lịch sử thực thi |
| `backup.go` | 187 | Tạo bản sao lưu, liệt kê, khôi phục, quản lý lưu trữ |
| `security.go` | 336 | Quy tắc tường lửa, bảo vệ brute-force, quét malware |
| `log.go` | 179 | Truy xuất file log, lọc, tìm kiếm |
| `settings.go` | 173 | Cài đặt panel: ngôn ngữ, cổng, đường dẫn, cấu hình SSL |
| `plugin.go` | 175 | Quản lý plugin: liệt kê, cài đặt, bật, tắt, cấu hình |

#### Các Handler WebSocket

| Handler | Số dòng | Mô tả |
|---------|--------:|-------|
| `ws/terminal.go` | 4189 | Terminal PTY qua WebSocket; tương thích xterm.js; JWT qua tham số query |
| `ws/monitor.go` | 1969 | Phát sóng chỉ số hệ thống thời gian thực mỗi 2 giây |

---

### 2.4 Tầng Service

**Vị trí:** `internal/service/`

#### Các Service Chính

| Service | Số dòng | Chức năng |
|---------|--------:|-----------|
| `auth_service.go` | 152 | Xác thực người dùng, kiểm tra mật khẩu (bcrypt), tạo admin mặc định |
| `user_service.go` | 164 | Thao tác CRUD người dùng, quản lý vai trò, cập nhật hồ sơ |
| `jwt.go` | 114 | Tạo và xác thực JWT access/refresh token |
| `totp_service.go` | 104 | Tạo TOTP 2FA secret, render mã QR, xác minh mã |
| `site_service.go` | 880 | CRUD website, quản lý domain, tạo vhost, gắn SSL, cấu hình PHP |
| `site_defaults.go` | 316 | Phiên bản PHP mặc định, cấu hình webserver, quản lý template |
| `database_service.go` | 369 | CRUD MySQL/PostgreSQL, quyền người dùng, sao lưu/khôi phục qua shell |
| `ftp_service.go` | 284 | Quản lý tài khoản Pure-FTPd (PAM), cô lập hệ thống file |
| `cron_service.go` | 410 | CRUD cron job, phân tích crontab, xác thực lịch trình, theo dõi thực thi |
| `file_service.go` | 1202 | Thao tác file: liệt kê, đọc, ghi, tải lên, tải xuống, xóa, đổi tên, chmod, nén, tìm kiếm |
| `ssl_service.go` | 624 | Tạo chứng chỉ SSL (OpenSSL), tự động hóa ACME Let's Encrypt, gia hạn, kiểm tra hết hạn |
| `ssl_renewer.go` | 94 | Gia hạn SSL nền: kiểm tra mỗi 24 giờ, ngưỡng hết hạn 30 ngày |
| `firewall_service.go` | 779 | Quản lý quy tắc UFW/iptables, bảo vệ DDoS, phát hiện brute-force |
| `monitor_service.go` | 521 | Thu thập chỉ số hệ thống: CPU, bộ nhớ, ổ đĩa, I/O, mạng, load average, tiến trình |
| `metrics_collector.go` | 509 | Thu thập dữ liệu nền, tổng hợp đa độ phân giải (raw → 5m → 1h → 1d) |
| `software_service.go` | 816 | Điều phối cài đặt phần mềm qua hàng đợi tác vụ, quản lý phiên bản |
| `docker_service.go` | 891 | Tích hợp Docker Engine API: container, image, volume, network |
| `backup_service.go` | 457 | Tạo bản sao lưu (tar.gz), lưu trữ từ xa (S3), xác minh, chính sách lưu giữ |
| `log_service.go` | 239 | Tổng hợp log từ hệ thống, web server và ứng dụng |
| `security_service.go` | 427 | Xác minh SSL, xác thực chuỗi chứng chỉ, quét bảo mật |
| `terminal_service.go` | 207 | Quản lý vòng đời phiên PTY, render MOTD, truyền stdin/stdout |
| `settings_service.go` | 210 | CRUD cài đặt panel (key-value), ngôn ngữ, cổng, đường dẫn, bật/tắt tính năng |

#### Tiêm Phụ Thuộc (Dependency Injection)

Các service được khởi tạo trong `app.New()` và tiêm vào handler:

```go
monitorSvc  := service.NewMonitorService()
siteSvc     := service.NewSiteService(db, taskQueue)
sslSvc      := service.NewSSLService(db)
// ...
siteHandler := v1.NewSiteHandler(siteSvc, sslSvc)
```

---

### 2.5 Lược Đồ Cơ Sở Dữ Liệu

**Vị trí:** `internal/database/migrations/` (3 migration)

#### Migration 001 — Lược Đồ Chính (17 bảng)

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

#### Migration 002 — Bảng Chỉ Số Giám Sát (4 bảng)

Tất cả các bảng chỉ số đều có cùng cấu trúc cột:

```sql
-- Columns: id, timestamp, cpu_percent, mem_percent, mem_used, mem_total,
--          swap_percent, disk_percent, disk_used, disk_total, disk_read,
--          disk_write, net_sent, net_recv, load1, load5, load15

monitor_metrics_raw   -- 1-minute granularity     (retention: 2 days)
monitor_metrics_5m    -- 5-minute aggregation      (retention: 7 days)
monitor_metrics_1h    -- 1-hour aggregation        (retention: 90 days)
monitor_metrics_1d    -- 1-day aggregation         (retention: 365 days)
```

#### Migration 003 — Cài Đặt Tường Lửa (1 bảng)

```sql
firewall_settings  (key, value, updated_at)
```

**Tổng cộng: 22 bảng qua 3 migration.**

---

### 2.6 Hệ Thống Cài Đặt Phần Mềm

**Vị trí:** `internal/service/installer/`

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

#### Mẫu Registry

`DefaultRegistry()` trả về tất cả 8 installer. Mỗi installer sử dụng `SetupServerDir()` để tạo cấu trúc thư mục nhất quán:

```
/ITDLUPanel/server/<software>/
  ├── conf → /etc/<software>/          (symlink)
  ├── logs → /var/log/<software>/      (symlink)
  └── data → /var/lib/<software>/      (symlink)
```

#### Các Installer

| Installer | File | Số dòng | Mô tả |
|-----------|------|--------:|-------|
| **Nginx** | `nginx.go` | 8262 | Repo chính thức, chuyển đổi phiên bản stable/mainline |
| **Apache** | `apache.go` | 3353 | Apache2 với quản lý module |
| **OpenLiteSpeed** | `ols.go` | 3544 | Web server thay thế |
| **PHP** | `php.go` | 5150 | PHP-FPM, nhiều phiên bản, cấu hình extension |
| **MySQL** | `mysql.go` | 4034 | MySQL/MariaDB, tạo user, khởi tạo DB |
| **Redis** | `redis.go` | 2965 | Bộ nhớ đệm, cấu hình, persistence |
| **Pure-FTPd** | `pureftpd.go` | 2511 | Máy chủ FTP tích hợp PAM |
| **phpMyAdmin** | `phpmyadmin.go` | 5150 | Giao diện quản lý DB, tăng cường bảo mật |

---

### 2.7 Tạo VHost

**Vị trí:** `internal/service/vhost/`

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

#### Các Triển Khai

| Generator | Số dòng | Đường dẫn cấu hình | Tính năng |
|-----------|--------:|---------------------|-----------|
| **Nginx** | 349 | `/etc/nginx/sites-available/<domain>` | Chuyển hướng HTTP→HTTPS, PHP-FPM upstream, header bảo mật (X-Frame-Options, X-Content-Type-Options, CSP), hỗ trợ ACME challenge, chặn đường dẫn cấm (.env, .git, .htaccess) |
| **Apache** | 164 | `/etc/apache2/sites-available/<domain>.conf` | Chỉ thị VirtualHost, module SSL, cấu hình module PHP, hỗ trợ .htaccess |
| **OpenLiteSpeed** | 173 | Cấu hình OLS listener | Cấu hình listener + context, định tuyến tĩnh/động |

---

### 2.8 Kiến Trúc WebSocket

**Vị trí:** `internal/websocket/` (Hub) và `internal/api/ws/` (handler)

#### Mẫu Hub

```go
type Hub struct {
    clients    map[string]*Client
    broadcast  chan []byte
    register   chan *Client
    unregister chan *Client
    mu         sync.RWMutex
}
```

Hub chạy một vòng lặp sự kiện chính xử lý các thao tác đăng ký/hủy đăng ký/phát sóng. Nó cung cấp `ClientCount()` và `BroadcastJSON()` để quản lý các client đang kết nối.

#### WebSocket Terminal

| Khía cạnh | Chi tiết |
|-----------|----------|
| **Đường dẫn** | `/api/v1/terminal` |
| **Xác thực** | JWT qua tham số query `?token=<jwt>` |
| **Quyền** | Yêu cầu vai trò `terminal.access` |
| **Giao thức** | Tương thích xterm.js; stdin/stdout hai chiều |
| **Thay đổi kích thước** | `{"type":"resize","cols":80,"rows":24}` |
| **PTY** | Cấp phát qua `creack/pty`; mỗi phiên một Bash shell |
| **Tính năng** | MOTD khi kết nối, tham số `?cwd=` tùy chọn, dọn dẹp phiên khi ngắt kết nối |

#### WebSocket Giám Sát

| Khía cạnh | Chi tiết |
|-----------|----------|
| **Đường dẫn** | `/api/v1/monitor/realtime` |
| **Xác thực** | JWT Bearer token trong header Authorization |
| **Khoảng thời gian** | Phát sóng chỉ số mỗi **2 giây** |
| **Dữ liệu** | CPU%, bộ nhớ%, ổ đĩa%, I/O mạng, load average |
| **Sự kiện** | `websocket.EventMetrics` |
| **Vòng đời** | Đăng ký khi kết nối → vòng lặp ticker → hủy đăng ký khi ngắt kết nối |

---

### 2.9 Các Hệ Thống Nền

#### Hàng Đợi Tác Vụ

**File:** `internal/task/queue.go` (420 dòng)

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

| Phương thức | Mô tả |
|-------------|-------|
| `Start()` / `Stop()` | Điều khiển vòng đời |
| `RegisterHandler(type, fn)` | Đăng ký handler cho loại tác vụ |
| `Enqueue(task)` | Thêm tác vụ vào hàng đợi (trạng thái: pending) |
| `Cancel(id)` | Hủy tác vụ đang chạy |
| `GetTask(id)` | Lấy thông tin một tác vụ |
| `ListTasks()` | Liệt kê tất cả tác vụ |
| `GetTaskSummary()` | Đếm số lượng theo trạng thái |
| `GetTaskLog(id)` | Truy xuất log thực thi |

**Các trạng thái tác vụ:** `pending` → `running` → `completed` | `failed` | `cancelled`

**Sử dụng cho:** Cài đặt phần mềm, gia hạn SSL, sao lưu, thao tác cơ sở dữ liệu.

#### Bộ Thu Thập Chỉ Số

**File:** `internal/service/metrics_collector.go` (509 dòng)

Khởi tạo hai goroutine nền:

1. **Vòng lặp thu thập** — Truy vấn `MonitorService` mỗi 60 giây → chèn vào `monitor_metrics_raw`
2. **Vòng lặp tổng hợp** — Cuộn dữ liệu raw thành các bản tóm tắt 5m/1h/1d

**Chính sách lưu giữ:**

| Độ phân giải | Thời gian lưu giữ |
|-------------|-------------------|
| Raw (1 phút) | 2 ngày |
| 5 phút | 7 ngày |
| 1 giờ | 90 ngày |
| 1 ngày | 365 ngày |

Cài đặt được đọc từ bảng `settings` trong DB và có thể được quản trị viên tùy chỉnh.

#### Tự Động Gia Hạn SSL

**File:** `internal/service/ssl_renewer.go` (94 dòng)

| Tham số | Giá trị |
|---------|---------|
| Khoảng thời gian kiểm tra | 24 giờ |
| Ngưỡng hết hạn | 30 ngày |
| Tuân thủ cờ `AutoRenew` theo chứng chỉ | ✓ |
| Tự động hóa ACME Let's Encrypt | ✓ |

Chạy khi khởi động và sau đó theo ticker định kỳ cho đến khi context bị hủy.

---

## 3. Kiến Trúc Frontend

### 3.1 Công Nghệ Sử Dụng

| Công nghệ | Phiên bản | Mục đích |
|------------|-----------|----------|
| React | 19.2.4 | Framework giao diện |
| TypeScript | 5.9.3 | An toàn kiểu dữ liệu |
| Vite | 8.0.1 | Công cụ build, HMR |
| Ant Design | 6.3.3 | Thư viện component giao diện |
| Tailwind CSS | 4.2.2 | CSS tiện ích |
| Zustand | 5.0.12 | Quản lý trạng thái |
| Monaco Editor | 4.7.0 | Trình soạn thảo code |
| xterm.js | 6.0.0 | Trình giả lập terminal |
| Recharts | 3.8.0 | Biểu đồ và đồ thị |
| Axios | 1.13.6 | HTTP client |
| React Router | 6.30.3 | Định tuyến phía client |
| i18next | 25.8.20 | Quốc tế hóa (en, vi) |

### 3.2 Cấu Trúc Thư Mục

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

### 3.3 Quản Lý Trạng Thái (Zustand)

#### `authStore` (33 dòng)

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

#### `themeStore` (23 dòng)

```typescript
interface ThemeState {
  mode: 'light' | 'dark';
  toggle(): void;
  setMode(mode: 'light' | 'dark'): void;
}
// Persisted to localStorage as "itdlu_theme"
```

#### `taskStore` (179 dòng)

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

### 3.4 Hệ Thống Giao Diện

Hook `usePalette()` cung cấp hệ thống màu nhất quán cho cả chế độ sáng và tối:

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

| Chế độ | Nền Card | Màu nhấn | Văn bản |
|--------|----------|-----------|---------|
| Tối | `#111827` | `#38BDF8` | `#E2E8F0` |
| Sáng | `#FFFFFF` | `#2563EB` | `#1E293B` |

Bộ font monospace: `"JetBrains Mono", "Fira Code", "Cascadia Code", monospace`

Theme API của Ant Design được sử dụng cho giao diện ở cấp component. Giá trị chế độ từ `useThemeStore()` điều khiển cả việc chọn palette và `algorithm` (tối/sáng) của Ant Design.

### 3.5 Các Module Trang

| Trang | Route | Kích thước | Tính năng chính |
|-------|-------|----------:|-----------------|
| **Đăng nhập** | `/login` | 5.7 KB | Tên người dùng/mật khẩu, xác minh TOTP, ghi nhớ đăng nhập |
| **Bảng điều khiển** | `/` | 36.4 KB | Thống kê hệ thống, thông tin máy chủ, thao tác nhanh, biểu đồ hoạt động |
| **Website** | `/websites` | 45.2 KB | CRUD website, quản lý domain, chọn PHP, gắn SSL |
| **Cơ sở dữ liệu** | `/databases` | 23.5 KB | CRUD DB, quyền người dùng, hộp thoại sao lưu/khôi phục |
| **FTP** | `/ftp` | 9.7 KB | Quản lý tài khoản FTP, đặt lại mật khẩu |
| **Quản lý file** | `/files` | 15.7 KB + 43 KB editor | Trình duyệt file, trình soạn thảo Monaco tích hợp, tải lên/tải xuống |
| **Docker** | `/docker` | 17.2 KB | Danh sách container, tạo, khởi động/dừng, xem log, exec terminal |
| **Giám sát** | `/monitor` | 1.8 KB + 29.6 KB + 25 KB | Chỉ số thời gian thực, biểu đồ lịch sử, bảng tiến trình |
| **Bảo mật** | `/security` | 9.1 KB | Quản lý SSL, cài đặt chống brute-force |
| **Tường lửa** | `/firewall` | 38.2 KB | Quản lý quy tắc UFW, lọc IP/cổng |
| **Nhật ký** | `/logs` | 22 KB | Xem log, lọc, tìm kiếm |
| **Terminal** | `/terminal` | 13.4 KB | Trình giả lập terminal qua WebSocket + xterm.js |
| **Cron** | `/cron` | 29.8 KB | Bộ lập lịch cron job, lịch sử thực thi |
| **Kho ứng dụng** | `/appstore` | 41.1 KB | Trình cài đặt phần mềm, chọn phiên bản, theo dõi trạng thái |
| **Cài đặt** | `/settings` | 15.6 KB | Cấu hình panel: ngôn ngữ, cổng, đường dẫn, SSL |
| **Người dùng** | `/users` | 11.8 KB | CRUD người dùng, gán vai trò, quản lý 2FA |

### 3.6 Định Tuyến

**File:** `web/src/router/index.tsx` (74 dòng)

```
/login              AuthRoute → LoginPage
                    (chuyển hướng người dùng đã xác thực)

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

*                   404 → Chuyển hướng về /
```

**Bảo vệ Route:**
- `ProtectedRoute` — Kiểm tra `authStore.isAuthenticated`; chuyển hướng đến `/login` nếu chưa xác thực
- `AuthRoute` — Chuyển hướng người dùng đã xác thực ra khỏi trang đăng nhập
- Fallback 404 chuyển hướng về `/`

### 3.7 API Client

**File:** `web/src/services/api.ts` (41 dòng)

```typescript
const api = axios.create({
  baseURL: '/api/v1',
});

// Request interceptor: adds Authorization header + X-CSRF-Token
// Response interceptor: global error handling (401 → logout)
```

---

## 4. Sơ Đồ Luồng Dữ Liệu

### 4.1 Luồng HTTP Request

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

### 4.2 Luồng Tác Vụ Nền

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

### 4.3 Luồng WebSocket (Terminal)

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

### 4.4 Luồng WebSocket (Giám Sát)

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

### 4.5 Thu Thập & Tổng Hợp Chỉ Số

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

## 5. Cấu Hình

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

| Mục | Khóa | Mặc định | Mô tả |
|-----|------|----------|-------|
| `server.host` | string | `0.0.0.0` | Địa chỉ lắng nghe |
| `server.port` | int | `8888` | Cổng HTTP/HTTPS |
| `server.ssl` | bool | `false` | Bật HTTPS |
| `server.ssl_cert` | string | `""` | Đường dẫn chứng chỉ TLS |
| `server.ssl_key` | string | `""` | Đường dẫn khóa riêng TLS |
| `database.path` | string | `data/panel.db` | Đường dẫn cơ sở dữ liệu SQLite |
| `auth.jwt_secret` | string | — | Khóa ký JWT (tự động tạo) |
| `auth.access_token_ttl` | int | `900` | Thời gian sống access token (15 phút) |
| `auth.refresh_token_ttl` | int | `604800` | Thời gian sống refresh token (7 ngày) |
| `auth.bcrypt_cost` | int | `12` | Hệ số chi phí băm bcrypt |
| `paths.base` | string | `/ITDLUPanel` | Thư mục gốc cài đặt |
| `paths.backup` | string | `/ITDLUPanel/backup` | Nơi lưu trữ bản sao lưu |
| `paths.logs` | string | `/ITDLUPanel/logs` | Nhật ký ứng dụng |
| `paths.wwwroot` | string | `/ITDLUPanel/wwwroot` | Thư mục gốc website |
| `paths.vhost` | string | `/ITDLUPanel/server/vhost` | Cấu hình vhost được tạo |
| `panel.language` | string | `en` | Ngôn ngữ mặc định (en/vi) |
| `panel.admin_path` | string | `/` | Đường dẫn URL panel quản trị |
| `panel.setup_completed` | bool | `false` | Cờ thiết lập ban đầu |

---

## 6. Thư Viện Phụ Thuộc Chính

### Thư Viện Go (`go.mod` — Go 1.25.0)

| Gói | Phiên bản | Mục đích |
|-----|-----------|----------|
| `github.com/gin-gonic/gin` | 1.12.0 | Framework định tuyến HTTP |
| `github.com/gorilla/websocket` | 1.5.3 | Hỗ trợ WebSocket |
| `github.com/golang-jwt/jwt/v5` | 5.3.1 | Xử lý JWT token |
| `golang.org/x/crypto` | 0.49.0 | Băm mật khẩu bcrypt |
| `modernc.org/sqlite` | 1.47.0 | SQLite nhúng thuần Go |
| `github.com/creack/pty` | 1.1.24 | Giả lập terminal PTY |
| `github.com/rs/zerolog` | 1.34.0 | Ghi log cấu trúc JSON |
| `github.com/shirou/gopsutil/v3` | 3.24.5 | Chỉ số hệ thống (CPU, RAM, ổ đĩa, mạng) |
| `github.com/pquerna/otp` | 1.5.0 | Triển khai TOTP 2FA |
| `github.com/google/uuid` | 1.6.0 | Tạo UUID |
| `github.com/go-playground/validator/v10` | 10.30.1 | Xác thực dữ liệu đầu vào |
| `gopkg.in/natefinch/lumberjack.v2` | 2.2.1 | Xoay vòng file log |
| `github.com/gin-contrib/gzip` | — | Middleware nén phản hồi |

### Thư Viện Frontend (`web/package.json`)

| Gói | Phiên bản | Mục đích |
|-----|-----------|----------|
| `react` | 19.2.4 | Framework giao diện |
| `react-router-dom` | 6.30.3 | Định tuyến phía client |
| `zustand` | 5.0.12 | Quản lý trạng thái |
| `antd` | 6.3.3 | Thư viện component giao diện |
| `@xterm/xterm` | 6.0.0 | Trình giả lập terminal |
| `@monaco-editor/react` | 4.7.0 | Trình soạn thảo code |
| `recharts` | 3.8.0 | Biểu đồ và đồ thị |
| `axios` | 1.13.6 | HTTP client |
| `i18next` | 25.8.20 | Quốc tế hóa |
| `tailwindcss` | 4.2.2 | Framework CSS tiện ích |
| `vite` | 8.0.1 | Công cụ build với HMR |
| `typescript` | 5.9.3 | An toàn kiểu dữ liệu |

---

## Phụ Lục: Thống Kê

| Chỉ số | Số lượng |
|--------|--------:|
| File mã nguồn Go | ~60 |
| File TypeScript/TSX | ~65 |
| Số dòng service backend | ~9.769 |
| Số dòng handler backend | ~4.994 |
| Số dòng installer | ~34.867 |
| Bảng cơ sở dữ liệu | 22 |
| Nhóm handler REST API | 18 |
| Endpoint WebSocket | 2 |
| Tầng middleware | 10 |
| Installer phần mềm | 8 |
| Generator VHost | 3 |
| Zustand store | 3 |
| Trang frontend | 17 (16 route) |
| Ngôn ngữ hỗ trợ | 2 (en, vi) |
| Thư viện Go trực tiếp | 20+ |
| Thư viện NPM trực tiếp | 10+ |
