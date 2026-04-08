# ITDLUPanel — Technical Specification

> **Version:** 0.1.0 · **Last updated:** 2026-04-08

---

## 1. Database Schema (SQLite)

### 1.1 Entity Relationship Diagram

```
users ──┬── user_roles ──── roles
        ├── user_sites ──── sites ──── domains
        ├── user_resources
        └── audit_logs

sites ──┬── domains
        ├── databases
        └── backups

crons ──── tasks
software ──── plugins
firewall_rules ──── firewall_settings

ftp_storages    (FTP backup targets)
cloud_storages  (S3/GDrive/OneDrive)

notification_channels ──── notification_rules
                      └── notification_logs

docker_containers (Docker metadata cache)
settings          (Key-value config)
schema_migrations (Migration tracking)
```

### 1.2 Table Definitions

#### `users`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| username | TEXT | UNIQUE NOT NULL |
| email | TEXT | UNIQUE |
| password_hash | TEXT | NOT NULL (bcrypt cost=12) |
| totp_secret | TEXT | NULL (base32 encoded) |
| totp_enabled | INTEGER | DEFAULT 0 |
| status | INTEGER | DEFAULT 1 (1=active, 0=disabled) |
| last_login | DATETIME | NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `roles`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| description | TEXT | |
| permissions | TEXT | JSON array of permission strings |
| is_system | INTEGER | DEFAULT 0 (prevents deletion) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**Default system roles:**
- `admin` — `["*"]` (full access)
- `operator` — `["sites.*","databases.*","files.*","cron.*","backup.*","terminal.access"]`
- `viewer` — `["sites.read","databases.read","files.read","logs.read","docker.read"]`

#### `user_roles`
| Column | Type | Constraints |
|--------|------|-------------|
| user_id | INTEGER | FK → users.id |
| role_id | INTEGER | FK → roles.id |
| PRIMARY KEY | | (user_id, role_id) |

#### `user_sites`
| Column | Type | Constraints |
|--------|------|-------------|
| user_id | INTEGER | FK → users.id |
| site_id | INTEGER | FK → sites.id |
| PRIMARY KEY | | (user_id, site_id) |

#### `user_resources`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| user_id | INTEGER | FK → users.id, UNIQUE |
| max_sites | INTEGER | DEFAULT 0 (0=unlimited) |
| max_databases | INTEGER | DEFAULT 0 |
| max_ftp_accounts | INTEGER | DEFAULT 0 |
| max_disk_mb | INTEGER | DEFAULT 0 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `sites`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| domain | TEXT | UNIQUE NOT NULL |
| description | TEXT | |
| root_path | TEXT | NOT NULL |
| php_version | TEXT | e.g. "8.2" |
| web_server | TEXT | "nginx" / "apache" / "ols" |
| ssl_enabled | INTEGER | DEFAULT 0 |
| status | INTEGER | DEFAULT 1 |
| user_id | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `domains`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| site_id | INTEGER | FK → sites.id |
| domain | TEXT | NOT NULL |
| type | TEXT | "alias" / "redirect" |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `databases`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| type | TEXT | "mysql" / "mariadb" |
| username | TEXT | NOT NULL |
| password | TEXT | Encrypted |
| site_id | INTEGER | FK → sites.id (optional) |
| user_id | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `ftps`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| username | TEXT | UNIQUE NOT NULL |
| password | TEXT | Encrypted |
| path | TEXT | NOT NULL |
| status | INTEGER | DEFAULT 1 |
| site_id | INTEGER | FK → sites.id (optional) |
| user_id | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `crons`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| schedule | TEXT | NOT NULL (cron expression) |
| command | TEXT | NOT NULL |
| type | TEXT | "shell" / "url" |
| status | INTEGER | DEFAULT 1 (1=enabled, 0=disabled) |
| last_run | DATETIME | NULL |
| last_result | TEXT | NULL |
| user_id | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `tasks`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | "install" / "backup" / "restore" / etc. |
| status | TEXT | "pending" / "running" / "done" / "failed" |
| progress | INTEGER | 0–100 |
| message | TEXT | Status message |
| error | TEXT | Error message if failed |
| started_at | DATETIME | NULL |
| completed_at | DATETIME | NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `software`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| version | TEXT | |
| installed | INTEGER | DEFAULT 0 |
| status | TEXT | "running" / "stopped" / "not_installed" |
| port | INTEGER | NULL |
| config_path | TEXT | NULL |
| installed_at | DATETIME | NULL |

