# ITDLUPanel — Linux Server Management Panel

[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-University_Project-blue)](#license)

An open-source Linux server management panel built by **Dalat University (DLU)**. ITDLUPanel delivers a modern, all-in-one web interface for managing Ubuntu/Debian servers — from website hosting and database administration to Docker containers and security hardening.

---

## Overview

- **Single binary deployment** — Go backend with embedded React frontend; no external runtime dependencies
- **SQLite database** — zero-configuration data storage in WAL mode; no separate database server required
- **Multi-user RBAC** — three roles (admin / operator / viewer) with granular permission control
- **Two-factor authentication** — TOTP-based 2FA with JWT session management
- **Built for Dalat University** — designed for university infrastructure management and educational environments

### Supported Platforms

| OS             | Version     |
| -------------- | ----------- |
| Ubuntu         | 20.04+      |
| Debian         | 11+         |

---

## Key Features

### Server Management

- **Real-time dashboard** — live CPU, RAM, disk, and network monitoring via WebSocket (2-second intervals)
- **Historical metrics** — view trends over 1 day, 7 days, or 30 days with automatic data aggregation
- **Process management** — view the full process table, send signals, or kill processes directly from the UI
- **Software installer** — one-click installation for nginx, Apache, OpenLiteSpeed, PHP (multiple versions), MySQL, Redis, PureFTPd, and phpMyAdmin

### Website Hosting

- **Multi-site management** — create and manage virtual hosts for nginx, Apache, and OpenLiteSpeed
- **PHP version switching** — change PHP versions per site without manual configuration
- **Domain & alias management** — add domains, subdomains, and server aliases
- **SSL certificates** — automated Let's Encrypt provisioning, custom certificate upload, and certificate holder management
- **Site config editor** — in-browser editing with Monaco Editor (syntax highlighting, autocomplete)

### File Management

- **Full-featured file manager** — list and grid views, drag-and-drop upload, breadcrumb navigation
- **Code editor** — Monaco-powered editor for directly editing server files
- **Terminal integration** — open a terminal popup at the current directory path
- **Bookmarks & search** — bookmark frequently accessed paths; search by filename or file content
- **Archive operations** — compress and decompress zip, tar, and tar.gz archives
- **Remote download** — download files from URLs directly to the server
- **Batch operations** — multi-select for copy, move, delete, and permission changes
- **Permissions management** — set file/directory permissions and ownership (user:group)

### Database & FTP

- **Database CRUD** — create, manage, and drop MySQL/MariaDB/PostgreSQL databases and users
- **phpMyAdmin integration** — accessible on port 888 for advanced database operations
- **FTP accounts** — manage FTP user accounts via PureFTPd with per-user directory and quota control

### Docker

- **Container lifecycle** — start, stop, restart, remove, and view logs for Docker containers
- **Image management** — pull new images, list existing images, and delete unused ones
- **System information** — view Docker daemon info, disk usage, and system-wide statistics

### Security

- **Firewall management** — add/remove port and IP rules, block ICMP, view listening ports
- **SSH configuration** — manage SSH daemon settings from the panel
- **Fail2ban integration** — view and manage Fail2ban jails and banned IPs

### Monitoring

- **Real-time WebSocket metrics** — CPU, memory, disk I/O, and network throughput pushed every 2 seconds
- **Data aggregation pipeline** — raw metrics → 5-minute averages → 1-hour averages → 1-day averages
- **Configurable retention** — set how long each aggregation tier is retained
- **Process table** — sortable process list with the ability to send kill signals

### Other

- **Cron job scheduler** — visual cron builder with predefined templates and raw expression support
- **Backup & restore** — create and restore full or partial backups of sites and databases
- **Audit logging** — every user action is logged with timestamp, IP, and details
- **Panel SSL** — secure the panel itself with HTTPS
- **Internationalization (i18n)** — English and Vietnamese language support
- **Theming** — dark and light themes with automatic system preference detection

---

## Architecture

```
┌─────────────────────────────────────────────┐
│          Frontend (React 19 + TS)           │
│  Ant Design v6 │ Tailwind v4 │ Vite 8      │
│  Monaco Editor │ xterm.js │ Recharts        │
└──────────────────┬──────────────────────────┘
                   │ REST API + WebSocket
┌──────────────────┴──────────────────────────┐
│           Backend (Go 1.25 + Gin)           │
│  JWT Auth │ RBAC │ Rate Limiting │ CSRF     │
│  Task Queue (4 workers) │ WS Hub            │
├─────────────────────────────────────────────┤
│  Services: Auth, Site, SSL, DB, File, FTP,  │
│  Docker, Cron, Firewall, Monitor, Backup,   │
│  Software, Security, Settings, Terminal     │
├─────────────────────────────────────────────┤
│  SQLite (WAL mode) │ 16+ tables             │
│  Metrics Collector │ SSL Renewer             │
└─────────────────────────────────────────────┘
```

### Tech Stack

| Layer      | Technology                                            |
| ---------- | ----------------------------------------------------- |
| Backend    | Go 1.25, Gin framework, modernc.org/sqlite (CGo-free) |
| Frontend   | React 19, TypeScript, Ant Design v6, Tailwind CSS v4  |
| Bundler    | Vite 8                                                |
| Database   | SQLite (WAL mode)                                     |
| Editors    | Monaco Editor (code), xterm.js (terminal)             |
| Charts     | Recharts                                              |
| State      | Zustand                                               |
| HTTP Client| Axios                                                 |

---

## Quick Start

### Build from Source

```bash
# Clone the repository
git clone https://github.com/itdlu/ITDLUPanel.git
cd ITDLUPanel

# Build (compiles Go binary + React frontend)
make build

# The output binary is at ./bin/itdlupanel
```

### Run

```bash
# Start the panel with the default configuration
./bin/itdlupanel -config config/panel.json
```

### Access

```
URL:      http://<server-ip>:8888
Username: admin
Password: admin@123456
```

> **⚠️ Important:** Change the default credentials immediately after first login.

---

## API Overview

ITDLUPanel exposes **150+ REST endpoints** under the `/api/v1/` prefix, organized by resource:

| Category   | Prefix                    | Description                        |
| ---------- | ------------------------- | ---------------------------------- |
| Auth       | `/api/v1/auth/`           | Login, logout, 2FA, token refresh  |
| Dashboard  | `/api/v1/dashboard/`      | System stats, resource usage       |
| Sites      | `/api/v1/sites/`          | Website CRUD, vhost config         |
| SSL        | `/api/v1/ssl/`            | Certificate management             |
| Databases  | `/api/v1/databases/`      | DB and user management             |
| Files      | `/api/v1/files/`          | File operations, upload, download  |
| FTP        | `/api/v1/ftp/`            | FTP account management             |
| Docker     | `/api/v1/docker/`         | Containers, images, system info    |
| Cron       | `/api/v1/cron/`           | Cron job management                |
| Firewall   | `/api/v1/firewall/`       | Port/IP rules, ICMP, listeners     |
| Software   | `/api/v1/software/`       | Software install/uninstall         |
| Monitor    | `/api/v1/monitor/`        | Historical metrics                 |
| Security   | `/api/v1/security/`       | SSH, Fail2ban                      |
| Backup     | `/api/v1/backup/`         | Backup and restore                 |
| Settings   | `/api/v1/settings/`       | Panel configuration                |
| Users      | `/api/v1/users/`          | User and role management           |

### WebSocket Endpoints

| Endpoint                        | Description                              |
| ------------------------------- | ---------------------------------------- |
| `/api/v1/terminal`              | Interactive shell session (xterm.js)     |
| `/api/v1/monitor/realtime`      | Real-time system metrics (2s interval)   |

### Authentication & Security

- **JWT Bearer tokens** — pass via `Authorization: Bearer <token>` header
- **Rate limiting** — 60 requests per minute per IP
- **CSRF protection** — token-based CSRF for state-changing operations
- **Audit logging** — all API calls are recorded with user, IP, and timestamp

> Full endpoint reference is available in [SPECIFICATION.md](../SPECIFICATION.md).

---

## Project Structure

```
ITDLUPanel/
├── cmd/panel/main.go              # Application entry point
├── internal/
│   ├── app/                       # App bootstrap, router setup, middleware registration
│   ├── api/v1/                    # HTTP handlers (15 handler files)
│   ├── api/ws/                    # WebSocket handlers (terminal, monitor)
│   ├── service/                   # Business logic layer (20+ services)
│   ├── service/installer/         # Software installers (nginx, Apache, PHP, MySQL, etc.)
│   ├── service/vhost/             # Virtual host generators (nginx, Apache, OpenLiteSpeed)
│   ├── database/                  # SQLite connection, schema migrations
│   ├── middleware/                # Auth, CORS, rate limiter, audit logger, CSRF
│   ├── websocket/                 # WebSocket hub, client management, event routing
│   └── config/                    # Configuration loading and validation
├── web/
│   └── src/
│       ├── pages/                 # 16 page modules (Dashboard, Sites, Files, etc.)
│       ├── components/            # Shared UI components
│       ├── stores/                # Zustand state stores
│       ├── services/              # API client layer (Axios)
│       └── hooks/                 # Shared React hooks
├── config/
│   └── panel.json                 # Panel configuration file
├── data/
│   └── panel.db                   # SQLite database (created at runtime)
├── docs/                          # Documentation
├── Makefile                       # Build targets
└── go.mod                         # Go module definition
```

---

## Configuration

The panel is configured via `config/panel.json`. Below is the structure with default values:

```jsonc
{
  // Server settings
  "server": {
    "host": "0.0.0.0",       // Bind address
    "port": 8888,             // Listen port
    "mode": "release"         // Gin mode: debug | release
  },

  // Database settings
  "database": {
    "path": "data/panel.db",  // SQLite database file path
    "max_connections": 10     // Connection pool size
  },

  // Authentication
  "auth": {
    "jwt_secret": "",         // JWT signing key (auto-generated if empty)
    "token_expire": 24,       // Token expiration in hours
    "max_login_attempts": 5,  // Lock account after N failed attempts
    "lockout_duration": 15    // Lockout duration in minutes
  },

  // File paths
  "paths": {
    "backup_dir": "data/backups",
    "temp_dir": "data/tmp",
    "log_dir": "data/logs"
  },

  // Panel settings
  "panel": {
    "name": "ITDLUPanel",     // Panel display name
    "language": "en",         // Default language: en | vi
    "ssl_enabled": false,     // Enable HTTPS for the panel
    "ssl_cert": "",           // Path to SSL certificate
    "ssl_key": ""             // Path to SSL private key
  }
}
```

---

## Requirements

### Runtime

| Resource | Minimum | Recommended |
| -------- | ------- | ----------- |
| OS       | Ubuntu 20.04 / Debian 11 | Ubuntu 22.04+ / Debian 12+ |
| RAM      | 512 MB  | 1 GB+       |
| Disk     | 1 GB free | 10 GB+ free |
| Network  | Public or private IP | Public IP with DNS |

### Build Dependencies

| Tool     | Version  | Purpose           |
| -------- | -------- | ----------------- |
| Go       | 1.25+    | Backend compiler  |
| Node.js  | 18+      | Frontend build    |
| Make     | any      | Build automation  |

> **Note:** Build dependencies are only needed to compile from source. The compiled binary has no external runtime dependencies.

---

## Development

```bash
# Start the backend in development mode
go run cmd/panel/main.go -config config/panel.json

# Start the frontend dev server (in a separate terminal)
cd web
npm install
npm run dev
```

The Vite dev server proxies API requests to the Go backend, enabling hot-reload for frontend development.

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository and create a feature branch
2. Follow existing code style and conventions
3. Write clear commit messages
4. Test your changes on a supported platform
5. Submit a pull request with a description of your changes

---

## License

This is a university project developed at **Dalat University (Trường Đại học Đà Lạt)**, Vietnam.

---

<p align="center">
  Built with ❤️ by the IT team at <strong>Dalat University</strong>
</p>
