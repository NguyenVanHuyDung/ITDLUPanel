# ITDLUPanel — Điểm Nổi Bật Chi Tiết (v1.0.0)

> Ngày: 2026-06-24 · **Go 1.26** · **React 19** · **SQLite 21 migrations** · **27 Handlers** · **71 Services**

---

## Tổng Quan Số Liệu

| Chỉ số | Giá trị |
|---|---|
| Tổng Go files | 145 |
| REST Handlers | 27 |
| Services | 71 (bao gồm 25 installer + 4 vhost generator) |
| Database migrations | 21 (001–020) |
| Database tables | 40+ |
| Frontend TSX files | 66 |
| REST API endpoints | ~160 |
| WebSocket endpoints | 2 |
| RBAC permission namespaces | 37 |
| Middleware layers | 11 |
| OWASP WAF categories | 15 |
| Docker one-click templates | 38 |
| Cron job templates | 30 |

---

## 1. Single Binary — Zero Dependencies

Toàn bộ stack (Go backend + React SPA + SQLite) đóng gói thành **một file nhị phân duy nhất ~60MB**, không yêu cầu bất kỳ runtime nào trên máy đích.

### Kỹ thuật đạt được

| Kỹ thuật | Chi tiết |
|---|---|
| `CGO_ENABLED=0` | Fully static binary — không libc, không libpthread |
| `modernc.org/sqlite` | Pure-Go SQLite driver — không CGO |
| `go:embed` | React SPA embed vào `web.go` tại compile time |
| `-s -w` ldflags | Strip symbol table và debug info |
| Cross-compile | linux/amd64 và linux/arm64 từ bất kỳ nền tảng nào |

---

## 2. Kiến Trúc Backend

### 2.1 Layered Design

```
Yêu cầu HTTP
    │
    ▼
┌─ Middleware Stack (11 lớp) ─────────────────────────────┐
│ 1. Recovery   — panic recovery + stack trace             │
│ 2. Logger    — structured logging (zerolog)              │
│ 3. Security  — X-Frame-Options, CSP, HSTS             │
│ 4. CORS      — cross-origin resource sharing            │
│ 5. Compress  — gzip response                            │
│ 6. Language  — Accept-Language → en/vi                 │
│ 7. RateLimit — 300 req/phút/IP (in-memory)             │
│ 8. CSRF      — X-CSRF-Token header + cookie           │
│ 9. Audit     — POST/PUT/DELETE → audit_logs           │
│ 10. Auth     — JWT HS256, 15-min access token         │
│ 11. RBAC     — 37 namespaces, cache 5-phút           │
└──────────────────────────────┬───────────────────────────┘
                              ▼
┌─ 27 REST Handlers ───────────────────────────────┐
│ auth · dashboard · site · database · redis · ftp · │
│ file · docker · docker_cleanup · docker_compose · cron │
│ security · waf · ssl · backup · ftp_storage ·         │
│ cloud_storage · software · monitor · task · user ·   │
│ role · plugin · settings · notification · log · system│
└──────────────────────────────┬───────────────────────┘
                              ▼
┌─ 71 Services ───────────────────────────────────┐
│ Business logic · 25 Installers · 4 Vhost Gens ·    │
│ WAF (HAProxy + Coraza SPOA) · Backup pipeline     │
└──────────────────────────────┬──────────────────────┘
                              ▼
┌─ SQLite (21 migrations → 40+ tables) ─────────────┐
│ WAL mode · foreign_keys ON · busy_timeout=10s       │
└───────────────────────────────────────────────────┘
```

### 2.2 Database Migrations (21 files)

