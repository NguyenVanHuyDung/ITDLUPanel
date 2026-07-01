# ITDLUPanel - Bảng Điều Khiển Quản Lý Máy Chủ Linux

**Đại học Đà Lạt | © 2026**

---

## Slide 1: Giới Thiệu ITDLUPanel

# ITDLUPanel

## Bảng Điều Khiển Quản Lý Máy Chủ Linux

**Single Binary • Zero Dependencies • Production-Ready**

Được phát triển bởi **Đại học Đà Lạt**

![Logo](https://via.placeholder.com/200x80/1565C0/FFFFFF?text=ITDLUPanel)

---

## Slide 2: Tổng Quan

# ITDLUPanel Là Gì?

**ITDLUPanel** (IT Đại học Đà Lạt Panel) là một **bảng điều khiển quản lý máy chủ Linux hiện đại**, đóng gói trong một file nhị phân duy nhất (~60MB) với **không phụ thuộc runtime bên ngoài**.

### Điểm Nổi Bật

- **Single Binary**: Toàn bộ stack trong một file Go
- **Zero Dependencies**: Không cần cài đặt Node.js, Python hay database riêng
- **Cross-Platform**: Biên dịch không cần CGO, chạy trên mọi Linux
- **Production-Ready**: Đã được kiểm chứng tại môi trường thực tế

---

## Slide 3: Tại Sao Chọn ITDLUPanel?

# Vì Sao Chọn ITDLUPanel?

### So Sánh Với Các Giải Pháp Khác

| Tiêu Chí | ITDLUPanel | cPanel | DirectAdmin |
|----------|------------|--------|------------|
| Chi phí | Miễn phí | Trả phí | Trả phí |
| Dependencies | Không | Cần nhiều | Cần nhiều |
| Giao diện | Hiện đại (React) | Cũ | Trung bình |
| Docker tích hợp | ✅ | ❌ | ❌ |
| WebSocket Terminal | ✅ | ❌ | ❌ |

### Phù Hợp Cho

- **Trường học & đại học**: Quản lý server học tập
- **Doanh nghiệp nhỏ**: Host website nội bộ
- **DevOps**: Môi trường development/staging

---

## Slide 4: Technology Stack

# Công Nghệ Sử Dụng

## Backend - Go 1.25

```
┌─────────────────────────────────────────────────────┐
│  Gin Framework        │  JWT Auth        │  SQLite │
│  WebSocket           │  TOTP 2FA        │  gopsutil│
└─────────────────────────────────────────────────────┘
```

| Component | Technology | Version |
|-----------|------------|---------|
| Language | Go | 1.25 |
| HTTP Framework | Gin | 1.12 |
| Database | SQLite | modernc.org/sqlite 1.47 |
| Auth | JWT | golang-jwt/jwt 5.3.1 |
| Terminal | xterm.js PTY | creack/pty 1.1.24 |
| Storage | MinIO Go | 7.0.100 |

## Frontend - React 19

```
┌─────────────────────────────────────────────────────┐
│  React 19            │  Ant Design 6.3    │  Vite  │
│  TypeScript 5.9      │  Tailwind CSS 4    │  i18n  │
└─────────────────────────────────────────────────────┘
```

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | React | 19.2.4 |
| UI Library | Ant Design | 6.3.3 |
| Build Tool | Vite | 8.0.1 |
| State | Zustand | 5.0.12 |
| Charts | Recharts | 3.8.0 |
| Terminal | xterm.js | 6.0.0 |

---

## Slide 5: Kiến Trúc Hệ Thống

# Kiến Trúc Tổng Quan

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser (React 19 SPA)                     │
│         Ant Design 6 • xterm.js • Monaco Editor              │
│         Recharts • Zustand • React Query • i18n              │
└────────────────┬──────────────────────┬──────────────────────┘
                 │  REST API (~160)      │  WebSocket (2)
                 │  HTTPS / JWT          │  PTY Terminal + Monitor
                 ▼                       ▼
┌──────────────────────────────────────────────────────────────┐
│              Single Go Binary (go:embed)                     │
│  ┌─────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   Gin   │→ │  24 Handlers │→ │  33+ Services         │   │
│  │  Router │  │  (REST API)  │  │  14 Installers        │   │
│  └─────────┘  └──────────────┘  │  4 Vhost Generators  │   │
│  ┌─────────┐  ┌──────────────┐  └──────────┬───────────┘   │
│  │   WS    │→ │  Terminal    │              │               │
│  │   Hub   │  │  Monitor     │              ▼               │
│  └─────────┘  └──────────────┘  ┌──────────────────────┐   │
│  ┌─────────────────────────┐    │  SQLite (25 tables)  │   │
│  │  Middleware Stack (11)   │    └──────────────────────┘   │
│  └─────────────────────────┘                                │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   Linux Host (Ubuntu/Debian)                  │
│   Nginx/Apache/OLS • PHP-FPM • MySQL/MariaDB • Redis       │
│   Docker • Fail2ban • PureFTPd • Certbot                     │
└──────────────────────────────────────────────────────────────┘
```

---

## Slide 6: Các Module Chính

# Tính Năng Chính

| Module | Mô Tả |
|--------|-------|
| 📊 **Dashboard** | Theo dõi CPU, RAM, Disk, Network realtime |
| 🌐 **Websites** | Quản lý site, domain, PHP version, Nginx/Apache |
| 🗄️ **Databases** | MySQL/MariaDB - create, backup, restore |
| 📁 **File Manager** | Trình duyệt file với Monaco Editor |
| 💻 **Terminal** | WebSocket terminal với multi-tab |
| 🔒 **Security** | Firewall, IP blocking, Fail2ban |
| 🐳 **Docker** | 38+ one-click app templates |
| ⏰ **Cron Jobs** | 30 templates, schedule builder |
| 📝 **Logs** | Panel, SSH, website, audit logs |
| 🔐 **SSL** | Let's Encrypt auto-issue, auto-renewal |
| 💾 **Backups** | FTP, S3, Google Drive, OneDrive |
| 👥 **Users** | RBAC - Admin/Operator/Viewer + 2FA |

---

## Slide 7: Dashboard - Giám Sát Realtime

# Dashboard Thông Minh

### Trực Quan Hóa Dữ Liệu

```
┌────────────────────────────────────────────────────────┐
│  CPU Usage          RAM Usage         Disk Usage       │
│  ████████░░ 78%    ██████░░░░ 62%   ███░░░░░░ 31%     │
│  [==========]      [==========]       [==========]    │
└────────────────────────────────────────────────────────┘
```

### Tính Năng Dashboard

- ✅ **Realtime Monitoring**: Cập nhật mỗi 2 giây qua WebSocket
- ✅ **Interactive Charts**: Biểu đồ tương tác với Recharts
- ✅ **Network Stats**: Bandwidth in/out theo thời gian thực
- ✅ **Process List**: Top processes đang chạy
- ✅ **Service Status**: Health check các dịch vụ

### Các Chỉ Số Theo Dõi

| Metric | Update Interval | Retention |
|--------|------------------|-----------|
| CPU | 2s | 1 hour |
| Memory | 2s | 1 hour |
| Disk I/O | 5s | 1 hour |
| Network | 2s | 1 hour |

---

## Slide 8: Quản Lý Websites

# Quản Lý Website Chuyên Nghiệp

### Hỗ Trợ Đa Web Server

```
┌─────────────────────────────────────────────────────────┐
│  Web Server Support                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                 │
│  │  Nginx  │  │ Apache  │  │   OLS   │                 │
│  │   ✅    │  │   ✅    │  │   ✅    │                 │
│  └─────────┘  └─────────┘  └─────────┘                 │
│                                                         │
│  PHP Versions: 7.4 • 8.0 • 8.1 • 8.2 • 8.3 • 8.4     │
└─────────────────────────────────────────────────────────┘
```

### Tính Năng Nổi Bật

- 🔄 **PHP Version Switching**: Chuyển đổi PHP version dễ dàng
- 📝 **Config Editor**: Chỉnh sửa Nginx/Apache config
- 🌐 **Domain Aliases**: Quản lý multiple domains
- 📊 **Access Logs**: Xem logs theo thời gian thực
- 🔒 **SSL Integration**: Tích hợp Let's Encrypt

### Quick Actions

```bash
[Create Site]  [PHP Settings]  [SSL Cert]  [Config Editor]
```

---

## Slide 9: Quản Lý Databases

# Quản Lý Database Toàn Diện

### Supported Databases

| Database | Port | Features |
|----------|------|----------|
| MySQL | 3306 | Full support |
| MariaDB | 3306 | Full support |
| Redis | 6379 | Cache management |

### Database Features

- ✅ **Create/Drop**: Tạo và xóa database nhanh chóng
- ✅ **User Management**: Phân quyền user database
- ✅ **Backup/Restore**: Sao lưu với nhiều destination
- ✅ **phpMyAdmin**: Giao diện web quản lý
- ✅ **Connection Info**: Thông tin kết nối chi tiết

### Backup Destinations

```
┌─────────────────────────────────────────────────────────┐
│  📁 FTP Server    │   ☁️ S3/MinIO   │   🔵 Google Drive │
│  📁 OneDrive      │   📁 Local      │   📁 SFTP          │
└─────────────────────────────────────────────────────────┘
```

---

## Slide 10: File Manager & Code Editor

# File Manager Thông Minh

### Monaco Editor Tích Hợp

- 🔥 **Syntax Highlighting**: Hỗ trợ 50+ ngôn ngữ
- 📂 **File Tree**: Duyệt file với tree view
- 📁 **Compress/Extract**: ZIP, TAR, GZ
- 🔐 **Permission Editor**: Chmod trực quan
- ⭐ **Bookmarks**: Đánh dấu thư mục yêu thích
- 🔍 **Search**: Tìm kiếm file nhanh

### Supported File Types

```
Languages: JavaScript, TypeScript, Python, Go, PHP, 
           Ruby, Java, C++, Rust, HTML, CSS, JSON, YAML...
```

### Quick Actions

| Action | Description |
|--------|-------------|
| New File | Tạo file mới |
| Upload | Upload file lên server |
| Download | Tải file về local |
| Compress | Nén file/folder |
| Extract | Giải nén archive |

---

## Slide 11: WebSocket Terminal

# Terminal Trong Trình Duyệt

### Tính Năng Terminal

```
┌──────────────────────────────────────────────────────────────┐
│  ITDLUPanel Terminal                           [+] [_] [X]   │
│  ──────────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  admin@server:~$ ssh user@server                       │ │
│  │  user@server's password: ********                      │ │
│  │  Welcome to Ubuntu 22.04 LTS                           │ │
│  │  user@server:~$ ls -la                                  │ │
│  │  drwxr-xr-x  5 admin admin  4096 Jun 29 10:00 .       │ │
│  │  drwxr-xr-x 14 admin admin  4096 Jun 29 09:30 ..       │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ──────────────────────────────────────────────────────────  │
│  [Tab 1] [Tab 2] [+]              [Fullscreen] [Theme: Dark] │
└──────────────────────────────────────────────────────────────┘
```

- 💻 **Full PTY Support**: Terminal đầy đủ chức năng
- 📑 **Multi-Tab**: Nhiều terminal cùng lúc
- 🔲 **Fullscreen**: Chế độ toàn màn hình
- 🎨 **Theme Support**: Light/Dark theme
- 📜 **Scrollback**: Buffer không giới hạn

### Technology

- **Backend**: gorill/websocket + creack/pty
- **Frontend**: xterm.js với custom themes

---

## Slide 12: Docker Management

# Docker Container Management

### Container Features

```
┌─────────────────────────────────────────────────────────┐
│  🐳 Docker Status: Running                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │nginx:1.2│ │mysql:8 │ │redis:7 │ │node:20 │        │
│  │ ● RUN   │ │ ● RUN   │ │ ● RUN   │ │ ● RUN   │        │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
└─────────────────────────────────────────────────────────┘
```

### Management Capabilities

| Feature | Description |
|---------|-------------|
| **Containers** | Start, stop, restart, remove |
| **Images** | Pull, build, remove images |
| **Networks** | Create and manage networks |
| **Volumes** | Persistent storage management |
| **Compose** | Docker Compose editor & runner |

### One-Click App Templates (38+)

```
┌────────────────────────────────────────────────────────┐
│  Popular Templates                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ WordPress │ │  Nextcloud│ │  GitLab  │              │
│  └──────────┘ └──────────┘ └──────────┘              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │  Matomo   │ │   Jira   │ │ Prometheus│              │
│  └──────────┘ └──────────┘ └──────────┘              │
└────────────────────────────────────────────────────────┘
```

---

## Slide 13: Security Features

# Bảo Mật Toàn Diện

### Security Stack

```
┌─────────────────────────────────────────────────────────┐
│                    Security Layers                        │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  JWT Auth (15min access + 7day refresh token)     │ │
│  │  TOTP 2FA (RFC 6238)                               │ │
│  │  RBAC (Admin/Operator/Viewer)                      │ │
│  │  bcrypt password hashing (cost=12)                 │ │
│  │  CSRF Protection                                    │ │
│  │  Rate Limiting (300 req/min per IP)                │ │
│  │  Audit Logging                                      │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Security Features

| Feature | Description |
|---------|-------------|
| 🔥 **Firewall** | UFW rules management |
| 🚫 **IP Blocking** | Block malicious IPs |
| 🛡️ **Fail2ban** | Auto-ban failed login attempts |
| 🔑 **SSH Config** | SSH hardening options |
| 📊 **Port Monitor** | Track open ports |
| 📝 **Audit Logs** | Log all admin actions |

### RBAC Roles

| Role | Permissions |
|------|------------|
| **Admin** | Full access |
| **Operator** | Manage services, no user management |
| **Viewer** | Read-only access |

---

## Slide 14: Hệ Thống Logs Toàn Diện

# Quản Lý Logs Thông Minh

### Tổng Quan Logs

```
┌───────────────────────────────────────────────────────────────────┐
│  📋 ITDLUPanel Log Center                                         │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  🔍 Filter: [All Logs ▼] [Date Range] [Search...]            │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │  📅 2026-06-30 14:25:03  [AUDIT]  User admin logged in       │ │
│  │  📅 2026-06-30 14:24:58  [ERROR]  Nginx: connection failed   │ │
│  │  📅 2026-06-30 14:23:15  [INFO]   Backup completed: db.sql   │ │
│  │  📅 2026-06-30 14:22:01  [WARN]   SSH: failed login attempt  │ │
│  │  📅 2026-06-30 14:20:33  [PANEL]  Service nginx restarted    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  [Download] [Export] [Clear Old] [Settings]                       │
└───────────────────────────────────────────────────────────────────┘
```

### Các Loại Logs

|| Type | Description | Location |
|------|-------------|----------|
| 📊 **Panel Logs** | Hoạt động của panel (login, logout, config changes) | `/var/log/itdlupanel/panel.log` |
| 💻 **SSH Logs** | Kết nối SSH, failed login attempts | `/var/log/auth.log` |
| 🌐 **Website Logs** | Access logs, error logs per domain | `/var/www/{domain}/logs/` |
| 🔒 **Audit Logs** | Tất cả actions của admin | SQLite database |
| 🐳 **Docker Logs** | Container logs, stdout/stderr | `docker logs {container}` |
| 🔄 **Service Logs** | Systemd services, cron jobs | `/var/log/syslog` |

### Tính Năng Chính

- 🔍 **Advanced Filtering**: Lọc theo loại, ngày, mức độ nghiêm trọng
- 📅 **Date Range Picker**: Chọn khoảng thời gian xem logs
- 🔎 **Full-Text Search**: Tìm kiếm nội dung log
- 📥 **Export**: Xuất logs ra JSON, CSV, TXT
- 🗜️ **Auto-Compression**: Nén logs cũ tự động
- ⏰ **Retention Policy**: Cấu hình số ngày lưu trữ

### Log Levels

```
┌─────────────────────────────────────────────────────────────────┐
│  Log Levels                                                       │
│                                                                  │
│  🔴 CRITICAL  - Lỗi nghiêm trọng, cần can thiệp ngay           │
│  🟠 ERROR     - Lỗi hoạt động không bình thường                 │
│  🟡 WARNING   - Cảnh báo, có thể ảnh hưởng                      │
│  🔵 INFO      - Thông tin hoạt động bình thường                 │
│  ⚪ DEBUG     - Chi tiết debug (dev mode)                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Security Audit Logs

|| Field | Description |
|-------|-------------|
| Timestamp | Thời gian chính xác (timezone) |
| User | Tài khoản thực hiện |
| Action | Hành động (create/delete/update/restart) |
| Resource | Đối tượng bị tác động |
| IP Address | Địa chỉ IP của người dùng |
| Result | Thành công/Thất bại |

### Website Access Logs

```
# Apache/Nginx Access Log Format
[30/Jun/2026:14:25:03 +0700] "GET /api/users HTTP/1.1" 200 1234
[30/Jun/2026:14:25:04 +0700] "POST /login HTTP/1.1" 302 0
[30/Jun/2026:14:25:05 +0700] "GET /dashboard HTTP/1.1" 200 5678
```

### Quick Actions

|| Action | Description |
|--------|-------------|
| View Live | Xem logs realtime với auto-refresh |
| Download | Tải toàn bộ log file |
| Search | Tìm kiếm nội dung |
| Archive | Nén và lưu trữ logs cũ |
| Purge | Xóa logs theo retention policy |

---

## Slide 15: SSL Certificates

# Quản Lý SSL Certificate

### SSL Features

```
┌─────────────────────────────────────────────────────────┐
│  🔒 SSL Certificate Manager                              │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Domain: example.com                                │ │
│  │  Provider: Let's Encrypt                            │ │
│  │  Valid Until: 2026-09-29                            │ │
│  │  Auto-Renewal: ✅ Enabled                           │ │
│  │  [View] [Renew] [Download] [Delete]                │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Certificate Options

| Type | Description |
|------|-------------|
| **Let's Encrypt** | Free auto-renewal SSL |
| **Self-Signed** | For internal/testing |
| **Custom** | Upload your own cert |

### Features

- ✅ **Auto-Issue**: Tự động cấp phát certificate
- ✅ **Auto-Renewal**: Gia hạn tự động trước 30 ngày
- ✅ **Wildcard Support**: Hỗ trợ wildcard certificates
- ✅ **Multi-Domain**: Nhiều domain trong 1 cert

---

## Slide 16: Backup & Storage

# Backup & Cloud Storage

### Supported Storage Backends

```
┌─────────────────────────────────────────────────────────┐
│  ☁️ Cloud Storage Options                              │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Amazon S3  │  │  Google     │  │  OneDrive   │    │
│  │   (AWS)     │  │   Drive     │  │  (Microsoft)│    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   MinIO     │  │   FTP/SFTP  │  │   Local     │    │
│  │  (S3-like)  │  │   Server    │  │   Storage   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Backup Features

- ✅ **Scheduled Backups**: Đặt lịch backup tự động
- ✅ **Incremental Backup**: Chỉ backup thay đổi
- ✅ **Compression**: Nén gzip/tar
- ✅ **Encryption**: Mã hóa backup files
- ✅ **Retention Policy**: Xóa backup cũ tự động

### OAuth2 Integration

- Google Drive via OAuth2
- OneDrive via OAuth2
- S3/MinIO via Access Keys

---

## Slide 17: Internationalization

# Đa Ngôn Ngữ

### Supported Languages

```
┌─────────────────────────────────────────────────────────┐
│  🌍 Language Support                                    │
│                                                         │
│  ┌─────────────┐              ┌─────────────┐         │
│  │ 🇺🇸 English  │              │ 🇻🇳 Tiếng Việt│         │
│  │   (EN)      │              │    (VI)     │         │
│  └─────────────┘              └─────────────┘         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### i18n Coverage

| Component | Coverage |
|-----------|----------|
| Backend API Messages | 100% |
| Frontend UI | 100% |
| Error Messages | 100% |
| Documentation | EN + VI |

### Implementation

- **Frontend**: i18next với react-i18next
- **Backend**: Custom i18n package
- **Dynamic Switching**: Đổi ngôn ngữ không cần reload

---

## Slide 18: Code Statistics

# Dự Án Bằng Con Số

### Codebase Metrics

| Metric | Count |
|--------|-------|
| Go files | 112 files • 43,314 LOC |
| TypeScript files | 93 files |
| API endpoints | ~160 REST + 2 WebSocket |
| Database tables | 25 |
| Docker templates | 38 one-click apps |
| Cron templates | 30 pre-built |
| Software installers | 14 |
| Frontend pages | 17 (lazy-loaded) |
| Shared components | 15 |

### Backend Architecture

```
Middleware Stack: 11 layers
API Handlers: 24 files
Services: 33+
Installers: 14
Vhost Generators: 4 (Nginx, Apache, OLS, Node)
```

### Frontend Architecture

```
Pages: 17 (all lazy-loaded)
Components: 15 shared
Zustand Stores: 5
Custom Hooks: 7
```

---

## Slide 19: Deployment

# Triển Khai Dễ Dàng

### Quick Start

```bash
# 1. Build
cd web && npm install && npx vite build && cd ..
make build

# 2. Configure
cp config/panel.json.example config/panel.json
vim config/panel.json

# 3. Run
./bin/itdlupanel -config config/panel.json

# 4. Access
# Open https://localhost:8888
```

### Default Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin@123456` |
| Default Port | `8888` |

### System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 1 GB | 2 GB |
| CPU | 1 core | 2+ cores |
| Disk | 5 GB | 20 GB |
| OS | Ubuntu 18.04+ | Ubuntu 22.04 LTS |

---

## Slide 20: Roadmap

# Lộ Trình Phát Triển

### Phase 1: ✅ Completed

- [x] Core panel functionality
- [x] Docker management
- [x] WebSocket terminal
- [x] SSL certificates
- [x] Multi-language support

### Phase 2: 🚧 In Progress

- [ ] Kubernetes cluster management
- [ ] Advanced monitoring (Prometheus/Grafana)
- [ ] Plugin marketplace
- [ ] API documentation (OpenAPI)

### Phase 3: 📋 Planned

- [ ] Multi-server management
- [ ] Mobile app (React Native)
- [ ] AI-powered suggestions
- [ ] GitOps integration

---

## Slide 21: Kết Luận

# Cảm Ơn!

## ITDLUPanel

### Contact & Support

- 🌐 **Website**: https://github.com/itdlu/ITDLUPanel
- 📧 **Email**: support@itdlu.edu.vn
- 📖 **Docs**: https://docs.itdlu.edu.vn

### Key Takeaways

```
┌─────────────────────────────────────────────────────────┐
│  ✓ Single Binary Deployment                             │
│  ✓ Zero External Dependencies                          │
│  ✓ Production-Ready Security (JWT, 2FA, RBAC)          │
│  ✓ Docker & Cloud Storage Integration                  │
│  ✓ Real-time WebSocket Terminal                        │
│  ✓ EN/VI Language Support                              │
│  ✓ MIT License - Completely Free                       │
└─────────────────────────────────────────────────────────┘
```

**© 2026 Đại học Đà Lạt (Dalat University)**

---

*Generated by ITDLUPanel Documentation System*
