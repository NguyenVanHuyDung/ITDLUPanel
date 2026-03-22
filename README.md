# ITDLUPanel

**Linux Server Management Panel** — A modern, all-in-one web panel for managing Linux servers. Built for **Đại học Đà Lạt** (Dalat University) with Go backend and React frontend in a single binary.

![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Ant Design](https://img.shields.io/badge/Ant%20Design-6-0170FE?logo=antdesign&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

| Module | Description |
|--------|-------------|
| 🖥️ **Dashboard** | Real-time CPU, RAM, disk, network metrics with interactive charts and detailed popovers |
| 🌐 **Websites** | Create/manage sites, domain aliases, PHP version switching, nginx config editing |
| 🗄️ **Databases** | MySQL/MariaDB management — create, backup, restore, user management |
| 📁 **File Manager** | Full-featured browser with Monaco code editor, bookmarks, compress/decompress, permissions |
| 🔑 **Terminal** | WebSocket-based xterm.js terminal with multi-tab, fullscreen, and inline terminal in Files |
| 🔒 **Security** | Firewall rules, port monitoring, IP blocking, SSH config, Fail2ban management |
| 📊 **Monitor** | Real-time system monitoring with expandable charts (CPU, memory, disk I/O, network) |
| 🐳 **Docker** | Container & image management — create, start/stop, logs, stats, networks, volumes |
| ⏰ **Cron Jobs** | Schedule builder, templates, execution history, run-now, enable/disable |
| 📋 **Logs** | Panel, SSH, website access/error, audit logs with search and filtering |
| 📦 **App Store** | Install/manage Nginx, Apache, PHP, MySQL, Redis, phpMyAdmin with progress tracking |
| 🔐 **SSL** | Let's Encrypt auto-issue, custom upload, auto-renewal, self-signed certificates |
| 👤 **Users** | RBAC with Admin/Operator/Viewer roles, 2FA (TOTP) support |
| 📡 **FTP** | FTP account CRUD with path and status management |
| ⚙️ **Settings** | Panel port, SSL, admin path, language, backup configuration |
| 🌓 **Theme** | Light/dark mode toggle with persistent preference |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│            Browser (React 19 SPA)           │
│       Ant Design 6 · xterm.js · Monaco      │
└──────────────┬─────────────┬────────────────┘
               │ REST API    │ WebSocket
               ▼             ▼
┌─────────────────────────────────────────────┐
│          Single Go Binary (~30MB)           │
│                                             │
│  Gin Router ─► 21 Services ─► SQLite        │
│  WS Handlers ─► PTY Terminal                │
│  Embedded Frontend (go:embed)               │
│  JWT Auth · RBAC · Rate Limit · Audit       │
└─────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│           Linux Host (Ubuntu/Debian)        │
│    Nginx · PHP-FPM · MySQL · Redis · Docker │
└─────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.22, Gin, SQLite, gopsutil, creack/pty |
| Frontend | React 19, TypeScript, Ant Design 6, Vite 8 |
| State | Zustand (auth + theme stores) |
| Charts | Recharts |
| Editor | Monaco Editor |
| Terminal | xterm.js + WebSocket |
| i18n | English 🇺🇸 / Vietnamese 🇻🇳 |

---

## 🚀 Quick Start

### Prerequisites

- Go 1.22+
- Node.js 18+
- Linux (Ubuntu 20.04+ / Debian 11+)

### Build from Source

```bash
# Clone
git clone https://github.com/your-org/ITDLUPanel.git
cd ITDLUPanel

# Build frontend
cd web && npm install && npm run build && cd ..

# Build backend (embeds frontend)
export PATH=/usr/local/go/bin:$PATH
CGO_ENABLED=0 go build -o bin/itdlupanel ./cmd/panel

# Run
./bin/itdlupanel
```

The panel starts on **http://localhost:8888** by default.

### Default Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin@123456` |

> ⚠️ **Change the default password immediately after first login.**

### Reset Admin Password

```bash
./bin/itdlupanel reset-password -password "NewPassword123"

# Reset for a specific user
./bin/itdlupanel reset-password -user admin -password "NewPassword123"

# With custom config path
./bin/itdlupanel reset-password -config /path/to/panel.json -password "NewPassword123"
```

### Configuration

Config file auto-generated at `config/panel.json`:

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

**~150 REST endpoints** + 2 WebSocket endpoints, organized by module:

| Module | Endpoints | Auth |
|--------|-----------|------|
| Auth | 9 | Mixed |
| Sites | 14 | JWT + `sites.*` |
| Databases | 8 | JWT + `databases.*` |
| Files | 17 | JWT + `files.*` |
| Docker | 15 | JWT + `docker.*` |
| Security | 12 | JWT + Admin |
| Software | 14 | JWT + Admin |
| Monitor | 5 + WS | JWT |
| Terminal | WS | JWT + `terminal.access` |
| Cron | 8 | JWT + `cron.*` |
| Logs | 7 | JWT + `logs.*` |
| SSL | 9 | JWT + Admin |
| Backups | 6 | JWT + `backup.*` |
| Others | ~20 | Various |

Full API documentation: [`docs/2026-03-22/SPECIFICATION.md`](docs/2026-03-22/SPECIFICATION.md)

---

## 🔒 Security

- **Authentication**: JWT (HS256) with 15-min access + 7-day refresh tokens
- **2FA**: TOTP-based two-factor authentication
- **Password**: bcrypt (cost=12)
- **CSRF**: Cookie + header token validation
- **Rate Limiting**: 60 req/min per IP
- **Audit Trail**: All write operations logged
- **RBAC**: Three roles — Admin (full), Operator (scoped), Viewer (read-only)

---

## 📊 Database

**SQLite** with 16 tables: `users`, `roles`, `sites`, `domains`, `databases`, `ftps`, `crons`, `tasks`, `software`, `plugins`, `firewall_rules`, `backups`, `audit_logs`, `settings`, `docker_containers`, `schema_migrations`

---

## 📁 Project Structure

```
ITDLUPanel/
├── cmd/panel/main.go          # Entry point
├── web.go                     # Embedded frontend (go:embed)
├── internal/
│   ├── api/v1/                # REST handlers (18 files)
│   ├── api/ws/                # WebSocket (terminal, monitor)
│   ├── app/                   # Router, middleware, bootstrap
│   ├── service/               # Business logic (21 services)
│   ├── service/installer/     # Software installers (6)
│   ├── service/vhost/         # Vhost generators (3)
│   ├── database/              # SQLite, migrations, models
│   ├── config/                # JSON config loader
│   ├── pkg/                   # Shared utils (crypto, logger, etc.)
│   ├── i18n/                  # Backend translations
│   ├── task/                  # Background task queue
│   └── websocket/             # WS hub
├── web/src/
│   ├── pages/                 # 15 pages (~10K LOC)
│   ├── layouts/               # MainLayout, AuthLayout
│   ├── components/            # NginxManageModal, RequireSoftware
│   ├── stores/                # auth, theme (Zustand)
│   ├── hooks/                 # useIsMobile, useBreakpoint
│   ├── services/api.ts        # Axios client
│   ├── types/                 # TypeScript interfaces
│   ├── router/                # Route definitions
│   └── i18n/                  # EN/VI translations
└── docs/                      # Architecture & spec docs
```

---

## 🌐 Supported Software

| Software | Install | Configure | Monitor |
|----------|---------|-----------|---------|
| Nginx | ✅ | ✅ | ✅ |
| Apache | ✅ | ✅ | ✅ |
| OpenLiteSpeed | ✅ | ✅ | ✅ |
| PHP 7.4–8.3 | ✅ | ✅ | ✅ |
| MySQL/MariaDB | ✅ | ✅ | ✅ |
| Redis | ✅ | ✅ | ✅ |
| phpMyAdmin | ✅ | — | — |
| Docker | Detect | ✅ | ✅ |

---

## 📄 Documentation

- [System Architecture](docs/2026-03-22/SYSTEM_ARCHITECTURE.md)
- [Specification](docs/2026-03-22/SPECIFICATION.md)

---

## 📝 License

MIT License — © 2026 Đại học Đà Lạt (Dalat University)
