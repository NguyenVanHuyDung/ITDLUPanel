# ITDLUPanel — Specification

> **Version**: 0.1.0 | **Date**: 2026-03-22 | **Author**: ITDLUPanel Team, Đại học Đà Lạt

---

## 1. Product Overview

**ITDLUPanel** is a web-based Linux server management panel designed for **Đại học Đà Lạt** (Dalat University). It provides system administrators with a unified interface to manage web servers, databases, files, security, Docker containers, and system monitoring through a modern, responsive web UI.

### Key Characteristics

- **Single Binary**: Go backend with embedded React frontend — no external runtime
- **SQLite Storage**: Zero-configuration database, no external DB server needed
- **Multi-Language**: English and Vietnamese UI
- **RBAC**: Three-tier role system (Admin, Operator, Viewer)
- **Real-time**: WebSocket-based terminal and monitoring
- **Responsive**: Full mobile and desktop support

---

## 2. Functional Modules

### 2.1 Dashboard

| Feature | Status | Description |
|---------|--------|-------------|
| System Info | ✅ | Hostname, OS, kernel, uptime, panel version |
| CPU Monitoring | ✅ | Usage %, model, cores, per-core usage, CPU time breakdown |
| Memory Monitoring | ✅ | Used/total/available, swap usage, buffer/cache |
| Disk Monitoring | ✅ | Usage %, filesystem type, mount point, I/O stats, inode info |
| Network Stats | ✅ | Upload/download speed, total transferred |
| Load Average | ✅ | 1/5/15 min averages, process counts |
| Software Status | ✅ | Installed software quick-view badges |
| Area Charts | ✅ | Real-time CPU, memory, network charts |
| Hover Popovers | ✅ | Detailed info on hover for CPU, RAM, Load, Disk circles |

### 2.2 Website Management

| Feature | Status | Description |
|---------|--------|-------------|
| CRUD Operations | ✅ | Create, list, edit, delete websites |
| Domain Aliases | ✅ | Add/remove domain aliases per site |
| PHP Version Switch | ✅ | Switch between installed PHP versions |
| Config Editor | ✅ | Direct nginx/apache config file editing |
| Directory Settings | ✅ | Document root, index file configuration |
| Start/Stop Sites | ✅ | Enable/disable individual sites |
| SSL Management | ⏳ | Placeholder — backend API exists (`/ssl/*`) |
| Redirect Rules | ⏳ | Placeholder — planned |
| Response Logs | ⏳ | Placeholder — backend exists (`/logs/website/*`) |

### 2.3 Database Management

| Feature | Status | Description |
|---------|--------|-------------|
| CRUD Operations | ✅ | Create, list, delete MySQL/MariaDB databases |
| User Management | ✅ | Database user creation with passwords |
| Password Change | ✅ | Update database user passwords |
| Backup/Restore | ✅ | Database backup and restore operations |
| Size Statistics | ✅ | View database size |
| Search/Filter | ✅ | Search databases by name |

### 2.4 File Manager

| Feature | Status | Description |
|---------|--------|-------------|
| Browse | ✅ | Navigate filesystem with breadcrumbs, bookmarks |
| Upload/Download | ✅ | File upload (drag-and-drop), file/directory download |
| Code Editor | ✅ | Monaco-based editor with syntax highlighting, multi-tab |
| Compress/Decompress | ✅ | ZIP, TAR.GZ, TAR creation and extraction |
| Permissions | ✅ | chmod + chown with visual permission editor |
| Copy/Move/Rename | ✅ | File operations with destination picker |
| Search | ✅ | Recursive file search across directories |
| Grid/List View | ✅ | Toggle between grid and list display modes |
| Hidden Files | ✅ | Toggle visibility of dotfiles |
| Inline Terminal | ✅ | Floating draggable terminal window with cwd |
| File Icons | ✅ | 50+ file type icons with extension-based detection |

### 2.5 Terminal

| Feature | Status | Description |
|---------|--------|-------------|
| WebSocket Terminal | ✅ | Full PTY shell via xterm.js |
| Multi-Tab | ✅ | Multiple concurrent terminal sessions |
| Fullscreen Mode | ✅ | Expand terminal to full viewport |
| Status Indicators | ✅ | Connected (green), Connecting (blue), Disconnected (red) |
| Resize Support | ✅ | Dynamic terminal resize |
| CWD Support | ✅ | Start terminal in specified directory |
| Default Path | ✅ | Defaults to `$HOME` |

### 2.6 Security

