# ITDLUPanel — Kiến Trúc Hệ Thống

> **Phiên bản:** 1.0.0 · **Go 1.26** · **React 19** · **Cập nhật lần cuối:** 2026-06-24

---

## 1. Tổng Quan

ITDLUPanel là một **bảng điều khiển quản lý máy chủ Linux đóng gói thành một tệp nhị phân duy nhất**, được xây dựng cho Đại học Đà Lạt. Toàn bộ stack — backend Go, frontend React, và cơ sở dữ liệu SQLite — được đóng gói thành một file thực thi duy nhất ~60MB với không có phụ thuộc runtime bên ngoài.

```
┌──────────────────────────────────────────────────────────────┐
│               Trình duyệt (React 19 SPA)                     │
│   Ant Design v6 · Tailwind v4 · Monaco Editor · xterm.js   │
│   Recharts · Zustand · TanStack Query · i18next            │
└─────────────────────┬────────────────────────────────────────┘
                      │  REST API (~220 endpoint)  │  WebSocket (2)
                      │  HTTPS / JWT Bearer       │  PTY Terminal + Monitor
                      ▼                            ▼
┌──────────────────────────────────────────────────────────────┐
│               Single Go Binary  (go:embed SPA)                │
│                                                              │
│  ┌──────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │   Gin    │→ │ 27 REST Handlers  │→ │ 71 Services      │   │
│  │  Router  │  │                  │  │ 25 Installers     │   │
│  └──────────┘  └──────────────────┘  │ 4 Vhost Gens     │   │
│  ┌──────────┐  ┌──────────────────┐  │ WAF (HAProxy +   │   │
│  │   WS     │→ │  Terminal WS     │  │   Coraza SPOA)   │   │
│  │   Hub    │  │  Monitor WS      │  └────────┬────────┘   │
│  └──────────┘  └──────────────────┘           │            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Middleware Stack (11 layers)                          │  │
│  │  Recovery·Logger·SecurityHeaders·CORS·Compress·Lang   │  │
│  │  RateLimit·CSRF·AuditLog·Auth(JWT)·RBAC           │  │
│  └──────────────────────────────────────────────┬─────────┘  │
│  ┌──────────────────────────────────────────────┴─────────┐  │
│  │  SQLite (21 migrations → 40+ bảng)  modernc.org/sqlite  │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             │  systemctl · exec · /proc · Docker API
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                 Linux Host (Ubuntu / Debian)                   │
│   Nginx/Apache/OLS · PHP-FPM · MySQL/MariaDB · PostgreSQL   │
│   Redis · Memcached · Docker · Fail2ban · PureFTPd          │
│   HAProxy · Coraza WAF                                        │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Ngăn Xếp Công Nghệ

### 2.1 Backend

| Thành phần       | Công nghệ                         | Phiên bản        |
|-----------------|-----------------------------------|-----------------|
| Ngôn ngữ        | Go                                | 1.26.0          |
| HTTP Framework  | Gin                               | 1.12.0          |
| Cơ sở dữ liệu  | SQLite (CGO-free)                 | modernc.org/sqlite 1.47.0 |
| WebSocket       | gorilla/websocket                   | 1.5.3           |
| Auth / JWT      | golang-jwt/jwt                   | 5.3.1           |
| 2FA (TOTP)     | pquerna/otp                      | 1.5.0           |
| Hash mật khẩu  | bcrypt (golang.org/x/crypto)      | —               |
| Giám sát hệ thống| gopsutil                      | 3.24.5          |
| Terminal PTY    | creack/pty                       | 1.1.24          |
| Logging         | zerolog + lumberjack               | 1.34.0          |
| Validation      | go-playground/validator           | 10.30.1         |
| Object Storage  | minio-go                         | 7.0.100         |
| OAuth2          | golang.org/x/oauth2              | 0.36.0          |
| FTP Client      | jlaffaye/ftp                    | 0.2.0           |
| TLS Multiplexing| soheilhy/cmux                   | 0.1.5           |

### 2.2 Frontend

| Thành phần      | Công nghệ                       | Phiên bản         |
|----------------|----------------------------------|------------------|
| Framework      | React                           | 19.2.4          |
| Ngôn ngữ       | TypeScript                      | 5.9.3           |
| Thư viện UI    | Ant Design                      | 6.3.3           |
| Công cụ build  | Vite                            | 8.0.1           |
| CSS            | Tailwind CSS                    | 4.2.2           |
| Trạng thái     | Zustand                         | 5.0.12          |
| Data Fetching  | TanStack React Query            | 5.91.2          |
| HTTP Client    | Axios                           | 1.13.6          |
| Biểu đồ        | Recharts                        | 3.8.0           |
| Trình soạn thảo| Monaco Editor                   | 4.7.0           |
| Terminal       | xterm.js                        | 6.0.0           |
| Routing        | React Router                    | 6.30.3          |
| i18n           | i18next                         | 25.8.20          |
| Ngày           | Day.js                          | 1.11.20         |

---

## 3. Kiến Trúc Backend

### 3.1 Thiết Kế Phân Lớp

```
Yêu cầu HTTP
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  Middleware Stack (11 layers)                              │
│  1. Recovery   — khôi phục panic với stack trace         │
│  2. Logger     — structured request logging (zerolog)        │
│  3. Security   — X-Frame-Options, CSP, X-Content-Type      │
│  4. CORS       — chia sẻ tài nguyên cross-origin          │
│  5. Compress   — nén response gzip                          │
│  6. Language   — phát hiện Accept-Language cho i18n          │
│  7. RateLimit — 300 req/phút/IP (in-memory token bucket)  │
│  8. CSRF      — xác thực cookie + X-CSRF-Token           │
│  9. Audit      — POST/PUT/DELETE → bảng audit_logs         │
│ 10. Auth       — xác thực JWT token (HS256)                 │
│ 11. RBAC     — kiểm soát truy cập theo quyền (5-phút cache)│
└────────────────────────────────────┬───────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────┐
│  API Handlers (27 tệp)                                      │
│  auth · dashboard · site · database · redis · ftp ·       │
│  file · docker · docker_cleanup · docker_compose · cron · │
│  security · waf · ssl · backup · ftp_storage ·             │
│  cloud_storage · software · monitor · task · user ·        │
│  role · plugin · settings · notification · log             │
└────────────────────────────────────┬───────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────┐
│  Service Layer (71 services)                               │
│  Business logic, validation, system calls, Docker API       │
│  WAF (HAProxy + Coraza SPOA), installer registry           │
└────────────────────────────────────┬───────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────┐
│  Data Layer                                                 │
│  SQLite (17 migrations → 38 bảng)                          │
│  File system · Docker socket · systemctl · /proc · crontab  │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Cấu Trúc Source Code

