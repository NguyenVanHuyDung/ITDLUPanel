# ITDLUPanel — Technical Specification

## 1. Database Schema

### 1.1 Entity Relationship

```
users ─────┬──▶ user_roles ◀── roles
            │
            ├──▶ sites ──▶ domains
            │
            ├──▶ databases
            │
            ├──▶ ftps
            │
            ├──▶ crons
            │
            ├──▶ tasks
            │
            ├──▶ backups
            │
            └──▶ audit_logs

software (standalone)
plugins (standalone)
firewall_rules (standalone)
docker_containers (standalone)
settings (key-value)
```

### 1.2 Full Schema (SQLite)

```sql
-- ============================================================
-- USERS & RBAC
-- ============================================================

CREATE TABLE users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,              -- bcrypt hash (cost=12)
    email       TEXT,
    role        TEXT NOT NULL DEFAULT 'viewer',  -- admin, operator, viewer
    totp_secret TEXT,                       -- TOTP 2FA secret (encrypted)
    totp_enabled INTEGER DEFAULT 0,        -- 0=disabled, 1=enabled
    status      INTEGER DEFAULT 1,         -- 1=active, 0=disabled
    last_login  DATETIME,
    last_ip     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,       -- admin, operator, viewer
    description TEXT,
    permissions TEXT NOT NULL               -- JSON array: ["sites.read","sites.write",...]
);

CREATE TABLE user_roles (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Default roles
INSERT INTO roles (name, description, permissions) VALUES
('admin', 'Full system administrator', '["*"]'),
('operator', 'Server operator', '["sites.*","databases.*","ftp.*","files.*","cron.*","docker.*","firewall.*","backup.*","terminal.access","monitor.read","logs.read"]'),
('viewer', 'Read-only viewer', '["monitor.read","logs.read","dashboard.read"]');

-- ============================================================
-- WEBSITES
-- ============================================================

CREATE TABLE sites (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,              -- site identifier (e.g., "my-site")
    domain      TEXT NOT NULL,              -- primary domain (e.g., "example.com")
    path        TEXT NOT NULL,              -- document root (e.g., "/ITDLUPanel/wwwroot/example.com")
    webserver   TEXT NOT NULL,              -- nginx, apache, openlitespeed
    php_version TEXT,                       -- php7.4, php8.1, php8.2, php8.3 (NULL=static)
    ssl_enabled INTEGER DEFAULT 0,         -- 0=off, 1=on
    ssl_type    TEXT,                       -- letsencrypt, custom, self-signed, NULL
    ssl_expiry  DATETIME,                  -- certificate expiry date
    status      INTEGER DEFAULT 1,         -- 1=running, 0=stopped
    config_extra TEXT,                      -- JSON: extra config (redirects, rewrites, etc.)
    created_by  INTEGER REFERENCES users(id),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE domains (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    domain      TEXT NOT NULL,              -- domain name
    is_primary  INTEGER DEFAULT 0,         -- 1=primary domain, 0=alias
    UNIQUE(site_id, domain)
);

CREATE INDEX idx_sites_domain ON sites(domain);
CREATE INDEX idx_domains_site ON domains(site_id);

-- ============================================================
-- DATABASES
-- ============================================================

CREATE TABLE databases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,              -- database name
    db_type     TEXT NOT NULL,              -- mysql, mariadb, postgresql
    username    TEXT NOT NULL,              -- database user
    password    TEXT NOT NULL,              -- encrypted password
    charset     TEXT DEFAULT 'utf8mb4',    -- character set
    collation   TEXT DEFAULT 'utf8mb4_general_ci',
    remote_access TEXT DEFAULT 'localhost', -- access host (localhost, %, specific IP)
    size        INTEGER DEFAULT 0,         -- size in bytes (updated periodically)
    created_by  INTEGER REFERENCES users(id),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, db_type)
);

-- ============================================================
-- FTP ACCOUNTS
-- ============================================================

CREATE TABLE ftps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT UNIQUE NOT NULL,       -- FTP username
    password    TEXT NOT NULL,              -- encrypted password
    path        TEXT NOT NULL,              -- home directory
    status      INTEGER DEFAULT 1,         -- 1=enabled, 0=disabled
    created_by  INTEGER REFERENCES users(id),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- CRON JOBS
-- ============================================================

CREATE TABLE crons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,              -- descriptive name
    type        TEXT NOT NULL,              -- shell, backup_site, backup_db, url, custom
    schedule    TEXT NOT NULL,              -- cron expression: "0 2 * * *"
    command     TEXT NOT NULL,              -- command to execute
    status      INTEGER DEFAULT 1,         -- 1=enabled, 0=disabled
    last_run    DATETIME,                  -- last execution time
    last_status TEXT,                       -- success, failed
    last_output TEXT,                       -- last execution output (truncated)
    created_by  INTEGER REFERENCES users(id),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- BACKGROUND TASKS
-- ============================================================

CREATE TABLE tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,              -- install, uninstall, backup, restore, update, custom
    name        TEXT NOT NULL,              -- human-readable name
    status      TEXT DEFAULT 'pending',     -- pending, running, completed, failed, cancelled
    progress    INTEGER DEFAULT 0,          -- 0-100
    log         TEXT,                        -- execution log (appended)
    result      TEXT,                        -- JSON result data
    error       TEXT,                        -- error message if failed
    created_by  INTEGER REFERENCES users(id),
    started_at  DATETIME,
    completed_at DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_status ON tasks(status);

-- ============================================================
-- INSTALLED SOFTWARE
-- ============================================================

CREATE TABLE software (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,       -- nginx, apache, openlitespeed, mysql, mariadb,
                                            -- php7.4, php8.1, php8.2, php8.3, pure-ftpd,
                                            -- redis, phpmyadmin, docker
    display_name TEXT NOT NULL,             -- "Nginx", "PHP 8.2", etc.
    version     TEXT NOT NULL,              -- installed version
    type        TEXT NOT NULL,              -- webserver, database, runtime, ftp, cache, tool, container
    status      INTEGER DEFAULT 1,         -- 1=running, 0=stopped, -1=error
    config_path TEXT,                       -- main config file path
    install_path TEXT,                      -- installation directory
    service_name TEXT,                      -- systemd service name
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PLUGINS
-- ============================================================

CREATE TABLE plugins (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,       -- plugin identifier (slug)
    display_name TEXT NOT NULL,             -- human-readable name
    version     TEXT NOT NULL,
    description TEXT,
    author      TEXT,
    homepage    TEXT,                        -- plugin homepage URL
    status      INTEGER DEFAULT 1,         -- 1=enabled, 0=disabled
    config      TEXT,                        -- JSON plugin settings
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- FIREWALL RULES
-- ============================================================

CREATE TABLE firewall_rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,              -- port, ip
    protocol    TEXT DEFAULT 'tcp',         -- tcp, udp, tcp/udp
    port        TEXT,                        -- single port "80" or range "8000:9000"
    ip          TEXT,                        -- IP address or CIDR "192.168.1.0/24"
    action      TEXT NOT NULL,              -- allow, deny
    direction   TEXT DEFAULT 'in',          -- in, out
    description TEXT,
    status      INTEGER DEFAULT 1,         -- 1=active, 0=disabled
    sort_order  INTEGER DEFAULT 0,         -- rule priority
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- BACKUPS
-- ============================================================

CREATE TABLE backups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,              -- site, database, panel, full
    name        TEXT NOT NULL,              -- backup name / description
    target_id   INTEGER,                    -- sites.id or databases.id (NULL for panel/full)
    target_name TEXT,                        -- site domain or database name (for display)
    file_path   TEXT NOT NULL,              -- full path to backup file
    file_size   INTEGER DEFAULT 0,         -- file size in bytes
    storage     TEXT DEFAULT 'local',       -- local, gdrive, s3, sftp
    checksum    TEXT,                        -- SHA256 hash of backup file
    status      TEXT DEFAULT 'completed',   -- pending, running, completed, failed
    created_by  INTEGER REFERENCES users(id),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id),
    username    TEXT,                        -- denormalized for quick display
    action      TEXT NOT NULL,              -- create, update, delete, login, logout, install, etc.
    resource    TEXT NOT NULL,              -- site, database, ftp, user, software, settings, etc.
    resource_id TEXT,                        -- ID of affected resource
    detail      TEXT,                        -- JSON with action details
    ip          TEXT,                        -- client IP address
    user_agent  TEXT,                        -- browser user agent
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- ============================================================
-- SETTINGS (Key-Value Store)
-- ============================================================

CREATE TABLE settings (
    key         TEXT PRIMARY KEY,            -- setting key
    value       TEXT NOT NULL,               -- setting value (JSON or plain text)
    description TEXT,                         -- human-readable description
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default settings
INSERT INTO settings (key, value, description) VALUES
('panel_port', '8888', 'Panel HTTP port'),
('panel_ssl', '0', 'Panel SSL enabled (0/1)'),
('panel_language', 'en', 'Default language (en/vi)'),
('admin_path', '/', 'Custom admin URL path'),
('session_timeout', '86400', 'Session timeout in seconds (default 24h)'),
('backup_path', '/ITDLUPanel/backup', 'Backup storage path'),
('wwwroot_path', '/ITDLUPanel/wwwroot', 'Website document root base path'),
('default_webserver', '', 'Default webserver (nginx/apache/openlitespeed)'),
('setup_completed', '0', 'First-time setup completed (0/1)');

-- ============================================================
-- DOCKER CONTAINERS
-- ============================================================

CREATE TABLE docker_containers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id TEXT NOT NULL UNIQUE,       -- Docker container ID
    name         TEXT NOT NULL,              -- Container name
    image        TEXT NOT NULL,              -- Image name:tag
    status       TEXT,                        -- running, stopped, paused, exited
    ports        TEXT,                        -- JSON port mapping: [{"host":8080,"container":80}]
    volumes      TEXT,                        -- JSON volume mapping
    env          TEXT,                        -- JSON environment variables
    restart_policy TEXT DEFAULT 'no',        -- no, always, unless-stopped, on-failure
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2. API Specification

### 2.1 General Conventions

```
Base URL:     https://{server_ip}:{port}/api/v1
Content-Type: application/json
Auth:         Bearer {access_token} in Authorization header
CSRF:         X-CSRF-Token header for POST/PUT/DELETE