#### `backups`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | "site" / "database" / "panel" |
| target | TEXT | Site domain or DB name |
| file_path | TEXT | NOT NULL |
| file_size | INTEGER | Bytes |
| storage_type | TEXT | "local" / "ftp" / "s3" / "google_drive" / "onedrive" |
| storage_id | INTEGER | FK to storage tables |
| status | TEXT | "completed" / "failed" |
| user_id | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `firewall_rules`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| port | TEXT | NOT NULL |
| protocol | TEXT | "tcp" / "udp" / "tcp/udp" |
| source | TEXT | IP or CIDR (default: "0.0.0.0/0") |
| action | TEXT | "allow" / "deny" |
| description | TEXT | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `firewall_settings`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| enabled | INTEGER | DEFAULT 0 |
| ping_enabled | INTEGER | DEFAULT 1 |
| ssh_port | INTEGER | DEFAULT 22 |

#### `ftp_storages`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| host | TEXT | NOT NULL |
| port | INTEGER | DEFAULT 21 |
| username | TEXT | NOT NULL |
| password | TEXT | Encrypted |
| path | TEXT | DEFAULT "/" |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `cloud_storages`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | "s3" / "google_drive" / "onedrive" |
| config | TEXT | JSON (encrypted credentials) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `audit_logs`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| user_id | INTEGER | FK → users.id |
| username | TEXT | |
| action | TEXT | NOT NULL |
| resource | TEXT | |
| details | TEXT | JSON |
| ip_address | TEXT | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `notification_channels`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | "email" / "telegram" / "webhook" |
| config | TEXT | JSON (server, token, URL) |
| enabled | INTEGER | DEFAULT 1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `notification_rules`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| channel_id | INTEGER | FK → notification_channels.id |
| event | TEXT | "backup_failed" / "disk_full" / etc. |
| threshold | TEXT | JSON (conditions) |
| enabled | INTEGER | DEFAULT 1 |

#### `notification_logs`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| channel_id | INTEGER | FK → notification_channels.id |
| event | TEXT | |
| message | TEXT | |
| status | TEXT | "sent" / "failed" |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

---

## 2. API Specification

### 2.1 Authentication

All authenticated endpoints require:
```
Authorization: Bearer <access_token>
X-CSRF-Token: <csrf_token>
```

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/v1/auth/login` | Login (returns tokens) | Public |
| POST | `/api/v1/auth/register` | Register new user | Admin |
| POST | `/api/v1/auth/refresh` | Refresh access token | Refresh token |
| POST | `/api/v1/auth/logout` | Logout (revoke tokens) | JWT |
| GET | `/api/v1/auth/profile` | Get current user profile | JWT |
| PUT | `/api/v1/auth/profile` | Update profile | JWT |
| POST | `/api/v1/auth/2fa/enable` | Enable TOTP 2FA | JWT |
| POST | `/api/v1/auth/2fa/verify` | Verify TOTP code | JWT |
| POST | `/api/v1/auth/2fa/disable` | Disable 2FA | JWT |

### 2.2 Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/dashboard` | System overview (CPU, RAM, disk, network, uptime) |
| GET | `/api/v1/health` | Health check |

