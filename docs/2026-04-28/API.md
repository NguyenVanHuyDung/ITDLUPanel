# ITDLUPanel — API Documentation

> **Version:** 1.0.0 · **Base URL:** `https://host:8888/api/v1` · **Last updated:** 2026-04-28

---

## 1. Overview

All endpoints live under `/api/v1`. Every authenticated endpoint requires:

```
Authorization: Bearer <access_token>
```

WebSocket endpoints use `?token=<access_token>` query parameter instead.

### Response Format

All REST endpoints return:

```json
// Success
{ "code": 200, "data": { ... } }

// Created
{ "code": 201, "data": { ... } }

// Validation error
{ "code": 422, "errors": [{ "field": "...", "message": "..." }] }

// Paginated
{ "code": 200, "data": [...], "page": 1, "per_page": 20, "total": 100, "total_pages": 5 }
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not found |
| 409 | Conflict |
| 422 | Validation error |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## 2. Authentication

### `POST /auth/login`

**Auth:** Public

**Request:**
```json
{ "username": "admin", "password": "secret" }
```

**Response (no 2FA):**
```json
{
  "code": 200,
  "data": {
    "access_token": "<jwt>",
    "expires_in": 900,
    "user": { "id": 1, "username": "admin", "role": "admin" }
  }
}
```

**Response (require 2FA):**
```json
{
  "code": 200,
  "data": { "require_2fa": true, "temp_token": "<jwt>" }
}
```

---

### `POST /auth/refresh`

**Auth:** Refresh token (cookie)

Returns a new access token. Refresh token is sent via `Cookie: refresh_token=<token>`.

**Response:**
```json
{ "code": 200, "data": { "access_token": "<jwt>", "expires_in": 900 } }
```

---

### `POST /auth/2fa/verify`

**Auth:** Public (uses temp_token from login)

**Request:**
```json
{ "temp_token": "...", "code": "123456" }
```

**Response:** Same as login success.

---

### `POST /auth/logout`

**Auth:** JWT

Clears the refresh token cookie.

**Response:**
```json
{ "code": 200, "data": { "message": "logged out successfully" } }
```

---

### `GET /auth/me`

**Auth:** JWT

**Response:**
```json
{
  "code": 200,
  "data": {
    "user_id": 1,
    "username": "admin",
    "role": "admin",
    "permissions": ["*"]
  }
}
```

---

### `PUT /auth/password`

**Auth:** JWT

**Request:**
```json
{ "old_password": "...", "new_password": "..." }
```

---

### `GET /auth/2fa/qrcode`

**Auth:** JWT

**Response:**
```json
{ "code": 200, "data": { "secret": "...", "qr_code_url": "otpauth://..." } }
```

---

### `POST /auth/2fa/enable`

**Auth:** JWT

**Request:**
```json
{ "secret": "...", "code": "123456" }
```

---

### `POST /auth/2fa/disable`

**Auth:** JWT

**Request:**
```json
{ "code": "123456" }
```

---

## 3. Dashboard

### `GET /dashboard`

**Auth:** JWT

Returns system overview (CPU, RAM, disk, network, uptime, service statuses).

---

### `GET /dashboard/software`

**Auth:** JWT

Returns installed software and their service statuses.

---

## 4. Health

### `GET /health`

**Auth:** None

**Response:**
```json
{ "code": 200, "data": { "status": "ok", "version": "1.0.0" } }
```

---

## 5. Sites

### `GET /sites`

**Auth:** JWT + `sites.read`

**Query:** `?page=1&per_page=20`

**Response:** Paginated list of sites.

---

### `POST /sites`

**Auth:** JWT + `sites.create`

**Request:**
```json
{
  "domain": "example.com",
  "php_version": "8.2",
  "web_server": "nginx",
  "root_path": "/www/example.com"
}
```

---

### `GET /sites/php-versions`

**Auth:** JWT + `sites.read`

Returns installed PHP versions on the system.

---

### `GET /sites/rewrite-templates`

**Auth:** JWT + `sites.read`

**Query:** `?webserver=nginx`

Returns available rewrite template names.

---

### `GET /sites/rewrite-templates/:name`

**Auth:** JWT + `sites.read`

Returns the content of a specific rewrite template.

---

### `GET /sites/:id`

**Auth:** JWT + `sites.read`

Returns site details.

---

### `PUT /sites/:id`

**Auth:** JWT + `sites.edit`

---

### `DELETE /sites/:id`

**Auth:** JWT + `sites.delete`

---

### `POST /sites/:id/start`

**Auth:** JWT + `sites.edit`

Enables and reloads site config.

---

### `POST /sites/:id/stop`

**Auth:** JWT + `sites.edit`

Disables site config.

---

### `GET /sites/:id/config`

**Auth:** JWT + `sites.config`

Returns raw vhost configuration.

---

### `PUT /sites/:id/config`

**Auth:** JWT + `sites.config`

**Request:**
```json
{ "content": "... nginx/apache config ..." }
```

---

### `PUT /sites/:id/php`

**Auth:** JWT + `sites.edit`

**Request:**
```json
{ "php_version": "8.3" }
```

---

### `POST /sites/:id/domains`

**Auth:** JWT + `sites.edit`

**Request:**
```json
{ "domain": "www.example.com" }
```

---

### `DELETE /sites/:id/domains/:did`

**Auth:** JWT + `sites.edit`

---

### `GET /sites/:id/domains`

**Auth:** JWT + `sites.read`

---

### `GET /sites/:id/ssl`

**Auth:** JWT + `sites.ssl`

---

### `POST /sites/:id/ssl/enable`

**Auth:** JWT + `sites.ssl`

**Request:**
```json
{ "cert_path": "...", "key_path": "..." }
```

---

### `POST /sites/:id/ssl/disable`

**Auth:** JWT + `sites.ssl`

---

### `POST /sites/:id/ssl/apply`

**Auth:** JWT + `sites.ssl`

Applies existing certificate to site by copying from another domain.

**Request:**
```json
{ "source_domain": "other.com" }
```

---

### `GET /sites/:id/force-https`

**Auth:** JWT + `sites.ssl`

---

### `PUT /sites/:id/force-https`

**Auth:** JWT + `sites.ssl`

**Request:**
```json
{ "enabled": true }
```

---

### `PUT /sites/:id/directory`

**Auth:** JWT + `sites.config`

**Request:**
```json
{ "path": "/public" }
```

---

### `GET /sites/:id/subdirs`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/running-directory`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/open-basedir`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/open-basedir`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/access-log`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/access-log`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/password-access`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/password-access`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/subdir-bindings`

**Auth:** JWT + `sites.config`

---

### `POST /sites/:id/subdir-bindings`

**Auth:** JWT + `sites.config`

---

### `DELETE /sites/:id/subdir-bindings/:index`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/limit-access`