| Feature | Status | Description |
|---------|--------|-------------|
| Firewall Rules | ✅ | List, add, delete, toggle UFW rules |
| Port Status | ✅ | View listening ports with process info |
| IP Blocking | ✅ | Block/unblock specific IP addresses |
| SSH Configuration | ✅ | Port, root login, password auth, max retries |
| Fail2ban | ✅ | Status monitoring and configuration |
| Direction Filter | ✅ | Filter rules by inbound/outbound |
| Batch Operations | ✅ | Select multiple rules for bulk delete |

### 2.7 System Monitor

| Feature | Status | Description |
|---------|--------|-------------|
| CPU Metrics | ✅ | Real-time CPU usage with charts |
| Memory Metrics | ✅ | RAM and swap usage charts |
| Disk I/O | ✅ | Read/write operations and bandwidth |
| Network Traffic | ✅ | Upload/download bandwidth charts |
| Process List | ✅ | Running processes with CPU/memory usage |
| Services | ✅ | List running system services |
| Fullscreen Charts | ✅ | Click to expand any metric chart |
| 3s Refresh | ✅ | Auto-refresh with 3-second interval |

### 2.8 Docker

| Feature | Status | Description |
|---------|--------|-------------|
| Container CRUD | ✅ | List, create, start, stop, restart, remove |
| Container Logs | ✅ | View container stdout/stderr |
| Container Stats | ✅ | CPU/memory usage per container |
| Image Management | ✅ | List, pull, remove Docker images |
| Networks/Volumes | ✅ | List Docker networks and volumes |
| Docker Detection | ✅ | Graceful handling when Docker not installed |

### 2.9 Cron Jobs

| Feature | Status | Description |
|---------|--------|-------------|
| CRUD Operations | ✅ | Create, edit, delete cron jobs |
| Schedule Builder | ✅ | Visual UI with minute/hour/day/week/month presets |
| Cron Expression | ✅ | Human-readable display (e.g., "Every day at 02:00") |
| Templates | ✅ | Pre-built templates (backup DB, backup sites, etc.) |
| Status Toggle | ✅ | Enable/disable individual jobs |
| Execution Logs | ✅ | View output of past executions |
| Run Now | ✅ | Manual immediate execution |

### 2.10 Logs

| Feature | Status | Description |
|---------|--------|-------------|
| Panel Logs | ✅ | Application logs with level filtering |
| SSH Logs | ✅ | SSH login attempts and activity |
| Website Access Logs | ✅ | Nginx access logs per site |
| Website Error Logs | ✅ | Nginx error logs per site |
| Audit Logs | ✅ | User action audit trail |
| Search/Filter | ✅ | Keyword search with line count control |
| Clear Logs | ✅ | Clear individual log types |

### 2.11 App Store (Software)

| Feature | Status | Description |
|---------|--------|-------------|
| Install Software | ✅ | Install from package list with version selection |
| Uninstall | ✅ | Remove installed packages |
| Service Control | ✅ | Start, stop, restart services |
| Configuration | ✅ | Edit software config files |
| Metrics | ✅ | View performance metrics per software |
| Error Logs | ✅ | View software error logs |
| Task Tracking | ✅ | Real-time installation progress with logs |
| Nginx Manager | ✅ | Dedicated modal for Nginx management |

### 2.12 SSL Certificates

| Feature | Status | Description |
|---------|--------|-------------|
| Let's Encrypt | ✅ | Auto-issue certificates |
| Custom Upload | ✅ | Upload custom SSL cert/key |
| Auto-Renew | ✅ | Background renewal service |
| Self-Signed | ✅ | Generate self-signed certificates |
| Panel SSL | ✅ | Configure SSL for panel itself |
| Certificate List | ✅ | View/delete certificates |

### 2.13 Users & Settings

| Feature | Status | Description |
|---------|--------|-------------|
| User CRUD | ✅ | Create, edit, delete users |
| Role Assignment | ✅ | Admin, Operator, Viewer roles |
| Password Reset | ✅ | Change user passwords |
| 2FA (TOTP) | ✅ | Two-factor authentication |
| Panel Port | ✅ | Change panel listening port |
| Admin Path | ✅ | Custom admin URL path |
| Language Setting | ✅ | Switch UI language (EN/VI) |
| Backup Config | ✅ | Configure backup paths |

### 2.14 FTP

| Feature | Status | Description |
|---------|--------|-------------|
| Account CRUD | ✅ | Create, edit, delete FTP accounts |
| Password Change | ✅ | Update FTP passwords |
| Status Toggle | ✅ | Enable/disable accounts |
| Home Directory | ✅ | Set per-account home directory |

