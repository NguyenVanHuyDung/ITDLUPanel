# ITDLUPanel — Implementation Plan

## Tổng quan

Dự án được chia thành **20 phases**, **87 tasks**, triển khai theo thứ tự phụ thuộc.
Mỗi phase xây dựng trên nền tảng của phase trước đó.

---

## Phase 1: Foundation & Core Infrastructure

**Mô tả**: Setup project Go, database, config, core HTTP server, build system
**Phụ thuộc**: Không có (phase đầu tiên)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p1-project-init` | Init Go project & structure | Init Go module `github.com/itdlu/panel`, tạo toàn bộ directory structure (cmd/, internal/, web/, scripts/), Makefile, .gitignore |
| 2 | `p1-database` | SQLite database layer | Setup SQLite với `modernc.org/sqlite` (CGO-free). Tạo migration system, toàn bộ core tables (users, sites, databases, ftps, crons, tasks, software, plugins, firewall_rules, backups, audit_logs, settings, docker_containers) |
| 3 | `p1-config` | Config management | Configuration manager đọc/ghi `panel.json`. Support default values, env overrides. Quản lý: port, SSL, language, paths |
| 4 | `p1-logging` | Structured logging | Setup zerolog với file + console output. Log rotation. Levels: debug, info, warn, error |
| 5 | `p1-shell` | Shell executor | Safe shell command executor wrapper. Prevent injection (không dùng string interpolation). Timeout support. Stdout/stderr capture |
| 6 | `p1-os-detect` | OS detection | Detect Ubuntu 22/24, AlmaLinux. Map package managers (apt/dnf). Map service names. Map repo sources |
| 7 | `p1-http-server` | HTTP server + middleware | Gin router setup. Middleware chain: recovery, logging, CORS, compression. Serve SPA static files (embed.FS). Health check endpoint |
| 8 | `p1-api-response` | API response format | Standard JSON response: `{code, message, data}`. Error types. Pagination helpers. Validation error format |
| 9 | `p1-i18n-be` | Backend i18n | go-i18n setup với EN + VI locale files. Translation function. Language detection từ header/config |
| 10 | `p1-build` | Build system | Makefile targets: `build`, `dev`, `test`, `lint`, `clean`. Cross-compile cho linux/amd64, linux/arm64. Embed frontend vào binary |

---

## Phase 2: Authentication & User Management

**Mô tả**: Login, JWT, 2FA, RBAC, user CRUD
**Phụ thuộc**: Phase 1

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p2-user-model` | User model + CRUD | User model với bcrypt password hashing (cost=12). CRUD operations. Default admin user tạo khi init DB |
| 2 | `p2-jwt` | JWT authentication | Access token (15min TTL) + refresh token (7 days, httpOnly cookie). Token generation, validation, refresh logic |
| 3 | `p2-login` | Login/logout API | POST /auth/login (verify credentials → issue tokens), POST /auth/logout (invalidate refresh token) |
| 4 | `p2-rate-limit` | Rate limiting | Per-IP rate limiter middleware. 5 failed login attempts → block 5 min, exponential backoff |
| 5 | `p2-csrf` | CSRF protection | CSRF token generation. Double-submit cookie pattern. Middleware validation cho POST/PUT/DELETE |
| 6 | `p2-rbac` | RBAC system | Roles table, permissions dạng JSON arrays. Auth middleware kiểm tra permission per route. Default roles: admin, operator, viewer |
| 7 | `p2-2fa` | Two-factor authentication | TOTP implementation (`pquerna/otp`). QR code generation (PNG). Enable/disable/verify API endpoints |
| 8 | `p2-audit` | Audit logging | Middleware log tất cả mutations vào audit_logs table: user, action, resource, detail, IP, user_agent |

---

## Phase 3: Frontend Foundation