**Auth:** JWT + `sites.config`

---

### `POST /sites/:id/limit-access`

**Auth:** JWT + `sites.config`

---

### `DELETE /sites/:id/limit-access/:index`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/deny-access`

**Auth:** JWT + `sites.config`

---

### `POST /sites/:id/deny-access`

**Auth:** JWT + `sites.config`

---

### `DELETE /sites/:id/deny-access/:index`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/traffic-control`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/traffic-control`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/default-doc`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/default-doc`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/reverse-proxy`

**Auth:** JWT + `sites.config`

---

### `POST /sites/:id/reverse-proxy`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/reverse-proxy/:index`

**Auth:** JWT + `sites.config`

---

### `DELETE /sites/:id/reverse-proxy/:index`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/redirect-rules`

**Auth:** JWT + `sites.config`

---

### `POST /sites/:id/redirect-rules`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/redirect-rules/:index`

**Auth:** JWT + `sites.config`

---

### `DELETE /sites/:id/redirect-rules/:index`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/hotlink`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/hotlink`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/maintenance`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/maintenance`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/maintenance/templates`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/quota`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/disk-usage`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/rewrite`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/rewrite`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/composer`

**Auth:** JWT + `sites.config`

---

### `POST /sites/:id/composer/install`

**Auth:** JWT + `sites.config`

---

### `POST /sites/:id/composer/run`

**Auth:** JWT + `sites.config`

**Request:**
```json
{ "command": "install|update|require|remove|dump-autoload", "args": [] }
```

---

### `GET /sites/:id/composer/json`

**Auth:** JWT + `sites.config`

---

### `PUT /sites/:id/composer/json`

**Auth:** JWT + `sites.config`

---

### `GET /sites/:id/statistics`

**Auth:** JWT + `sites.read`

**Query:** `?days=7` (default 7)

Returns access log statistics (requests, bandwidth).

---

### `POST /sites/batch/delete`

**Auth:** JWT + `sites.delete`

**Request:**
```json
{ "ids": [1, 2, 3] }
```

---

### `PUT /sites/batch/php`

**Auth:** JWT + `sites.edit`

**Request:**
```json
{ "ids": [1, 2], "php_version": "8.2" }
```

---

### `POST /sites/batch/ssl`

**Auth:** JWT + `sites.ssl`

**Request:**
```json
{ "ids": [1, 2], "source_domain": "other.com" }
```

---

## 6. Databases

### `GET /databases`

**Auth:** JWT + `databases.read`

**Query:** `?page=1&per_page=20`

---

### `POST /databases`

**Auth:** JWT + `databases.create`

**Request:**
```json
{ "name": "myapp", "type": "mysql", "username": "appuser", "password": "..." }
```

---

### `GET /databases/:id`

**Auth:** JWT + `databases.read`

---

### `DELETE /databases/:id`

**Auth:** JWT + `databases.delete`

---

### `PUT /databases/:id/password`

**Auth:** JWT + `databases.edit`

**Request:**
```json
{ "password": "..." }
```

---

### `POST /databases/:id/backup`

**Auth:** JWT + `databases.backup`

---

### `POST /databases/:id/restore`

**Auth:** JWT + `databases.backup`

**Request:**
```json
{ "file_path": "/backup/myapp.sql.gz" }
```

---

### `POST /databases/:id/import`

**Auth:** JWT + `databases.edit`

Multipart form: `file` field with `.sql` or `.sql.gz`.

---

### `PUT /databases/:id/access`

**Auth:** JWT + `databases.edit`

**Request:**
```json
{ "host": "localhost|%" }
```

---

### `GET /databases/version`

**Auth:** JWT + `databases.read`

---

### `POST /databases/service`

**Auth:** JWT + `databases.edit`

**Request:**
```json
{ "action": "start|stop|restart|reload", "db_type": "mysql|mariadb" }
```

---

### `GET /databases/:id/size`

**Auth:** JWT + `databases.read`

---

### `PUT /databases/:id/quota`

**Auth:** JWT + `databases.edit`

**Request:**
```json
{ "disk_quota": 1073741824 }
```

---

## 7. Redis

### `GET /redis/info`

**Auth:** JWT + `software.read`

---

### `GET /redis/config`

**Auth:** JWT + `software.read`

---

### `PUT /redis/config`

**Auth:** JWT + `software.manage`

**Request:**
```json
{ "key": "maxmemory", "value": "256mb" }
```

---

### `GET /redis/config-file`