| Migration | Mô tả |
|---|---|
| 001 | Schema ban đầu (users, sites, databases, cron, backups...) |
| 002 | Monitor metrics cascade (raw, 5m, 1h, 1d) |
| 003 | Firewall settings |
| 004 | phpMyAdmin default port |
| 005 | Disk quota cho sites và databases |
| 006 | Site description |
| 007 | User ↔ Site assignment, roles.is_system |
| 008 | Panel settings (name, timezone) |
| 009 | FTP storage backend |
| 010 | Cloud storages (S3, Google Drive, OneDrive) |
| 011 | User resources tracking |
| 012 | Notification channels, rules, logs |
| 013 | Notification templates (custom_subject, custom_body) |
| 014 | Site type (php/node/python/static) |
| 015 | Docker cleanup rules và logs |
| 016 | WAF core (sites, rules, logs, OWASP categories, IP lists) |
| 017 | WAF enhanced (traffic stats, URI list, Lua scripts, UA list, attack signatures, slow requests, geo stats) |
| 018 | **Backup uploads** (progress, chunks, resume state) |
| 019 | **Cron storage mapping** (per-job remote target) |
| 020 | **Incremental backups** (strategy, parent_id, snapshot_path) |

---

## 3. Authentication & Security

### 3.1 JWT Authentication

| Thông số | Giá trị |
|---|---|
| Algorithm | HS256 |
| Access token TTL | 15 phút |
| Refresh token TTL | 7 ngày |
| Storage | `Authorization: Bearer <token>` header |
| WebSocket auth | `?token=<jwt>` query param |

### 3.2 Two-Factor Authentication

| Thông số | Giá trị |
|---|---|
| Algorithm | TOTP (RFC 6238) |
| Library | `pquerna/otp` |
| Temp token TTL | 5 phút |
| Issuer label | `ITDLUPanel` |
| Setup flow | QR code → verify code → enable |
| Disable flow | Yêu cầu mã TOTP hợp lệ |

### 3.3 Brute-Force Protection (Adaptive Lockout)

| Số lần thất bại | Thời gian khóa | Loại |
|---|---|---|
| 5 lần thất bại | 30 giây | Soft-lock tạm thời |
| 10 lần thất bại | 15 phút | Hard-lock |
| Cleanup | Mỗi 10 phút | Xóa entries cũ hơn 30 phút |

### 3.4 Security Headers

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000
```

### 3.5 Rate Limiting

| Thông số | Giá trị |
|---|---|
| Giới hạn | **300 requests/phút/IP** |
| Implementation | In-memory sliding window map |
| Cleanup goroutine | Mỗi 1 phút |
| Response khi vượt | HTTP 429 "too many requests" |

### 3.6 RBAC (37 Namespaces)

| Group | Permissions |
|---|---|
| `dashboard` | dashboard.read |
| `sites` | sites.read, sites.create, sites.edit, sites.delete, sites.ssl, sites.config |
| `databases` | databases.read, databases.create, databases.edit, databases.delete, databases.backup |
| `ftp` | ftp.read, ftp.create, ftp.edit, ftp.delete |
| `files` | files.read, files.write, files.delete |
| `cron` | cron.read, cron.create, cron.edit, cron.delete |
| `backup` | backup.read, backup.create, backup.restore, backup.delete |
| `docker` | docker.read, docker.upload, docker.manage, docker.create, docker.cleanup |
| `firewall` | firewall.read, firewall.manage |
| `terminal` | terminal.access |
| `monitor` | monitor.read, monitor.processes |
| `logs` | logs.read, logs.manage |
| `system` | software.manage, users.manage, settings.manage, security.manage |

- **Cache**: In-memory, TTL 5 phút, auto-invalidate khi role update
- **Wildcard**: `sites.*` cấp tất cả `sites.X`
- **Default roles**: Admin (`*`), Operator (18 permissions), Viewer (3 permissions)

---

## 4. Backup System

### 4.1 Incremental Backup (rsync + hardlinks)

| Thông số | Giá trị |
|---|---|
| First snapshot | Full copy: `rsync -aH <src> <dest>` |
| Subsequent | `rsync -aH --link-dest=<prev_snap>` |
| Unchanged files | Hardlink → cùng inode, không tốn thêm đĩa |
| Timestamp format | `20060102_150405` |
| Path format | `snapshots/<type>/<target>/<ts>` |
| Compression | Thư mục snapshot KHÔNG nén (để hardlink hoạt động) |
| DB columns | `strategy`, `parent_id`, `snapshot_path` |
| Rsync args | `-aHx --numeric-ids --delete` |

### 4.2 Backup Encryption (AES-256-GCM)

| Thông số | Giá trị |
|---|---|
| Algorithm | AES-256-GCM |
| Key derivation | PBKDF2-SHA256, **100,000 iterations** |
| Salt size | 16 bytes |
| Nonce | 12 bytes (GCM standard) |
| Auth tag | 16 bytes |
| Magic header | `ITBK` (4 bytes) |
| Buffer size | 64 KB streaming |
| Use case | Mã hóa trước khi upload lên cloud |

### 4.3 Cloud Upload Pipeline (Async + Resumable)

| Thông số | Giá trị |
|---|---|
| Provider | Google Drive |
| Protocol | **Resumable Upload Protocol** |
| Chunk size | **16 MB** |
| Timeout/chunk | 5 phút |
| Resume support | Lưu session URI + file ID trong `backup_uploads` table |
| Folder handling | Tự động tạo nested folders |
| Path format | `itdlupanel_backup/<type>/<filename>` |

### 4.4 Google OAuth2 — Device Authorization Flow

Lý do dùng Device Flow: Google không chấp nhận `http://private-ip:<port>` làm redirect URI. Device Flow chỉ cần `client_id`.