### 2.3 Sites

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/sites` | List all sites |
| POST | `/api/v1/sites` | Create site |
| GET | `/api/v1/sites/:id` | Get site details |
| PUT | `/api/v1/sites/:id` | Update site |
| DELETE | `/api/v1/sites/:id` | Delete site |
| GET | `/api/v1/sites/:id/config` | Get Nginx/Apache config |
| PUT | `/api/v1/sites/:id/config` | Save config |
| POST | `/api/v1/sites/:id/domains` | Add domain alias |
| DELETE | `/api/v1/sites/:id/domains/:did` | Remove domain |
| PUT | `/api/v1/sites/:id/php` | Switch PHP version |
| GET | `/api/v1/sites/:id/statistics` | Site traffic stats |
| POST | `/api/v1/sites/:id/ssl` | Configure SSL for site |
| GET | `/api/v1/sites/:id/logs` | Site access/error logs |
| POST | `/api/v1/sites/:id/deploy` | Deploy/reload config |

### 2.4 Databases

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/databases` | List databases |
| POST | `/api/v1/databases` | Create database + user |
| GET | `/api/v1/databases/:id` | Get database info |
| DELETE | `/api/v1/databases/:id` | Delete database |
| POST | `/api/v1/databases/:id/backup` | Backup database |
| POST | `/api/v1/databases/:id/restore` | Restore from backup |
| PUT | `/api/v1/databases/:id/password` | Reset DB password |
| GET | `/api/v1/databases/:id/size` | Get database size |

### 2.5 Docker (46+ endpoints)

**Containers:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/docker/containers` | List containers |
| POST | `/api/v1/docker/containers` | Create container |
| GET | `/api/v1/docker/containers/:id` | Inspect container |
| DELETE | `/api/v1/docker/containers/:id` | Remove container |
| POST | `/api/v1/docker/containers/:id/start` | Start |
| POST | `/api/v1/docker/containers/:id/stop` | Stop |
| POST | `/api/v1/docker/containers/:id/restart` | Restart |
| POST | `/api/v1/docker/containers/:id/pause` | Pause |
| POST | `/api/v1/docker/containers/:id/unpause` | Unpause |
| GET | `/api/v1/docker/containers/:id/logs` | Container logs |
| GET | `/api/v1/docker/containers/:id/stats` | Container stats |
| POST | `/api/v1/docker/containers/:id/rename` | Rename |
| POST | `/api/v1/docker/containers/:id/exec` | Execute command |

**Images:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/docker/images` | List images |
| POST | `/api/v1/docker/images/pull` | Pull image |
| DELETE | `/api/v1/docker/images/:id` | Remove image |
| GET | `/api/v1/docker/images/:id` | Inspect image |
| GET | `/api/v1/docker/images/search` | Search Docker Hub |
| POST | `/api/v1/docker/images/:id/tag` | Tag image |

**Networks:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/docker/networks` | List networks |
| POST | `/api/v1/docker/networks` | Create network |
| DELETE | `/api/v1/docker/networks/:id` | Remove network |
| GET | `/api/v1/docker/networks/:id` | Inspect network |
| POST | `/api/v1/docker/networks/:id/connect` | Connect container |
| POST | `/api/v1/docker/networks/:id/disconnect` | Disconnect |

**Volumes:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/docker/volumes` | List volumes |
| POST | `/api/v1/docker/volumes` | Create volume |
| DELETE | `/api/v1/docker/volumes/:name` | Remove volume |
| GET | `/api/v1/docker/volumes/:name` | Inspect volume |
| POST | `/api/v1/docker/volumes/prune` | Prune unused |

**Compose:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/docker/compose` | List projects |
| POST | `/api/v1/docker/compose` | Create project |
| POST | `/api/v1/docker/compose/:name/up` | Start project |
| POST | `/api/v1/docker/compose/:name/down` | Stop project |
| DELETE | `/api/v1/docker/compose/:name` | Remove project |
| GET | `/api/v1/docker/compose/:name/logs` | Project logs |

**System:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/docker/info` | Docker engine info |
| GET | `/api/v1/docker/daemon/config` | Get daemon.json |
| POST | `/api/v1/docker/daemon/config` | Save daemon.json |
| POST | `/api/v1/docker/restart` | Restart Docker |
| POST | `/api/v1/docker/stop` | Stop Docker |