**Auth:** JWT + `software.read`

---

### `PUT /redis/config-file`

**Auth:** JWT + `software.manage`

---

### `GET /redis/clients`

**Auth:** JWT + `software.read`

---

### `DELETE /redis/clients/:id`

**Auth:** JWT + `software.manage`

---

### `POST /redis/flush`

**Auth:** JWT + `software.manage`

**Request:**
```json
{ "db": 0 }    // specific DB
// or
{ "all": true } // all DBs
```

---

### `GET /redis/dbsize`

**Auth:** JWT + `software.read`

---

### `GET /redis/slowlog`

**Auth:** JWT + `software.read`

---

### `GET /redis/memory`

**Auth:** JWT + `software.read`

---

### `PUT /redis/password`

**Auth:** JWT + `software.manage`

---

### `GET /redis/persistence`

**Auth:** JWT + `software.read`

---

## 8. FTP

### `GET /ftp`

**Auth:** JWT + `ftp.read`

**Query:** `?page=1&per_page=20`

---

### `POST /ftp`

**Auth:** JWT + `ftp.create`

**Request:**
```json
{ "username": "ftpuser", "password": "...", "path": "/www/example.com" }
```

---

### `GET /ftp/:id`

**Auth:** JWT + `ftp.read`

---

### `PUT /ftp/:id`

**Auth:** JWT + `ftp.edit`

---

### `DELETE /ftp/:id`

**Auth:** JWT + `ftp.delete`

---

### `PUT /ftp/:id/password`

**Auth:** JWT + `ftp.edit`

---

### `PUT /ftp/:id/status`

**Auth:** JWT + `ftp.edit`

**Request:**
```json
{ "enabled": true }
```

---

### `POST /ftp/batch/delete`

**Auth:** JWT + `ftp.delete`

---

### `POST /ftp/batch/status`

**Auth:** JWT + `ftp.edit`

---

### `POST /ftp/batch/path`

**Auth:** JWT + `ftp.edit`

---

## 9. Files

### `GET /files`

**Auth:** JWT + `files.read`

**Query:** `?path=/www&show_hidden=true`

---

### `GET /files/content`

**Auth:** JWT + `files.read`

**Query:** `?path=/www/index.html`

---

### `PUT /files/content`

**Auth:** JWT + `files.write`

**Request:**
```json
{ "path": "/www/index.html", "content": "..." }
```

---

### `POST /files/upload`

**Auth:** JWT + `files.write`

Multipart form with `files[]` or `file` field. **Query:** `?path=/www`

---

### `GET /files/download`

**Auth:** JWT + `files.read`

**Query:** `?path=/www/backup.tar.gz`

Supports HTTP Range for resume.

---

### `POST /files/mkdir`

**Auth:** JWT + `files.write`

**Request:**
```json
{ "path": "/www/newdir" }
```

---

### `POST /files/create`

**Auth:** JWT + `files.write`

**Request:**
```json
{ "path": "/www/newfile.txt" }
```

---

### `POST /files/rename`

**Auth:** JWT + `files.write`

**Request:**
```json
{ "old_path": "...", "new_path": "..." }
```

---

### `POST /files/copy`

**Auth:** JWT + `files.write`

**Request:**
```json
{ "src": "...", "dst": "..." }
```

---

### `POST /files/move`

**Auth:** JWT + `files.write`

---

### `DELETE /files`

**Auth:** JWT + `files.delete`

**Request:**
```json
{ "paths": ["/www/file1", "/www/file2"] }
```

---

### `PUT /files/permissions`

**Auth:** JWT + `files.write`

**Request:**
```json
{ "path": "/www", "mode": "0755", "recursive": true }
```

---

### `PUT /files/owner`

**Auth:** JWT + `files.write`

**Request:**
```json
{ "path": "/www", "owner": "www-data", "group": "www-data", "recursive": true }
```

---

### `POST /files/compress`

**Auth:** JWT + `files.write`

**Request:**
```json
{ "paths": ["/www/file1", "/www/dir1"], "dest": "/backup/archive.tar.gz", "format": "tar.gz" }
```

---

### `POST /files/decompress`

**Auth:** JWT + `files.write`

**Request:**
```json
{ "path": "/backup/archive.tar.gz", "dest": "/www" }
```

---

### `GET /files/search`

**Auth:** JWT + `files.read`

**Query:** `?path=/www&pattern=*.log`

---

### `GET /files/search-content`

**Auth:** JWT + `files.read`

**Query:** `?path=/www&pattern=error`

---

### `POST /files/calculate-size`

**Auth:** JWT + `files.read`

**Request:**
```json
{ "path": "/www" }
```

---

## 10. Docker

### `GET /docker/info`

**Auth:** JWT + `docker.read`

---

### `GET /docker/containers`

**Auth:** JWT + `docker.read`

**Query:** `?all=true`

---

### `POST /docker/containers`

**Auth:** JWT + `docker.create`

**Request:**
```json
{
  "name": "myapp",
  "image": "nginx:latest",
  "ports": { "80/tcp": "8080" },
  "env": ["DB_HOST=localhost"],
  "volumes": ["/data:/app/data"],
  "restart_policy": "always"
}
```

---

### `GET /docker/containers/:id`

**Auth:** JWT + `docker.read`

---

### `DELETE /docker/containers/:id`

**Auth:** JWT + `docker.create`

**Query:** `?force=true`

---

### `POST /docker/containers/:id/start`

**Auth:** JWT + `docker.manage`

---

### `POST /docker/containers/:id/stop`

**Auth:** JWT + `docker.manage`

---

### `POST /docker/containers/:id/restart`

**Auth:** JWT + `docker.manage`

---

