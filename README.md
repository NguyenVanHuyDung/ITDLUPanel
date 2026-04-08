# ITDLUPanel

![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Ant Design](https://img.shields.io/badge/Ant%20Design-6-0170FE?logo=antdesign&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

[🇻🇳 Tiếng Việt](#tiếng-việt) | [🇺🇸 English](#english)

---

# Tiếng Việt

**Bảng điều khiển quản lý máy chủ Linux** — Web panel hiện đại, tất-cả-trong-một, đóng gói thành một file binary duy nhất (~60MB). Được phát triển cho **Đại học Đà Lạt** với Go backend và React frontend.

---

## ✨ Tính năng

| Module | Mô tả |
|--------|-------|
| 🖥️ **Dashboard** | Theo dõi CPU, RAM, ổ đĩa, mạng theo thời gian thực với biểu đồ tương tác |
| 🌐 **Website** | Quản lý website, domain alias, PHP version, cấu hình Nginx/Apache/OLS |
| 🗄️ **Cơ sở dữ liệu** | Quản lý MySQL/MariaDB — tạo, sao lưu, khôi phục, quản lý user |
| 📁 **Quản lý tệp** | Trình duyệt file với Monaco code editor, bookmark, nén/giải nén, phân quyền |
| 🔑 **Terminal** | Terminal xterm.js qua WebSocket, đa tab, toàn màn hình |
| 🔒 **Bảo mật** | Tường lửa, giám sát cổng, chặn IP, cấu hình SSH, Fail2ban |
| 📊 **Giám sát** | Biểu đồ CPU, bộ nhớ, disk I/O, mạng — real-time và lịch sử |
| 🐳 **Docker** | Container, image, network, volume, compose, 38 template cài nhanh, cloud image |
| ⏰ **Cron Jobs** | 30 template có sẵn, trình tạo lịch, lịch sử, chạy ngay |
| 📋 **Nhật ký** | Panel, SSH, website, audit log với tìm kiếm và lọc |
| 📦 **Kho ứng dụng** | Cài đặt Nginx, Apache, PHP, MySQL, Redis, phpMyAdmin, Docker... |
| 🔐 **SSL** | Let's Encrypt tự động, upload chứng chỉ, tự ký, tự động gia hạn |
| 👤 **Người dùng** | RBAC — Admin/Operator/Viewer, hỗ trợ 2FA (TOTP) |
| 📡 **FTP** | Quản lý tài khoản FTP |
| 💾 **Lưu trữ** | Sao lưu qua FTP, S3/MinIO, Google Drive, OneDrive |
| ⚙️ **Cài đặt** | Cổng, SSL, ngôn ngữ, thông báo (Email/Telegram/Webhook) |
| 🌓 **Giao diện** | Chế độ sáng/tối |

---

## 🏗️ Kiến trúc

```
┌──────────────────────────────────────────────────────────┐
│                 Browser (React 19 SPA)                    │
│         Ant Design 6 · xterm.js · Monaco Editor           │
└──────────────┬──────────────────────┬────────────────────┘
               │  REST API (~160)     │  WebSocket (2)
               ▼                      ▼
┌──────────────────────────────────────────────────────────┐
│            File binary Go duy nhất (~60MB)                │
│                                                           │
│  Gin Router → 24 Handlers → 33 Services → SQLite (25 tbl)│
│  WebSocket Hub → PTY Terminal + Real-time Monitor         │
│  11 Middleware: JWT · RBAC · Rate Limit · CSRF · Audit    │
│  14 Installers · 4 Vhost Generators · Task Queue          │
│  Embedded Frontend (go:embed)                             │
└──────────────────────────┬───────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────┐
│               Linux Host (Ubuntu/Debian)                  │
│  Nginx/Apache/OLS · PHP-FPM · MySQL/MariaDB · Redis      │
│  Docker · Fail2ban · PureFTPd · Certbot                   │
└──────────────────────────────────────────────────────────┘
```

### Công nghệ

| Tầng | Công nghệ |
|------|-----------|
| Backend | Go 1.25, Gin 1.12, SQLite (pure Go), zerolog |
| Frontend | React 19, TypeScript 5.9, Ant Design 6, Vite 8 |
| State | Zustand 5 (5 stores: auth, theme, settings, task, notification) |
| Charts | Recharts 3.8 |
| Editor | Monaco Editor |
| Terminal | xterm.js 6 + WebSocket |
| i18n | Tiếng Anh 🇺🇸 / Tiếng Việt 🇻🇳 |

### Thống kê mã nguồn

| Metric | Số liệu |
|--------|---------|
| Go files | 112 files · 43,314 LOC |
| TypeScript files | 93 files |
| API endpoints | ~160 REST + 2 WebSocket |
| Database tables | 25 |
| Docker templates | 38 one-click apps |
| Cron templates | 30 pre-built |
| Supported software | 14 installers |

---

## 🚀 Bắt đầu nhanh

### Yêu cầu

- Go 1.25+
- Node.js 18+
- Linux (Ubuntu 20.04+ / Debian 11+)

### Build từ mã nguồn

```bash
# Clone
git clone https://github.com/your-org/ITDLUPanel.git
cd ITDLUPanel

# Build frontend
cd web && npm install && npx vite build && cd ..

# Build backend (nhúng frontend vào binary)
export PATH=/usr/local/go/bin:$PATH
make build

# Chạy
./bin/itdlupanel -config config/panel.json
```

### Docker

```bash
docker build -t itdlupanel .
docker run -d -p 8888:8888 --name panel itdlupanel
```

Panel mặc định chạy tại **https://localhost:8888**

### Thông tin đăng nhập mặc định

| Trường | Giá trị |
|--------|---------|
| Tên đăng nhập | `admin` |
| Mật khẩu | `admin@123456` |

> ⚠️ **Đổi mật khẩu ngay sau lần đăng nhập đầu tiên.**

### Đặt lại mật khẩu

```bash
./bin/itdlupanel reset-password -password "NewPassword123"
./bin/itdlupanel reset-password -user admin -password "NewPassword123"
./bin/itdlupanel reset-password -config /path/to/panel.json -password "NewPassword123"
```

### Cấu hình

File cấu hình tự động tạo tại `config/panel.json`:

```json
{
  "server": { "host": "0.0.0.0", "port": 8888 },
  "database": { "path": "data/panel.db" },
  "auth": { "jwt_secret": "<tự sinh>", "access_token_ttl": 900 },
  "paths": { "wwwroot": "/ITDLUPanel/wwwroot" },
  "panel": { "language": "en", "version": "0.1.0" }
}
```

---

## 📡 API

**~160 REST endpoints** + 2 WebSocket:

| Module | Endpoints | Quyền |
|--------|-----------|-------|
| Auth | 9 | Public + JWT |
| Sites | 14 | `sites.*` |
| Databases | 8 | `databases.*` |
| Files | 17 | `files.*` |
| Docker | 46+ | `docker.*` |
| Security | 12 | `security.*` |
| Software | 14 | `software.*` |
| Monitor | 5 + WS | JWT |
| Terminal | WS | `terminal.access` |
| Cron | 8 | `cron.*` |
| Logs | 7 | `logs.*` |
| SSL | 9 | `ssl.*` |
| Backups | 6 | `backup.*` |
| Storage | 8 | Admin |
| Users/Roles | 11 | Admin |
| Notifications | 8 | Admin |
| Dashboard/Tasks | 9 | JWT |

---

## 🔒 Bảo mật

| Tính năng | Chi tiết |
|-----------|---------|
| Xác thực | JWT HS256 (access 15 phút + refresh 7 ngày) |
| 2FA | TOTP (RFC 6238) |
| Mật khẩu | bcrypt cost=12 |
| CSRF | Cookie + header token |
| Rate Limit | 300 req/phút mỗi IP |
| Audit Trail | Ghi lại toàn bộ thao tác ghi |
| RBAC | Admin · Operator · Viewer |
| TLS | HTTPS tích hợp |

---

## 🌐 Phần mềm hỗ trợ

| Phần mềm | Cài đặt | Cấu hình | Giám sát |
|-----------|---------|----------|----------|
| Nginx | ✅ | ✅ | ✅ |
| Apache | ✅ | ✅ | ✅ |
| OpenLiteSpeed | ✅ | ✅ | ✅ |
| PHP 7.4–8.4 | ✅ | ✅ | ✅ |
| MySQL/MariaDB | ✅ | ✅ | ✅ |
| Redis | ✅ | ✅ | ✅ |
| phpMyAdmin | ✅ | — | — |
| PureFTPd | ✅ | ✅ | — |
| Docker | Detect | ✅ | ✅ |

**Storage modules:** FTP, S3/MinIO, Google Drive, OneDrive

---

## 📁 Cấu trúc dự án

```
ITDLUPanel/
├── cmd/panel/main.go          # Điểm khởi chạy
├── web.go                     # go:embed frontend
├── internal/
│   ├── api/v1/                # 24 REST handlers
│   ├── api/ws/                # WebSocket (terminal, monitor)
│   ├── app/                   # Router, middleware, bootstrap
│   ├── service/               # 33 business services
│   ├── service/installer/     # 14 software installers
│   ├── service/vhost/         # 4 vhost generators
│   ├── database/              # SQLite, 25 tables, 14 migrations
│   ├── config/                # JSON config
│   ├── pkg/                   # crypto, logger, errors, validator
│   ├── i18n/                  # Đa ngôn ngữ (EN/VI)
│   ├── task/                  # Hàng đợi tác vụ nền
│   ├── websocket/             # WS hub
│   ├── system/                # Shell, OS detection
│   └── plugin/                # Plugin system
├── web/src/
│   ├── pages/                 # 17 trang (lazy-loaded)
│   ├── layouts/               # MainLayout, AuthLayout
│   ├── components/            # 15 shared components
│   ├── stores/                # 5 Zustand stores
│   ├── hooks/                 # 7 custom hooks
│   ├── services/api.ts        # Axios client
│   ├── types/                 # TypeScript interfaces
│   ├── router/                # Route definitions
│   └── i18n/                  # EN/VI translations
├── config/panel.json          # Runtime config
├── data/panel.db              # SQLite database
├── docs/                      # Tài liệu kiến trúc
├── Makefile                   # Build commands
└── Dockerfile                 # Multi-stage build
```

---

## 📄 Tài liệu

| Tài liệu | Nội dung |
|-----------|---------|
| [System Architecture](docs/SYSTEM_ARCHITECTURE.md) | Kiến trúc tổng quan, tech stack, component diagram |
| [Technical Spec](docs/TECHNICAL_SPEC.md) | Database schema, API spec, configuration |
| [Build Architecture](docs/BUILD_ARCHITECTURE.md) | Quy trình build, go:embed, Docker |
| [Storage Guide](docs/STORAGE_GUIDE.md) | Hướng dẫn kết nối S3, Google Drive, OneDrive |

---

## 📝 Giấy phép

MIT License — © 2026 Đại học Đà Lạt

---
---

# English

**Linux Server Management Panel** — A modern, all-in-one web panel for Linux server management, packaged as a single binary (~60MB). Built for **Dalat University** with Go backend and React frontend.

---

## ✨ Features

| Module | Description |
|--------|-------------|
| 🖥️ **Dashboard** | Real-time CPU, RAM, disk, network monitoring with interactive charts |
| 🌐 **Websites** | Site management, domain aliases, PHP version switching, Nginx/Apache/OLS config |
| 🗄️ **Databases** | MySQL/MariaDB — create, backup, restore, user management |
| 📁 **File Manager** | Full browser with Monaco code editor, bookmarks, compress/decompress, permissions |
| 🔑 **Terminal** | xterm.js WebSocket terminal with multi-tab, fullscreen |
| 🔒 **Security** | Firewall, port monitoring, IP blocking, SSH config, Fail2ban |
| 📊 **Monitor** | Real-time + historical system metrics (CPU, memory, disk I/O, network) |
| 🐳 **Docker** | Containers, images, networks, volumes, compose, 38 one-click templates, cloud images |
| ⏰ **Cron Jobs** | 30 built-in templates, schedule builder, execution history, run-now |
| 📋 **Logs** | Panel, SSH, website, audit logs with search and filtering |
| 📦 **App Store** | Install Nginx, Apache, PHP, MySQL, Redis, phpMyAdmin, Docker... |
| 🔐 **SSL** | Let's Encrypt auto-issue, custom upload, self-signed, auto-renewal |
| 👤 **Users** | RBAC — Admin/Operator/Viewer roles, 2FA (TOTP) support |
| 📡 **FTP** | FTP account management |
| 💾 **Storage** | Backup to FTP, S3/MinIO, Google Drive, OneDrive |
| ⚙️ **Settings** | Port, SSL, language, notifications (Email/Telegram/Webhook) |
| 🌓 **Theme** | Light/dark mode toggle |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                 Browser (React 19 SPA)                    │
│         Ant Design 6 · xterm.js · Monaco Editor           │
└──────────────┬──────────────────────┬────────────────────┘
               │  REST API (~160)     │  WebSocket (2)
               ▼                      ▼
┌──────────────────────────────────────────────────────────┐
│              Single Go Binary (~60MB)                     │
│                                                           │
│  Gin Router → 24 Handlers → 33 Services → SQLite (25 tbl)│
│  WebSocket Hub → PTY Terminal + Real-time Monitor         │
│  11 Middleware: JWT · RBAC · Rate Limit · CSRF · Audit    │
│  14 Installers · 4 Vhost Generators · Task Queue          │
│  Embedded Frontend (go:embed)                             │
└──────────────────────────┬───────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────┐
│               Linux Host (Ubuntu/Debian)                  │
│  Nginx/Apache/OLS · PHP-FPM · MySQL/MariaDB · Redis      │
│  Docker · Fail2ban · PureFTPd · Certbot                   │
└──────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.25, Gin 1.12, SQLite (pure Go), zerolog |
| Frontend | React 19, TypeScript 5.9, Ant Design 6, Vite 8 |
| State | Zustand 5 (5 stores: auth, theme, settings, task, notification) |
| Charts | Recharts 3.8 |
| Editor | Monaco Editor |
| Terminal | xterm.js 6 + WebSocket |
| i18n | English 🇺🇸 / Vietnamese 🇻🇳 |

### Codebase Stats

| Metric | Count |
|--------|-------|
| Go files | 112 files · 43,314 LOC |
| TypeScript files | 93 files |
| API endpoints | ~160 REST + 2 WebSocket |
| Database tables | 25 |
| Docker templates | 38 one-click apps |
| Cron templates | 30 pre-built |
| Software installers | 14 |

---

## 🚀 Quick Start

### Prerequisites

- Go 1.25+
- Node.js 18+
- Linux (Ubuntu 20.04+ / Debian 11+)

### Build from Source

```bash
# Clone
git clone https://github.com/your-org/ITDLUPanel.git
cd ITDLUPanel

# Build frontend
cd web && npm install && npx vite build && cd ..

# Build backend (embeds frontend)
export PATH=/usr/local/go/bin:$PATH
make build

# Run
./bin/itdlupanel -config config/panel.json
```

### Docker

```bash
docker build -t itdlupanel .
docker run -d -p 8888:8888 --name panel itdlupanel
```

Panel starts at **https://localhost:8888**

### Default Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin@123456` |

> ⚠️ **Change the default password immediately after first login.**

### Reset Password

```bash
./bin/itdlupanel reset-password -password "NewPassword123"
./bin/itdlupanel reset-password -user admin -password "NewPassword123"
./bin/itdlupanel reset-password -config /path/to/panel.json -password "NewPassword123"
```

### Configuration

Auto-generated at `config/panel.json`:

```json
{
  "server": { "host": "0.0.0.0", "port": 8888 },
  "database": { "path": "data/panel.db" },
  "auth": { "jwt_secret": "<auto>", "access_token_ttl": 900 },
  "paths": { "wwwroot": "/ITDLUPanel/wwwroot" },
  "panel": { "language": "en", "version": "0.1.0" }
}
```

---

## 📡 API

**~160 REST endpoints** + 2 WebSocket:

| Module | Endpoints | Permission |
|--------|-----------|------------|
| Auth | 9 | Public + JWT |
| Sites | 14 | `sites.*` |
| Databases | 8 | `databases.*` |
| Files | 17 | `files.*` |
| Docker | 46+ | `docker.*` |
| Security | 12 | `security.*` |
| Software | 14 | `software.*` |
| Monitor | 5 + WS | JWT |
| Terminal | WS | `terminal.access` |
| Cron | 8 | `cron.*` |
| Logs | 7 | `logs.*` |
| SSL | 9 | `ssl.*` |
| Backups | 6 | `backup.*` |
| Storage | 8 | Admin |
| Users/Roles | 11 | Admin |
| Notifications | 8 | Admin |
| Dashboard/Tasks | 9 | JWT |

---

## 🔒 Security

| Feature | Details |
|---------|---------|
| Authentication | JWT HS256 (15-min access + 7-day refresh) |
| 2FA | TOTP (RFC 6238) |
| Password | bcrypt cost=12 |
| CSRF | Cookie + header token |
| Rate Limiting | 300 req/min per IP |
| Audit Trail | All write operations logged |
| RBAC | Admin · Operator · Viewer |
| TLS | Built-in HTTPS |

---

## 🌐 Supported Software

| Software | Install | Configure | Monitor |
|----------|---------|-----------|---------|
| Nginx | ✅ | ✅ | ✅ |
| Apache | ✅ | ✅ | ✅ |
| OpenLiteSpeed | ✅ | ✅ | ✅ |
| PHP 7.4–8.4 | ✅ | ✅ | ✅ |
| MySQL/MariaDB | ✅ | ✅ | ✅ |
| Redis | ✅ | ✅ | ✅ |
| phpMyAdmin | ✅ | — | — |
| PureFTPd | ✅ | ✅ | — |
| Docker | Detect | ✅ | ✅ |

**Storage modules:** FTP, S3/MinIO, Google Drive, OneDrive

---

## 📁 Project Structure

```
ITDLUPanel/
├── cmd/panel/main.go          # Entry point
├── web.go                     # go:embed frontend
├── internal/
│   ├── api/v1/                # 24 REST handlers
│   ├── api/ws/                # WebSocket (terminal, monitor)
│   ├── app/                   # Router, middleware, bootstrap
│   ├── service/               # 33 business services
│   ├── service/installer/     # 14 software installers
│   ├── service/vhost/         # 4 vhost generators
│   ├── database/              # SQLite, 25 tables, 14 migrations
│   ├── config/                # JSON config
│   ├── pkg/                   # crypto, logger, errors, validator
│   ├── i18n/                  # Backend translations (EN/VI)
│   ├── task/                  # Background task queue
│   ├── websocket/             # WS hub
│   ├── system/                # Shell, OS detection
│   └── plugin/                # Plugin system
├── web/src/
│   ├── pages/                 # 17 pages (lazy-loaded)
│   ├── layouts/               # MainLayout, AuthLayout
│   ├── components/            # 15 shared components
│   ├── stores/                # 5 Zustand stores
│   ├── hooks/                 # 7 custom hooks
│   ├── services/api.ts        # Axios client
│   ├── types/                 # TypeScript interfaces
│   ├── router/                # Route definitions
│   └── i18n/                  # EN/VI translations
├── config/panel.json          # Runtime config
├── data/panel.db              # SQLite database
├── docs/                      # Architecture docs
├── Makefile                   # Build commands
└── Dockerfile                 # Multi-stage build
```

---

## 📄 Documentation

| Document | Content |
|----------|---------|
| [System Architecture](docs/SYSTEM_ARCHITECTURE.md) | High-level architecture, tech stack, component diagram |
| [Technical Spec](docs/TECHNICAL_SPEC.md) | Database schema, API spec, configuration |
| [Build Architecture](docs/BUILD_ARCHITECTURE.md) | Build pipeline, go:embed, Docker |
| [Storage Guide](docs/STORAGE_GUIDE.md) | S3, Google Drive, OneDrive connection guide |

---

## 📝 License

MIT License — © 2026 Đại học Đà Lạt (Dalat University)