```
cmd/panel/main.go                # Điểm khởi chạy, CLI sub-commands
internal/
├── api/v1/                     # 27 tệp REST handler
│   ├── auth.go                    Đăng nhập, 2FA, refresh token, profile
│   ├── dashboard.go               Tổng quan hệ thống, trạng thái phần mềm
│   ├── site.go                   Website CRUD + 55+ sub-endpoints
│   ├── database.go               MySQL/MariaDB/PostgreSQL CRUD + sao lưu
│   ├── redis.go                 Quản lý Redis (config, clients, memory)
│   ├── ftp.go                   FTP account CRUD + batch operations
│   ├── file.go                  Trình duyệt file, editor, upload/download
│   ├── docker.go                Containers, images, networks, volumes
│   ├── docker_cleanup.go         Quy tắc dọn dẹp, nhật ký, stats, dry-run
│   ├── docker_compose.go         Docker Compose projects
│   ├── cron.go                  Cron job CRUD + run/toggle
│   ├── security.go              Firewall, SSH, Fail2ban, SSH keys
│   ├── waf.go                  Trang WAF, rules, logs, IP lists, stats
│   ├── ssl.go                  Quản lý cert, Let's Encrypt, DNS-01
│   ├── backup.go               Backup CRUD, restore, download
│   ├── ftp_storage.go          Quản lý FTP storage backend
│   ├── cloud_storage.go        S3, Google Drive, OneDrive + OAuth
│   ├── software.go             70+ endpoints: cài đặt, PHP, MariaDB,
│   │                           PostgreSQL, MongoDB, Nginx, v.v.
│   ├── monitor.go             Chỉ số hệ thống, danh sách tiến trình, disk
│   ├── task.go                Trạng thái tác vụ nền, nhật ký, hủy
│   ├── user.go                User CRUD + gán resource
│   ├── role.go               RBAC role management
│   ├── plugin.go              Plugin CRUD, cài đặt/gỡ cài đặt
│   ├── settings.go            Cài đặt panel (port, SSL, language)
│   ├── notification.go         Channels, rules, templates, logs
│   ├── system.go              System info, OS detection, version
│   └── log.go               Nhật ký panel, website, SSH, audit
├── api/ws/                    # 2 WebSocket handlers
│   ├── terminal.go             PTY terminal (xterm.js ↔ creack/pty)
│   └── monitor.go             Chỉ số hệ thống thời gian thực (2s interval)
├── app/                       # Application core
│   ├── app.go                Bootstrap, TLS multiplexing, graceful shutdown
│   ├── router.go             Route registration, service wiring
│   ├── auth_middleware.go    JWT, RBAC, CSRF, rate-limit, audit
│   └── middleware.go         Recovery, logger, CORS, compression, i18n
├── service/                   # 71 dịch vụ business-logic
│   ├── auth_service.go          Phát hành JWT, xác thực, refresh
│   ├── totp_service.go          Tạo và xác minh TOTP 2FA
│   ├── jwt.go                   Tạo JWT token
│   ├── user_service.go          Quản lý người dùng
│   ├── role_service.go          RBAC role và quản lý quyền
│   ├── site_service.go          Quản lý website + tạo vhost
│   ├── site_defaults.go         Tạo trang mặc định
│   ├── site_statistics_service.go Thống kê nhật ký truy cập
│   ├── ssl_service.go           Quản lý chứng chỉ, Let's Encrypt
│   ├── ssl_renewer.go          Tự động gia hạn SSL qua cron
│   ├── database_service.go       Thao tác MySQL/MariaDB
│   ├── redis_service.go         Thao tác Redis
│   ├── ftp_service.go           Quản lý tài khoản PureFTPd
│   ├── file_service.go          Thao tác file, nén, tìm kiếm
│   ├── cron_service.go          Thực thi cron job, ghi nhật ký
│   ├── firewall_service.go       Quản lý UFW, chặn cổng
│   ├── security_service.go       Cấu hình SSH, Fail2ban, SSH keys
│   ├── waf_service.go            Quản lý trang WAF, cấu hình HAProxy
│   ├── waf_log_service.go       Phân tích và tổng hợp nhật ký WAF
│   ├── haproxy_manager.go         Cài đặt và cấu hình HAProxy
│   ├── coraza_spoa.go           Tích hợp Coraza SPOA
│   ├── geo_service.go           Tra cứu GeoIP cho WAF
│   ├── backup_service.go         Tạo sao lưu, restore, retention
│   ├── backup_encryption.go     Mã hóa backup (AES-256-GCM)
│   ├── backup_incremental.go    Incremental snapshots qua rsync+hardlinks
│   ├── backup_upload_service.go  Upload cloud không đồng bộ, resumable
│   ├── ftp_storage_service.go    Upload/download sao lưu FTP storage
│   ├── cloud_storage_service.go  Sao lưu S3/GDrive/OneDrive
│   ├── software_service.go        Cài đặt phần mềm, PHP, tinh chỉnh DB
│   ├── docker_service.go         Docker Engine API wrapper
│   ├── docker_compose_service.go Quản lý Docker Compose
│   ├── docker_cleanup_service.go  Dọn dẹp container/image/volume
│   ├── monitor_service.go         Chỉ số hệ thống qua gopsutil
│   ├── metrics_collector.go       Tổng hợp metrics, chính sách retention
│   ├── notification_service.go    Gửi Email, Telegram, webhook
│   ├── email_service.go         Gửi email SMTP
│   ├── telegram_service.go        Tích hợp Telegram Bot API
│   ├── log_service.go           Xoay nhật ký, phân tích, tail
│   ├── settings_service.go        Quản lý cấu hình panel
│   ├── terminal_service.go        Quản lý PTY session
│   ├── permission_cache.go       RBAC permission cache (in-memory)
│   ├── user_resource_service.go   Theo dõi tài nguyên theo user (CPU, RAM, disk)
│   ├── installer/                 # 25 trình cài đặt phần mềm
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
│   │   └── ...                   # Tất cả 25 tệp installer
│   └── vhost/                   # 4 trình tạo vhost
│       ├── nginx.go              Apache
│       ├── apache.go             OpenLiteSpeed
│       ├── ols.go
│       └── vhost.go            Shared base vhost logic
├── database/                    # SQLite, 21 migrations (001-020), models
├── config/                    # JSON config reader/writer
├── pkg/                        # crypto · errors · logger · response · validator
├── i18n/                       # Bản dịch EN/VI backend
├── task/                       # Background task queue (4 workers)
├── websocket/                  # WS hub, broadcast, events
├── system/                     # Shell execution, OS detection
└── plugin/                     # Plugin interface và manager
```