Standard Response Format:
{
  "code": 200,              // HTTP status code
  "message": "Success",     // Human-readable message (translated)
  "data": { ... }           // Response data (object, array, or null)
}

Error Response:
{
  "code": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "username", "message": "Username is required" }
  ]
}

Pagination (for list endpoints):
  Query params: ?page=1&per_page=20&sort=created_at&order=desc
  Response includes:
  {
    "data": [...],
    "pagination": {
      "page": 1,
      "per_page": 20,
      "total": 150,
      "total_pages": 8
    }
  }
```

### 2.2 API Endpoints

#### 2.2.1 Authentication (`/api/v1/auth`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `POST` | `/auth/login` | Login with username + password | ❌ | - |
| `POST` | `/auth/logout` | Logout (invalidate refresh token) | ✅ | - |
| `POST` | `/auth/refresh` | Refresh access token | Cookie | - |
| `GET` | `/auth/me` | Get current user info | ✅ | - |
| `POST` | `/auth/2fa/verify` | Verify TOTP code during login | Partial | - |
| `GET` | `/auth/2fa/qrcode` | Get 2FA setup QR code | ✅ | - |
| `POST` | `/auth/2fa/enable` | Enable 2FA for current user | ✅ | - |
| `POST` | `/auth/2fa/disable` | Disable 2FA for current user | ✅ | - |
| `PUT` | `/auth/password` | Change current user password | ✅ | - |

**POST /auth/login**
```json
// Request
{ "username": "admin", "password": "secret123" }