### 2.15 Theme

| Feature | Status | Description |
|---------|--------|-------------|
| Light Mode | ✅ | White sidebar, light content background |
| Dark Mode | ✅ | Dark sidebar and content areas |
| Toggle Button | ✅ | Sun/moon icon on header bar |
| Persistence | ✅ | Saved to localStorage |

---

## 3. API Specification

### 3.1 Endpoint Summary

| Module | Endpoints | Auth | Permission |
|--------|-----------|------|------------|
| Health | 1 | None | None |
| Auth | 9 | Mixed | — |
| Dashboard | 2 | JWT | Any authenticated |
| Monitor | 5 + 1 WS | JWT | Any authenticated |
| Users | 4 | JWT | Admin only |
| Sites | 14 | JWT | `sites.*` |
| SSL | 9 | JWT | Admin only |
| Databases | 8 | JWT | `databases.*` |
| FTP | 7 | JWT | `ftp.*` |
| Files | 17 | JWT | `files.*` |
| Crons | 8 | JWT | `cron.*` |
| Security | 12 | JWT | Admin only |
| Docker | 15 | JWT | `docker.*` |
| Logs | 7 | JWT | `logs.*` |
| Backups | 6 | JWT | `backup.*` |
| Software | 14 | JWT | Admin only |
| Plugins | 7 | JWT | Admin only |
| Settings | 7 | JWT | Admin only |
| Tasks | 4 | JWT | Any authenticated |
| Terminal | 1 WS | JWT (query) | `terminal.access` |
| **Total** | **~150** | | |

### 3.2 Authentication Endpoints

```
POST   /api/v1/auth/login          # Login with username/password
POST   /api/v1/auth/refresh        # Refresh access token
POST   /api/v1/auth/logout         # Logout
GET    /api/v1/auth/me             # Current user info
PUT    /api/v1/auth/password       # Change password
GET    /api/v1/auth/2fa/qrcode     # Generate 2FA QR code
POST   /api/v1/auth/2fa/enable     # Enable 2FA
POST   /api/v1/auth/2fa/disable    # Disable 2FA
POST   /api/v1/auth/2fa/verify     # Verify 2FA code
```

### 3.3 Resource Endpoints (Pattern)

Each resource follows RESTful conventions:

```
GET    /api/v1/{resource}           # List
POST   /api/v1/{resource}           # Create
GET    /api/v1/{resource}/:id       # Get by ID
PUT    /api/v1/{resource}/:id       # Update
DELETE /api/v1/{resource}/:id       # Delete
```

---

## 4. Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| **Performance** | Dashboard loads in < 2s, API response < 500ms |
| **Security** | JWT auth, bcrypt passwords, CSRF protection, rate limiting |
| **Scalability** | Single server, handles 100+ sites |
| **Availability** | Single binary, auto-restart via systemd |
| **Compatibility** | Ubuntu 20.04+, Debian 11+ |
| **Browser Support** | Chrome 90+, Firefox 88+, Safari 14+, Edge 90+ |
| **Responsive** | Mobile (< 768px), tablet, desktop |
| **i18n** | English, Vietnamese |
| **Data Integrity** | SQLite WAL mode, atomic operations |

---

## 5. Supported Software

| Software | Install | Configure | Monitor |
|----------|---------|-----------|---------|
| Nginx | ✅ | ✅ | ✅ |
| Apache | ✅ | ✅ | ✅ |
| OpenLiteSpeed | ✅ | ✅ | ✅ |
| PHP (7.4–8.3) | ✅ | ✅ | ✅ |
| MySQL/MariaDB | ✅ | ✅ | ✅ |
| Redis | ✅ | ✅ | ✅ |
| phpMyAdmin | ✅ | — | — |
| Docker | Detect | ✅ | ✅ |

---

## 6. Completion Status

| Category | Implemented | Total | Coverage |
|----------|-------------|-------|----------|
| Backend API Endpoints | ~150 | ~150 | 100% |
| Frontend Pages | 15 | 15 | 100% |
| Database Tables | 16 | 16 | 100% |
| Services | 21 | 21 | 100% |
| Middleware | 10 | 10 | 100% |
| WebSocket Endpoints | 2 | 2 | 100% |
| **Overall** | | | **~95%** |

**Remaining work**: Website SSL tab, Redirect Rules tab, Response Logs tab (backend APIs exist, frontend integration pending).
