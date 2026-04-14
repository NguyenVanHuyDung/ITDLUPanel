# ITDLUPanel — API Reference

> **Base URL**: `https://<server>:8888/api/v1` · **Auth**: Bearer JWT · **Version**: 4.0.0 · **Date**: 2026-04-14

---

## Authentication

All endpoints (except login, refresh, health) require the `Authorization: Bearer <access_token>` header.

**Token Flow**:
1. `POST /auth/login` → returns `access_token` (15 min) + `refresh_token` (7 days)
2. Use `access_token` in `Authorization` header
3. When expired, call `POST /auth/refresh` with `refresh_token`
4. If 2FA is enabled, call `POST /auth/2fa/verify` after login

---

## Response Format

All responses follow a standard envelope:

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

Error responses:
```json
{
  "code": 401,
  "message": "invalid username or password"
}
```

Validation errors:
```json
{
  "code": 422,
  "message": "validation failed",
  "errors": [
    { "field": "name", "message": "name is required" }
  ]
}
```

---

## 1. Health Check

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | No | Server health check |

**Response**: `{ "status": "ok", "version": "0.1.0" }`

---

## 2. Authentication (`/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/login` | No | Login with username/password |
| `POST` | `/auth/refresh` | No | Refresh access token |
| `POST` | `/auth/2fa/verify` | No | Verify TOTP 2FA code |
| `POST` | `/auth/logout` | Yes | Invalidate session |
| `GET` | `/auth/me` | Yes | Get current user info |
| `PUT` | `/auth/password` | Yes | Change own password |
| `GET` | `/auth/2fa/qrcode` | Yes | Generate 2FA QR code |
| `POST` | `/auth/2fa/enable` | Yes | Enable 2FA |
| `POST` | `/auth/2fa/disable` | Yes | Disable 2FA |

### POST `/auth/login`

**Request**:
```json
{
  "username": "admin",
  "password": "admin@123456"
}
```

**Response**:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "totp_enabled": false
  }
}
```

### PUT `/auth/password`

```json
{
  "current_password": "old-password",
  "new_password": "new-password"
}
```

---

## 3. Users (`/users`) — Admin Only

| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|------------|-------------|
| `GET` | `/users` | Yes | Admin | List all users |
| `POST` | `/users` | Yes | Admin | Create user |
| `PUT` | `/users/:id` | Yes | Admin | Update user |
| `PUT` | `/users/:id/password` | Yes | Admin | Reset user password |
| `DELETE` | `/users/:id` | Yes | Admin | Delete user |
| `GET` | `/users/:id/resources` | Yes | Admin | List user's assigned resources |
| `POST` | `/users/:id/resources` | Yes | Admin | Bulk assign resources to user |
| `DELETE` | `/users/:id/resources/:type/:rid` | Yes | Admin | Remove resource from user |

### POST `/users`

```json
{
  "username": "webmaster",
  "password": "secure-pass",
  "email": "user@example.com",
  "role": "editor"
}
```

---

## 4. Roles (`/roles`) — Admin Only

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/roles` | Yes | List all roles |
| `GET` | `/roles/permissions` | Yes | Get full permission tree |
| `POST` | `/roles` | Yes | Create role |
| `PUT` | `/roles/:id` | Yes | Update role |
| `DELETE` | `/roles/:id` | Yes | Delete role (non-system only) |

### POST `/roles`

```json
{
  "name": "developer",
  "description": "Full access to sites and databases",
  "permissions": ["sites.*", "databases.*", "files.*"]
}
```

---

## 5. Dashboard (`/dashboard`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/dashboard` | Yes | System overview (CPU, RAM, disk, uptime, counts) |
| `GET` | `/dashboard/software` | Yes | Installed software list with status |

---

## 6. Monitor (`/monitor`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/monitor/system` | Yes | Current CPU, RAM, disk, load, network |
| `GET` | `/monitor/processes` | Yes | Process list with PID, CPU, RAM, command |
| `POST` | `/monitor/processes/kill` | Yes | Kill a process by PID |
| `GET` | `/monitor/services` | Yes | Service status (nginx, mysql, etc.) |
| `GET` | `/monitor/network` | Yes | Network interface stats |
| `GET` | `/monitor/disk` | Yes | Disk partitions and usage |
| `GET` | `/monitor/history` | Yes | Historical metrics (5m, 1h, 1d) |
| `DELETE` | `/monitor/history` | Yes | Clean old metric data |
| `GET` | `/monitor/settings` | Yes | Monitor collection settings |
| `PUT` | `/monitor/settings` | Yes | Update collection interval |
| `WS` | `/monitor/realtime` | Yes | WebSocket real-time metrics stream |