// Response (no 2FA)
{
  "code": 200,
  "data": {
    "access_token": "eyJhbGciOi...",
    "expires_in": 900,
    "user": { "id": 1, "username": "admin", "role": "admin" }
  }
}
// + Set-Cookie: refresh_token=xxx; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth

// Response (2FA required)
{
  "code": 200,
  "data": {
    "require_2fa": true,
    "temp_token": "temp_xxx"
  }
}
```

#### 2.2.2 Dashboard (`/api/v1/dashboard`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/dashboard` | System overview | ✅ | dashboard.read |
| `GET` | `/dashboard/software` | Installed software status | ✅ | dashboard.read |

**GET /dashboard**
```json
{
  "code": 200,
  "data": {
    "system": {
      "hostname": "server01",
      "os": "Ubuntu 22.04.3 LTS",
      "kernel": "5.15.0-88-generic",
      "uptime": 864000,
      "panel_version": "1.0.0"
    },
    "cpu": {
      "model": "Intel Xeon E5-2680 v4",
      "cores": 8,
      "usage_percent": 23.5,
      "load_average": [1.2, 0.8, 0.6]
    },
    "memory": {
      "total": 17179869184,
      "used": 8589934592,
      "available": 8589934592,
      "usage_percent": 50.0
    },
    "disk": {
      "total": 107374182400,
      "used": 42949672960,
      "available": 64424509440,
      "usage_percent": 40.0
    },
    "network": {
      "bytes_sent": 1073741824,
      "bytes_recv": 2147483648
    },
    "counts": {
      "sites": 5,
      "databases": 3,
      "ftp_accounts": 2,
      "cron_jobs": 4,
      "running_tasks": 1
    }
  }
}
```