### `POST /docker/containers/:id/pause`

**Auth:** JWT + `docker.manage`

---

### `POST /docker/containers/:id/unpause`

**Auth:** JWT + `docker.manage`

---

### `POST /docker/containers/:id/rename`

**Auth:** JWT + `docker.manage`

**Request:**
```json
{ "name": "newname" }
```

---

### `GET /docker/containers/:id/logs`

**Auth:** JWT + `docker.read`

**Query:** `?tail=100`

---

### `GET /docker/containers/:id/stats`

**Auth:** JWT + `docker.read`

---

### `GET /docker/images`

**Auth:** JWT + `docker.read`

---

### `POST /docker/images/pull`

**Auth:** JWT + `docker.manage`

**Request:**
```json
{ "name": "nginx:latest" }
```

---

### `DELETE /docker/images/:id`

**Auth:** JWT + `docker.manage`

**Query:** `?force=true`

---

### `GET /docker/images/:id/inspect`

**Auth:** JWT + `docker.read`

---

### `GET /docker/images/:id/history`

**Auth:** JWT + `docker.read`

---

### `POST /docker/images/:id/tag`

**Auth:** JWT + `docker.manage`

**Request:**
```json
{ "repo": "myrepo", "tag": "v1.0" }
```

---

### `GET /docker/images/search`

**Auth:** JWT + `docker.read`

**Query:** `?q=nginx`

---

### `POST /docker/images/prune`

**Auth:** JWT + `docker.manage`

---

### `GET /docker/networks`

**Auth:** JWT + `docker.read`

---

### `POST /docker/networks`

**Auth:** JWT + `docker.create`

**Request:**
```json
{ "name": "mynet", "driver": "bridge", "subnet": "172.20.0.0/16" }
```

---

### `DELETE /docker/networks/:id`

**Auth:** JWT + `docker.manage`

---

### `GET /docker/networks/:id`

**Auth:** JWT + `docker.read`

---

### `POST /docker/networks/:id/connect`

**Auth:** JWT + `docker.manage`

**Request:**
```json
{ "container": "abc123" }
```

---

### `POST /docker/networks/:id/disconnect`

**Auth:** JWT + `docker.manage`

---

### `POST /docker/networks/prune`

**Auth:** JWT + `docker.manage`

---

### `GET /docker/volumes`

**Auth:** JWT + `docker.read`

---

### `POST /docker/volumes`

**Auth:** JWT + `docker.create`

**Request:**
```json
{ "name": "mydata", "driver": "local" }
```

---

### `DELETE /docker/volumes/:name`

**Auth:** JWT + `docker.manage`

**Query:** `?force=true`

---

### `GET /docker/volumes/:name`

**Auth:** JWT + `docker.read`

---

### `POST /docker/volumes/prune`

**Auth:** JWT + `docker.manage`

---

### `GET /docker/system/df`

**Auth:** JWT + `docker.read`

Disk usage across images, containers, volumes.

---

### `POST /docker/system/restart`

**Auth:** JWT + `docker.manage`

---

### `POST /docker/system/stop`

**Auth:** JWT + `docker.manage`

---

### `GET /docker/system/config`

**Auth:** JWT + `docker.read`

---

### `PUT /docker/system/config`

**Auth:** JWT + `docker.manage`

**Request:**
```json
{ "mirrors": ["https://mirror.example.com"] }
```

---

## 11. Docker Compose

### `GET /docker/compose`

**Auth:** JWT + `docker.read`

---

### `POST /docker/compose`

**Auth:** JWT + `docker.create`

**Request:**
```json
{ "name": "myapp", "yaml": "version: '3'\nservices:\n  web:\n    image: nginx" }
```

---

### `GET /docker/compose/:name`

**Auth:** JWT + `docker.read`

---

### `DELETE /docker/compose/:name`

**Auth:** JWT + `docker.manage`

---

### `POST /docker/compose/:name/up`

**Auth:** JWT + `docker.manage`

---

### `POST /docker/compose/:name/down`

**Auth:** JWT + `docker.manage`

---

### `POST /docker/compose/:name/restart`

**Auth:** JWT + `docker.manage`

---

### `GET /docker/compose/:name/logs`

**Auth:** JWT + `docker.read`

---

## 12. Cron

### `GET /crons`

**Auth:** JWT + `cron.read`

**Query:** `?page=1&per_page=20`

---

### `POST /crons`

**Auth:** JWT + `cron.create`

**Request:**
```json
{ "name": "Daily Backup", "schedule": "0 2 * * *", "command": "/scripts/backup.sh", "type": "shell" }
```

---

### `GET /crons/:id`

**Auth:** JWT + `cron.read`

---

### `PUT /crons/:id`

**Auth:** JWT + `cron.edit`

---

### `DELETE /crons/:id`

**Auth:** JWT + `cron.delete`

---

### `PUT /crons/:id/status`

**Auth:** JWT + `cron.edit`

**Request:**
```json
{ "enabled": true }
```

---

### `GET /crons/:id/log`

**Auth:** JWT + `cron.read`

---

### `POST /crons/:id/run`

**Auth:** JWT + `cron.edit`

---

## 13. Security

### Firewall

### `GET /firewall/rules`

**Auth:** JWT + `firewall.read`

---

### `POST /firewall/rules`

**Auth:** JWT + `firewall.manage`

**Request:**
```json
{ "port": "8080", "protocol": "tcp", "source": "0.0.0.0/0", "action": "allow" }
```

---

### `DELETE /firewall/rules/:id`

**Auth:** JWT + `firewall.manage`

---

### `PUT /firewall/rules/:id/status`

**Auth:** JWT + `firewall.manage`