---

## 7. Sites (`/sites`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/sites` | sites.read | List all websites |
| `POST` | `/sites` | sites.create | Create website |
| `GET` | `/sites/php-versions` | sites.read | Available PHP versions |
| `GET` | `/sites/rewrite-templates` | sites.read | URL rewrite templates list |
| `GET` | `/sites/rewrite-templates/:name` | sites.read | Get specific rewrite template |
| `POST` | `/sites/batch/delete` | sites.delete | Batch delete sites |
| `PUT` | `/sites/batch/php` | sites.edit | Batch switch PHP version |
| `POST` | `/sites/batch/ssl` | sites.ssl | Batch apply SSL |
| `GET` | `/sites/:id` | sites.read | Get site details |
| `PUT` | `/sites/:id` | sites.edit | Update site |
| `DELETE` | `/sites/:id` | sites.delete | Delete site |
| `POST` | `/sites/:id/start` | sites.edit | Start site |
| `POST` | `/sites/:id/stop` | sites.edit | Stop site |
| `GET` | `/sites/:id/config` | sites.config | Get web server config |
| `PUT` | `/sites/:id/config` | sites.config | Update web server config |
| `PUT` | `/sites/:id/php` | sites.edit | Switch PHP version |

### Site Domains

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/sites/:id/domains` | sites.read | List site domains |
| `POST` | `/sites/:id/domains` | sites.edit | Add domain |
| `DELETE` | `/sites/:id/domains/:did` | sites.edit | Remove domain |

### Site SSL

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/sites/:id/ssl` | sites.ssl | Get SSL info |
| `POST` | `/sites/:id/ssl/enable` | sites.ssl | Enable SSL |
| `POST` | `/sites/:id/ssl/disable` | sites.ssl | Disable SSL |
| `POST` | `/sites/:id/ssl/apply` | sites.ssl | Apply cert from holder |
| `GET` | `/sites/:id/force-https` | sites.ssl | Get force HTTPS setting |
| `PUT` | `/sites/:id/force-https` | sites.ssl | Set force HTTPS |

### Site Configuration

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `PUT` | `/sites/:id/directory` | sites.config | Update root directory |
| `GET` | `/sites/:id/subdirs` | sites.config | List subdirectories |
| `PUT` | `/sites/:id/running-directory` | sites.config | Set running directory |
| `GET` | `/sites/:id/open-basedir` | sites.config | Get open_basedir |
| `PUT` | `/sites/:id/open-basedir` | sites.config | Set open_basedir |
| `GET` | `/sites/:id/access-log` | sites.config | Get access log config |
| `PUT` | `/sites/:id/access-log` | sites.config | Set access log config |
| `GET` | `/sites/:id/password-access` | sites.config | Get password protection |
| `PUT` | `/sites/:id/password-access` | sites.config | Set password protection |
| `GET` | `/sites/:id/default-doc` | sites.config | Get default document |
| `PUT` | `/sites/:id/default-doc` | sites.config | Set default document |
| `PUT` | `/sites/:id/quota` | sites.config | Set disk quota |
| `GET` | `/sites/:id/disk-usage` | sites.config | Get current disk usage |
| `GET` | `/sites/:id/rewrite` | sites.config | Get URL rewrite rules |
| `PUT` | `/sites/:id/rewrite` | sites.config | Set URL rewrite rules |