#### 2.2.3 Websites (`/api/v1/sites`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/sites` | List all websites | ✅ | sites.read |
| `POST` | `/sites` | Create website | ✅ | sites.write |
| `GET` | `/sites/:id` | Get website detail | ✅ | sites.read |
| `PUT` | `/sites/:id` | Update website | ✅ | sites.write |
| `DELETE` | `/sites/:id` | Delete website | ✅ | sites.delete |
| `POST` | `/sites/:id/start` | Start website | ✅ | sites.write |
| `POST` | `/sites/:id/stop` | Stop website | ✅ | sites.write |
| `GET` | `/sites/:id/config` | Get webserver config | ✅ | sites.read |
| `PUT` | `/sites/:id/config` | Update webserver config | ✅ | sites.write |
| `GET` | `/sites/:id/ssl` | Get SSL info | ✅ | sites.read |
| `POST` | `/sites/:id/ssl` | Configure SSL (LE/custom) | ✅ | sites.write |
| `DELETE` | `/sites/:id/ssl` | Remove SSL | ✅ | sites.write |
| `GET` | `/sites/:id/logs` | Get access/error logs | ✅ | sites.read |
| `POST` | `/sites/:id/domains` | Add domain | ✅ | sites.write |
| `DELETE` | `/sites/:id/domains/:did` | Remove domain | ✅ | sites.write |
| `GET` | `/sites/:id/php` | Get PHP config | ✅ | sites.read |
| `PUT` | `/sites/:id/php` | Change PHP version | ✅ | sites.write |

**POST /sites**
```json
// Request
{
  "domain": "example.com",
  "php_version": "php8.2",
  "create_ftp": false,
  "create_database": false
}

// Response
{
  "code": 201,
  "message": "Website created successfully",
  "data": {
    "id": 1,
    "name": "example.com",
    "domain": "example.com",
    "path": "/ITDLUPanel/wwwroot/example.com",
    "webserver": "nginx",
    "php_version": "php8.2",
    "ssl_enabled": false,
    "status": 1,
    "created_at": "2026-03-20T12:00:00Z"
  }
}
```

#### 2.2.4 Databases (`/api/v1/databases`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/databases` | List databases | ✅ | databases.read |
| `POST` | `/databases` | Create database + user | ✅ | databases.write |
| `GET` | `/databases/:id` | Get database detail | ✅ | databases.read |
| `DELETE` | `/databases/:id` | Delete database + user | ✅ | databases.delete |
| `PUT` | `/databases/:id/password` | Change database password | ✅ | databases.write |
| `POST` | `/databases/:id/backup` | Backup database | ✅ | databases.write |
| `POST` | `/databases/:id/restore` | Restore from backup | ✅ | databases.write |
| `GET` | `/databases/:id/size` | Get database size | ✅ | databases.read |

**POST /databases**
```json
// Request
{
  "name": "myapp_db",
  "username": "myapp_user",
  "password": "secure_password",
  "charset": "utf8mb4",
  "remote_access": "localhost"
}
```