**Request:**
```json
{ "enabled": true }
```

---

### `GET /firewall/settings`

**Auth:** JWT + `firewall.read`

---

### `PUT /firewall/settings`

**Auth:** JWT + `firewall.manage`

**Request:**
```json
{ "key": "enabled|icmp_block", "value": true }
```

---

### `GET /firewall/port-status`

**Auth:** JWT + `firewall.read`

---

### `GET /firewall/blocked-ips`

**Auth:** JWT + `firewall.read`

---

### `POST /firewall/blocked-ips`

**Auth:** JWT + `firewall.manage`

**Request:**
```json
{ "ip": "1.2.3.4" }
```

---

### `DELETE /firewall/blocked-ips`

**Auth:** JWT + `firewall.manage`

**Request:**
```json
{ "ip": "1.2.3.4" }
```

---

### `GET /firewall/status`

**Auth:** JWT + `firewall.read`

---

### `POST /firewall/install`

**Auth:** JWT + `firewall.manage`

---

### SSH

### `GET /security/ssh`

**Auth:** JWT + `security.manage`

---

### `PUT /security/ssh`

**Auth:** JWT + `security.manage`

---

### `PUT /security/root-password`

**Auth:** JWT + `security.manage`

**Request:**
```json
{ "password": "..." }
```

---

### `GET /security/ssh/users`

**Auth:** JWT + `security.manage`

---

### `POST /security/ssh/users`

**Auth:** JWT + `security.manage`

---

### `DELETE /security/ssh/users/:username`

**Auth:** JWT + `security.manage`

---

### `GET /security/ssh/keys/:username`

**Auth:** JWT + `security.manage`

---

### `POST /security/ssh/keys/:username`

**Auth:** JWT + `security.manage`

**Request:**
```json
{ "public_key": "ssh-rsa AAAA..." }
```

---

### `DELETE /security/ssh/keys/:username/:fingerprint`

**Auth:** JWT + `security.manage`

---

### `POST /security/ssh/keys/:username/generate`

**Auth:** JWT + `security.manage`

**Request:**
```json
{ "key_type": "ed25519|rsa" }
```

---

### `GET /security/ssh/keys/:username/public`

**Auth:** JWT + `security.manage`

---

### `GET /security/ssh/keys/:username/download-private`

**Auth:** JWT + `security.manage`

Downloads private key file.

---

### Fail2ban

### `GET /security/fail2ban`

**Auth:** JWT + `security.manage`

---

### `PUT /security/fail2ban`

**Auth:** JWT + `security.manage`

---

### `POST /security/fail2ban/install`

**Auth:** JWT + `security.manage`

---

### `POST /security/fail2ban/uninstall`

**Auth:** JWT + `security.manage`

---

### `GET /security/fail2ban/config`

**Auth:** JWT + `security.manage`

---

### `PUT /security/fail2ban/config`

**Auth:** JWT + `security.manage`

---

### `GET /security/fail2ban/jails`

**Auth:** JWT + `security.manage`

---

### `POST /security/fail2ban/jails`

**Auth:** JWT + `security.manage`

---

### `DELETE /security/fail2ban/jails/:name`

**Auth:** JWT + `security.manage`

---

### `POST /security/fail2ban/ban`

**Auth:** JWT + `security.manage`

**Request:**
```json
{ "jail": "sshd", "ip": "1.2.3.4" }
```

---

### `POST /security/fail2ban/unban`

**Auth:** JWT + `security.manage`

---

### `GET /security/fail2ban/log`

**Auth:** JWT + `security.manage`

**Query:** `?lines=200`

---

## 14. SSL

### `GET /ssl/certificates`

**Auth:** JWT + Admin

---

### `GET /ssl/certificates/:domain`

**Auth:** JWT + Admin

---

### `DELETE /ssl/certificates/:domain`

**Auth:** JWT + Admin

---

### `POST /ssl/letsencrypt`

**Auth:** JWT + Admin

**Request:**
```json
{ "domain": "example.com", "email": "admin@example.com" }
```

---

### `POST /ssl/letsencrypt-dns/init`

**Auth:** JWT + Admin

Initiates DNS-01 challenge. Returns TXT record to add.

---

### `POST /ssl/letsencrypt-dns/complete`

**Auth:** JWT + Admin

Verifies DNS and issues certificate.

---

### `POST /ssl/upload`

**Auth:** JWT + Admin

Multipart form: `domain`, `cert`, `key` files.
Or JSON body:
```json
{ "domain": "example.com", "cert": "...PEM...", "key": "...PEM..." }
```

---

### `POST /ssl/renew/:domain`

**Auth:** JWT + Admin

---

### `GET /ssl/panel`

**Auth:** JWT + Admin

---

### `POST /ssl/panel`

**Auth:** JWT + Admin

Uploads or configures panel SSL certificate.

---

### `POST /ssl/panel/self-signed`

**Auth:** JWT + Admin

Generates a self-signed certificate for the panel.

---

## 15. Backups

### `GET /backups`

**Auth:** JWT + `backup.read`

**Query:** `?page=1&page_size=20&type=site&target_id=1`

---

### `POST /backups`

**Auth:** JWT + `backup.create`

**Request:**
```json
{ "type": "site|database|panel", "target_id": 1, "storage": "ftp", "storage_id": 1 }
```

---

### `GET /backups/site-counts`

**Auth:** JWT + `backup.read`

---

### `GET /backups/database-counts`

**Auth:** JWT + `backup.read`

---

### `GET /backups/:id`

**Auth:** JWT + `backup.read`

---

### `DELETE /backups/:id`

**Auth:** JWT + `backup.delete`

---

