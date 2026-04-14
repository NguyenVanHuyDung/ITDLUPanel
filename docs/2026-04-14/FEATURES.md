# ITDLUPanel — Features & Functional Specification

> **Version**: 4.0.0 · **Date**: 2026-04-14

---

## 1. Dashboard

| Feature | Description |
|---------|-------------|
| System Overview | CPU, RAM, Disk, Swap usage with real-time gauges |
| Resource Cards | Website count, database count, cron jobs, FTP accounts |
| Software Status | Installed software list with running/stopped badges |
| Uptime Display | Server and panel uptime |
| Quick Actions | Start/stop/restart services from dashboard |

---

## 2. Website Management

### 2.1 Site CRUD

| Feature | Description |
|---------|-------------|
| Create Website | Domain, PHP version, webserver selection, document root |
| Site Types | PHP, Static HTML, Reverse Proxy |
| Multi-domain | Add multiple domains/subdomains per site |
| Start/Stop | Enable or disable individual sites |
| Batch Operations | Batch delete, batch PHP switch, batch SSL |

### 2.2 Web Server Configuration

| Feature | Description |
|---------|-------------|
| Config Editor | Monaco editor for nginx/apache/OLS config |
| PHP Switching | Switch PHP version per site (5.6 – 8.4) |
| URL Rewrite | Pre-built templates (WordPress, Laravel, Drupal, etc.) + custom rules |
| Default Document | Set index file (index.php, index.html, etc.) |
| Running Directory | Set public directory for frameworks |
| Open Basedir | PHP open_basedir security restriction |

### 2.3 Site Security

| Feature | Description |
|---------|-------------|
| Password Protection | HTTP Basic Auth on site or paths |
| IP Access Limits | Allow/deny by IP address |
| Deny Access Rules | Block specific paths or file types |
| Hotlink Protection | Prevent external sites from embedding resources |
| Traffic Control | Request rate limiting per IP |

### 2.4 Site Advanced

| Feature | Description |
|---------|-------------|
| Reverse Proxy | Add reverse proxy rules (e.g., proxy to Node.js app) |
| Redirect Rules | 301/302 redirects with regex support |
| Subdirectory Bindings | Bind subdirectories to different PHP versions or apps |
| Maintenance Mode | Enable maintenance page with customizable templates |
| Disk Quota | Set per-site disk usage limits |
| Composer | Install and manage PHP Composer per site |
| Site Statistics | Traffic stats and disk usage |

### 2.5 SSL per Site

| Feature | Description |
|---------|-------------|
| Let's Encrypt (HTTP) | Automated HTTP-01 challenge |
| Let's Encrypt (DNS) | DNS-01 for wildcard certificates |
| Custom Certificate | Upload PEM cert + key |
| Force HTTPS | Automatic HTTP → HTTPS redirect |
| Auto-Renewal | Background certificate renewal |

---

## 3. Database Management

### 3.1 MySQL / MariaDB

| Feature | Description |
|---------|-------------|
| Create Database | Name, username, password, charset, collation |
| Delete Database | Remove database and associated user |
| Change Password | Update database user password |
| Backup | mysqldump per database or bulk |
| Restore | Restore from SQL backup file |
| Import | Import SQL files into database |
| Remote Access | Set remote access permissions (localhost, %, specific IP) |
| Disk Quota | Set per-database size limits |
| phpMyAdmin | One-click open phpMyAdmin web interface |
| Root Password | Reset MySQL/MariaDB root password |
| Service Control | Start, stop, restart MySQL/MariaDB service |
| Slow Query Log | View and manage slow queries |
| Binary Logs | View binary log files |
| RAM Plans | Pre-built memory optimization templates |
| Memory Protection | OOM killer protection settings |

### 3.2 PostgreSQL

| Feature | Description |
|---------|-------------|
| Create Database | Name, username, password, encoding |
| Delete Database | Remove database and role |
| Change Password | Update PostgreSQL role password |
| Backup | pg_dump per database or bulk |
| Restore | Restore from SQL backup file |
| Import | Import SQL files |
| Remote Access | pg_hba.conf management |
| Disk Quota | Per-database size limits |
| pgAdmin | One-click open pgAdmin web interface |
| Root Password | Reset PostgreSQL superuser password |
| Service Control | Start, stop, restart PostgreSQL service |
| Connections | View active connections |
| Database List | View all PostgreSQL databases (including system) |