#### 2.2.5 FTP (`/api/v1/ftp`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/ftp` | List FTP accounts | ✅ | ftp.read |
| `POST` | `/ftp` | Create FTP account | ✅ | ftp.write |
| `PUT` | `/ftp/:id` | Update FTP account | ✅ | ftp.write |
| `DELETE` | `/ftp/:id` | Delete FTP account | ✅ | ftp.delete |
| `PUT` | `/ftp/:id/status` | Enable/disable | ✅ | ftp.write |
| `PUT` | `/ftp/:id/password` | Change password | ✅ | ftp.write |

#### 2.2.6 Files (`/api/v1/files`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/files` | List directory (`?path=/home`) | ✅ | files.read |
| `POST` | `/files/upload` | Upload file(s) (multipart) | ✅ | files.write |
| `GET` | `/files/download` | Download file (`?path=...`) | ✅ | files.read |
| `POST` | `/files/mkdir` | Create directory | ✅ | files.write |
| `POST` | `/files/rename` | Rename file/directory | ✅ | files.write |
| `POST` | `/files/copy` | Copy file/directory | ✅ | files.write |
| `POST` | `/files/move` | Move file/directory | ✅ | files.write |
| `DELETE` | `/files` | Delete file/directory | ✅ | files.delete |
| `GET` | `/files/content` | Read file content (`?path=...`) | ✅ | files.read |
| `PUT` | `/files/content` | Write file content | ✅ | files.write |
| `POST` | `/files/compress` | Compress files | ✅ | files.write |
| `POST` | `/files/decompress` | Decompress archive | ✅ | files.write |
| `PUT` | `/files/permissions` | Change permissions | ✅ | files.write |
| `GET` | `/files/search` | Search files (`?path=&keyword=`) | ✅ | files.read |

#### 2.2.7 Docker (`/api/v1/docker`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/docker/containers` | List containers | ✅ | docker.read |
| `POST` | `/docker/containers` | Create container | ✅ | docker.write |
| `GET` | `/docker/containers/:id` | Container detail | ✅ | docker.read |
| `DELETE` | `/docker/containers/:id` | Remove container | ✅ | docker.delete |
| `POST` | `/docker/containers/:id/start` | Start container | ✅ | docker.write |
| `POST` | `/docker/containers/:id/stop` | Stop container | ✅ | docker.write |
| `POST` | `/docker/containers/:id/restart` | Restart container | ✅ | docker.write |
| `GET` | `/docker/containers/:id/logs` | Container logs | ✅ | docker.read |
| `GET` | `/docker/images` | List images | ✅ | docker.read |
| `POST` | `/docker/images/pull` | Pull image | ✅ | docker.write |
| `DELETE` | `/docker/images/:id` | Remove image | ✅ | docker.delete |
| `GET` | `/docker/networks` | List networks | ✅ | docker.read |
| `GET` | `/docker/volumes` | List volumes | ✅ | docker.read |

#### 2.2.8 Monitor (`/api/v1/monitor`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/monitor/system` | System metrics snapshot | ✅ | monitor.read |
| `GET` | `/monitor/network` | Network traffic stats | ✅ | monitor.read |
| `GET` | `/monitor/disk` | Disk I/O stats | ✅ | monitor.read |
| `GET` | `/monitor/processes` | Process list (top) | ✅ | monitor.read |
| `GET` | `/monitor/services` | Service status list | ✅ | monitor.read |
| `WS` | `/monitor/realtime` | Real-time metrics stream | ✅ | monitor.read |

#### 2.2.9 Firewall & Security (`/api/v1/firewall`, `/api/v1/security`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/firewall/rules` | List firewall rules | ✅ | firewall.read |
| `POST` | `/firewall/rules` | Add firewall rule | ✅ | firewall.write |
| `PUT` | `/firewall/rules/:id` | Update rule | ✅ | firewall.write |
| `DELETE` | `/firewall/rules/:id` | Delete rule | ✅ | firewall.write |
| `PUT` | `/firewall/rules/:id/status` | Enable/disable rule | ✅ | firewall.write |
| `GET` | `/security/ssh` | Get SSH configuration | ✅ | firewall.read |
| `PUT` | `/security/ssh` | Update SSH config | ✅ | firewall.write |
| `GET` | `/security/fail2ban` | Fail2ban status | ✅ | firewall.read |
| `PUT` | `/security/fail2ban` | Configure fail2ban | ✅ | firewall.write |