---

## 4. Ngăn Xếp Middleware

| Thứ tự | Middleware      | Mục đích                                    |
|--------|-----------------|---------------------------------------------|
| 1      | Recovery       | Khôi phục panic với stack trace           |
| 2      | Logger         | Ghi nhật ký request có cấu trúc (zerolog)  |
| 3      | SecurityHeaders | X-Frame-Options, CSP, X-Content-Type      |
| 4      | CORS           | Chia sẻ tài nguyên cross-origin           |
| 5      | Compress       | Nén response gzip                          |
| 6      | Language       | Phát hiện Accept-Language cho i18n          |
| 7      | RateLimit     | 300 requests/phút/IP (in-memory)          |
| 8      | CSRF          | Xác thực cookie + X-CSRF-Token           |
| 9      | Audit          | POST/PUT/DELETE → bảng audit_logs          |
| 10     | Auth           | Xác thực JWT token (HS256)                 |
| 11     | RBAC          | Kiểm soát truy cập theo quyền (5-phút cache)|

---

## 5. Xác Thực & Ủy Quyền

- **JWT tokens:** Access (15 phút) + Refresh (7 ngày), ký HS256
- **2FA:** TOTP (RFC 6238) qua pquerna/otp với cấu hình mã QR
- **Mật khẩu:** bcrypt cost=12
- **Ba vai trò RBAC:** Admin (`*`), Operator (có phạm vi), Viewer (chỉ đọc)
- **Không gian quyền:** `sites.*`, `databases.*`, `files.*`, `docker.*`, `docker.cleanup`, `cron.*`, `logs.*`, `backup.*`, `terminal.access`, `security.*`, `software.*`, `ssl.*`, `firewall.*`, `ftp.*`, `redis.*`, `waf.*`, `software.read`, `software.manage`, `docker.read`, `docker.create`, `docker.manage`, `docker.cleanup`
- **Cache quyền:** In-memory, TTL 5 phút, tải lại từ DB khi miss
- **Wildcard matching:** `sites.*` cấp tất cả quyền `sites.X`