**Mô tả**: React project setup, layout, routing, auth UI
**Phụ thuộc**: Phase 1 (HTTP server), Phase 2 (Auth API)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p3-react-init` | Init React project | Create React + TypeScript + Vite project trong `web/`. Setup tsconfig, ESLint, Prettier |
| 2 | `p3-design-system` | Design system & theme | Tailwind CSS config với DLU colors (blue #1565C0, green #2E7D32). Ant Design 5 / shadcn setup. Global styles. Font: Inter + JetBrains Mono |
| 3 | `p3-layout` | Main layout | Sidebar navigation (250px, collapsible), header bar (search, user, language switcher), content area. Responsive breakpoints |
| 4 | `p3-router` | React Router | Route config cho tất cả pages. Protected routes (redirect nếu chưa login). Lazy loading per page |
| 5 | `p3-api-client` | API client | Axios instance với JWT interceptor. Auto refresh token khi 401. Error handling. Request/response typing |
| 6 | `p3-auth-store` | Auth store + login page | Zustand auth store (user, tokens, login/logout actions). Login page UI (form, validation, error display) |
| 7 | `p3-i18n-fe` | Frontend i18n | react-i18next setup. EN + VI translation files. Language switcher component trong header |
| 8 | `p3-setup-wizard` | First-time setup wizard | Stack selection wizard (LAMP/LEMP/LOMP). Version selection dropdowns. Installation progress bar |
| 9 | `p3-notifications` | Notification system | Toast notifications (success, error, warning, info). Alert modals. Task progress notifications |

---

## Phase 4: Dashboard & System Monitoring

**Mô tả**: Dashboard overview, system metrics, real-time monitoring
**Phụ thuộc**: Phase 3 (Frontend layout), Phase 1 (Shell executor)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p4-system-info` | System info collector | Go service thu thập CPU, RAM, Disk, Network, Uptime qua `gopsutil`. Cache với refresh interval 2s |
| 2 | `p4-dashboard-api` | Dashboard API endpoints | GET /dashboard trả về system overview. Software status. Counts (sites, databases, FTP, crons) |
| 3 | `p4-dashboard-ui` | Dashboard page | Overview cards (CPU, RAM, Disk gauges), network chart, software list, quick stats. Responsive grid |
| 4 | `p4-realtime-ws` | Real-time WebSocket | WebSocket endpoint streaming system metrics mỗi 2s. gorilla/websocket hub. Connection management |
| 5 | `p4-monitor-ui` | Monitor page | CPU/RAM/Network/Disk time-series charts (ECharts). Process list table. Service status indicators |

---

## Phase 5: Software Management & Stack Installation

**Mô tả**: Install/manage Nginx, Apache, OLS, MySQL, PHP, etc.
**Phụ thuộc**: Phase 4 (WebSocket for progress), Phase 1 (Shell, OS detect)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p5-task-worker` | Background task worker | Goroutine pool (max 3 concurrent) với SQLite-backed queue. Progress updates. WebSocket broadcast. Persistent across restart |
| 2 | `p5-installer-framework` | Software installer framework | Base installer interface. Script execution với progress parsing. Status tracking trong DB. Rollback on failure |
| 3 | `p5-nginx` | Nginx installer + manager | Install Nginx qua apt/dnf. Service start/stop/restart (systemctl). Config file management |
| 4 | `p5-apache` | Apache installer + manager | Install Apache (apache2/httpd) qua apt/dnf. Service management |
| 5 | `p5-ols` | OpenLiteSpeed installer + manager | Install OLS từ official repo. Service management |
| 6 | `p5-mysql` | MySQL/MariaDB installer + manager | Install MySQL/MariaDB. Root password setup. Service management |
| 7 | `p5-php` | PHP multi-version installer | Install PHP 7.4/8.1/8.2/8.3 với FPM. Extension management. PHP-FPM service per version |
| 8 | `p5-ftp-install` | Pure-FTPd installer | Install Pure-FTPd. Default config. Service management |
| 9 | `p5-redis` | Redis installer | Install Redis server. Default config. Service management |
| 10 | `p5-phpmyadmin` | phpMyAdmin installer | Install phpMyAdmin. Configure Nginx/Apache access |
| 11 | `p5-stack-wizard` | Stack wizard backend | API orchestrate multiple software installs theo stack (LAMP/LEMP/LOMP). Progress tracking |
| 12 | `p5-software-ui` | Software management page | Frontend: software list (installed + available), install/uninstall buttons, status indicators, version info |

---

## Phase 6: Website Management

**Mô tả**: Tạo, quản lý website, domain, vhost config
**Phụ thuộc**: Phase 5 (Nginx/Apache/OLS installed)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p6-site-service` | Site CRUD service | Create: tạo directory, generate vhost config, reload webserver. Update/Delete tương tự |
| 2 | `p6-vhost-nginx` | Nginx vhost template engine | Go template cho Nginx server block. Hỗ trợ: SSL, PHP-FPM, redirects, rewrites, caching |
| 3 | `p6-vhost-apache` | Apache vhost template engine | Go template cho Apache VirtualHost. Hỗ trợ tương tự Nginx |
| 4 | `p6-vhost-ols` | OLS vhost template engine | Go template cho OpenLiteSpeed virtual host |
| 5 | `p6-domains` | Domain management | Add/remove domains per site. Set primary domain. Update vhost config |
| 6 | `p6-php-switch` | PHP version switching | Switch PHP-FPM version per site. Update vhost config. Restart PHP-FPM |
| 7 | `p6-site-config` | Site config editor | Raw config file viewer/editor. Syntax validation trước save |
| 8 | `p6-website-ui` | Website management page | Frontend: site list table, create modal (domain, PHP version), detail view, config editor (Monaco), status controls |