#### 2.2.10 Logs (`/api/v1/logs`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/logs/panel` | Panel access/error logs | ✅ | logs.read |
| `GET` | `/logs/website/:id` | Website logs (access+error) | ✅ | logs.read |
| `GET` | `/logs/ssh` | SSH login logs | ✅ | logs.read |
| `GET` | `/logs/audit` | Audit log | ✅ | logs.read |
| `DELETE` | `/logs/:type` | Clear logs | ✅ | logs.delete |

#### 2.2.11 Cron Jobs (`/api/v1/crons`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/crons` | List cron jobs | ✅ | cron.read |
| `POST` | `/crons` | Create cron job | ✅ | cron.write |
| `PUT` | `/crons/:id` | Update cron job | ✅ | cron.write |
| `DELETE` | `/crons/:id` | Delete cron job | ✅ | cron.delete |
| `PUT` | `/crons/:id/status` | Enable/disable | ✅ | cron.write |
| `GET` | `/crons/:id/log` | Get execution log | ✅ | cron.read |
| `POST` | `/crons/:id/run` | Run cron job now | ✅ | cron.write |

#### 2.2.12 Terminal (`/api/v1/terminal`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `WS` | `/terminal` | WebSocket SSH terminal | ✅ | terminal.access |

**WebSocket Messages:**
```json
// Client → Server (input)
{ "type": "input", "data": "ls -la\n" }
{ "type": "resize", "cols": 120, "rows": 40 }

// Server → Client (output)
{ "type": "output", "data": "total 42\ndrwxr-xr-x..." }
{ "type": "error", "message": "Connection lost" }
```

#### 2.2.13 Plugins / App Store (`/api/v1/plugins`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/plugins` | List installed plugins | ✅ | plugins.* |
| `GET` | `/plugins/store` | Browse available plugins | ✅ | plugins.* |
| `POST` | `/plugins/:name/install` | Install plugin | ✅ | plugins.* |
| `DELETE` | `/plugins/:name` | Uninstall plugin | ✅ | plugins.* |
| `PUT` | `/plugins/:name/status` | Enable/disable | ✅ | plugins.* |
| `GET` | `/plugins/:name/config` | Get plugin config | ✅ | plugins.* |
| `PUT` | `/plugins/:name/config` | Update plugin config | ✅ | plugins.* |

#### 2.2.14 Software Management (`/api/v1/software`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/software` | List all software (installed & available) | ✅ | software.* |
| `POST` | `/software/install` | Install software (async task) | ✅ | software.* |
| `DELETE` | `/software/:name` | Uninstall software | ✅ | software.* |
| `POST` | `/software/:name/start` | Start service | ✅ | software.* |
| `POST` | `/software/:name/stop` | Stop service | ✅ | software.* |
| `POST` | `/software/:name/restart` | Restart service | ✅ | software.* |
| `GET` | `/software/:name/config` | Get config file content | ✅ | software.* |
| `PUT` | `/software/:name/config` | Update config file | ✅ | software.* |
| `GET` | `/software/:name/status` | Service status | ✅ | software.* |

**POST /software/install**
```json
// Request
{
  "name": "nginx",
  "version": "1.24"
}

// Response
{
  "code": 202,
  "message": "Installation started",
  "data": {
    "task_id": 42
  }
}
```

#### 2.2.15 Backup (`/api/v1/backups`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/backups` | List backups | ✅ | backup.read |
| `POST` | `/backups` | Create backup | ✅ | backup.write |
| `DELETE` | `/backups/:id` | Delete backup file | ✅ | backup.delete |
| `POST` | `/backups/:id/restore` | Restore from backup | ✅ | backup.write |
| `GET` | `/backups/:id/download` | Download backup file | ✅ | backup.read |

#### 2.2.16 Settings (`/api/v1/settings`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/settings` | Get all settings | ✅ | settings.* |
| `PUT` | `/settings` | Update settings (batch) | ✅ | settings.* |
| `PUT` | `/settings/panel-port` | Change panel port | ✅ | settings.* |
| `PUT` | `/settings/panel-ssl` | Configure panel SSL | ✅ | settings.* |
| `GET` | `/settings/panel-info` | Panel info (version, uptime) | ✅ | settings.* |