---

## 6. Kiến Trúc WAF

Hệ thống WAF cung cấp bảo vệ tường lửa ứng dụng web cấp doanh nghiệp sử dụng HAProxy như reverse proxy và Coraza như engine quy tắc tương thích ModSecurity.

### 6.1 Các Thành Phần

```
Lưu lượng Internet
      │
      ▼
┌──────────────────────────────────────────────────┐
│  HAProxy (Layer 7 Load Balancer + SSL Termination)│
│  ┌─────────────────────────────────────────────┐  │
│  │  • Chế độ proxy trong suốt               │  │
│  │  • SSL passthrough / offload                │  │
│  │  • Health check endpoints                 │  │
│  │  • Giới hạn kết nối (maxconn)            │  │
│  │  • Timeout (client, server)              │  │
│  │  • Lua hooks cho logic tùy chỉ            │  │
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
│  │  │  • Remote Code Execution (RCE)          │ │ │
│  │  │  • CRLF Injection                     │ │ │
│  │  │  • Path Traversal                     │ │ │
│  │  │  • PHP/Java/Node Injection            │ │ │
│  │  │  • HTTP Protocol Violations            │ │ │
│  │  └────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────┘ │
│                      │                             │
└──────────────────────│─────────────────────────────┘
                       │ (lưu lượng sạch/chặn)
                       ▼
              Backend Application Server
```

### 6.2 Các Giai Đoạn Xử Lý

| Giai đoạn | Mô tả                                  | Quy tắc áp dụng |
|-----------|----------------------------------------|------------------|
| 1         | Request headers + connection variables   | Phase 1 rules  |
| 2         | Request body (nếu có)                  | Phase 2 rules  |
| 3         | Response headers                        | Phase 3 rules  |
| 4         | Response body                          | Phase 4 rules  |
| 5         | Chỉ ghi nhật ký                        | All rules      |

### 6.3 Tính Năng WAF Chính