### 3.3 Redis

| Feature | Description |
|---------|-------------|
| Server Info | Redis server information and version |
| Configuration | View/edit Redis config via API or raw file |
| Client List | View connected clients, kill connections |
| Flush | Flush all databases |
| Database Size | Key count across databases |
| Slow Log | Slow query analysis |
| Memory Stats | Detailed memory usage breakdown |
| Password | Set/change Redis authentication password |
| Persistence | RDB and AOF persistence status and configuration |

---

## 4. File Management

| Feature | Description |
|---------|-------------|
| File Browser | Navigate server file system with breadcrumb path |
| File Editor | Monaco editor with syntax highlighting for 50+ languages |
| Upload | Drag-and-drop file upload (multipart) |
| Download | Direct file download |
| Create | Create files and directories |
| Rename | Rename files and directories |
| Copy / Move | Copy or move files across directories |
| Delete | Single and batch file deletion |
| Permissions | chmod with octal or symbolic notation |
| Ownership | chown user:group |
| Compress | Create zip or tar.gz archives |
| Decompress | Extract zip, tar.gz, tar.bz2, 7z archives |
| Search | Search files by name pattern |
| Content Search | grep-like content search across files |
| Size Calculation | Calculate directory sizes |

---

## 5. Docker Management

### 5.1 Containers

| Feature | Description |
|---------|-------------|
| List Containers | All containers with status, ports, image, created time |
| Create Container | Image, ports, volumes, env vars, restart policy |
| Start/Stop/Restart | Container lifecycle management |
| Pause/Unpause | Freeze/unfreeze container processes |
| Rename | Change container name |
| Remove | Delete container |
| Logs | Real-time container log viewer |
| Stats | CPU, memory, network, I/O statistics |

### 5.2 Images

| Feature | Description |
|---------|-------------|
| List Images | All local images with tags, size, created time |
| Pull Image | Pull from Docker Hub or private registry |
| Search | Search Docker Hub for images |
| Remove | Delete local image |
| Inspect | View image metadata |
| History | View image layer history |
| Tag | Add tags to images |
| Prune | Remove unused images |

### 5.3 Networks & Volumes

| Feature | Description |
|---------|-------------|
| List/Create/Remove | Network and volume management |
| Inspect | View network/volume details |
| Connect/Disconnect | Attach/detach containers from networks |
| Prune | Remove unused networks and volumes |

### 5.4 Docker Compose

| Feature | Description |
|---------|-------------|
| Project Management | Create, list, remove compose projects |
| Up/Down/Restart | Manage compose services |
| Logs | View service logs |
| One-Click Apps | 38 pre-built docker-compose templates |

### 5.5 System

| Feature | Description |
|---------|-------------|
| Disk Usage | Docker disk usage breakdown |
| Daemon Config | View/edit daemon.json |
| Restart/Stop | Docker daemon control |

---

## 6. Cron Job Management

| Feature | Description |
|---------|-------------|
| Create Cron | Name, schedule (cron expression), command |
| Job Types | Shell command, URL request, backup |
| Enable/Disable | Toggle individual cron jobs |
| Run Now | Execute cron job immediately |
| Execution Log | View stdout/stderr output per execution |
| Templates | 30 pre-built cron job templates |

---

## 7. FTP Management

| Feature | Description |
|---------|-------------|
| Create Account | Username, password, home directory |
| Enable/Disable | Toggle FTP accounts |
| Change Password | Update FTP password |
| Batch Operations | Batch delete, enable/disable, update path |
| PureFTPd Backend | Full PureFTPd integration |

---

## 8. Security

### 8.1 Firewall (UFW)

| Feature | Description |
|---------|-------------|
| Rule Management | Add/remove/toggle firewall rules |
| Port Status | Check open/closed ports |
| IP Blocking | Block/unblock specific IP addresses |
| Protocols | TCP, UDP, or both |
| Directions | Inbound and outbound rules |
| Auto-Install | Install UFW if not present |

### 8.2 SSH Security

| Feature | Description |
|---------|-------------|
| SSH Config | Edit SSH daemon configuration |
| Root Password | Change system root password |
| SSH Users | Create/delete SSH user accounts |
| SSH Keys | Manage authorized_keys per user |
| Key Generation | Generate SSH key pairs (RSA, Ed25519) |
| Download Keys | Download private keys |
| Port Change | Change SSH listening port |