### `POST /backups/:id/restore`

**Auth:** JWT + `backup.restore`

---

### `GET /backups/:id/download`

**Auth:** JWT + `backup.read`

Downloads backup file.

---

## 16. FTP Storage

### `GET /ftp-storages`

**Auth:** JWT + `backup.read`

---

### `POST /ftp-storages`

**Auth:** JWT + `backup.create`

**Request:**
```json
{ "name": "Remote Backup", "host": "backup.example.com", "port": 21, "username": "...", "password": "...", "remote_path": "/backups" }
```

---

### `GET /ftp-storages/:id`

**Auth:** JWT + `backup.read`

---

### `PUT /ftp-storages/:id`

**Auth:** JWT + `backup.create`

---

### `DELETE /ftp-storages/:id`

**Auth:** JWT + `backup.delete`

---

### `POST /ftp-storages/:id/test`

**Auth:** JWT + `backup.read`

---

### `POST /ftp-storages/test`

**Auth:** JWT + `backup.read`

---

### `GET /ftp-storages/:id/files`

**Auth:** JWT + `backup.read`

**Query:** `?sub_dir=/subfolder`

---

## 17. Cloud Storage

### `GET /cloud-storages`

**Auth:** JWT + `backup.read`

**Query:** `?type=s3|google_drive|onedrive`

---

### `POST /cloud-storages`

**Auth:** JWT + `backup.create`

**Request:**
```json
{
  "name": "AWS S3",
  "type": "s3",
  "config": { "bucket": "...", "region": "...", "access_key": "...", "secret_key": "..." },
  "is_default": true
}
```

---

### `GET /cloud-storages/:id`

**Auth:** JWT + `backup.read`

---

### `PUT /cloud-storages/:id`

**Auth:** JWT + `backup.create`

---

### `DELETE /cloud-storages/:id`

**Auth:** JWT + `backup.delete`

---

### `POST /cloud-storages/:id/test`

**Auth:** JWT + `backup.read`

---

### `POST /cloud-storages/test`

**Auth:** JWT + `backup.read`

Inline test with config in body.

---

### `GET /cloud-storages/:id/auth-url`

**Auth:** JWT + `backup.create`

Returns OAuth URL for Google Drive / OneDrive authorization.

---

### `GET /cloud-storages/oauth/callback`

**Auth:** None (browser redirect from OAuth provider)

Handles OAuth redirect, stores tokens.

---

## 18. Software

### `GET /software`

**Auth:** JWT + Admin

---

### `GET /software/webserver-check`

**Auth:** JWT + Admin

---

### `POST /software/install`

**Auth:** JWT + Admin

**Request:**
```json
{ "name": "nginx", "version": "1.25" }
```

Returns `202 Accepted` with `{ "task_id": 42 }`.

---

### `POST /software/install-stack`

**Auth:** JWT + Admin

**Request:**
```json
{ "components": ["nginx", "mysql", "php8.2"] }
```

---

### `DELETE /software/:name`

**Auth:** JWT + Admin

**Query:** `?version=8.2`

---

### `POST /software/:name/start`

**Auth:** JWT + Admin

---

### `POST /software/:name/stop`

**Auth:** JWT + Admin

---

### `POST /software/:name/restart`

**Auth:** JWT + Admin

---

### `GET /software/:name/status`

**Auth:** JWT + Admin

---

### `GET /software/:name/config`

**Auth:** JWT + Admin

---

### `PUT /software/:name/config`

**Auth:** JWT + Admin

---

### `POST /software/:name/reload`

**Auth:** JWT + Admin

---

### `GET /software/:name/metrics`

**Auth:** JWT + Admin (nginx only)

---

### `GET /software/:name/error-log`

**Auth:** JWT + Admin

**Query:** `?lines=100`

---

### `GET /software/:name/optimization`

**Auth:** JWT + Admin

---

### `PUT /software/:name/optimization`

**Auth:** JWT + Admin

---

### PHP Per-Version Management

### `GET /software/php/:version/extensions`

**Auth:** JWT + Admin

---

### `POST /software/php/:version/extensions/install`

**Auth:** JWT + Admin

**Request:**
```json
{ "extensions": ["gd", "mbstring", "zip"] }
```

---

### `POST /software/php/:version/extensions/uninstall`

**Auth:** JWT + Admin

---

### `GET /software/php/:version/config`

**Auth:** JWT + Admin

---

### `PUT /software/php/:version/config`

**Auth:** JWT + Admin

---

### `GET /software/php/:version/opcache`

**Auth:** JWT + Admin

---

### `PUT /software/php/:version/opcache`

**Auth:** JWT + Admin

---

### `GET /software/php/:version/config-file`

**Auth:** JWT + Admin

---

### `PUT /software/php/:version/config-file`

**Auth:** JWT + Admin

---

### `GET /software/php/:version/error-log`

**Auth:** JWT + Admin

---

### `GET /software/php/:version/fpm-config`

**Auth:** JWT + Admin

---

### `PUT /software/php/:version/fpm-config`

**Auth:** JWT + Admin

---

### `GET /software/php/:version/disable-functions`

**Auth:** JWT + Admin

---

### `PUT /software/php/:version/disable-functions`

**Auth:** JWT + Admin

---

### `GET /software/php/:version/fpm-status`

**Auth:** JWT + Admin

---

### `GET /software/php/:version/slow-log`

**Auth:** JWT + Admin

---

### `PUT /software/php/:version/slow-log-config`

**Auth:** JWT + Admin

---

### `GET /software/php/:version/phpinfo`

**Auth:** JWT + Admin

---

### DB Management

### `GET /software/mysql/slow-log`