- **15 danh mục OWASP** được thiết lập sẵn với mức độ nghiêm trọng và ánh xạ MITRE ATT&CK
- **Trình tạo quy tắc tùy chỉnh** với phase, action, priority và log-level
- **Chặn theo địa lý** qua tích hợp MaxMind GeoIP
- **Danh sách IP** với CIDR, theo dõi số lần truy cập, tự động hết hạn và nguồn thủ công/tự động
- **Danh sách trắng/đen URI** với thứ tự ưu tiên
- **Lọc User-Agent** cho bot đã biết và mẫu độc hại
- **Tự động học chữ ký tấn công** từ phân tích nhật ký
- **Thống kê lưu lượng** — băng thông hàng giờ, thời gian phản hồi p95, số yêu cầu
- **Thống kê địa lý** — yêu cầu và chặn theo từng quốc gia
- **Phát hiện yêu cầu chậm** — ngưỡng độ trễ có thể cấu hình
- **Kịch bản Lua** — kịch bản Lua HAProxy tùy chỉnh được triển khai từ DB

---

## 7. Tích Hợp Docker

Docker management giao tiếp qua Unix socket (`/var/run/docker.sock`) sử dụng Docker API v1.41:

- **40+ endpoints:** Containers (CRUD, start/stop, logs, stats, exec), Images (list, pull, remove, search), Networks, Volumes, Compose, Daemon config
- **Docker image upload** — tải lên qua drag-and-drop với phân quyền theo user
- **Docker Compose:** Tạo, up, down, restart, remove, logs
- **Docker Cleanup:** Quy tắc theo lịch, kích hoạt theo ngưỡng disk, chế độ dry-run, nhật ký lịch sử
- **System:** Dung lượng ổ đĩa, cấu hình daemon (registry mirrors), restart/stop

---

## 8. Hệ Thống Tác Vụ Nền

Các thao tác chạy dài được thực thi không đồng bộ với tiến trình thời gian thực:

```
Yêu cầu API → Tạo Tác vụ (SQLite) → Đẩy vào Queue → Worker thực thi
                                                                │
                                                                ▼
                                                    Cập nhật tiến trình WebSocket
                                                    → Thanh tiến trình trên trình duyệt
```

- **Worker pool:** 4 workers đồng thời
- **Persistence:** Tác vụ được lưu trong SQLite
- **Cancellation:** Tác vụ có thể bị hủy giữa chừng
- **Loại tác vụ:** install, uninstall, backup, restore, extension install, stack install

---

## 9. Kiến Trúc WebSocket

```
Hub (in-memory broadcast hub)
  ├── Terminal WS  → creack/pty → bash shell → xterm.js
  └── Monitor WS  → gopsutil metrics → ticker 2s → Biểu đồ trình duyệt
```

- **Terminal:** Xác thực JWT qua `?token=<jwt>` query param; resize PTY qua JSON `{type:"resize",cols,rows}`
- **Monitor:** Đọc từ broadcast channel của hub; đẩy metrics mỗi 2 giây

---

## 10. Kiến Trúc Frontend

### 10.1 Các Module Trang (lazy-loaded)

| Trang            | Mô tả                                                |
|------------------|------------------------------------------------------|
| Dashboard        | Tổng quan hệ thống, biểu đồ live, quick actions    |
| Websites         | Site CRUD, bí danh tên miền, chuyển đổi PHP, batch ops|
| Databases        | MySQL/MariaDB/PostgreSQL/MongoDB CRUD, backup/restore|
| Files            | Trình duyệt file, Monaco editor, bookmarks, nén      |
| Terminal         | Multi-tab xterm.js qua WebSocket                     |
| Docker           | Containers, images, networks, volumes, compose         |
| Docker Cleanup   | Quy tắc dọn dẹp, nhật ký, stats, dry-run           |
| Security         | Cấu hình SSH, Fail2ban, chặn IP, SSH keys           |
| WAF              | Sites, rules, logs, danh sách IP, thống kê         |
| Firewall         | Quy tắc UFW, trạng thái cổng                        |
| Monitor          | Chỉ số hệ thống thời gian thực + lịch sử          |
| Cron             | Cron CRUD với trình tạo schedule                    |
| Logs             | Nhật ký panel, website, SSH, audit                 |
| AppStore         | Cài đặt/gỡ cài đặt phần mềm với tiến trình        |
| FTP / FTP Storage| Tài khoản FTP, đích sao lưu FTP từ xa            |
| Cloud Storage    | S3, Google Drive, OneDrive backup backends          |
| Backups          | Quản lý sao lưu, restore, retention                |
| Notifications    | Kênh thông báo, rules, templates                    |
| Users            | Quản lý người dùng với RBAC                       |
| Settings         | Cài đặt panel, SSL, notifications                   |
| Login            | Auth + 2FA                                         |