| Step | Chi tiết |
|---|---|
| 1 | Panel POST `/device/code` → Google |
| 2 | Frontend hiển thị "Visit google.com/device + enter XXXX-XXXX" |
| 3 | Panel poll `/token` mỗi `interval` giây |
| 4 | User approve → tokens trả về |
| Error: `authorization_pending` | Retry sau interval |
| Error: `slow_down` | Tăng wait time |
| Error: `invalid_grant` | Code đã exchange (success) |
| Scopes | `drive.file` (Drive) |
| Token storage | `AccessToken`, `RefreshToken`, `TokenExpiry` (RFC3339) trong DB |
| Auto-refresh | OAuth client tự động refresh expired tokens |

### 4.5 Multi-Cloud Destinations

| Provider | Protocol | Timeout |
|---|---|---|
| FTP | `jlaffaye/ftp` | 30 phút |
| S3 / MinIO | `minio-go v7` | 30 phút upload, 15s test |
| Google Drive | Resumable Upload v3 | 30 phút |
| OneDrive | Graph API v1.0 | 30 phút |

---

## 5. Docker Management

### 5.1 Docker API

| Thông số | Giá trị |
|---|---|
| Socket | `/var/run/docker.sock` |
| API version | v1.41 |
| Dial timeout | 5 giây |
| HTTP timeout | 30 giây |
| Image load timeout | **30 phút** |
| RBAC | `docker.read`, `docker.upload`, `docker.manage`, `docker.create`, `docker.cleanup` |
| Ownership | `panel.owner=<uid>` label → users chỉ thấy container của mình |

### 5.2 Endpoints — Containers (14 endpoints)

`GET /containers` · `POST /containers` · `GET /containers/:id` · `DELETE /containers/:id` · `POST /containers/:id/start` · `POST /containers/:id/stop` · `POST /containers/:id/restart` · `POST /containers/:id/pause` · `POST /containers/:id/unpause` · `POST /containers/:id/rename` · `GET /containers/:id/logs` · `GET /containers/:id/stats`

### 5.3 Endpoints — Images (10 endpoints)

`GET /images` · `GET /images/search` · `POST /images/pull` · **`POST /images/load`** · `POST /images/prune` · `DELETE /images/:id` · `GET /images/:id/inspect` · `GET /images/:id/history` · `POST /images/:id/tag`

> **Image upload** (`POST /images/load`): multipart upload, max 64 MiB in-memory, spool to temp file nếu lớn hơn.

### 5.4 Endpoints — Networks & Volumes (12 endpoints)

Networks: `GET /networks` · `POST /networks` · `POST /networks/prune` · `GET /networks/:id` · `DELETE /networks/:id` · `POST /networks/:id/connect` · `POST /networks/:id/disconnect`

Volumes: `GET /volumes` · `POST /volumes` · `POST /volumes/prune` · `GET /volumes/:name` · `DELETE /volumes/:name`

### 5.5 Endpoints — System (5 endpoints)

`GET /system/df` · `POST /system/restart` · `POST /system/stop` · `GET /system/config` · `PUT /system/config`

### 5.6 Docker Compose (8 endpoints)

