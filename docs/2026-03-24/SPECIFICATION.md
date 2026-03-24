# ITDLUPanel — Feature Specification

> **Project:** ITDLUPanel — Linux Server Management Panel  
> **Built by:** Dalat University (ITDLU)  
> **Stack:** Go (backend) + React (frontend)  
> **Date:** 2026-03-24  
> **Version:** 1.0

---

## Table of Contents

1. [Authentication & Authorization](#1-authentication--authorization)
2. [Dashboard](#2-dashboard)
3. [Websites](#3-websites)
4. [SSL Management](#4-ssl-management)
5. [Databases](#5-databases)
6. [File Manager](#6-file-manager)
7. [FTP Management](#7-ftp-management)
8. [Docker](#8-docker)
9. [App Store (Software)](#9-app-store-software)
10. [Cron Jobs](#10-cron-jobs)
11. [Firewall](#11-firewall)
12. [Monitor](#12-monitor)
13. [Security](#13-security)
14. [Settings](#14-settings)
15. [Users](#15-users)
16. [Logs](#16-logs)
17. [Terminal](#17-terminal)
18. [Task Management](#18-task-management)
19. [Backups](#19-backups)
20. [Plugins](#20-plugins)

---

## 1. Authentication & Authorization

### 1.1 Login

- **Username/password authentication** — standard credential-based login form.
- **2FA verification** — TOTP-based two-factor authentication using a 6-digit code. Users scan a QR code with an authenticator app (Google Authenticator, Authy, etc.) to enroll.
- **Language selector** — toggle between English and Vietnamese (`en` / `vi`) on the login page. Selection persists via localStorage and is sent as `Accept-Language` header.
- **JWT tokens**:
  - Access token: **15-minute** expiry, sent as `Authorization: Bearer <token>`.
  - Refresh token: **7-day** expiry, stored in an HTTP-only secure cookie.
  - Token rotation: issuing a new access token via `/auth/refresh` also rotates the refresh token.

### 1.2 RBAC (Role-Based Access Control)

Three built-in roles with hierarchical permissions:

| Role       | Description                                      |
| ---------- | ------------------------------------------------ |
| `admin`    | Full access to all modules and settings.         |
| `operator` | Read/write access to operational modules.        |
| `viewer`   | Read-only access; cannot modify any resources.   |

Permission granularity is per module using a wildcard notation:

- `sites.*` — all website operations
- `databases.*` — all database operations
- `files.*` — all file manager operations
- `docker.*` — all Docker operations
- `firewall.*` — all firewall operations
- `crons.*` — all cron job operations
- `software.*` — all software/app store operations
- `monitor.*` — all monitoring operations
- `security.*` — all security settings
- `settings.*` — all panel settings
- `users.*` — all user management operations
- `logs.*` — all log viewing operations
- `backups.*` — all backup operations
- `plugins.*` — all plugin operations
- `terminal.*` — terminal access
- `ftp.*` — all FTP operations

### 1.3 API Endpoints

```
POST /api/v1/auth/login          # Authenticate with username/password; returns JWT pair
POST /api/v1/auth/refresh         # Refresh access token using refresh token cookie
POST /api/v1/auth/2fa/verify      # Submit 6-digit TOTP code after login
POST /api/v1/auth/logout          # Invalidate current session and clear refresh cookie
GET  /api/v1/auth/me              # Return current user profile and permissions
PUT  /api/v1/auth/password        # Change current user's password (requires old password)
GET  /api/v1/auth/2fa/qrcode      # Generate TOTP secret and return QR code data URI
POST /api/v1/auth/2fa/enable      # Enable 2FA after verifying initial TOTP code
POST /api/v1/auth/2fa/disable     # Disable 2FA (requires current TOTP code or password)
```

---

## 2. Dashboard

### 2.1 Features

- **System status gauges** — CPU usage, RAM usage, and system Load displayed as ring gauges. Each gauge is clickable to expand a popover with detailed breakdowns:
  - CPU: per-core usage, steal/iowait percentages.
  - RAM: used/free/cached/buffers breakdown.
  - Load: 1min / 5min / 15min averages.
- **Disk usage** — table of mount points showing total/used/free space, filesystem type, I/O read/write stats, and inode usage (used/total/percentage).
- **Overview cards** — quick-glance count cards for:
  - Sites (total / active / stopped)
  - FTP accounts (total / active)
  - Databases (total count)
  - Security alerts (blocked IPs, failed login attempts)
- **Installed software grid** — grid of installed software packages with status indicators (running = green, stopped = red, not installed = gray). Clicking a software tile navigates to its management page.
- **Network traffic chart** — area chart showing inbound/outbound bandwidth over the last 30 data points (one per minute by default). Hoverable tooltips with exact values.
- **Nginx management modal** — quick-access modal from the dashboard to restart/reload Nginx, view status, and see active connections count.

### 2.2 API Endpoints

```
GET /api/v1/dashboard             # Returns system metrics, overview counts, disk info, network stats
GET /api/v1/dashboard/software    # Returns list of installed software with name, version, and status
```

**Response schema for `GET /api/v1/dashboard`:**

```json
{
  "cpu": { "usage": 23.5, "cores": [...] },
  "memory": { "total": 8192, "used": 4096, "free": 2048, "cached": 2048 },
  "load": { "load1": 0.5, "load5": 0.8, "load15": 0.6 },
  "disk": [
    { "mount": "/", "fs": "ext4", "total": 50000, "used": 30000, "free": 20000, "io_read": 1024, "io_write": 512, "inodes_used": 50000, "inodes_total": 500000 }
  ],
  "network": { "points": [...], "rx_rate": 1024, "tx_rate": 512 },
  "overview": { "sites": 5, "ftp": 3, "databases": 8, "security_alerts": 2 },
  "uptime": 86400,
  "hostname": "server01"
}
```

---

## 3. Websites

### 3.1 Features

- **Site CRUD** — create, read, update, and delete website configurations. Creating a site provisions an Nginx server block (or Apache vhost / OLS listener), creates the document root directory, and sets ownership.
- **Domain management** — add/remove domains and aliases for each site. Primary domain designation. Automatic Nginx config regeneration on domain changes.
- **PHP version switching** — per-site PHP version selection from installed PHP versions (e.g., 7.4, 8.0, 8.1, 8.2, 8.3). Switching updates the PHP-FPM socket reference in the web server config.
- **Config editor** — Monaco-based editor for directly editing the Nginx/Apache/OLS configuration file for a site. Syntax highlighting for Nginx config. Validation before save to prevent broken configs.
- **SSL management** (per-site):
  - **Current cert info** — displays issuer, domain(s), expiry date, and validity status.
  - **Let's Encrypt** — one-click issuance via ACME (HTTP-01 challenge). Auto-renewal via cron.
  - **Custom upload** — upload custom certificate (PEM) and private key.
  - **Certificate Holder** — shows which certificate is currently active and allows switching between available certificates.

### 3.2 API Endpoints

```
GET    /api/v1/sites                    # List all sites with pagination and filtering
POST   /api/v1/sites                    # Create a new site
GET    /api/v1/sites/:id                # Get site details by ID
PUT    /api/v1/sites/:id                # Update site settings (name, document root, etc.)
DELETE /api/v1/sites/:id                # Delete site and optionally remove files
POST   /api/v1/sites/:id/start          # Start/enable the site (enable Nginx server block)
POST   /api/v1/sites/:id/stop           # Stop/disable the site (disable Nginx server block)
GET    /api/v1/sites/:id/config         # Get raw web server config for the site
PUT    /api/v1/sites/:id/config         # Update raw web server config (with validation)
PUT    /api/v1/sites/:id/php            # Switch PHP version for the site
POST   /api/v1/sites/:id/domains        # Add a domain/alias to the site
DELETE /api/v1/sites/:id/domains/:did   # Remove a domain/alias from the site
GET    /api/v1/sites/:id/domains        # List all domains for the site
GET    /api/v1/sites/:id/ssl            # Get SSL/TLS status and certificate info for the site
POST   /api/v1/sites/:id/ssl/enable     # Enable SSL for the site
POST   /api/v1/sites/:id/ssl/disable    # Disable SSL for the site
POST   /api/v1/sites/:id/ssl/apply      # Apply a specific certificate to the site
GET    /api/v1/sites/php-versions       # List all installed PHP versions available for sites
```

---

## 4. SSL Management

### 4.1 Features

- **Global certificate inventory** — view all SSL certificates across the server, including Let's Encrypt, self-signed, and custom-uploaded certificates.
- **Let's Encrypt issuance** — issue certificates for one or more domains. Supports HTTP-01 challenge validation. Automatic Nginx config for challenge path.
- **Custom certificate upload** — upload PEM-encoded certificate chain and private key. Validation of certificate/key pair matching.
- **Certificate renewal** — manual renewal trigger for Let's Encrypt certificates. Shows days until expiry.
- **Panel SSL** — manage the SSL certificate used by ITDLUPanel itself. Options: self-signed generation, custom upload.

### 4.2 API Endpoints

```
GET    /api/v1/ssl/certificates          # List all SSL certificates on the server
GET    /api/v1/ssl/certificates/:domain  # Get certificate details for a specific domain
DELETE /api/v1/ssl/certificates/:domain  # Delete a certificate for a specific domain
POST   /api/v1/ssl/letsencrypt           # Issue a new Let's Encrypt certificate
POST   /api/v1/ssl/upload                # Upload a custom certificate and private key
POST   /api/v1/ssl/renew/:domain         # Renew a Let's Encrypt certificate for a domain
GET    /api/v1/ssl/panel                 # Get current panel SSL certificate info
POST   /api/v1/ssl/panel                 # Upload/apply a custom SSL certificate for the panel
POST   /api/v1/ssl/panel/self-signed     # Generate and apply a self-signed certificate for the panel
```

---

## 5. Databases

### 5.1 Features

- **Multi-engine support** — MySQL, MariaDB, and PostgreSQL. Engine auto-detected based on installed software.
- **Database CRUD** — create and delete databases. Database names are validated (alphanumeric + underscore).
- **User management** — each database has an associated user created at database creation time. User permissions are scoped to their database.
- **Password change** — change the password for a database user. Generates secure random passwords with a "generate" button.
- **Backup/restore** — on-demand database dump (`.sql.gz`) and restore from uploaded dump file.
- **phpMyAdmin link** — direct link to phpMyAdmin on port 888 for MySQL/MariaDB databases. Pre-authenticated via token when possible.
- **Size monitoring** — view database size (data + index) in the database list.

### 5.2 API Endpoints

```
GET    /api/v1/databases              # List all databases with size, engine, and user info
POST   /api/v1/databases              # Create a new database and associated user
GET    /api/v1/databases/:id          # Get database details (name, user, size, engine, charset)
DELETE /api/v1/databases/:id          # Drop database and associated user
PUT    /api/v1/databases/:id/password  # Change the database user's password
POST   /api/v1/databases/:id/backup   # Trigger a database backup (returns download URL or task ID)
POST   /api/v1/databases/:id/restore  # Restore database from an uploaded dump file
GET    /api/v1/databases/:id/size     # Get current database size (data + index)
```

---

## 6. File Manager

### 6.1 Features

- **Dual view modes** — list view (table) and grid view (icon thumbnails). Toggle via toolbar button.
- **Breadcrumb navigation** — clickable breadcrumb path segments for quick directory traversal.
- **Bookmarks** — user-defined bookmarks for frequently accessed paths. Default bookmark: `/www/wwwroot`.
- **Toolbar actions**:
  - Upload files (drag-and-drop zone + file picker)
  - New folder / new file creation
  - Search (filename search within current directory tree)
  - Terminal shortcut (opens terminal popup `cd`-ed to current path)
  - Toggle hidden files visibility
- **File table** — columns: Name, Size, Modified, Permissions, Owner. Sortable by each column. Pagination options: 25 / 50 / 100 / 200 items per page.
- **Context menu** — right-click on file/folder for: Open, Edit, Rename, Copy, Move, Delete, Download, Compress, Permissions, Properties.
- **Monaco code editor** — inline file editing with syntax highlighting (auto-detected by extension). Save with `Ctrl+S`.
- **Terminal popup** — embedded terminal that opens pre-navigated to the current file manager path.
- **Drag-and-drop upload** — drop files/folders onto the file list to upload. Progress indicator for each file.
- **Compress/decompress** — support for `.zip`, `.tar`, `.tar.gz` formats. Compress selected files/folders. Decompress archives in-place or to a specified path.
- **Remote download** — download a file from a URL directly to the server. Shows progress.
- **Batch operations** — select multiple files via checkboxes for bulk delete, move, copy, compress, permission change.
- **Permissions/owner management** — chmod and chown dialogs with numeric (e.g., `755`) and symbolic (rwxr-xr-x) notation. Recursive option for directories.
- **File content search** — search within file contents (grep-like) across a directory tree.
- **Loading indicators** — spinner/progress overlays for long-running operations (large uploads, compression, remote downloads).

### 6.2 API Endpoints

```
GET    /api/v1/files                  # List directory contents (query: path, page, per_page, sort, show_hidden)
GET    /api/v1/files/content          # Get file content as text (query: path, encoding)
PUT    /api/v1/files/content          # Save file content (body: path, content, encoding)
POST   /api/v1/files/upload           # Upload file(s) via multipart form (body: path, files[])
GET    /api/v1/files/download         # Download a file (query: path; returns file stream)
POST   /api/v1/files/mkdir            # Create a new directory (body: path)
POST   /api/v1/files/create           # Create a new empty file (body: path)
POST   /api/v1/files/rename           # Rename a file or directory (body: old_path, new_path)
POST   /api/v1/files/copy             # Copy file(s)/folder(s) (body: sources[], destination)
POST   /api/v1/files/move             # Move file(s)/folder(s) (body: sources[], destination)
DELETE /api/v1/files                  # Delete file(s)/folder(s) (body: paths[])
PUT    /api/v1/files/permissions      # Change file permissions (body: path, mode, recursive)
PUT    /api/v1/files/owner            # Change file owner/group (body: path, owner, group, recursive)
POST   /api/v1/files/compress         # Compress files (body: paths[], destination, format)
POST   /api/v1/files/decompress       # Decompress archive (body: path, destination)
GET    /api/v1/files/search           # Search filenames (query: path, keyword)
GET    /api/v1/files/search-content   # Search within file contents (query: path, keyword, extensions)
POST   /api/v1/files/calculate-size   # Calculate total size of files/folders (body: paths[])
POST   /api/v1/files/remote-download  # Download file from URL to server (body: url, destination)
```

---

## 7. FTP Management

### 7.1 Features

- **FTP account CRUD** — create, read, update, and delete FTP user accounts. Backed by Pure-FTPd virtual users.
- **Home directory** — each FTP user is chroot-jailed to a specified home directory.
- **Password management** — change FTP user passwords. Password strength indicator.
- **Enable/disable** — toggle FTP accounts active/inactive without deleting.
- **Status overview** — list all FTP accounts with username, home directory, status (active/inactive), and disk quota.

### 7.2 API Endpoints

```
GET    /api/v1/ftp                # List all FTP accounts
POST   /api/v1/ftp                # Create a new FTP account (body: username, password, home_dir)
GET    /api/v1/ftp/:id            # Get FTP account details
PUT    /api/v1/ftp/:id            # Update FTP account settings (home_dir, quota)
DELETE /api/v1/ftp/:id            # Delete an FTP account
PUT    /api/v1/ftp/:id/password   # Change FTP account password
PUT    /api/v1/ftp/:id/status     # Enable or disable FTP account (body: enabled)
```

---

## 8. Docker

### 8.1 Features

- **Docker availability detection** — when Docker is not installed, displays an alert banner with a one-click "Install Docker" button that triggers a background installation task.
- **Container management**:
  - List all containers (running, stopped, paused) with name, image, status, ports, and created date.
  - Start / stop / restart containers.
  - Remove containers (with optional volume cleanup).
  - View container logs (tail with follow option).
  - View container resource stats (CPU%, memory, network I/O, block I/O).
- **Image management**:
  - List all local images with repository, tag, size, and created date.
  - Pull images from Docker Hub (with tag specification).
  - Delete unused images.
- **System info** — Docker engine version, storage driver, number of containers/images, disk usage.
- **Networks & volumes** — view Docker networks and volumes (read-only listing).

### 8.2 API Endpoints

```
GET    /api/v1/docker/info                  # Docker system info and version
GET    /api/v1/docker/containers            # List all containers (query: all, filters)
POST   /api/v1/docker/containers            # Create and start a new container
GET    /api/v1/docker/containers/:id        # Get container details (inspect)
DELETE /api/v1/docker/containers/:id        # Remove a container (query: force, volumes)
POST   /api/v1/docker/containers/:id/start   # Start a stopped container
POST   /api/v1/docker/containers/:id/stop    # Stop a running container (query: timeout)
POST   /api/v1/docker/containers/:id/restart # Restart a container
GET    /api/v1/docker/containers/:id/logs    # Get container logs (query: tail, since, follow)
GET    /api/v1/docker/containers/:id/stats   # Get container resource usage stats (stream or snapshot)
GET    /api/v1/docker/images                 # List all local images
POST   /api/v1/docker/images/pull            # Pull an image (body: image, tag)
DELETE /api/v1/docker/images/:id             # Delete a local image (query: force)
GET    /api/v1/docker/networks               # List Docker networks
GET    /api/v1/docker/volumes                # List Docker volumes
```

---

## 9. App Store (Software)

### 9.1 Features

- **Three tabs**:
  - **Installed** — software currently installed on the server, with version and status.
  - **Available** — software available for installation from the ITDLUPanel repository.
  - **Stacks** — pre-configured software bundles for one-click deployment.
- **Version selection** — when installing, user can select a specific version from available versions.
- **Install progress** — installations run as background tasks in the task queue. Real-time progress via WebSocket.
- **Service management** — start, stop, restart installed software services directly from the UI.
- **Config editor** — Monaco-based editor for editing software configuration files (e.g., `nginx.conf`, `my.cnf`, `php.ini`). Syntax highlighting per config type.
- **Nginx management modal** — quick-access modal for Nginx-specific operations: restart, reload, test config, view active connections.

### 9.2 Pre-defined Stacks

| Stack | Components                       |
| ----- | -------------------------------- |
| LEMP  | Nginx + MySQL + PHP              |
| LOMP  | OpenLiteSpeed + MySQL + PHP      |
| LAMP  | Apache + MySQL + PHP             |

### 9.3 Supported Software

| Software        | Notes                                          |
| --------------- | ---------------------------------------------- |
| Nginx           | Web server / reverse proxy                     |
| Apache          | HTTP server (mod_php or PHP-FPM)               |
| OpenLiteSpeed   | High-performance web server                    |
| PHP             | Multiple concurrent versions (7.4–8.3+)        |
| MySQL           | Relational database                            |
| Redis           | In-memory data store / cache                   |
| Pure-FTPd       | FTP server for file transfer                   |
| phpMyAdmin      | Web-based MySQL/MariaDB administration (port 888) |

### 9.4 API Endpoints

```
GET    /api/v1/software                        # List all software (installed + available)
POST   /api/v1/software/install                # Install a software package (body: name, version)
POST   /api/v1/software/install-stack          # Install a full stack (body: stack_name, options)
DELETE /api/v1/software/:name                  # Uninstall a software package
POST   /api/v1/software/:name/start            # Start a software service
POST   /api/v1/software/:name/stop             # Stop a software service
POST   /api/v1/software/:name/restart          # Restart a software service
GET    /api/v1/software/:name/status           # Get service status (running/stopped/not installed)
GET    /api/v1/software/:name/config           # Get software configuration file contents
PUT    /api/v1/software/:name/config           # Update software configuration file
POST   /api/v1/software/:name/reload           # Reload software configuration without restart
GET    /api/v1/software/:name/metrics          # Get software-specific metrics (connections, memory, etc.)
GET    /api/v1/software/:name/error-log        # Get recent error log entries for the software
GET    /api/v1/software/:name/optimization     # Get current optimization/tuning parameters
PUT    /api/v1/software/:name/optimization     # Apply optimization/tuning parameters
```

---

## 10. Cron Jobs

### 10.1 Features

- **Job CRUD** — create, read, update, and delete cron jobs. Each job consists of a schedule and a command.
- **Visual schedule builder** — interactive UI for selecting:
  - Minute (0–59, or `*`)
  - Hour (0–23, or `*`)
  - Day of month (1–31, or `*`)
  - Month (1–12, or `*`)
  - Day of week (0–6, or `*`)
  - Common presets: every minute, hourly, daily, weekly, monthly.
- **Custom cron expression** — advanced mode for entering raw cron expressions (e.g., `*/5 * * * *`).
- **Templates tab** — pre-built cron job templates for common tasks: backup database, clear cache, rotate logs, update SSL certificates.
- **Run now** — manually trigger immediate execution of a cron job.
- **Enable/disable** — toggle jobs active/inactive without deleting.
- **Execution logs** — per-job log of past executions with timestamp, exit code, stdout/stderr output, and duration.

### 10.2 API Endpoints

```
GET    /api/v1/crons              # List all cron jobs
POST   /api/v1/crons              # Create a new cron job (body: schedule, command, name)
GET    /api/v1/crons/:id          # Get cron job details
PUT    /api/v1/crons/:id          # Update a cron job (schedule, command, name)
DELETE /api/v1/crons/:id          # Delete a cron job
PUT    /api/v1/crons/:id/status   # Enable or disable a cron job (body: enabled)
GET    /api/v1/crons/:id/log      # Get execution log for a cron job (query: limit, offset)
POST   /api/v1/crons/:id/run      # Trigger immediate execution of a cron job
```

---

## 11. Firewall

### 11.1 Features

- **Port rules** — manage firewall rules by port number. Specify port, protocol (TCP/UDP/both), direction (in/out), and action (allow/deny). Support for port ranges (e.g., `8000-9000`).
- **IP rules** — allow or block traffic from specific IP addresses or CIDR ranges.
- **Blocked IPs** — dedicated view for blacklisted IPs. Add/remove IPs manually. Shows source (manual, Fail2ban).
- **Listening ports** — real-time list of ports currently in use with associated process names and PIDs.
- **Global enable/disable** — master toggle to enable or disable the entire firewall.
- **ICMP block toggle** — option to block ICMP (ping) requests.
- **Bulk operations** — select multiple rules for batch enable/disable/delete.

### 11.2 API Endpoints

```
GET    /api/v1/firewall/rules              # List all firewall rules
POST   /api/v1/firewall/rules              # Create a new firewall rule (body: port, protocol, direction, action, source_ip)
DELETE /api/v1/firewall/rules/:id          # Delete a firewall rule
PUT    /api/v1/firewall/rules/:id/status   # Enable or disable a rule (body: enabled)
GET    /api/v1/firewall/settings           # Get firewall global settings (enabled, icmp_block, etc.)
PUT    /api/v1/firewall/settings           # Update firewall global settings
GET    /api/v1/firewall/port-status        # List currently listening ports with process info
GET    /api/v1/firewall/blocked-ips        # List all blocked IP addresses
POST   /api/v1/firewall/blocked-ips        # Block an IP address (body: ip, reason)
DELETE /api/v1/firewall/blocked-ips        # Unblock an IP address (body: ip)
```

---

## 12. Monitor

### 12.1 Features

- **Historical charts** — time-series charts for CPU, RAM, disk, and network metrics. Built with a charting library (e.g., Recharts or Chart.js).
- **Time range selector** — switch between 1 day, 7 days, and 30 days of historical data.
- **Process table** — real-time list of running processes with columns: PID, Name, User, CPU%, RAM%, Command. Sortable by any column. Search/filter by name.
- **Kill process** — select a process and send a kill signal (SIGTERM or SIGKILL).
- **Real-time WebSocket metrics** — live-updating metrics streamed via WebSocket for dashboard gauges and charts. Pushes data every 2 seconds.

### 12.2 API Endpoints

```
GET    /api/v1/monitor/system              # Current system metrics snapshot (CPU, RAM, swap, load)
GET    /api/v1/monitor/processes           # List running processes (query: sort_by, order, search)
POST   /api/v1/monitor/processes/kill      # Kill a process (body: pid, signal)
GET    /api/v1/monitor/services            # List systemd services and their statuses
GET    /api/v1/monitor/network             # Current network interface stats (rx/tx bytes, packets, errors)
GET    /api/v1/monitor/disk                # Current disk usage and I/O stats per mount point
GET    /api/v1/monitor/history             # Historical metrics (query: metric, range)
DELETE /api/v1/monitor/history             # Purge historical metric data (query: before_date)
GET    /api/v1/monitor/settings            # Get monitoring settings (collection interval, retention)
PUT    /api/v1/monitor/settings            # Update monitoring settings
WS     /api/v1/monitor/realtime            # WebSocket stream for real-time system metrics
```

---

## 13. Security

### 13.1 Features

- **SSH configuration**:
  - Change SSH port (default: 22).
  - Enable/disable root login (`PermitRootLogin`).
  - Enable/disable password authentication (`PasswordAuthentication`).
  - Set max authentication attempts (`MaxAuthTries`).
  - Set login grace timeout (`LoginGraceTime`).
  - Changes are applied by rewriting `/etc/ssh/sshd_config` and restarting sshd.
- **Fail2ban management**:
  - Enable/disable Fail2ban service.
  - Configure ban time (seconds).
  - Configure max retry limit before ban.
  - Configure find time (observation window).
  - Manage IP whitelist (IPs that are never banned).
  - View currently banned IPs with ban reason and expiry.

### 13.2 API Endpoints

```
GET    /api/v1/security/ssh        # Get current SSH configuration
PUT    /api/v1/security/ssh        # Update SSH configuration (body: port, root_login, password_auth, max_attempts, timeout)
GET    /api/v1/security/fail2ban   # Get Fail2ban configuration and status
PUT    /api/v1/security/fail2ban   # Update Fail2ban configuration (body: enabled, ban_time, max_retry, find_time, whitelist)
```

---

## 14. Settings

### 14.1 Features

- **General settings**:
  - Panel port — change the port ITDLUPanel listens on (default: 8443).
  - Admin path — customize the URL path prefix (e.g., `/admin` → `/custom-path`).
  - Language — set default panel language (English / Vietnamese).
- **Panel SSL**:
  - View current certificate info (issuer, expiry, domains).
  - Generate a self-signed certificate for the panel.
  - Upload a custom certificate for the panel.
- **Panel info**:
  - ITDLUPanel version.
  - Operating system and kernel version.
  - Server uptime.
  - Go runtime version.
- **Danger zone**:
  - Reset panel settings to defaults.
  - Uninstall ITDLUPanel (removes panel but preserves websites/databases).
  - Backup panel configuration and data.
  - Restore panel from backup.
  - Clear all panel logs.

### 14.2 API Endpoints

```
GET    /api/v1/settings               # Get all panel settings
PUT    /api/v1/settings               # Update panel settings (batch)
PUT    /api/v1/settings/panel-port    # Change panel listening port (body: port)
PUT    /api/v1/settings/panel-ssl     # Upload/update panel SSL certificate
GET    /api/v1/settings/panel-info    # Get panel version, OS info, uptime, runtime info
PUT    /api/v1/settings/admin-path    # Change admin URL path prefix (body: path)
PUT    /api/v1/settings/language      # Change default language (body: language)
```

---

## 15. Users

### 15.1 Features

- **User CRUD** — create, update, and delete panel user accounts.
- **Role assignment** — assign one of the three roles (`admin`, `operator`, `viewer`) to each user. Role determines permission scope.
- **Password reset** — admin can reset any user's password. Password complexity requirements enforced (min 8 chars, mixed case, numbers, special chars).
- **Enable/disable** — deactivate a user account without deleting it. Disabled users cannot log in.
- **Bulk operations** — select multiple users for batch role change, enable/disable, or delete.

### 15.2 API Endpoints

```
GET    /api/v1/users                # List all panel users (query: page, per_page, search, role)
POST   /api/v1/users                # Create a new panel user (body: username, password, email, role)
PUT    /api/v1/users/:id            # Update user details (body: email, role, enabled)
PUT    /api/v1/users/:id/password   # Reset user password (body: new_password)
DELETE /api/v1/users/:id            # Delete a panel user
```

---

## 16. Logs

### 16.1 Features

- **Panel logs** — ITDLUPanel application logs in JSON format. Filterable by log level (debug, info, warn, error, fatal). Searchable by message content. Auto-refresh toggle.
- **SSH logs** — parsed SSH authentication logs showing login attempts, source IPs, usernames, and success/failure status.
- **Audit logs** — record of all user actions within the panel (who did what, when). Includes: user, action, resource, timestamp, IP address, result. Exportable to CSV.
- **Website logs** — per-site access and error logs. Access logs show request method, URL, status code, response size, referrer, user agent. Error logs show error messages with timestamps.

### 16.2 API Endpoints

```
GET    /api/v1/logs/panel                # Get panel application logs (query: level, search, limit, offset)
GET    /api/v1/logs/website/:id/access   # Get website access logs (query: limit, offset, search)
GET    /api/v1/logs/website/:id/error    # Get website error logs (query: limit, offset, search)
GET    /api/v1/logs/ssh                  # Get SSH authentication logs (query: limit, offset)
GET    /api/v1/logs/audit                # Get audit logs (query: user, action, resource, from, to, limit, offset)
DELETE /api/v1/logs/:type                # Clear logs by type (panel, ssh, audit)
GET    /api/v1/logs/search               # Full-text search across all log types (query: keyword, types[], from, to)
```

---

## 17. Terminal

### 17.1 Features

- **Multi-tab terminal sessions** — open multiple terminal tabs simultaneously. Each tab is an independent shell session.
- **xterm.js** — full-featured terminal emulator in the browser using xterm.js with WebGL renderer for performance.
- **Auto-resize** — terminal dimensions automatically adjust to the browser window/container size. Sends SIGWINCH to the PTY.
- **Scrollback** — configurable scrollback buffer (default: 5000 lines).
- **Fullscreen** — toggle fullscreen mode for distraction-free terminal use.
- **WebSocket-based** — terminal I/O is streamed over a WebSocket connection. JWT token passed as query parameter for authentication.
- **Session persistence** — terminal sessions remain active while the browser tab is open. Reconnects automatically on brief disconnections.

### 17.2 API Endpoints

```
WS /api/v1/terminal?token=<JWT>    # WebSocket endpoint for terminal session
```

**WebSocket message protocol:**

| Direction | Type    | Payload                              |
| --------- | ------- | ------------------------------------ |
| Client→   | `input` | `{ "type": "input", "data": "ls\n" }` |
| Client→   | `resize`| `{ "type": "resize", "cols": 80, "rows": 24 }` |
| →Client   | `output`| `{ "type": "output", "data": "..." }` |
| →Client   | `exit`  | `{ "type": "exit", "code": 0 }`       |

---

## 18. Task Management

### 18.1 Features

- **Task queue** — background task execution system for long-running operations (software installation, backups, bulk operations).
- **Task status tracking** — each task has a status: `pending`, `running`, `completed`, `failed`, `cancelled`.
- **Task logs** — real-time log output for each task, streamable via polling or WebSocket.
- **Task summary** — overview counts by status (e.g., 3 running, 5 completed, 1 failed).
- **Task cleanup** — delete completed/failed tasks from the history.

### 18.2 API Endpoints

```
GET    /api/v1/tasks              # List all tasks (query: status, page, per_page)
GET    /api/v1/tasks/summary      # Get task count summary by status
GET    /api/v1/tasks/:id          # Get task details (name, status, progress, created_at, started_at, finished_at)
GET    /api/v1/tasks/:id/log      # Get task log output (query: offset; supports streaming)
DELETE /api/v1/tasks/:id          # Delete a completed/failed task from history
```

---

## 19. Backups

### 19.1 Features

- **Full system backup** — create a backup of all panel data, site configurations, databases, and SSL certificates.
- **Selective backup** — choose which components to include (sites, databases, SSL, panel settings).
- **Backup scheduling** — (via Cron Jobs) schedule automated backups.
- **Restore** — restore from a backup archive. Supports selective restore of individual components.
- **Download** — download backup archives directly from the panel.
- **Backup management** — list, view details, and delete old backups. Shows backup size and creation date.

### 19.2 API Endpoints

```
GET    /api/v1/backups                  # List all backups (query: page, per_page)
POST   /api/v1/backups                  # Create a new backup (body: components[], description)
GET    /api/v1/backups/:id              # Get backup details (components, size, status, created_at)
DELETE /api/v1/backups/:id              # Delete a backup archive
POST   /api/v1/backups/:id/restore     # Restore from a backup (body: components[])
GET    /api/v1/backups/:id/download     # Download backup archive file
```

---

## 20. Plugins

### 20.1 Features

- **Plugin system** — extensible architecture allowing third-party plugins to add new pages, API endpoints, and functionality to ITDLUPanel.
- **Plugin store** — browse and install plugins from the ITDLUPanel plugin repository.
- **Plugin management** — enable/disable installed plugins without uninstalling. View plugin info (name, version, author, description).
- **Plugin configuration** — per-plugin settings page rendered from plugin-defined config schema.
- **Plugin lifecycle** — install, activate, deactivate, uninstall. Plugins can hook into panel events (site created, backup completed, etc.).

### 20.2 API Endpoints

```
GET    /api/v1/plugins                    # List installed plugins with status
GET    /api/v1/plugins/store              # Browse available plugins in the store
POST   /api/v1/plugins/:name/install      # Install a plugin from the store
DELETE /api/v1/plugins/:name              # Uninstall a plugin
PUT    /api/v1/plugins/:name/status       # Enable or disable a plugin (body: enabled)
GET    /api/v1/plugins/:name/config       # Get plugin configuration
PUT    /api/v1/plugins/:name/config       # Update plugin configuration
```

---

## Appendix A: Common API Conventions

### Base URL

```
https://<server-ip>:<panel-port>/api/v1/
```

### Authentication

All API endpoints (except `/auth/login` and `/auth/refresh`) require a valid JWT access token:

```
Authorization: Bearer <access_token>
```

### Standard Response Format

**Success:**

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

**Error:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [ ... ]
  }
}
```

### Pagination

List endpoints support pagination via query parameters:

```
?page=1&per_page=25
```

Response includes pagination metadata:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 25,
    "total": 150,
    "total_pages": 6
  }
}
```

### HTTP Status Codes

| Code | Meaning                      |
| ---- | ---------------------------- |
| 200  | Success                      |
| 201  | Created                      |
| 204  | No Content (successful delete) |
| 400  | Bad Request / Validation Error |
| 401  | Unauthorized (invalid/expired token) |
| 403  | Forbidden (insufficient permissions) |
| 404  | Not Found                    |
| 409  | Conflict (resource already exists) |
| 422  | Unprocessable Entity         |
| 429  | Too Many Requests (rate limited) |
| 500  | Internal Server Error        |

### Rate Limiting

- Login endpoint: **5 requests per minute** per IP.
- API endpoints: **60 requests per minute** per user.
- File upload: **10 requests per minute** per user.

---

## Appendix B: WebSocket Endpoints

| Endpoint                       | Purpose                            | Auth              |
| ------------------------------ | ---------------------------------- | ----------------- |
| `/api/v1/terminal?token=<JWT>` | Interactive terminal session       | JWT query param   |
| `/api/v1/monitor/realtime`     | Real-time system metrics stream    | JWT query param   |

---

## Appendix C: Technology Stack

| Component       | Technology                                    |
| --------------- | --------------------------------------------- |
| Backend         | Go (Gin/Echo framework)                       |
| Frontend        | React + TypeScript                            |
| UI Library      | Ant Design / Tailwind CSS                     |
| Code Editor     | Monaco Editor                                 |
| Terminal        | xterm.js                                      |
| Charts          | Recharts / Chart.js                           |
| State Management| Zustand / React Query                         |
| Build Tool      | Vite                                          |
| Database        | SQLite (panel data) / BoltDB                  |
| Auth            | JWT (RS256 or HS256)                           |
| i18n            | react-i18next (English + Vietnamese)           |
| WebSocket       | gorilla/websocket                              |
| Process Manager | systemd integration                            |
| SSL/TLS         | ACME (Let's Encrypt) via lego/certmagic        |

---

*This specification is maintained by the ITDLU development team. For questions or contributions, contact the ITDLUPanel project maintainers.*