**Auth:** JWT + Admin

---

### `GET /software/mysql/binary-logs`

**Auth:** JWT + Admin

---

### `GET /software/mysql/memory-protection`

**Auth:** JWT + Admin

---

### `PUT /software/mysql/memory-protection`

**Auth:** JWT + Admin

---

### `GET /software/mysql/ram-plans`

**Auth:** JWT + Admin

---

### `GET /software/postgresql/connections`

**Auth:** JWT + Admin

---

### `GET /software/postgresql/databases`

**Auth:** JWT + Admin

---

### `GET /software/mongodb/databases`

**Auth:** JWT + Admin

---

### `POST /software/mongodb/databases`

**Auth:** JWT + Admin

---

### `DELETE /software/mongodb/databases/:dbname`

**Auth:** JWT + Admin

---

### `GET /software/mongodb/databases/:dbname/collections`

**Auth:** JWT + Admin

---

### `POST /software/mongodb/databases/:dbname/collections`

**Auth:** JWT + Admin

---

### `DELETE /software/mongodb/databases/:dbname/collections/:collname`

**Auth:** JWT + Admin

---

### `GET /software/mongodb/stats`

**Auth:** JWT + Admin

---

### `GET /software/mongodb/users`

**Auth:** JWT + Admin

---

### `POST /software/mongodb/users`

**Auth:** JWT + Admin

---

### `DELETE /software/mongodb/users/:dbname/:username`

**Auth:** JWT + Admin

---

### `GET /software/pgadmin/manager`

**Auth:** JWT + Admin

---

### `PUT /software/pgadmin/manager`

**Auth:** JWT + Admin

---

### `GET /software/nginx/available-versions`

**Auth:** JWT + Admin

---

### `GET /software/phpmyadmin/manager`

**Auth:** JWT + Admin

---

### `PUT /software/phpmyadmin/manager`

**Auth:** JWT + Admin

---

### `GET /software/phpmyadmin/php-versions`

**Auth:** JWT + Admin

---

## 19. Monitor

### `GET /monitor/system`

**Auth:** JWT

Full system metrics (CPU, RAM, disk, network, uptime).

---

### `GET /monitor/processes`

**Auth:** JWT

**Query:** `?limit=50`

Top processes by CPU/memory.

---

### `POST /monitor/processes/kill`

**Auth:** JWT

**Request:**
```json
{ "pid": 1234 }
```

---

### `GET /monitor/services`

**Auth:** JWT

Status of managed services (nginx, mysql, etc).

---

### `GET /monitor/network`

**Auth:** JWT

Aggregate network interface stats.

---

### `GET /monitor/disk`

**Auth:** JWT

Disk partition usage.

---

### `GET /monitor/history`

**Auth:** JWT

**Query:** `?range=1d|7d|30d&resolution=auto`

Historical metrics data.

---

### `DELETE /monitor/history`

**Auth:** JWT

**Query:** `?table=raw|5m|1h|1d|all`

---

### `GET /monitor/settings`

**Auth:** JWT

---

### `PUT /monitor/settings`

**Auth:** JWT

**Request:**
```json
{ "interval": 60, "retention_raw": 7, "retention_5m": 30, "retention_1h": 90, "retention_1d": 365 }
```

---

## 20. Tasks

### `GET /tasks`

**Auth:** JWT

**Query:** `?page=1&per_page=20&status=running|pending|done|failed`

---

### `GET /tasks/summary`

**Auth:** JWT

Returns counts by status.

---

### `GET /tasks/:id`

**Auth:** JWT

---

### `GET /tasks/:id/log`

**Auth:** JWT

---

### `DELETE /tasks/:id`

**Auth:** JWT

Cancels a running or pending task.

---

## 21. Users

### `GET /users`

**Auth:** JWT + Admin

**Query:** `?page=1&per_page=20`

---

### `POST /users`

**Auth:** JWT + Admin

**Request:**
```json
{ "username": "john", "password": "...", "email": "john@example.com", "role": "operator" }
```

---

### `GET /users/:id`

**Auth:** JWT + Admin

---

### `PUT /users/:id`

**Auth:** JWT + Admin

**Request:**
```json
{ "email": "...", "role": "viewer", "status": 1 }
```

---

### `PUT /users/:id/password`

**Auth:** JWT + Admin

**Request:**
```json
{ "password": "..." }
```

---

### `DELETE /users/:id`

**Auth:** JWT + Admin

---

### `GET /users/:id/resources`

**Auth:** JWT + Admin

---

### `POST /users/:id/resources`

**Auth:** JWT + Admin

**Request:**
```json
{ "type": "site|database|ftp", "resource_ids": [1, 2, 3] }
```

---

### `DELETE /users/:id/resources/:type/:rid`

**Auth:** JWT + Admin

---

## 22. Roles

### `GET /roles`

**Auth:** JWT + Admin

---

### `GET /roles/permissions`

**Auth:** JWT + Admin

Returns the full permission tree for the UI.

---

### `POST /roles`

**Auth:** JWT + Admin

**Request:**
```json
{ "name": "Developer", "description": "...", "permissions": ["sites.*", "databases.read"] }
```

---

### `PUT /roles/:id`

**Auth:** JWT + Admin

---

### `DELETE /roles/:id`

**Auth:** JWT + Admin

---

## 23. Plugins

### `GET /plugins`

**Auth:** JWT + Admin

List installed plugins.

---

### `GET /plugins/store`

**Auth:** JWT + Admin

List available plugins in store.

---

### `POST /plugins/:name/install`

**Auth:** JWT + Admin

---

### `DELETE /plugins/:name`

**Auth:** JWT + Admin

---

### `PUT /plugins/:name/status`