---

## Phase 7: SSL & Let's Encrypt

**Mô tả**: SSL certificate management, ACME auto-renewal
**Phụ thuộc**: Phase 6 (Website management)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p7-acme` | ACME/Let's Encrypt client | Integrate `go-acme/lego` library. HTTP-01 challenge. Certificate issuance. Store cert files |
| 2 | `p7-auto-renew` | SSL auto-renewal | Scheduled check (daily). Auto-renew certificates 30 days trước expiry. Reload webserver |
| 3 | `p7-custom-ssl` | Custom SSL upload | Upload certificate + key file. Validate certificate chain. Apply to website |
| 4 | `p7-panel-ssl` | Panel self-signed SSL | Generate self-signed cert cho panel HTTPS. Config update. Restart panel |
| 5 | `p7-ssl-ui` | SSL management UI | Frontend: SSL status per site (active/expired/none), issue/renew buttons, upload form |

---

## Phase 8: Database Management

**Mô tả**: Quản lý MySQL/MariaDB databases
**Phụ thuộc**: Phase 5 (MySQL/MariaDB installed)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p8-db-service` | Database CRUD service | Create/delete MySQL/MariaDB databases via SQL. User/permission management (GRANT/REVOKE) |
| 2 | `p8-db-backup` | Database backup/restore | Backup: mysqldump → gzip. Restore: gunzip → mysql import. Scheduled backups qua cron |
| 3 | `p8-db-ui` | Database management page | Frontend: DB list table, create modal, password change, backup/restore buttons, size display, phpMyAdmin link |

---

## Phase 9: FTP Management

**Mô tả**: Quản lý FTP accounts qua Pure-FTPd
**Phụ thuộc**: Phase 5 (Pure-FTPd installed)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p9-ftp-service` | FTP account service | Pure-FTPd user CRUD (pure-pw useradd/userdel/passwd). Password management. Directory binding. Enable/disable |
| 2 | `p9-ftp-ui` | FTP management page | Frontend: FTP user list, create/edit modal, password change, status toggle, directory path |

---

## Phase 10: File Manager

**Mô tả**: Web file manager đầy đủ tính năng
**Phụ thuộc**: Phase 1 (Shell executor), Phase 3 (Layout)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p10-file-service` | File manager service | Directory listing (path, size, permissions, dates), file read/write, upload (multipart chunked), download (auth token), mkdir, rename, copy, move, delete, compress (tar.gz/zip), decompress, chmod/chown, search |
| 2 | `p10-file-ui` | File manager page | Frontend: directory tree sidebar, file list (table view), breadcrumb navigation, context menu (right-click), upload button (drag & drop), code editor (Monaco), file preview (images), search bar |

---

## Phase 11: Web Terminal

**Mô tả**: SSH terminal qua WebSocket
**Phụ thuộc**: Phase 4 (WebSocket infrastructure)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p11-terminal-ws` | WebSocket terminal backend | SSH client via `golang.org/x/crypto/ssh`. PTY allocation. Window resize. WebSocket proxy. Local auth (root) |
| 2 | `p11-terminal-ui` | Terminal page | Frontend: xterm.js terminal component. Multi-tab support. Resize handling. Dark theme. Copy/paste. Font: JetBrains Mono |

---

## Phase 12: Cron Job Management

**Mô tả**: Quản lý scheduled tasks
**Phụ thuộc**: Phase 1 (Shell executor), Phase 3 (Layout)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p12-cron-service` | Cron job service | CRUD cron jobs. Đồng bộ với system crontab (crontab -l/-e). Execution logging. Status control (enable/disable) |
| 2 | `p12-cron-ui` | Cron management page | Frontend: cron list table, create/edit modal, cron schedule picker (visual), execution log viewer, run-now button |