### 8.3 Fail2ban

| Feature | Description |
|---------|-------------|
| Install/Uninstall | Manage Fail2ban installation |
| Global Config | Max retries, ban time, find time |
| Jail Management | Create/edit/remove jails (sshd, nginx, etc.) |
| Manual Ban/Unban | Ban or unban specific IPs |
| Log Viewer | View Fail2ban activity log |

### 8.4 Panel Security

| Feature | Description |
|---------|-------------|
| Two-Factor Auth | TOTP 2FA with QR code provisioning |
| Brute-Force Protection | Auto-lockout after failed attempts |
| Session Timeout | Configurable session duration |
| CSRF Protection | Token-based CSRF on all state-changing requests |
| Rate Limiting | 300 requests/minute per IP |
| Audit Trail | Log all administrative actions |

---

## 9. SSL Certificate Management

### 9.1 Panel SSL

| Feature | Description |
|---------|-------------|
| Auto-Generation | Self-signed ECDSA P-256 cert on first boot (10-year validity) |
| Custom Upload | Upload PEM cert + key for panel |
| Certificate Info | View issuer, validity dates, SANs, type |
| Regenerate | Generate new self-signed cert from Settings |

### 9.2 Website SSL

| Feature | Description |
|---------|-------------|
| Let's Encrypt (HTTP-01) | Automated certificate issuance |
| Let's Encrypt (DNS-01) | Wildcard certificate support |
| Custom Upload | Upload cert + key per domain |
| Auto-Renewal | Background renewal before expiry |
| Force HTTPS | Per-site HTTP→HTTPS redirect |
| Batch SSL | Apply SSL to multiple sites at once |

---

## 10. Monitoring

| Feature | Description |
|---------|-------------|
| Real-time Metrics | CPU, RAM, disk, swap, network, load (WebSocket) |
| Process Manager | List all processes, sort by CPU/RAM, kill process |
| Service Status | Running/stopped status for installed services |
| Network Stats | Interface statistics, connections |
| Disk Stats | Partition usage, I/O stats |
| Historical Data | Charts with 5m, 1h, 1d, 30d history |
| Collection Settings | Configure metrics collection interval |

---

## 11. Log Management

| Feature | Description |
|---------|-------------|
| Panel Log | Application log with search and filtering |
| Website Access Log | Per-site Nginx/Apache access logs |
| Website Error Log | Per-site error logs |
| SSH Log | SSH authentication log |
| Audit Log | All admin actions (who, what, when, from where) |
| Log Search | Full-text search across all log types |
| Log Rotation | Automatic logrotate configuration |
| Clear Logs | Clear specific log types |

---

## 12. Backup & Storage

### 12.1 Backups

| Feature | Description |
|---------|-------------|
| Site Backup | Document root + web server config |
| Database Backup | mysqldump / pg_dump |
| Manual Backup | On-demand backup creation |
| Scheduled Backup | Via cron job integration |
| Restore | One-click restore from any backup |
| Download | Download backup files |

### 12.2 Storage Targets

| Storage | Features |
|---------|----------|
| Local | Default `/ITDLUPanel/backup/` directory |
| FTP | Remote FTP server with connection test |
| Amazon S3 | AWS S3 + compatible (MinIO, Wasabi, R2, DO Spaces, Backblaze B2) |
| Google Drive | OAuth2 authentication, folder organization |
| OneDrive | Microsoft Graph API, OAuth2 |

---

## 13. Software Management (App Store)

### 13.1 Software Lifecycle

| Feature | Description |
|---------|-------------|
| Install | One-click installation with progress tracking |
| Uninstall | Clean removal with config cleanup |
| Start/Stop/Restart | Service control |
| Reload | Graceful config reload |
| Version Info | Display installed version |
| Stack Install | Install complete LEMP/LAMP stack at once |

### 13.2 Software-Specific Management

| Software | Management Features |
|----------|-------------------|
| Nginx | Config editor, performance tuning, version switching, error log |
| Apache | Config editor, modules, error log |
| OpenLiteSpeed | Config editor, listeners |
| PHP (5.6-8.4) | Extensions, php.ini editor, FPM config, OPcache, disabled functions, slow log, phpinfo |
| MySQL/MariaDB | Config, slow log, binary logs, RAM plans, memory protection |
| PostgreSQL | Config, connections, database list |
| Redis | Config (API + file), clients, flush, slow log, memory, persistence |
| phpMyAdmin | Port, PHP version, SSL configuration |
| pgAdmin | Port, SSL, web interface management |