`GET /` · `POST /` · `GET /:name` · `DELETE /:name` · `POST /:name/up` · `POST /:name/down` · `POST /:name/restart` · `GET /:name/logs`

Compose files stored tại: `/opt/itdlupanel/docker/compose`

### 5.7 Docker One-Click Templates (38 apps)

| Nhóm | Số lượng | Apps |
|---|---|---|
| Web Server | 4 | Nginx, Apache, Caddy, Traefik |
| Database | 6 | MySQL, PostgreSQL, MongoDB, MariaDB, ClickHouse, CockroachDB |
| Cache | 3 | Redis, Memcached, KeyDB |
| Queue | 3 | RabbitMQ, Kafka, NATS |
| Storage | 1 | MinIO |
| Search | 3 | Elasticsearch, Meilisearch, Typesense |
| DevTools | 11 | Portainer, phpMyAdmin, Adminer, pgAdmin, GitLab, Gitea, Jenkins, Drone CI, SonarQube, Vault, Directus |
| Monitoring | 3 | Grafana, Prometheus, Uptime Kuma |
| CMS | 3 | WordPress, Ghost, Joomla |
| Automation | 1 | n8n |

---

## 6. WAF — Web Application Firewall

### 6.1 Architecture

```
Internet → HAProxy (transparent proxy + SSL termination)
              │ maxconn: 10,000 | timeout: 30s
              ▼ (SPOE v2, 127.0.0.1:9000)
         Coraza SPOA (OWASP ModSecurity CRS v4.0)
              │ blocking/logging
              ▼
         Backend Application Server
```

### 6.2 OWASP CRS v4.0 Coverage (15 categories)

| Danh mục | MITRE ID | Phase 1 | Phase 2 |
|---|---|---|---|
| SQL Injection (SQLi) | T1505 | ✅ | ✅ |
| Cross-Site Scripting (XSS) | T1059 | ✅ | ✅ |
| Local File Inclusion (LFI) | T1005 | ✅ | ✅ |
| Remote File Inclusion (RFI) | T1190 | ✅ | ✅ |
| Remote Code Execution (RCE) | T1210 | ✅ | ✅ |
| CRLF Injection | T1059 | ✅ | ✅ |
| Path Traversal | T1005 | ✅ | ✅ |
| PHP Injection | T1059 | ✅ | ✅ |
| Java Injection | T1059 | ✅ | ✅ |
| Node.js Injection | T1059 | ✅ | ✅ |
| HTTP Protocol Violations | T1499 | ✅ | — |
| Evasion Techniques | T1005 | ✅ | ✅ |
| Generic Attacks | — | ✅ | ✅ |
| User-Agent Anomalies | — | ✅ | — |
| Protocol Threats | — | ✅ | — |

### 6.3 WAF Key Parameters

| Thông số | Giá trị |
|---|---|
| `SecRequestBodyLimit` | 12.5 MB |
| `SecRequestBodyNoFilesLimit` | 128 KB |
| `SecPcreMatchLimit` | 1000 |
| `SecPcreMatchLimitRecursion` | 100 |
| `SecCollectionTimeout` | 600s |
| `SecAuditLogParts` | ABIJEFHZ |
| SPOE agent timeout | 60s |

### 6.4 Advanced WAF Features

- **Geo-blocking**: MaxMind GeoIP, 51 quốc gia
- **IP lists**: Whitelist/blacklist, CIDR support, hit tracking, auto-expiry
- **URI lists**: Whitelist/blacklist với priority ordering
- **User-Agent lists**: Filter bot/malicious patterns
- **Attack signatures**: Auto-learned từ log analysis
- **Lua scripting**: Custom HAProxy Lua scripts stored in DB, deployed on restart
- **Traffic stats**: Hourly bandwidth, p95 response times, request counts
- **Geo stats**: Per-country request và block rates
- **Slow request detection**: Configurable threshold (default 5000ms)

---

## 7. Monitoring System

### 7.1 Metrics Cascade

```
Raw (60s intervals)
    │  aggregate every 5 minutes
    ▼
5-minute aggregates
    │  aggregate every hour
    ▼
Hourly aggregates
    │  aggregate every day
    ▼
Daily aggregates
```