---

## Phase 13: Firewall & Security

**Mô tả**: Firewall rules, SSH security, brute-force protection
**Phụ thuộc**: Phase 1 (Shell executor), Phase 3 (Layout)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p13-firewall` | Firewall service | iptables wrapper (Ubuntu) / firewalld wrapper (AlmaLinux). Port rules (allow/deny). IP whitelist/blacklist. SSH config (port, root login, key auth). Fail2ban integration |
| 2 | `p13-security-ui` | Security page | Frontend: firewall rules table (add/edit/delete), SSH settings form, fail2ban status & config, IP whitelist/blacklist |

---

## Phase 14: Docker Management

**Mô tả**: Quản lý Docker containers/images
**Phụ thuộc**: Phase 1 (Shell executor), Phase 3 (Layout)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p14-docker-service` | Docker management service | Docker Engine API client (via Unix socket `/var/run/docker.sock`). Container CRUD, start/stop/restart, logs. Image pull/list/remove. Network/volume list |
| 2 | `p14-docker-ui` | Docker management page | Frontend: container list (status, ports, uptime), image list, create container form (image, ports, volumes, env), log viewer (streaming), network/volume tabs |

---

## Phase 15: Log Management

**Mô tả**: Xem và quản lý logs
**Phụ thuộc**: Phase 1 (Logging), Phase 3 (Layout)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p15-log-service` | Log management service | Read panel logs, website access/error logs, SSH login logs (`/var/log/auth.log`), audit logs. Log streaming (tail -f qua WebSocket). Search/filter. Clear logs. Log rotation config |
| 2 | `p15-log-ui` | Logs page | Frontend: tabbed viewer (Panel, Website, SSH, Audit), real-time streaming toggle, search bar, date filter, clear button, export. Dark background cho log content (monospace font) |

---

## Phase 16: Backup System

**Mô tả**: Backup/restore website, database
**Phụ thuộc**: Phase 6 (Sites), Phase 8 (Databases)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p16-backup-service` | Backup service | Site backup: tar.gz toàn bộ document root. DB backup: mysqldump → gzip. Panel config backup. Scheduled backup qua cron. Local storage (/ITDLUPanel/backup/). Framework cho future remote backup (Google Drive, S3) |
| 2 | `p16-backup-ui` | Backup page | Frontend: backup list (type, size, date), create backup button (chọn site/DB), restore button, download, delete. Scheduled backup config |

---

## Phase 17: Plugin System & App Store

**Mô tả**: Plugin engine, store interface
**Phụ thuộc**: Phase 1 (HTTP server)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p17-plugin-engine` | Plugin engine | Plugin loader (Go plugin .so hoặc subprocess). Plugin API interface (routes, hooks, settings). Lifecycle: install, enable, disable, uninstall. Plugin registry. Settings storage |
| 2 | `p17-appstore-ui` | App Store page | Frontend: plugin grid/list view (icon, name, description, version, author), install/uninstall button, enable/disable toggle, settings panel per plugin, search & categories |

---

## Phase 18: Settings & Panel Management

**Mô tả**: Panel settings, account management
**Phụ thuộc**: Phase 1 (Config)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p18-settings-service` | Settings service | Panel settings CRUD. Port change (update config + restart). SSL config. Password change. Admin path customization. Language switching. API token management. Panel update mechanism |
| 2 | `p18-settings-ui` | Settings page | Frontend: tabbed settings (Basic: port/username/password, SSL: panel certificate, Security: IP whitelist/admin path, Backup: auto-backup config, Notifications, API tokens). Save button per section |

---

## Phase 19: Installation Script & Packaging