---

## 14. Terminal

| Feature | Description |
|---------|-------------|
| Web Terminal | Full PTY terminal via WebSocket |
| Multiple Sessions | Open multiple terminal tabs |
| Resize | Auto-resize to browser window |
| Shell Support | bash, sh, zsh (system default) |
| Authentication | JWT-secured WebSocket connection |

---

## 15. User Management

| Feature | Description |
|---------|-------------|
| User CRUD | Create, update, delete panel users |
| Role Assignment | Assign roles to users |
| Password Management | Admin can reset any user's password |
| Resource Assignment | Assign specific sites, DBs, FTP to users |
| Status | Enable/disable user accounts |
| Activity Tracking | Last login time and IP address |

---

## 16. Role-Based Access Control (RBAC)

| Feature | Description |
|---------|-------------|
| Role CRUD | Create custom roles with specific permissions |
| Permission Tree | Visual permission selector |
| System Roles | Built-in admin and viewer roles (non-deletable) |
| Granular Permissions | Per-resource type permissions (sites, databases, files, etc.) |
| Resource Scoping | Users see only their assigned resources |

### Permission Categories

| Category | Permissions |
|----------|------------|
| Sites | read, create, edit, delete, config, ssl |
| Databases | read, create, edit, delete, backup |
| FTP | read, create, edit, delete |
| Files | read, write, delete |
| Docker | read, create, manage |
| Cron | read, create, edit, delete |
| Firewall | read, manage |
| Security | manage |
| Logs | read, manage |
| Backup | read, create, delete, restore |
| Software | read, manage |

---

## 17. Notifications

| Feature | Description |
|---------|-------------|
| Email (SMTP) | Send notifications via email |
| Telegram Bot | Send notifications to Telegram chat |
| Webhook | POST JSON to custom URL |
| Event Types | SSL expiry, backup complete/fail, software events, site events, cron events |
| Custom Templates | Customize notification subject and body with variables |
| Template Preview | Live preview of rendered notification |
| Delivery Logs | Track sent notifications with status |
| Channel Testing | Test notification channels individually |

---

## 18. Settings

### 18.1 General

| Setting | Description |
|---------|-------------|
| Panel Name | Custom display name |
| Language | English / Vietnamese |
| Timezone | System timezone selection |
| Session Timeout | Auto-logout duration |
| Admin Path | Custom URL path prefix |

### 18.2 Server Info

| Info | Description |
|------|-------------|
| Panel Version | Current version number |
| Go Version | Go runtime version |
| OS | Operating system and architecture |
| Uptime | Panel and server uptime |
| Hostname | Server hostname |
| Started At | Panel start timestamp |

### 18.3 SSL Tab

| Feature | Description |
|---------|-------------|
| SSL Status | Enabled/Disabled badge |
| Certificate Type | Self-Signed / Let's Encrypt / Custom |
| Issuer | Certificate issuer |
| Common Name | Certificate CN (domain) |
| Valid From/Until | Certificate validity dates |
| SANs | Subject Alternative Names list |
| Generate Self-Signed | Generate new 10-year self-signed cert |
| Upload Certificate | Upload custom PEM cert + key |

### 18.4 Security Tab

| Feature | Description |
|---------|-------------|
| Panel Port | Change panel listening port |
| Panel SSL | Enable/disable SSL |

### 18.5 Menu Visibility

| Feature | Description |
|---------|-------------|
| Toggle Menu Items | Show/hide sidebar menu items |
| Locked Items | Dashboard and Settings always visible |
| Persistent | Saved to localStorage, persists across sessions |

### 18.6 Danger Zone

| Feature | Description |
|---------|-------------|
| Reset Panel | Reset panel to factory defaults |
| Clear Data | Clear all panel data |

---

## 19. Plugins

| Feature | Description |
|---------|-------------|
| Plugin Store | Browse available plugins |
| Install/Uninstall | One-click plugin management |
| Enable/Disable | Toggle plugin status |
| Configuration | Per-plugin settings |

---

## 20. Internationalization (i18n)

| Feature | Description |
|---------|-------------|
| Languages | English (en), Vietnamese (vi) |
| Framework | i18next + react-i18next |
| Scope | All UI labels, messages, errors |
| Runtime Switching | Change language without reload |