### 10.2 Quản Lý Trạng Thái (Zustand)

| Store           | Mục đích                                      |
|-----------------|-----------------------------------------------|
| `auth`          | JWT tokens, profile người dùng, login/logout |
| `theme`         | Chế độ tối/sáng, màu palette                |
| `settings`      | Cấu hình panel (language, port, paths)       |
| `task`          | Theo dõi tiến trình tác vụ nền               |
| `notification`   | Kênh notification, số thông báo chưa đọc    |

---

## 11. Lược Đồ Cơ Sở Dữ Liệu (SQLite — 38 bảng)

### Cốt lõi

| Bảng              | Mục đích                                           |
|-------------------|----------------------------------------------------|
| `users`           | Tài khoản (username, email, bcrypt hash, 2FA secret)|
| `roles`           | RBAC roles với mảng JSON permissions             |
| `user_roles`      | Ánh xạ User ↔ Role                              |
| `settings`       | Cài đặt panel dạng key-value                    |
| `schema_migrations`| Theo dõi migration                              |

### Ứng dụng

| Bảng               | Mục đích                                          |
|--------------------|---------------------------------------------------|
| `sites`            | Websites (domain, root, PHP version, web server, SSL)|
| `domains`          | Bí danh tên miền cho mỗi site                  |
| `databases`        | MySQL/MariaDB/PostgreSQL/MongoDB databases    |
| `ftps`             | Tài khoản FTP                                   |
| `crons`            | Cron jobs (schedule, command, status)            |
| `tasks`            | Background tasks                                 |
| `software`         | Registry phần mềm đã cài đặt                   |
| `plugins`          | Metadata plugin                                 |
| `backups`          | Bản ghi sao lưu (incremental + full)          |
| `firewall_rules`  | Quy tắc firewall                                |
| `audit_logs`        | Audit trail thao táá ghi                      |
| `docker_containers`| Bản ghi Docker container                        |
| `docker_cleanup_rules`| Quy tắc dọn dẹp với lịch                     |
| `docker_cleanup_logs`| Lịch sử thực thi dọn dẹp                  |
| `ftp_storages`      | Cấu hình FTP storage                          |
| `cloud_storages`    | Cấu hình S3/GDrive/OneDrive                 |
| `notification_channels`| Kênh Email/Telegram/Webhook              |
| `notification_rules`| Alert rules và triggers                        |
| `notification_logs`| Lịch sử gửi notification                        |
| `backup_uploads`   | Tiến trình upload cloud, chunk, resume state   |
| `cron_storages`   | Ánh xạ cron → storage (đích remote theo job)   |

### WAF (migrations 016 & 017)

| Bảng                  | Mục đích                                    |
|------------------------|----------------------------------------------|
| `waf_sites`            | Cấu hình trang được bảo vệ                |
| `waf_rules`            | Quy tắc tùy chỉnh và OWASP                 |
| `waf_owasp_categories`  | Toggleable danh mục quy tắc OWASP         |
| `waf_logs`             | Audit trail đầy đủ các quyết định WAF      |
| `waf_stats`            | Thống kê tấn công tổng hợp                 |
| `waf_traffic_stats`    | Thống kê băng thông và độ trễ hàng giờ    |
| `waf_settings`         | Cấu hình WAF toàn cục                     |
| `waf_ip_list`          | Danh sách trắng/đen IP, CIDR, theo dõi truy cập|
| `waf_uri_list`         | URI whitelist/blacklist                     |
| `waf_ua_list`          | User-Agent whitelist/blacklist              |
| `waf_attack_signatures` | Mẫu tấn công tự động học                   |
| `waf_slow_requests`    | Bản ghi phát hiện yêu cầu chậm             |
| `waf_geo_stats`        | Thống kê yêu cầu và chặn theo quốc gia    |
| `waf_lua_scripts`      | Kịch bản Lua HAProxy tùy chỉnh             |

---

## 12. Tính Năng Bảo Mật