### Site Advanced

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET/POST/DELETE` | `/sites/:id/subdir-bindings` | sites.config | Subdirectory bindings |
| `GET/POST/DELETE` | `/sites/:id/limit-access` | sites.config | IP access limits |
| `GET/POST/DELETE` | `/sites/:id/deny-access` | sites.config | Deny access rules |
| `GET/PUT` | `/sites/:id/traffic-control` | sites.config | Traffic rate limiting |
| `GET/POST/PUT/DELETE` | `/sites/:id/reverse-proxy` | sites.config | Reverse proxy rules |
| `GET/POST/PUT/DELETE` | `/sites/:id/redirect-rules` | sites.config | Redirect rules |
| `GET/PUT` | `/sites/:id/hotlink` | sites.config | Hotlink protection |
| `GET/PUT` | `/sites/:id/maintenance` | sites.config | Maintenance mode |
| `GET` | `/sites/:id/maintenance/templates` | sites.config | Maintenance page templates |
| `GET/POST` | `/sites/:id/composer/*` | sites.config | Composer management |
| `GET` | `/sites/:id/statistics` | sites.read | Site traffic statistics |

### POST `/sites`

```json
{
  "name": "my-website",
  "domain": "example.com",
  "path": "/ITDLUPanel/wwwroot/example.com",
  "webserver": "nginx",
  "php_version": "8.3",
  "site_type": "php"
}
```

---

## 8. Databases (`/databases`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/databases` | databases.read | List databases (filter by `db_type`) |
| `POST` | `/databases` | databases.create | Create database + user |
| `GET` | `/databases/:id` | databases.read | Get database details |
| `DELETE` | `/databases/:id` | databases.delete | Delete database + user |
| `PUT` | `/databases/:id/password` | databases.edit | Change database password |
| `POST` | `/databases/:id/backup` | databases.backup | Backup database |
| `POST` | `/databases/:id/restore` | databases.backup | Restore from backup |
| `POST` | `/databases/:id/import` | databases.edit | Import SQL file |
| `PUT` | `/databases/:id/access` | databases.edit | Set remote access |
| `GET` | `/databases/version` | databases.read | Get database version |
| `POST` | `/databases/service` | databases.edit | Service action (start/stop/restart) |
| `GET` | `/databases/:id/size` | databases.read | Get database size |
| `PUT` | `/databases/:id/quota` | databases.edit | Set disk quota |

### POST `/databases`

```json
{
  "name": "myapp_db",
  "db_type": "mysql",
  "username": "myapp_user",
  "password": "secure-pass",
  "charset": "utf8mb4",
  "collation": "utf8mb4_general_ci"
}
```

**Supported `db_type`**: `mysql`, `mariadb`, `postgresql`

---

## 9. Redis (`/redis`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/redis/info` | software.read | Redis server info |
| `GET` | `/redis/config` | software.read | Get Redis configuration |
| `PUT` | `/redis/config` | software.manage | Update Redis configuration |
| `GET` | `/redis/config-file` | software.read | Get raw redis.conf |
| `PUT` | `/redis/config-file` | software.manage | Save raw redis.conf |
| `GET` | `/redis/clients` | software.read | List connected clients |
| `DELETE` | `/redis/clients/:id` | software.manage | Kill client connection |
| `POST` | `/redis/flush` | software.manage | Flush all databases |
| `GET` | `/redis/dbsize` | software.read | Get database key count |
| `GET` | `/redis/slowlog` | software.read | Get slow query log |
| `GET` | `/redis/memory` | software.read | Memory usage statistics |
| `PUT` | `/redis/password` | software.manage | Set/change Redis password |
| `GET` | `/redis/persistence` | software.read | Get RDB/AOF persistence info |

---

## 10. SSL Certificates (`/ssl`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/ssl/certificates` | Yes | List all certificates |
| `GET` | `/ssl/certificates/:domain` | Yes | Get certificate details |
| `DELETE` | `/ssl/certificates/:domain` | Yes | Delete certificate |
| `POST` | `/ssl/letsencrypt` | Yes | Issue Let's Encrypt cert (HTTP-01) |
| `POST` | `/ssl/letsencrypt-dns/init` | Yes | Start DNS-01 challenge |
| `POST` | `/ssl/letsencrypt-dns/complete` | Yes | Complete DNS-01 challenge |
| `POST` | `/ssl/upload` | Yes | Upload custom cert + key |
| `POST` | `/ssl/renew/:domain` | Yes | Renew certificate |
| `GET` | `/ssl/panel` | Yes | Get panel SSL info |
| `POST` | `/ssl/panel` | Yes | Upload panel SSL cert |
| `POST` | `/ssl/panel/self-signed` | Yes | Generate self-signed cert (10 years) |

---

## 11. Docker (`/docker`)

### Containers

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/docker/info` | docker.read | Docker daemon info |
| `GET` | `/docker/containers` | docker.read | List containers |
| `POST` | `/docker/containers` | docker.create | Create container |
| `GET` | `/docker/containers/:id` | docker.read | Get container details |
| `DELETE` | `/docker/containers/:id` | docker.create | Remove container |
| `POST` | `/docker/containers/:id/start` | docker.manage | Start container |
| `POST` | `/docker/containers/:id/stop` | docker.manage | Stop container |
| `POST` | `/docker/containers/:id/restart` | docker.manage | Restart container |
| `POST` | `/docker/containers/:id/pause` | docker.manage | Pause container |
| `POST` | `/docker/containers/:id/unpause` | docker.manage | Unpause container |
| `POST` | `/docker/containers/:id/rename` | docker.manage | Rename container |
| `GET` | `/docker/containers/:id/logs` | docker.read | Get container logs |
| `GET` | `/docker/containers/:id/stats` | docker.read | Get container stats |

### Images

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/docker/images` | docker.read | List images |
| `GET` | `/docker/images/search` | docker.read | Search Docker Hub |
| `POST` | `/docker/images/pull` | docker.manage | Pull image |
| `POST` | `/docker/images/prune` | docker.manage | Prune unused images |
| `DELETE` | `/docker/images/:id` | docker.manage | Remove image |
| `GET` | `/docker/images/:id/inspect` | docker.read | Inspect image |
| `GET` | `/docker/images/:id/history` | docker.read | Image history |
| `POST` | `/docker/images/:id/tag` | docker.manage | Tag image |

### Networks

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/docker/networks` | docker.read | List networks |
| `POST` | `/docker/networks` | docker.create | Create network |
| `POST` | `/docker/networks/prune` | docker.manage | Prune networks |
| `GET` | `/docker/networks/:id` | docker.read | Inspect network |
| `DELETE` | `/docker/networks/:id` | docker.manage | Remove network |
| `POST` | `/docker/networks/:id/connect` | docker.manage | Connect container |
| `POST` | `/docker/networks/:id/disconnect` | docker.manage | Disconnect container |

### Volumes

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/docker/volumes` | docker.read | List volumes |
| `POST` | `/docker/volumes` | docker.create | Create volume |
| `POST` | `/docker/volumes/prune` | docker.manage | Prune volumes |
| `GET` | `/docker/volumes/:name` | docker.read | Inspect volume |
| `DELETE` | `/docker/volumes/:name` | docker.manage | Remove volume |

### System

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/docker/system/df` | docker.read | Disk usage |
| `POST` | `/docker/system/restart` | docker.manage | Restart Docker daemon |
| `POST` | `/docker/system/stop` | docker.manage | Stop Docker daemon |
| `GET` | `/docker/system/config` | docker.read | Get daemon.json |
| `PUT` | `/docker/system/config` | docker.manage | Update daemon.json |

---

## 12. Docker Compose (`/docker-compose`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/docker-compose` | docker.read | List compose projects |
| `POST` | `/docker-compose` | docker.create | Create compose project |
| `GET` | `/docker-compose/:name` | docker.read | Get project details |
| `DELETE` | `/docker-compose/:name` | docker.manage | Remove project |
| `POST` | `/docker-compose/:name/up` | docker.manage | Docker compose up |
| `POST` | `/docker-compose/:name/down` | docker.manage | Docker compose down |
| `POST` | `/docker-compose/:name/restart` | docker.manage | Restart services |
| `GET` | `/docker-compose/:name/logs` | docker.read | Get service logs |

---

## 13. Files (`/files`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/files` | files.read | List directory contents |
| `GET` | `/files/content` | files.read | Read file content |
| `PUT` | `/files/content` | files.write | Write file content |
| `POST` | `/files/upload` | files.write | Upload file (multipart) |
| `GET` | `/files/download` | files.read | Download file |
| `POST` | `/files/mkdir` | files.write | Create directory |
| `POST` | `/files/create` | files.write | Create empty file |
| `POST` | `/files/rename` | files.write | Rename file/directory |
| `POST` | `/files/copy` | files.write | Copy file |
| `POST` | `/files/move` | files.write | Move file |
| `DELETE` | `/files` | files.delete | Delete file(s) |
| `PUT` | `/files/permissions` | files.write | Set chmod permissions |
| `PUT` | `/files/owner` | files.write | Set chown owner |
| `POST` | `/files/compress` | files.write | Compress files (zip/tar.gz) |
| `POST` | `/files/decompress` | files.write | Extract archive |
| `GET` | `/files/search` | files.read | Search files by name |
| `GET` | `/files/search-content` | files.read | Search file contents (grep) |
| `POST` | `/files/calculate-size` | files.read | Calculate directory size |

---

## 14. Cron Jobs (`/crons`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/crons` | cron.read | List all cron jobs |
| `POST` | `/crons` | cron.create | Create cron job |
| `GET` | `/crons/:id` | cron.read | Get cron job details |
| `PUT` | `/crons/:id` | cron.edit | Update cron job |
| `DELETE` | `/crons/:id` | cron.delete | Delete cron job |
| `PUT` | `/crons/:id/status` | cron.edit | Enable/disable cron job |
| `GET` | `/crons/:id/log` | cron.read | Get execution log |
| `POST` | `/crons/:id/run` | cron.edit | Run immediately |

### POST `/crons`

```json
{
  "name": "Daily Backup",
  "type": "shell",
  "schedule": "0 2 * * *",
  "command": "/usr/local/bin/backup.sh"
}
```

---

## 15. FTP (`/ftps`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/ftps` | ftp.read | List FTP accounts |
| `POST` | `/ftps` | ftp.create | Create FTP account |
| `GET` | `/ftps/:id` | ftp.read | Get FTP account |
| `PUT` | `/ftps/:id` | ftp.edit | Update FTP account |
| `DELETE` | `/ftps/:id` | ftp.delete | Delete FTP account |
| `PUT` | `/ftps/:id/password` | ftp.edit | Change password |
| `PUT` | `/ftps/:id/status` | ftp.edit | Enable/disable account |
| `POST` | `/ftps/batch/delete` | ftp.delete | Batch delete |
| `POST` | `/ftps/batch/status` | ftp.edit | Batch enable/disable |
| `POST` | `/ftps/batch/path` | ftp.edit | Batch update home path |

---

## 16. Security & Firewall

### Firewall (`/firewall`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/firewall/rules` | firewall.read | List firewall rules |
| `POST` | `/firewall/rules` | firewall.manage | Add firewall rule |
| `DELETE` | `/firewall/rules/:id` | firewall.manage | Delete rule |
| `PUT` | `/firewall/rules/:id/status` | firewall.manage | Toggle rule |
| `GET` | `/firewall/settings` | firewall.read | Get firewall settings |
| `PUT` | `/firewall/settings` | firewall.manage | Update settings |
| `GET` | `/firewall/port-status` | firewall.read | Check port statuses |
| `GET` | `/firewall/blocked-ips` | firewall.read | List blocked IPs |
| `POST` | `/firewall/blocked-ips` | firewall.manage | Block IP |
| `DELETE` | `/firewall/blocked-ips` | firewall.manage | Unblock IP |
| `GET` | `/firewall/status` | firewall.read | UFW status |
| `POST` | `/firewall/install` | firewall.manage | Install UFW |

### Security (`/security`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/security/ssh` | security.manage | Get SSH config |
| `PUT` | `/security/ssh` | security.manage | Update SSH config |
| `PUT` | `/security/root-password` | security.manage | Change root password |
| `GET` | `/security/ssh/users` | security.manage | List SSH users |
| `POST` | `/security/ssh/users` | security.manage | Create SSH user |
| `DELETE` | `/security/ssh/users/:username` | security.manage | Delete SSH user |
| `GET` | `/security/ssh/keys/:username` | security.manage | Get authorized keys |
| `POST` | `/security/ssh/keys/:username` | security.manage | Add authorized key |
| `DELETE` | `/security/ssh/keys/:username/:fp` | security.manage | Remove key |
| `POST` | `/security/ssh/keys/:username/generate` | security.manage | Generate SSH key pair |
| `GET` | `/security/ssh/keys/:username/public` | security.manage | Get public keys |
| `GET` | `/security/ssh/keys/:username/download-private` | security.manage | Download private key |

### Fail2ban (`/security/fail2ban`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/security/fail2ban` | security.manage | Get Fail2ban status |
| `PUT` | `/security/fail2ban` | security.manage | Configure Fail2ban |
| `POST` | `/security/fail2ban/install` | security.manage | Install Fail2ban |
| `POST` | `/security/fail2ban/uninstall` | security.manage | Uninstall Fail2ban |
| `GET` | `/security/fail2ban/config` | security.manage | Get global config |
| `PUT` | `/security/fail2ban/config` | security.manage | Update global config |
| `GET` | `/security/fail2ban/jails` | security.manage | List jails |
| `POST` | `/security/fail2ban/jails` | security.manage | Add/update jail |
| `DELETE` | `/security/fail2ban/jails/:name` | security.manage | Remove jail |
| `POST` | `/security/fail2ban/ban` | security.manage | Ban IP |
| `POST` | `/security/fail2ban/unban` | security.manage | Unban IP |
| `GET` | `/security/fail2ban/log` | security.manage | View Fail2ban log |

---

## 17. Backups (`/backups`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/backups` | backup.read | List backups |
| `POST` | `/backups` | backup.create | Create backup (site or database) |
| `GET` | `/backups/site-counts` | backup.read | Backup counts per site |
| `GET` | `/backups/database-counts` | backup.read | Backup counts per database |
| `GET` | `/backups/:id` | backup.read | Get backup details |
| `DELETE` | `/backups/:id` | backup.delete | Delete backup |
| `POST` | `/backups/:id/restore` | backup.restore | Restore from backup |
| `GET` | `/backups/:id/download` | backup.read | Download backup file |

---

## 18. Storage

### FTP Storage (`/ftp-storages`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/ftp-storages` | backup.read | List FTP storage |
| `POST` | `/ftp-storages` | backup.create | Add FTP storage |
| `GET` | `/ftp-storages/:id` | backup.read | Get storage details |
| `PUT` | `/ftp-storages/:id` | backup.create | Update storage |
| `DELETE` | `/ftp-storages/:id` | backup.delete | Delete storage |
| `POST` | `/ftp-storages/:id/test` | backup.read | Test connection |
| `POST` | `/ftp-storages/test` | backup.read | Test inline config |
| `GET` | `/ftp-storages/:id/files` | backup.read | List remote files |

### Cloud Storage (`/cloud-storages`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/cloud-storages` | backup.read | List cloud storage |
| `POST` | `/cloud-storages` | backup.create | Add cloud storage (S3/GDrive/OneDrive) |
| `GET` | `/cloud-storages/:id` | backup.read | Get storage details |
| `PUT` | `/cloud-storages/:id` | backup.create | Update storage |
| `DELETE` | `/cloud-storages/:id` | backup.delete | Delete storage |
| `POST` | `/cloud-storages/:id/test` | backup.read | Test connection |
| `POST` | `/cloud-storages/test` | backup.read | Test inline config |
| `GET` | `/cloud-storages/:id/auth-url` | backup.create | Get OAuth URL |
| `GET` | `/cloud-storages/oauth/callback` | No | OAuth callback (public) |

---

## 19. Software (`/software`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/software` | Yes | List all software |
| `GET` | `/software/webserver-check` | Yes | Get installed web server |
| `POST` | `/software/install` | Yes | Install software |
| `POST` | `/software/install-stack` | Yes | Install full stack |
| `DELETE` | `/software/:name` | Yes | Uninstall software |
| `POST` | `/software/:name/start` | Yes | Start service |
| `POST` | `/software/:name/stop` | Yes | Stop service |
| `POST` | `/software/:name/restart` | Yes | Restart service |
| `GET` | `/software/:name/status` | Yes | Get service status |
| `GET` | `/software/:name/config` | Yes | Get config |
| `PUT` | `/software/:name/config` | Yes | Update config |
| `POST` | `/software/:name/reload` | Yes | Reload service |
| `GET` | `/software/:name/metrics` | Yes | Get service metrics |
| `GET` | `/software/:name/error-log` | Yes | Get error log |
| `GET` | `/software/:name/optimization` | Yes | Get optimization settings |
| `PUT` | `/software/:name/optimization` | Yes | Update optimization |

### phpMyAdmin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/software/phpmyadmin/manager` | Get phpMyAdmin config |
| `PUT` | `/software/phpmyadmin/manager` | Set phpMyAdmin config |
| `GET` | `/software/phpmyadmin/php-versions` | Available PHP versions |

### pgAdmin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/software/pgadmin/manager` | Get pgAdmin config |
| `PUT` | `/software/pgadmin/manager` | Set pgAdmin config |

### MySQL/MariaDB Specific

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/software/mysql/slow-log` | Get slow query log |
| `GET` | `/software/mysql/binary-logs` | Get binary logs |
| `GET` | `/software/mysql/memory-protection` | Get OOM protection |
| `PUT` | `/software/mysql/memory-protection` | Set OOM protection |
| `GET` | `/software/mysql/ram-plans` | Get RAM optimization plans |

### PostgreSQL Specific

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/software/postgresql/connections` | Active connections |
| `GET` | `/software/postgresql/databases` | All PostgreSQL databases |

### PHP Version Specific (`/software/php/:version`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/software/php/:version/extensions` | List extensions |
| `POST` | `/software/php/:version/extensions/install` | Install extension |
| `POST` | `/software/php/:version/extensions/uninstall` | Uninstall extension |
| `GET` | `/software/php/:version/config` | PHP config (php.ini values) |
| `PUT` | `/software/php/:version/config` | Update PHP config |
| `GET` | `/software/php/:version/opcache` | OPcache settings |
| `PUT` | `/software/php/:version/opcache` | Update OPcache |
| `GET` | `/software/php/:version/config-file` | Raw php.ini content |
| `PUT` | `/software/php/:version/config-file` | Save php.ini |
| `GET` | `/software/php/:version/error-log` | PHP error log |
| `GET` | `/software/php/:version/fpm-config` | FPM pool config |
| `PUT` | `/software/php/:version/fpm-config` | Update FPM config |
| `GET` | `/software/php/:version/disable-functions` | Disabled functions list |
| `PUT` | `/software/php/:version/disable-functions` | Update disabled functions |
| `GET` | `/software/php/:version/fpm-status` | FPM process status |
| `GET` | `/software/php/:version/slow-log` | PHP slow log |
| `PUT` | `/software/php/:version/slow-log-config` | Slow log settings |
| `GET` | `/software/php/:version/phpinfo` | phpinfo() output |

---

## 20. Logs (`/logs`)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/logs/panel` | logs.read | Panel application log |
| `GET` | `/logs/website/:id/access` | logs.read | Website access log |
| `GET` | `/logs/website/:id/error` | logs.read | Website error log |
| `GET` | `/logs/website/:id/dates` | logs.read | Available log dates |
| `DELETE` | `/logs/website/:id/:logType` | logs.manage | Clear website log |
| `GET` | `/logs/sites` | logs.read | Minimal site list for log viewer |
| `GET` | `/logs/ssh` | logs.read | SSH auth log |
| `GET` | `/logs/audit` | logs.read | Audit trail log |
| `DELETE` | `/logs/:type` | logs.manage | Clear log by type |
| `GET` | `/logs/search` | logs.read | Full-text log search |

---

## 21. Tasks (`/tasks`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/tasks` | Yes | List background tasks |
| `GET` | `/tasks/summary` | Yes | Task count summary by status |
| `GET` | `/tasks/:id` | Yes | Get task details |
| `GET` | `/tasks/:id/log` | Yes | Get task execution log |
| `DELETE` | `/tasks/:id` | Yes | Cancel running task |

---

## 22. Notifications (`/notifications`)

### Channels

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/notifications/channels` | Yes | List notification channels |
| `POST` | `/notifications/channels` | Yes | Create channel (email/telegram/webhook) |
| `PUT` | `/notifications/channels/:id` | Yes | Update channel |
| `DELETE` | `/notifications/channels/:id` | Yes | Delete channel |
| `POST` | `/notifications/channels/:id/test` | Yes | Send test notification |
| `POST` | `/notifications/channels/:id/test/:eventType` | Yes | Test specific event |

### Rules

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/notifications/rules` | Yes | List routing rules |
| `PUT` | `/notifications/rules` | Yes | Bulk upsert rules |
| `PUT` | `/notifications/rules/:channelId` | Yes | Set rules for channel |

### Templates

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/notifications/templates/defaults/:eventType` | Yes | Default templates |
| `GET` | `/notifications/templates/:channelId/:eventType` | Yes | Custom template |
| `PUT` | `/notifications/templates/:channelId/:eventType` | Yes | Save custom template |
| `POST` | `/notifications/templates/preview` | Yes | Preview rendered template |

### Logs & Events

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/notifications/logs` | Yes | Notification delivery log |
| `DELETE` | `/notifications/logs` | Yes | Clear notification logs |
| `GET` | `/notifications/event-types` | Yes | All event types |
| `GET` | `/notifications/event-types/critical` | Yes | Critical event types |

---

## 23. Plugins (`/plugins`) — Admin Only

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/plugins` | Yes | List installed plugins |
| `GET` | `/plugins/store` | Yes | List available plugins |
| `POST` | `/plugins/:name/install` | Yes | Install plugin |
| `DELETE` | `/plugins/:name` | Yes | Uninstall plugin |
| `PUT` | `/plugins/:name/status` | Yes | Enable/disable plugin |
| `GET` | `/plugins/:name/config` | Yes | Get plugin config |
| `PUT` | `/plugins/:name/config` | Yes | Update plugin config |

---

## 24. Settings (`/settings`) — Admin Only

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/settings` | Yes | Get all settings |
| `PUT` | `/settings` | Yes | Update settings |
| `PUT` | `/settings/panel-port` | Yes | Change panel port |
| `PUT` | `/settings/panel-ssl` | Yes | Configure panel SSL |
| `GET` | `/settings/panel-info` | Yes | Panel info (version, uptime, Go version) |
| `GET` | `/settings/server-info` | Yes | Server info (OS, kernel, hostname) |
| `PUT` | `/settings/admin-path` | Yes | Set admin URL path |
| `PUT` | `/settings/language` | Yes | Set panel language |
| `PUT` | `/settings/panel-name` | Yes | Set panel display name |
| `PUT` | `/settings/timezone` | Yes | Set timezone |
| `PUT` | `/settings/session-timeout` | Yes | Set session timeout |
| `GET` | `/settings/timezones` | Yes | List available timezones |

---

## 25. WebSocket Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `WS /api/v1/terminal` | JWT (query param) | PTY terminal session |
| `WS /api/v1/monitor/realtime` | JWT (header) | Real-time system metrics |

### Terminal WebSocket

Connect: `wss://<server>:8888/api/v1/terminal?token=<jwt>`

**Messages** (JSON):
- Client → Server: `{ "type": "input", "data": "<stdin>" }`
- Client → Server: `{ "type": "resize", "cols": 120, "rows": 40 }`
- Server → Client: `{ "type": "output", "data": "<stdout>" }`

### Monitor WebSocket

Connect: `wss://<server>:8888/api/v1/monitor/realtime`

**Messages** (JSON from server):
```json
{
  "type": "metrics",
  "data": {
    "cpu_percent": 23.5,
    "mem_percent": 67.2,
    "disk_percent": 45.0,
    "net_sent": 1024000,
    "net_recv": 2048000,
    "load1": 0.75,
    "load5": 0.82,
    "load15": 0.90
  }
}
```

---

## Endpoint Summary

| Category | Count |
|----------|-------|
| Authentication | 9 |
| Users | 7 |
| Roles | 5 |
| Dashboard | 2 |
| Monitor | 10 + 1 WS |
| Sites | 50 |
| Databases | 12 |
| Redis | 13 |
| SSL | 10 |
| Docker | 30 |
| Docker Compose | 8 |
| Files | 17 |
| Cron | 8 |
| FTP | 10 |
| Security | 29 |
| Backups | 7 |
| Storage (FTP) | 8 |
| Storage (Cloud) | 9 |
| Software | 38 |
| Logs | 10 |
| Tasks | 5 |
| Notifications | 16 |
| Plugins | 7 |
| Settings | 12 |
| **Total** | **~173 REST + 2 WS** |