| Bảng | Resolution | Default Retention | Configurable |
|---|---|---|---|
| `monitor_metrics_raw` | 1 sample/minute | **2 ngày** | Có |
| `monitor_metrics_5m` | 5-minute avg | **7 ngày** | Có |
| `monitor_metrics_1h` | 1-hour avg | **90 ngày** | Có |
| `monitor_metrics_1d` | 1-day avg | **365 ngày** | Có |

### 7.2 Metrics Collected

CPU (%, load avg 1/5/15), Memory (%, used/total), Swap, Disk (%, used/total), Disk I/O (read/write bytes), Network (sent/recv bytes), Load averages

### 7.3 Alert Thresholds

| Metric | Threshold | Event |
|---|---|---|
| CPU | > 90% | `EventCPUHigh` |
| Memory | > 90% | `EventMemoryHigh` |
| Disk | > 90% | `EventDiskHigh` |

### 7.4 History Resolution Auto-Selection

| Query range | Data source |
|---|---|
| ≤ 24 giờ | Raw metrics |
| ≤ 7 ngày | 5-minute aggregates |
| ≤ 30 ngày | Hourly aggregates |
| > 30 ngày | Daily aggregates |
| Max records/query | 2,000 |

### 7.5 Storage Math

| Source | Size/sample | 1 năm (cascade) |
|---|---|---|
| Raw (60s) | ~500 bytes | 182 MB |
| 5m aggregates | ~50 bytes | 18 KB |
| 1h aggregates | ~50 bytes | 18 KB |
| 1d aggregates | ~50 bytes | 18 KB |
| **Total cascade 1 năm** | | **< 100 KB** |

---

## 8. Redis Management (21 endpoints)

| Endpoint | Mô tả |
|---|---|
| `GET /info` | Server info |
| `GET/PUT /config` | Runtime config |
| `GET/PUT /config-file` | Config file |
| `GET /clients` | Client list |
| `DELETE /clients/:id` | Kill client |
| `POST /flush` | FLUSHDB (managed) |
| `GET /dbsize` | Key count |
| `GET /slowlog` | Slow query log |
| `GET /memory` | Memory analysis |
| `PUT /password` | Set/change password |
| `GET /persistence` | RDB/AOF status |
| `POST /bgsave` | Trigger BGSAVE |
| `GET /replication` | Master/slave info |
| `GET /db-overview` | Key type distribution |
| `GET /keys` | Key listing (pattern) |
| `GET /key` | Single key value |
| `DELETE /key` | Delete key |
| `PUT /key/ttl` | Set TTL |
| `POST /cli` | CLI command execution |

---

## 9. File Manager (18 endpoints)

### 9.1 Operations

| Thao tác | Chi tiết |
|---|---|
| Browse | List/grid view, breadcrumb navigation |
| Upload | Drag-drop, batch upload |
| Download | Range request (resume support) |
| Create | New file, new folder |
| Edit | Monaco Editor (syntax highlighting, autocomplete) |
| Rename | Inline rename |
| Copy/Move | Batch support |
| Delete | Batch delete |
| Permissions | chmod (Octal + symbolic) |
| Owner | chown (UID/GID) |
| Compress | **tar.gz**, **zip** |
| Decompress | Auto-detect format |
| Search | Filename glob (max 1000 results) |
| Search content | Max 5 matches/file, 200 total |
| Remote download | Fetch URL → server directly |
| File size limit | Read max 10 MB |
| Binary detection | Null-byte check |

---

## 10. Cron Jobs (30 templates)

| Nhóm | Số lượng | Templates |
|---|---|---|
| Backup | 5 | All DBs, Single DB, All Sites, Single Site, Full Panel |
| SSL | 1 | Renew SSL |
| Cleanup | 4 | Temp/Cache, Old Logs, Nginx Cache, Docker Cleanup, PHP OPcache |
| System Maintenance | 7 | System Update, Disk Usage, Memory Report, Restart Nginx, Restart MySQL, Restart PHP-FPM, Sync Clock |
| Security | 4 | Rootkit scan, Failed SSH logins, Fail2Ban, Open Ports |
| Database | 3 | Optimize MySQL, Slow Query, Flush Logs |
| Monitoring | 3 | Health Check, Disk Alert, Website Uptime |
| Logs & Rotation | 2 | Access Logs, Journal |
| Custom | 2 | Shell Script, URL Request |