| Tính năng         | Triển khai                                    |
|-------------------|-------------------------------------------------|
| Xác thực          | JWT HS256 (access 15 phút + refresh 7 ngày)  |
| 2FA               | TOTP (RFC 6238)                               |
| Mật khẩu          | bcrypt cost=12                                  |
| CSRF              | Cookie + X-CSRF-Token header                 |
| Giới hạn tốc độ   | 300 req/phút/IP (in-memory)                   |
| Audit Trail       | Tất cả writes → `audit_logs`                 |
| RBAC              | Admin / Operator / Viewer + custom roles      |
| Security Headers   | X-Frame-Options, CSP, X-Content-Type-Options|
| TLS               | HTTPS tích hợp (cmux HTTP+HTTPS cùng port)    |
| Path Traversal    | Tất cả đường dẫn file được xác thực trước truy cập|
| WAF               | HAProxy + Coraza OWASP ruleset                 |
| Mã hóa Backup     | AES-256-GCM cho dữ liệu backup nhạy cảm     |
| Incremental Backup | rsync + hardlinks cho backup tiết kiệm không gian |
| Google OAuth2     | Device Authorization Flow cho cloud storage     |

---

## 13. Lệnh CLI

| Lệnh                                                        | Mô tả                       |
|-------------------------------------------------------------|------------------------------|
| `itdlupanel -config <path>`                                 | Khởi động panel server      |
| `itdlupanel reset-password -user <u> -password <p>`        | Đặt lại mật khẩu người dùng |
| `itdlupanel backup -type=site -all`                        | Sao lưu tất cả site CLI     |
| `itdlupanel backup -type=database -target <name>`           | Sao lưu DB cụ thể          |
| `itdlupanel backup -type=panel`                            | Sao lưu toàn bộ panel      |
| `itdlupanel backup -type=site -target example.com -storage=ftp -storage-id=1` | Sao lưu với upload từ xa |
| `itdlupanel cron-run -id <n>`                              | Thực thi cron job theo ID  |

---

## 14. Build & Triển Khai

### 14.1 Quy Trình Build

```
Phase 1: Frontend Build
  cd web && npm install && npx vite build → web/dist/

Phase 2: Go Embed + Compile
  go generate (embed web/dist/) → web.go
  CGO_ENABLED=0 go build → bin/itdlupanel (~60MB)

Kết quả: Tệp nhị phân tĩnh đơn với SPA được nhúng
```

### 14.2 Makefile Targets

| Target             | Mô tả                                    |
|--------------------|------------------------------------------|
| `make build`       | Build cho nền tảng hiện tại           |
| `make dev`         | Development mode (`go run`)             |
| `make build-linux-amd64` | Cross-compile cho Linux amd64    |
| `make build-linux-arm64` | Cross-compile cho Linux arm64    |
| `make test`        | Chạy tests với coverage               |
| `make lint`        | Chạy golangci-lint                     |
| `make clean`       | Xóa build artifacts                    |

### 14.3 Docker Build (multi-stage)

```dockerfile
FROM node:22-alpine AS frontend
COPY web/ . && npm ci && npx vite build

FROM golang:1.26-alpine AS backend
COPY --from=frontend /app/web/dist web/dist/
RUN CGO_ENABLED=0 go build -o itdlupanel ./cmd/panel

FROM alpine:3.21
COPY --from=backend /itdlupanel /usr/local/bin/
EXPOSE 8888
CMD ["itdlupanel"]
```

---

## 15. Đường Dẫn Triển Khai

| Tài nguyên          | Đường dẫn                                       |
|---------------------|------------------------------------------------|
| Panel binary        | `/usr/local/bin/itdlupanel`                  |
| Cấu hình panel      | `/ITDLUPanel/server/config/panel.json`     |
| Cơ sở dữ liệu panel| `/ITDLUPanel/server/data/panel.db`         |
| SSL (panel)         | `/ITDLUPanel/server/data/ssl/panel/`       |
| SSL (sites)         | `/ITDLUPanel/server/data/ssl/sites/<domain>/`|
| Vhost (nginx)       | `/etc/nginx/sites-enabled/`                   |
| Vhost (apache)      | `/etc/apache2/sites-enabled/`                  |
| Vhost (OLS)         | `/usr/local/lsws/conf/vhosts/`             |
| Lưu trữ sao lưu     | `/ITDLUPanel/backup/`                       |
| Lưu trữ log         | `/ITDLUPanel/logs/`                         |
| Wwwroot              | `/ITDLUPanel/wwwroot/`                       |