#### 2.2.17 Users & RBAC (`/api/v1/users`, `/api/v1/roles`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/users` | List users | ✅ | users.* |
| `POST` | `/users` | Create user | ✅ | users.* |
| `PUT` | `/users/:id` | Update user | ✅ | users.* |
| `DELETE` | `/users/:id` | Delete user | ✅ | users.* |
| `PUT` | `/users/:id/role` | Assign role | ✅ | users.* |
| `GET` | `/roles` | List roles | ✅ | users.* |
| `POST` | `/roles` | Create custom role | ✅ | users.* |
| `PUT` | `/roles/:id` | Update role permissions | ✅ | users.* |

#### 2.2.18 Background Tasks (`/api/v1/tasks`)

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `GET` | `/tasks` | List tasks | ✅ | - |
| `GET` | `/tasks/:id` | Get task status + progress | ✅ | - |
| `GET` | `/tasks/:id/log` | Get task execution log | ✅ | - |
| `DELETE` | `/tasks/:id` | Cancel running task | ✅ | - |
| `WS` | `/tasks/stream` | Real-time task updates | ✅ | - |

---

## 3. WebSocket Endpoints

| Endpoint | Purpose | Auth | Message Format |
|----------|---------|------|----------------|
| `WS /api/v1/terminal` | SSH terminal | JWT | Binary frames (PTY I/O) |
| `WS /api/v1/monitor/realtime` | System metrics | JWT | JSON (2s interval) |
| `WS /api/v1/tasks/stream` | Task progress | JWT | JSON (event-driven) |

**Monitor Realtime Message:**
```json
{
  "type": "metrics",
  "timestamp": "2026-03-20T12:00:00Z",
  "data": {
    "cpu_percent": 23.5,
    "memory_percent": 50.0,
    "disk_io_read": 1048576,
    "disk_io_write": 524288,
    "net_bytes_sent": 4096,
    "net_bytes_recv": 8192,
    "load_average": [1.2, 0.8, 0.6]
  }
}
```

**Task Stream Message:**
```json
{
  "type": "task_update",
  "data": {
    "task_id": 42,
    "status": "running",
    "progress": 65,
    "log_line": "Installing PHP 8.2 extensions..."
  }
}
```

---

## 4. Input Validation Rules

| Field | Rules |
|-------|-------|
| `username` | 3-32 chars, alphanumeric + underscore, starts with letter |
| `password` | 8-128 chars, min 1 uppercase + 1 lowercase + 1 digit |
| `email` | Valid email format |
| `domain` | Valid domain format (RFC 1035), no wildcards in create |
| `database name` | 1-64 chars, alphanumeric + underscore |
| `ftp username` | 3-32 chars, alphanumeric + underscore |
| `file path` | No `..`, no null bytes, must be within allowed directories |
| `port` | 1-65535 integer |
| `IP address` | Valid IPv4/IPv6, optional CIDR notation |
| `cron schedule` | Valid cron expression (5 fields) |

---

## 5. Error Codes

| HTTP Code | Meaning | Example |
|-----------|---------|---------|
| `200` | Success | Request completed |
| `201` | Created | Resource created |
| `202` | Accepted | Async task started |
| `400` | Bad Request | Validation failed |
| `401` | Unauthorized | Invalid/expired token |
| `403` | Forbidden | Insufficient permissions |
| `404` | Not Found | Resource not found |
| `409` | Conflict | Resource already exists |
| `422` | Unprocessable | Business logic error |
| `429` | Rate Limited | Too many requests |
| `500` | Server Error | Internal error |

---

## 6. i18n Language Keys Structure

```
Backend (Go):
  locales/
  ├── en.json     # English
  └── vi.json     # Vietnamese

Frontend (React):
  src/i18n/
  ├── en.json
  └── vi.json

Key naming convention: {module}.{action}.{detail}
  Example:
    "site.create.success": "Website created successfully"
    "site.create.success": "Tạo website thành công"
    "auth.login.failed": "Invalid username or password"
    "auth.login.failed": "Tên đăng nhập hoặc mật khẩu không đúng"
    "dashboard.cpu.usage": "CPU Usage"
    "dashboard.cpu.usage": "Sử dụng CPU"
```