Cron types: `shell`, `url`, `backup_site`, `backup_db`

---

## 11. Dashboard Features

| Section | Chi tiết |
|---|---|
| System rings | Load, CPU (per-core grid), RAM (buffers/cached), Swap |
| Disk | Type/mount/available, I/O read/write, inode usage |
| Overview cards | Sites (running/stopped), FTP accounts, Databases, Security |
| SSL Certificates | Expiry badges: urgent (<7d), warning (<30d) |
| Security summary | Firewall ON/OFF, SSH port, blocked IPs |
| Top processes | Top 5 by CPU/MEM (>50% highlighted) |
| Software grid | Installed software với status indicators |
| Traffic chart | Upstream/downstream, rolling 30 points |
| Storage providers | FTP, S3, Google Drive, OneDrive — configured count |
| Refresh options | 5s, 10s, 30s auto-refresh |

---

## 12. So Sánh Với Các Panel Khác

| | ITDLUPanel | cPanel | aaPanel | VestACP |
|---|---|---|---|---|
| Binary size | **~60MB** | ~500MB+ | ~200MB | ~150MB |
| Deploy | 1 file SCP | Installer + runtime | ~200MB | ~150MB |
| WAF | **Coraza SPOA + OWASP CRS v4.0** | Plugin | Plugin | ❌ |
| Incremental backup | **rsync+hardlinks** | ✅ | ❌ | ❌ |
| Backup encryption | **AES-256-GCM** | ❌ | ❌ | ❌ |
| Cloud upload | **16MB chunk resumable** | ❌ | ❌ | ❌ |
| Google OAuth | **Device Authorization Flow** | ❌ | ❌ | ❌ |
| Metrics cascade | **<100KB/năm** | ❌ | ❌ | ❌ |
| Dark/Light theme | ✅ + 8 accent presets | ✅ | ✅ | Limited |
| Dark/Light + Accent | ✅ 8 presets | ✅ | ✅ | Limited |
| RBAC permissions | **37 namespaces** | ✅ | Limited | Basic |
| Redis CLI in browser | ✅ 21 endpoints | Plugin | ❌ | ❌ |
| Auto HTTPS on boot | ✅ | ❌ | ❌ | ❌ |
| 2FA TOTP | ✅ | ✅ | ✅ | ❌ |
| Docker image upload | ✅ drag-drop | ❌ | ❌ | ❌ |
| Geo-blocking WAF | ✅ 51 countries | Plugin | ❌ | ❌ |

---

## 13. Các Số Liệu Quan Trọng

| Category | Số liệu |
|---|---|
| **Rate limit** | 300 req/phút/IP |
| **JWT access TTL** | 15 phút |
| **JWT refresh TTL** | 7 ngày |
| **Bcrypt cost** | 12 |
| **GCM nonce** | 12 bytes |
| **PBKDF2 iterations** | 100,000 |
| **Salt size** | 16 bytes |
| **Drive chunk size** | 16 MB |
| **Metrics raw interval** | 60s (min 10s) |
| **Metrics cascade** | raw → 5m → 1h → 1d |
| **Service health check** | 60s interval |
| **Auth lockout 1** | 5 fails → 30s |
| **Auth lockout 2** | 10 fails → 15 phút |
| **Auth cleanup** | 10 phút / entries >30 phút |
| **Rate limit cleanup** | 1 phút |
| **RBAC cache TTL** | 5 phút |
| **Max search results** | 1000 files, 200 matches |
| **File read limit** | 10 MB |
| **Backup upload timeout** | 30 phút |
| **Drive chunk timeout** | 5 phút |
| **S3 test timeout** | 15 giây |
| **Docker dial timeout** | 5 giây |
| **Docker HTTP timeout** | 30 giây |
| **Docker image load** | 30 phút |
| **Static asset extensions excluded from PV** | 18 extensions |
| **OWASP WAF categories** | 15 |
| **Docker one-click apps** | 38 |
| **Cron templates** | 30 |
| **RBAC namespaces** | 37 |
| **Middleware layers** | 11 |