**Mô tả**: One-line install script, systemd service
**Phụ thuộc**: Phase 1 (Build system)

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p19-install-script` | Install script | Bash `install.sh`: detect OS (Ubuntu/AlmaLinux), check requirements (RAM, disk), install system deps, download correct binary, setup directories (/ITDLUPanel/*), generate default admin credentials, setup systemd, start service, display access info |
| 2 | `p19-systemd` | Systemd service | `itdlupanel.service` unit file. Service management script (`itdlupanel start/stop/restart/status/logs/default`). Auto-restart on failure. Uninstall script |
| 3 | `p19-cross-compile` | Cross-compile build | Build pipeline: compile cho linux/amd64 + linux/arm64. GitHub Actions CI/CD workflow. Release artifacts. Version tagging |

---

## Phase 20: Testing, Polish & Documentation

**Mô tả**: Testing, bug fixes, documentation
**Phụ thuộc**: Tất cả phases trước

| # | Task ID | Task | Mô tả chi tiết |
|---|---------|------|-----------------|
| 1 | `p20-backend-tests` | Backend unit tests | Unit tests cho core services (auth, site, database, file, etc.). Integration tests cho API endpoints. Test database fixtures. Coverage target: 70%+ |
| 2 | `p20-frontend-tests` | Frontend tests | Component tests (Vitest + Testing Library). E2E tests cho critical flows (login, create site, file upload). Coverage target: 60%+ |
| 3 | `p20-security-audit` | Security audit | Review tất cả system commands (check injection). Validate auth flows. Check file path traversal. Test rate limiting. Input fuzzing |
| 4 | `p20-docs` | Documentation | README.md (overview, screenshots). Installation guide. User guide. Plugin development guide. API documentation (OpenAPI/Swagger) |

---

## Dependency Graph (Tóm tắt)

```
Phase 1 (Foundation)
  ├──▶ Phase 2 (Auth)
  │     └──▶ Phase 3 (Frontend)
  │           ├──▶ Phase 4 (Dashboard/Monitor)
  │           │     └──▶ Phase 5 (Software Mgmt)
  │           │           ├──▶ Phase 6 (Websites) ──▶ Phase 7 (SSL)
  │           │           ├──▶ Phase 8 (Databases)
  │           │           └──▶ Phase 9 (FTP)
  │           ├──▶ Phase 10 (File Manager)
  │           ├──▶ Phase 11 (Terminal)
  │           ├──▶ Phase 12 (Cron)
  │           ├──▶ Phase 13 (Security)
  │           ├──▶ Phase 14 (Docker)
  │           ├──▶ Phase 15 (Logs)
  │           ├──▶ Phase 16 (Backup) ◀── Phase 6 + Phase 8
  │           ├──▶ Phase 17 (Plugins)
  │           └──▶ Phase 18 (Settings)
  └──▶ Phase 19 (Install Script)

Phase 20 (Testing & Docs) ◀── All phases
```

---

## Parallel Work Opportunities

Các phases có thể làm song song nếu đủ nhân lực:

| Song song nhóm 1 | Song song nhóm 2 | Song song nhóm 3 |
|-------------------|-------------------|-------------------|
| Phase 10 (Files) | Phase 11 (Terminal) | Phase 12 (Cron) |
| Phase 13 (Security) | Phase 14 (Docker) | Phase 15 (Logs) |

Sau khi Phase 5 hoàn thành:
| Song song A | Song song B | Song song C |
|-------------|-------------|-------------|
| Phase 6 (Websites) → Phase 7 (SSL) | Phase 8 (Databases) | Phase 9 (FTP) |

---

## Conventions & Standards

### Code Style
- **Go**: `gofmt` + `golangci-lint` (standard Go style)
- **TypeScript/React**: ESLint + Prettier (Airbnb style)
- **CSS**: Tailwind utility classes, BEM cho custom CSS
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)

### Naming Conventions
- **Go files**: `snake_case.go`
- **Go types/functions**: `PascalCase` (exported), `camelCase` (unexported)
- **React components**: `PascalCase.tsx`
- **API routes**: `kebab-case` (e.g., `/api/v1/firewall/rules`)
- **Database tables**: `snake_case` (plural)
- **i18n keys**: `module.action.detail`

### Git Branching
- `main` — production-ready
- `develop` — integration branch
- `feature/{phase}-{task}` — feature branches (e.g., `feature/p1-database`)
- `fix/{description}` — bug fixes
- `release/{version}` — release preparation