**Auth:** JWT + Admin

**Request:**
```json
{ "status": "enabled|disabled" }
```

---

### `GET /plugins/:name/config`

**Auth:** JWT + Admin

---

### `PUT /plugins/:name/config`

**Auth:** JWT + Admin

---

## 24. Settings

### `GET /settings`

**Auth:** JWT + Admin

---

### `PUT /settings`

**Auth:** JWT + Admin

**Request:**
```json
{ "key": "value", "key2": "value2" }
```

---

### `PUT /settings/panel-port`

**Auth:** JWT + Admin

**Request:**
```json
{ "port": 8888 }
```

---

### `PUT /settings/panel-ssl`

**Auth:** JWT + Admin

**Request:**
```json
{ "enable": true }
```

---

### `GET /settings/panel-info`

**Auth:** JWT + Admin

---

### `PUT /settings/admin-path`

**Auth:** JWT + Admin

**Request:**
```json
{ "path": "/admin" }
```

---

### `PUT /settings/language`

**Auth:** JWT + Admin

**Request:**
```json
{ "language": "vi" }
```

---

### `PUT /settings/panel-name`

**Auth:** JWT + Admin

**Request:**
```json
{ "name": "My Panel" }
```

---

### `PUT /settings/timezone`

**Auth:** JWT + Admin

**Request:**
```json
{ "timezone": "Asia/Ho_Chi_Minh" }
```

---

### `PUT /settings/session-timeout`

**Auth:** JWT + Admin

**Request:**
```json
{ "timeout": 1800 }
```

---

### `GET /settings/timezones`

**Auth:** JWT + Admin

---

### `GET /settings/server-info`

**Auth:** JWT + Admin

---

## 25. Logs

### `GET /logs/panel`

**Auth:** JWT + `logs.read`

**Query:** `?lines=100`

---

### `GET /logs/website/:id/access`

**Auth:** JWT + `logs.read`

**Query:** `?lines=100&date=2026-04-01&start_date=...&end_date=...`

---

### `GET /logs/website/:id/error`

**Auth:** JWT + `logs.read`

**Query:** Same as access log.

---

### `GET /logs/website/:id/dates`

**Auth:** JWT + `logs.read`

Returns available rotated log dates.

---

### `DELETE /logs/website/:id/:logType`

**Auth:** JWT + `logs.manage`

`logType`: `access` or `error`.

---

### `GET /logs/sites`

**Auth:** JWT + `logs.read`

Minimal site list for dropdown.

---

### `GET /logs/ssh`

**Auth:** JWT + `logs.read`

---

### `GET /logs/audit`

**Auth:** JWT + `logs.read`

**Query:** `?page=1&page_size=20`

---

### `DELETE /logs/:type`

**Auth:** JWT + `logs.manage`

`type`: `panel|ssh|audit`.

---

### `GET /logs/search`

**Auth:** JWT + `logs.read`

**Query:** `?path=...&pattern=error&lines=50`

---

## 26. Notifications

### Channels

### `GET /notifications/channels`

**Auth:** JWT + Admin

---

### `POST /notifications/channels`

**Auth:** JWT + Admin

**Request:**
```json
{ "type": "email|telegram", "name": "Admin Alert", "config": { "server": "...", "token": "..." }, "is_enabled": true }
```

---

### `PUT /notifications/channels/:id`

**Auth:** JWT + Admin

---

### `DELETE /notifications/channels/:id`

**Auth:** JWT + Admin

---

### `POST /notifications/channels/:id/test`

**Auth:** JWT + Admin

---

### `POST /notifications/channels/:id/test/:eventType`

**Auth:** JWT + Admin

---

### Rules

### `GET /notifications/rules`

**Auth:** JWT + Admin

---

### `PUT /notifications/rules`

**Auth:** JWT + Admin

---

### `PUT /notifications/rules/:channelId`

**Auth:** JWT + Admin

**Request:**
```json
{ "event_types": ["backup_failed", "disk_full"] }
```

---

### Templates

### `GET /notifications/templates/defaults/:eventType`

**Auth:** JWT + Admin

---

### `GET /notifications/templates/:channelId/:eventType`

**Auth:** JWT + Admin

---

### `PUT /notifications/templates/:channelId/:eventType`

**Auth:** JWT + Admin

---

### `POST /notifications/templates/preview`

**Auth:** JWT + Admin

---

### Logs

### `GET /notifications/logs`

**Auth:** JWT + Admin

**Query:** `?page=1&per_page=20&channel_type=...&event_type=...&status=sent|failed`

---

### `DELETE /notifications/logs`

**Auth:** JWT + Admin

---

### Event Types

### `GET /notifications/event-types`

**Auth:** JWT + Admin

---

### `GET /notifications/event-types/critical`

**Auth:** JWT + Admin

---

## 27. WebSocket Endpoints

### Terminal

**URL:** `wss://host:8888/api/v1/terminal?token=<jwt>&cwd=/www`

**Auth:** JWT via query param + `terminal.access` permission

**Client → Server (resize):**
```json
{ "type": "resize", "cols": 120, "rows": 40 }
```

**Client → Server (input):** Raw bytes forwarded to PTY stdin.

**Server → Client:** Raw PTY stdout bytes (binary).

---

### Monitor

**URL:** `wss://host:8888/api/v1/monitor/realtime?token=<jwt>`

**Auth:** JWT + Auth middleware

**Server → Client (every 2s):**
```json
{
  "event": "metrics",
  "data": {
    "cpu_percent": 23.5,
    "memory_percent": 61.2,
    "disk_usage": [...],
    "network": [...],
    "uptime": 864000
  }
}
```