### 2.6 Files

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/files` | List directory |
| GET | `/api/v1/files/read` | Read file content |
| POST | `/api/v1/files/save` | Save file content |
| POST | `/api/v1/files/create` | Create file/directory |
| POST | `/api/v1/files/rename` | Rename |
| POST | `/api/v1/files/copy` | Copy |
| POST | `/api/v1/files/move` | Move |
| DELETE | `/api/v1/files` | Delete files |
| POST | `/api/v1/files/compress` | Compress to archive |
| POST | `/api/v1/files/decompress` | Extract archive |
| POST | `/api/v1/files/upload` | Upload file |
| GET | `/api/v1/files/download` | Download file |
| POST | `/api/v1/files/permissions` | Set permissions |
| POST | `/api/v1/files/search` | Search files |
| GET | `/api/v1/files/info` | File/dir info |
| POST | `/api/v1/files/remote-download` | Download from URL |
| GET | `/api/v1/files/tree` | Directory tree |

### 2.7 WebSocket Endpoints

| Path | Description | Protocol |
|------|-------------|----------|
| `/api/v1/terminal` | PTY terminal (xterm.js ↔ creack/pty) | WebSocket |
| `/api/v1/monitor/realtime` | Real-time metrics (CPU, RAM, disk, net) | WebSocket |

---

## 3. Configuration

### 3.1 Panel Configuration (`config/panel.json`)

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8888,
    "ssl": {
      "enabled": true,
      "cert_file": "config/ssl/cert.pem",
      "key_file": "config/ssl/key.pem"
    }
  },
  "database": {
    "path": "data/panel.db"
  },
  "auth": {
    "jwt_secret": "<auto-generated-on-first-run>",
    "access_token_ttl": 900,
    "refresh_token_ttl": 604800
  },
  "paths": {
    "wwwroot": "/ITDLUPanel/wwwroot",
    "backup": "/ITDLUPanel/backups",
    "logs": "/ITDLUPanel/logs"
  },
  "panel": {
    "language": "en",
    "version": "0.1.0",
    "entry_path": "/admin"
  }
}
```

### 3.2 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PANEL_PORT` | HTTP port | 8888 |
| `PANEL_HOST` | Bind address | 0.0.0.0 |
| `PANEL_CONFIG` | Config file path | config/panel.json |

---

## 4. Build Specification

### 4.1 Build Requirements

- Go 1.25.0+
- Node.js 18+
- npm 9+

### 4.2 Build Process

```
Phase 1: Frontend Build
  npm install → vite build → web/dist/

Phase 2: Go Embed + Compile
  go:embed web/dist → web.go
  CGO_ENABLED=0 go build → bin/itdlupanel (~60MB)

Result: Single static binary with embedded SPA
```

### 4.3 Makefile Targets

| Target | Description |
|--------|-------------|
| `make build` | Build for current platform |
| `make build-linux-amd64` | Cross-compile for Linux amd64 |
| `make dev` | Development mode |
| `make clean` | Remove build artifacts |

### 4.4 Docker Build

```dockerfile
# Stage 1: Frontend
FROM node:22-alpine AS frontend
COPY web/ .
RUN npm ci && npx vite build

# Stage 2: Backend
FROM golang:1.25-alpine AS backend
COPY --from=frontend /dist web/dist
RUN CGO_ENABLED=0 go build -o itdlupanel ./cmd/panel

# Stage 3: Runtime
FROM alpine:3.21
COPY --from=backend /itdlupanel /usr/local/bin/
EXPOSE 8888
CMD ["itdlupanel"]
```
