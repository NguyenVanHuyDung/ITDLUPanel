# ITDLUPanel

![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Ant Design](https://img.shields.io/badge/Ant%20Design-6-0170FE?logo=antdesign&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

> **Bảng điều khiển quản lý máy chủ Linux** — Web panel hiện đại, tất-cả-trong-một, đóng gói thành một file binary duy nhất. Được phát triển cho **Đại học Đà Lạt**.

[🇻🇳 Tiếng Việt](#tiếng-việt) · [🇺🇸 English](#english)

---

# Tiếng Việt

## Tính năng

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

## Kiến trúc

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser (React 19 SPA)                     │
│            Ant Design 6 · xterm.js · Monaco Editor          │
└──────────────────────┬─────────────────┬───────────────────┘
                       │  REST API        │  WebSocket
                       ▼                  ▼
┌──────────────────────────────────────────────────────────────┐
│                     Go Binary (~60MB)                        │
│                                                              │
│  Gin → 24 Handlers → 33 Services → SQLite (25 tables)       │
│  WebSocket Hub → PTY Terminal + Real-time Monitor           │
│  11 Middleware · 14 Installers · 4 Vhost Generators         │
│  Embedded Frontend (go:embed)                               │
└─────────────────────────┬────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                   Linux Host (Ubuntu/Debian)                  │
│    Nginx/Apache/OLS · PHP-FPM · MySQL/MariaDB · Redis       │
│    Docker · Fail2ban · PureFTPd · Certbot                   │
└──────────────────────────────────────────────────────────────┘
```

### Thống kê

| Metric | Số liệu |
|--------|----------|
| Go files | 112 files · 43,000+ LOC |
| TypeScript files | 93 files |
| API endpoints | ~160 REST + 2 WebSocket |
| Database tables | 25 |
| Docker templates | 38 one-click apps |
| Cron templates | 30 pre-built |
| Supported software | 14 installers |

### Công nghệ

| Tầng | Công nghệ |
|------|-----------|
| Backend | Go 1.25, Gin 1.12, SQLite, zerolog |
| Frontend | React 19, TypeScript 5.9, Ant Design 6, Vite 8 |
| State | Zustand 5 (5 stores) |
| Charts | Recharts 3.8 |
| Terminal | xterm.js 6 + WebSocket |
| i18n | English 🇺🇸 / Vietnamese 🇻🇳 |

## Bắt đầu nhanh

### Yêu cầu

- Go 1.25+
- Node.js 18+
- Linux (Ubuntu 20.04+ / Debian 11+)

### Build từ mã nguồn

```bash
# Clone
git clone https://github.com/NguyenVanHuyDung/ITDLUPanel.git
cd ITDLUPanel

# Build frontend
cd web && npm install && npx vite build && cd ..

# Build backend
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

Panel chạy tại **https://localhost:8888**

### Thông tin đăng nhập mặc định

| Trường | Giá trị |
|--------|----------|
| Username | `admin` |
| Password | `admin@123456` |

> ⚠️ **Đổi mật khẩu ngay sau lần đăng nhập đầu tiên.**

### Đặt lại mật khẩu

```bash
./bin/itdlupanel reset-password -password "NewPassword123"
./bin/itdlupanel reset-password -user admin -password "NewPassword123"
./bin/itdlupanel reset-password -config /path/to/panel.json -password "NewPassword123"
```

## API

**~160 REST endpoints** + 2 WebSocket:

| Module | Endpoints | Quyền |
|--------|-----------|--------|
| Auth | 9 | Public + JWT |
| Sites | 14 | `sites.*` |
| Databases | 8 | `databases.*` |
| Files | 18 | `files.*` |
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

## Bảo mật

| Tính năng | Chi tiết |
|------------|----------|
| Xác thực | JWT HS256 (access 15 phút + refresh 7 ngày) |
| 2FA | TOTP (RFC 6238) |
| Mật khẩu | bcrypt cost=12 |
| CSRF | Cookie + header token |
| Rate Limit | 300 req/phút mỗi IP |
| Audit Trail | Ghi lại toàn bộ thao tác ghi |
| RBAC | Admin · Operator · Viewer |

## Phần mềm hỗ trợ

| Phần mềm | Cài đặt | Cấu hình | Giám sát |
|----------|----------|----------|----------|
| Nginx | ✅ | ✅ | ✅ |
| Apache | ✅ | ✅ | ✅ |
| OpenLiteSpeed | ✅ | ✅ | ✅ |
| PHP 7.4–8.4 | ✅ | ✅ | ✅ |
| MySQL/MariaDB | ✅ | ✅ | ✅ |
| Redis | ✅ | ✅ | ✅ |
| phpMyAdmin | ✅ | — | — |
| PureFTPd | ✅ | ✅ | — |
| Docker | Detect | ✅ | ✅ |

## Cấu trúc dự án

```
ITDLUPanel/
├── cmd/panel/main.go          # Entry point
├── web.go                     # go:embed frontend
├── internal/
│   ├── api/v1/                # 24 REST handlers
│   ├── api/ws/                # WebSocket
│   ├── app/                   # Router, middleware
│   ├── service/               # 33 business services
│   ├── service/installer/     # 14 software installers
│   ├── service/vhost/         # 4 vhost generators
│   ├── database/              # SQLite, 25 tables
│   ├── pkg/                   # utilities
│   └── system/                # Shell, OS detection
├── web/src/
│   ├── pages/                 # 17 pages
│   ├── components/            # shared components
│   ├── stores/                # Zustand stores
│   └── services/api.ts        # Axios client
├── config/panel.json          # Runtime config
├── Makefile
└── Dockerfile
```

## Tài liệu

| Tài liệu | Nội dung |
|-----------|----------|
| [System Architecture](docs/SYSTEM_ARCHITECTURE.md) | Kiến trúc tổng quan |
| [Technical Spec](docs/TECHNICAL_SPEC.md) | Database schema, API spec |
| [Build Architecture](docs/BUILD_ARCHITECTURE.md) | Quy trình build |
| [Storage Guide](docs/STORAGE_GUIDE.md) | Kết nối S3, Google Drive, OneDrive |

## Giấy phép

MIT License — © 2026 Đại học Đà Lạt

---

---

# English

**Linux Server Management Panel** — A modern, all-in-one web panel for Linux server management, packaged as a single binary. Built for **Dalat University** with Go backend and React frontend.

## Features

| Module | Description |
|--------|-------------|
| 🖥️ **Dashboard** | Real-time CPU, RAM, disk, network monitoring with interactive charts |
| 🌐 **Websites** | Site management, domain aliases, PHP version switching, Nginx/Apache/OLS |
| 🗄️ **Databases** | MySQL/MariaDB — create, backup, restore, user management |
| 📁 **File Manager** | Full browser with Monaco editor, bookmarks, compress/decompress, permissions |
| 🔑 **Terminal** | xterm.js WebSocket terminal with multi-tab, fullscreen |
| 🔒 **Security** | Firewall, port monitoring, IP blocking, SSH config, Fail2ban |
| 📊 **Monitor** | Real-time + historical system metrics |
| 🐳 **Docker** | Containers, images, networks, volumes, compose, 38 one-click templates |
| ⏰ **Cron Jobs** | 30 templates, schedule builder, execution history |
| 📋 **Logs** | Panel, SSH, website, audit logs with search |
| 📦 **App Store** | Install Nginx, Apache, PHP, MySQL, Redis, phpMyAdmin, Docker... |
| 🔐 **SSL** | Let's Encrypt auto-issue, custom upload, self-signed, auto-renewal |
| 👤 **Users** | RBAC — Admin/Operator/Viewer, 2FA (TOTP) support |
| 📡 **FTP** | FTP account management |
| 💾 **Storage** | Backup to FTP, S3/MinIO, Google Drive, OneDrive |
| ⚙️ **Settings** | Port, SSL, language, notifications |
| 🌓 **Theme** | Light/dark mode |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser (React 19 SPA)                     │
│            Ant Design 6 · xterm.js · Monaco Editor          │
└──────────────────────┬─────────────────┬───────────────────┘
                       │  REST API        │  WebSocket
                       ▼                  ▼
┌──────────────────────────────────────────────────────────────┐
│                     Go Binary (~60MB)                         │
│                                                              │
│  Gin → 24 Handlers → 33 Services → SQLite (25 tables)      │
│  WebSocket Hub → PTY Terminal + Real-time Monitor            │
│  11 Middleware · 14 Installers · 4 Vhost Generators         │
│  Embedded Frontend (go:embed)                               │
└─────────────────────────┬────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                   Linux Host (Ubuntu/Debian)                 │
│    Nginx/Apache/OLS · PHP-FPM · MySQL/MariaDB · Redis        │
│    Docker · Fail2ban · PureFTPd · Certbot                    │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Go 1.25+
- Node.js 18+
- Linux (Ubuntu 20.04+ / Debian 11+)

### Build from Source

```bash
git clone https://github.com/NguyenVanHuyDung/ITDLUPanel.git
cd ITDLUPanel

cd web && npm install && npx vite build && cd ..

export PATH=/usr/local/go/bin:$PATH
make build

./bin/itdlupanel -config config/panel.json
```

### Docker

```bash
docker build -t itdlupanel .
docker run -d -p 8888:8888 --name panel itdlupanel
```

### Default Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin@123456` |

> ⚠️ **Change the default password immediately after first login.**

## API

**~160 REST endpoints** + 2 WebSocket

| Module | Endpoints | Permission |
|--------|-----------|------------|
| Auth | 9 | Public + JWT |
| Sites | 14 | `sites.*` |
| Databases | 8 | `databases.*` |
| Files | 18 | `files.*` |
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

## Security

| Feature | Details |
|---------|---------|
| Authentication | JWT HS256 (15-min access + 7-day refresh) |
| 2FA | TOTP (RFC 6238) |
| Password | bcrypt cost=12 |
| CSRF | Cookie + header token |
| Rate Limiting | 300 req/min per IP |
| Audit Trail | All write operations logged |
| RBAC | Admin · Operator · Viewer |

## Supported Software

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

## License

MIT License — © 2026 Dalat University
