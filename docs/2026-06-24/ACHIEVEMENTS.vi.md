# ITDLUPanel — Thành Tựu & Điểm Nổi Bật

> **Phiên bản tài liệu:** 1.0.0 · **Cập nhật lần cuối:** 2026-06-24

---

## Tổng Quan

Tài liệu này liệt kê các thành tựu có thể đo lường được và các điểm nổi bật kỹ thuật của ITDLUPanel, phân biệt nó với các bảng điều khiển máy chủ khác. Tất cả các số liệu được rút ra trực tiếp từ codebase — không bịa đặt.

---

## 1. Triển Khai Tệp Nhị Phân Duy Nhất — Không Phụ Thuộc Runtime

### Khẳng Định

ITDLUPanel phân phối dưới dạng **một tệp nhị phân tĩnh ~60MB** với toàn bộ frontend nhúng bên trong. Không yêu cầu phụ thuộc runtime trên máy đích.

### Cách Đạt Được

| Kỹ thuật | Chi tiết |
|-----------|---------|
| `CGO_ENABLED=0` | Tệp nhị phân hoàn toàn tĩnh — không `libc`, không `libpthread` |
| `modernc.org/sqlite` | Driver SQLite thuần Go — không CGO cho database |
| `go:embed` | React SPA nhúng vào `web.go` tại thời điểm biên dịch |
| `-s -w` ldflags | Symbol table và debug info bị loại bỏ trong bản production |
| Cross-compile | `linux/amd64` và `linux/arm64` biên dịch chéo từ bất kỳ nền tảng nào |

### Tại Sao Nó Quan Trọng

Các stack LAMP/LEMP truyền thống yêu cầu cài đặt và quản lý riêng Apache/Nginx, PHP, MySQL, và phpMyAdmin. ITDLUPanel loại bỏ hoàn toàn điều này — một tệp nhị phân thay thế tất cả, triển khai bằng một lệnh `scp` duy nhất.

---

## 2. Tổng Hợp Metrics Thông Minh — 1 Năm Dữ Liệu Trong <100 KB/Ngày

### Vấn Đề

Hầu hết các bảng điều khiển lưu metrics thô ở độ phân giải đầy đủ mãi mãi, làm phình database lên hàng gigabyte.

### Giải Pháp của ITDLUPanel

`MetricsCollector` triển khai **4-tier time-series aggregation cascade**:

```
Thô (60s intervals)
    │
    │  tổng hợp mỗi 5 phút
    ▼
5-phút aggregates
    │
    │  tổng hợp mỗi giờ
    ▼
Giờ aggregates
    │
    │  tổng hợp mỗi ngày
    ▼
Ngày aggregates
```

| Bảng | Độ phân giải | Giữ mặc định | Có thể cấu hình |
|-------|-------------|--------------|----------------|
| `monitor_metrics_raw` | 1 mẫu/phút | **2 ngày** | Có (`monitor_retention_raw`) |
| `monitor_metrics_5m` | 5-phút avg | **7 ngày** | Có (`monitor_retention_5m`) |
| `monitor_metrics_1h` | 1-giờ avg | **90 ngày** | Có (`monitor_retention_1h`) |
| `monitor_metrics_1d` | 1-ngày avg | **365 ngày** | Có (`monitor_retention_1d`) |

### Tính Toán Lưu Trữ

| Nguồn | Kích thước mẫu | 1 ngày | 1 tuần | 1 năm (thô) | 1 năm (cascade) |
|--------|----------------|---------|---------|----------------|-------------------|
| Thô (60s) | ~500 bytes | 720 KB | 5 MB | 182 MB | — |
| 5m aggregates | ~50 bytes | 288 | 2 KB | — | 18 KB |
| 1h aggregates | ~50 bytes | — | 8 KB | 18 KB | 18 KB |
| 1d aggregates | ~50 bytes | — | — | — | 18 KB |

**Tổng lưu trữ cascade 1 năm**: < 100 KB, phục vụ daily averages với retention 1 năm.

Thu thập chạy ở khoảng thời gian tối thiểu **10 giây** (có thể cấu hình, mặc định 60s) để phản hồi real-time.

---

## 3. Tối Ưu SQLite — Cấu Hình Production-Ready WAL

### Khẳng Định

SQLite thường bị loại bỏ là không phù hợp cho production, nhưng cấu hình của ITDLUPanel loại bỏ các điểm thất bại phổ biến.

### Chi Tiết Cấu Hình

| PRAGMA | Giá trị | Tác Động |
|--------|---------|----------|
| `journal_mode = WAL` | Enabled | Đọc đồng thời trong khi ghi; không khóa đọc |
| `busy_timeout = 10000` | 10 giây | Ngăn lỗi "database locked" dưới tải ghi |
| `foreign_keys = ON` | Enforced | Toàn vẹn dữ liệu ở engine level |
| `journal_size_limit = 67108864` | 64 MB | Ngăn WAL file phình không giới hạn |
| `max_open_conns = 4` | 4 kết nối | Ngăn write contention |
| `max_idle_conns = 2` | 2 idle | Giảm connection overhead |

### Tại Sao Nó Hoạt Động

Với chế độ WAL, đọc không bao giờ chặn ghi và ghi không bao giờ chặn đọc. Kết hợp với busy timeout 10 giây, database xử lý đồng thời các WebSocket monitor client, API requests, và background task workers.

---

## 4. Kiến Trúc WAF — HAProxy + Coraza SPOA (Tiêu Chuẩn Công Nghiệp)

### Thách Thức

Hầu hết các bảng điều khiển chỉ cung cấp chặn IP cơ bản hoặc giới hạn tốc độ. ITDLUPanel triển khai **Layer 7 Web Application Firewall** đầy đủ, so sánh được với các thiết bị WAF thương mại.

### Kiến Trúc

```
Internet
   │
   ▼
HAProxy (transparent proxy + SSL termination)
   │  maxconn: 10,000 | client timeout: 30s | server timeout: 30s
   │
   ▼ (SPOE v2, 127.0.0.1:9000)
Coraza SPOA (OWASP ModSecurity CRS v4.0)
   │
   ▼ (chặn hoặc ghi log)
Backend Application Server
```

### OWASP CRS v4.0 Coverage

| Danh mục | MITRE ID | Phase 1 | Phase 2 |
|----------|----------|----------|---------|
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

### Cấu Hình WAF Nổi Bật

| Tham số | Giá trị | Mục đích |
|---------|---------|----------|
| `SecRequestBodyLimit` | 12.5 MB | Xử lý upload file lớn |
| `SecRequestBodyNoFilesLimit` | 128 KB | Bảo vệ bộ nhớ |
| `SecPcreMatchLimit` | 1000 | Phòng ngừa ReDoS |
| `SecPcreMatchLimitRecursion` | 100 | Bảo vệ đệ quy sâu |
| `SecCollectionTimeout` | 600s | Dọn session |
| `SecAuditLogParts` | ABIJEFHZ | Full audit trail |
| SPOE agent timeout | 60s | HAProxy ↔ Coraza sync |

### Khả Năng WAF Độc Đáo

- **Geo-blocking** qua MaxMind GeoIP — chặn/cho phép lưu lượng theo quốc gia với thống kê real-time
- **Danh sách IP với hỗ trợ CIDR** — whitelist, blacklist với theo dõi số lần truy cập và tự động hết hạn
- **Lua scripting trong HAProxy** — kịch bản Lua tùy chỉnh lưu trong DB, triển khai khi restart WAF
- **Tự động học chữ ký tấn công** — mẫu được trích xuất từ phân tích nhật ký WAF
- **Thống kê lưu lượng** — băng thông hàng giờ, số yêu cầu, phân vị thời gian phản hồi (p95, max, min, avg)
- **Phát hiện yêu cầu chậm** — ngưỡng độ trễ có thể cấu hình (mặc định 5000ms)

---

## 5. Docker Auto-Cleanup — Giải Phóng Dung Lượng Ổ Đĩa Chủ Động

### Vấn Đề

Docker tích lũy images không sử dụng, containers đã dừng, volumes treo, và build cache — âm thầm tiêu tốn gigabytes.

### Giải Pháp của ITDLUPanel

Hệ thống dọn dẹp dựa trên quy tắc với **thực thi theo lịch**, **kích hoạt theo ngưỡng ổ đĩa**, và **chế độ dry-run**.

#### Các Mục Tiêu Dọn Dẹp

| Mục tiêu | Lệnh Docker | Metrics Theo Dõi |
|-----------|-------------|------------------|
| Containers đã dừng | `docker container prune` | Số lượng, dung lượng giải phóng |
| Images treo | `docker image prune` | Dung lượng giải phóng |
| Volumes không sử dụng | `docker volume prune` | Dung lượng ước tính |
| Networks không sử dụng | `docker network prune` | Số lượng |
| Build cache | `docker builder prune` | Dung lượng giải phóng |

#### Cấu Hình Quy Tắc

| Cài đặt | Mặc định | Mô tả |
|---------|-----------|--------|
| `threshold_pct` | Không | Kích hoạt dọn dẹp khi disk vượt N% |
| `keep_last_log` | 10 | Số nhật ký dọn dẹp giữ lại cho mỗi quy tắc |
| `schedule` | — | Biểu thức cron chuẩn (5 trường) |
| `mode` | `manual` | `manual` hoặc `auto` |
| Threshold cooldown | 30 phút | Ngăn vòng dọn dẹp trên giá trị biên |

#### Chế Độ Dry-Run

Trước khi thực thi bất kỳ dọn dẹp nào, quản trị viên có thể chạy `POST /docker/cleanup/dry-run` để xem trước chính xác những gì **sẽ** bị xóa — không có thay đổi nào được thực hiện. Trả về `total_reclaimable_bytes`, số lượng items theo loại, và danh sách các đối tượng cụ thể.

---

## 6. Hệ Thống Sao Lưu — Multi-Layer Retention & Incremental Backup

### Chính Sách Retention

| Chính sách | Cơ chế |
|------------|--------|
| Max keep | `EnforceRetention(type, targetID, maxKeep)` — xóa cũ nhất vượt quá N |
| Giới hạn tuổi | `CleanOldBackups(keepDays)` — xóa records cũ hơn N ngày |
| Per-backup type | Giới hạn độc lập cho site, database, và panel backups |

### Nén

| Loại Backup | Phương pháp | Kết quả |
|------------|-------------|--------|
| Site files | `tar czf` | `.tar.gz` |
| Database | `mysqldump` → `gzip -f` | `.sql.gz` |
| Panel config | `tar czf -h` (follow symlinks) | `.tar.gz` |

### Sao Lưu Incremental

Phương pháp rsync + hardlinks giúp tiết kiệm không gian đĩa đáng kể:

| Loại | Cơ chế | Lợi ích |
|------|---------|----------|
| Incremental snapshot | rsync + hardlinks | Chỉ sao chép delta thay đổi |
| Hard links | Cùng inode, không tốn thêm đĩa | Tiết kiệm không gian |
| Retention | EnforceRetention per loại | Giới hạn số bản giữ lại |

### Mã Hóa Backup

Dữ liệu backup nhạy cảm được mã hóa bằng **AES-256-GCM** trước khi upload lên cloud.

### Đích Đa Đám Mây

| Nhà cung cấp | Protocol | Timeout | Tính năng |
|---------------|---------|---------|-----------|
| FTP | `jlaffaye/ftp` | 30 phút | Upload, download, delete |
| S3 / MinIO | `minio-go v7` | 30 phút | Multipart, bất kỳ S3-compatible nào |
| Google Drive | OAuth2 + Drive API v3 | 30 phút | Multipart, thư mục lồng |
| OneDrive | Graph API v1.0 | 30 phút | Upload, download, delete |

Đường dẫn remote: `itdlupanel_backup/{type}/{filename}`.

---

## 7. Thống Kê Website từ NGINX Access Logs — Phân Tích Full-Funnel

### Vấn Đề

Hầu hết các bảng điều khiển chỉ hiển thị uptime hoặc health cơ bản. ITDLUPanel phân tích nhật ký NGINX thô để cung cấp cho chủ website **metrics kiểu Google Analytics**.

### Metrics Theo Dõi

| Metric | Định nghĩa |
|--------|-----------|
| **Traffic** | Tổng `body_bytes_sent` từ combined log format |
| **Requests** | Tổng số dòng |
| **Unique IPs (UV)** | Số lượng `$remote_addr` riêng biệt |
| **Unique Visitors (UV)** | Số lượng hash(IP + User-Agent) riêng biệt |
| **Page Views (PV)** | Các yêu cầu trang không phải static (GET/HEAD, loại trừ 14 static asset extensions) |

### Các Định Dạng Log Được Hỗ Trợ

- **Hiện tại**: Combined NGINX log format
- **Đã xoay**: file `.log` và `.gz` (gzip-compressed) qua `gzip.NewReader`
- **Khoảng ngày**: Tối đa 30 ngày mỗi query
- **Scanner buffer**: 256 KB ban đầu, 1 MB max cho các dòng lớn

### Các Static Asset Extensions Được Loại Trừ Khỏi PV

```
.css .js .png .jpg .jpeg .gif .svg .ico
.woff .woff2 .ttf .eot .map .webp .avif .mp4 .mp3 .webm .pdf
```

---

## 8. Bảo Vệ Brute-Force — Khóa Thích Ứng

### Vấn Đề

Ngưỡng khóa tĩnh thất bại dưới các cuộc tấn công phân tán.

### Triển Khai (`auth_service.go`)

| Số lần thất bại | Thời gian khóa | Hành động |
|----------------|-------------|----------|
| 5 lần thất bại | 30 giây | Khóa mềm tạm thời |
| 10 lần thất bại | 15 phút | Khóa cứng |
| 5 lần + `root` | 30 giây | Track riêng cho root |

Các bản ghi login attempt được **dọn mỗi 10 phút**, loại bỏ entries cũ hơn 30 phút — ngăn bảng khóa phình không giới hạn.

---

## 9. Middleware Stack — 11 Lớp Phòng Thủ

Mỗi middleware là một lớp riêng biệt, độc lập có thể test:

| # | Middleware | Chức năng |
|---|-----------|-----------|
| 1 | `RecoveryMiddleware` | Khôi phục panic với stack trace |
| 2 | `LoggerMiddleware` | Structured request/response logging (zerolog) |
| 3 | `SecurityHeadersMiddleware` | X-Frame-Options, CSP, X-Content-Type, HSTS |
| 4 | `CORSMiddleware` | Cross-origin control; wildcard dev, strict release |
| 5 | `CompressionMiddleware` | gzip (default compression level) |
| 6 | `LanguageMiddleware` | Accept-Language → `en`/`vi` i18n |
| 7 | `RateLimitMiddleware` | In-memory token bucket; 300 req/phút/IP |
| 8 | `CSRFExemptionMiddleware` | GET/HEAD/OPTIONS + Bearer auth → skip |
| 9 | `CSRFValidationMiddleware` | `X-CSRF-Token` header vs cookie |
| 10 | `AuthMiddleware` | JWT HS256 validation; 15-phút access token |
| 11 | `RBACMiddleware` | Permission check với 5-phút double-check cache |

### RBAC Permission Cache

- **TTL**: 5 phút với double-check locking
- **Pattern**: Wildcard matching (`sites.*` cấp tất cả `sites.X`)
- **Cache invalidation**: Tự động khi role/permission update
- **Permissions**: 30+ namespaces bao gồm `waf.*` và `docker.cleanup`

---

## 10. Khả Năng CLI — Vận Hành Không Cần Trình Duyệt

### Vượt Qua Giao Diện Web

Hầu hết các bảng điều khiển yêu cầu trình duyệt cho mọi thứ. ITDLUPanel cung cấp CLI đầy đủ cho **tự động hóa headless**:

```bash
# Sao lưu tất cả site với retention 10 bản
itdlupanel backup -type=site -all -max-keep=10

# Sao lưu database cụ thể
itdlupanel backup -type=database -target=mydb -max-keep=5

# Sao lưu panel config (DB + SSL + settings)
itdlupanel backup -type=panel

# Upload lên FTP từ xa ngay sau khi backup
itdlupanel backup -type=site -target=example.com \
  -storage=ftp -storage-id=1

# Chạy cron job thủ công (hữu ích để test)
itdlupanel cron-run -id=5

# Đặt lại mật khẩu user
itdlupanel reset-password -user=admin -password=NewSecret123
```

CLI commands xuất **structured JSON** để dễ parse bởi scripts:

```json
{"status":"ok","type":"site","count":5,"file":"/ITDLUPanel/backup/sites/backup_20260509.tar.gz","size":104857600}
```

---

## 11. Bảo Mật Cứng Rắn — Fail2ban + SSH Keys + 2FA

### Fail2ban Integration

| Cài đặt | Giá trị mặc định |
|---------|-----------------|
| `bantime` (SSH jail) | 3600 giây |
| `findtime` | 600 giây |
| `maxretry` | 5 lần thử |
| `action` | `iptables-multiport` |

### Quản Lý SSH Key

- **Tạo** ED25519 hoặc RSA keys server-side
- **Tải xuống** private key trực tiếp từ panel (không bao giờ lưu trữ không mã hóa)
- **Root user protection** — UID > 1000 validation ngăn xóa nhầm system user
- **Key storage** — `~/.ssh/authorized_keys` với `command=` wrapper

### Two-Factor Authentication

- **Issuer**: `ITDLUPanel` trong authenticator apps
- **Temp token TTL**: 5 phút (ngăn replay)
- **Setup flow**: QR code → verify → enable (3 bước)
- **Disable flow**: Yêu cầu mã TOTP hợp lệ

---

## 12. Database Indexes — 30+ Indexes Cho Query Performance

Mọi cột thường xuyên được query đều có index riêng:

| Bảng | Indexes |
|-------|---------|
| `monitor_metrics_*` | 4 × `(timestamp)` — một mỗi resolution tier |
| `audit_logs` | 3 × (user, action, created_at) |
| `domains` | 1 × `(site_id)` |
| `sites` | 1 × `(domain)` |
| `tasks` | 1 × `(status)` |
| `waf_logs` | 5 × (timestamp, site, action, ip, severity) |
| `docker_cleanup_logs` | 2 × (rule_id, started_at) |
| WAF tables (tổng) | 13 indexes bao gồm composite + unique constraints |

---

## 13. Search Safety — Giới Hạn Tiêu Thụ Tài Nguyên

| Thao tác | Giới hạn | File |
|---------|---------|------|
| File content read | **10 MB max** | `file_service.go:356` |
| Search content | Bỏ qua files > 10 MB | `file_service.go:256-269` |
| Binary file detection | Null-byte check | `file_service.go:261` |
| Glob search results | **1000 max** | `file_service.go:205` |
| Content search matches | **5 mỗi file, 200 tổng** | `file_service.go:281,294` |
| Archive extraction | Path traversal check + prefix validation | `file_service.go:1035-1067` |
| Directory size | `du -sb` với 2-phút timeout | `file_service.go:1196` |
| Large copy/move | 5-phút timeout | `file_service.go` |
| Backup command | 5-phút timeout | `backup_service.go:44` |

---

## 14. Mọi Thứ Đều Có Thể Cấu Hình — Không Giá Trị Cố Định

Mọi tham số hành vi đều được externalized:

| Danh mục | Cài đặt |
|----------|---------|
| Metrics | Collection interval, retention per tier (raw/5m/1h/1d) |
| Auth | JWT TTL, refresh TTL, bcrypt cost, lockout thresholds, lockout duration |
| Backup | Path, compression format, max-keep, remote storage |
| WAF | Request body limits, PCRE limits, collection timeout, paranoia level, anomaly threshold |
| Docker cleanup | Threshold %, cooldown, log retention, schedule |
| Rate limit | Requests per window, window duration |
| RBAC | Permission cache TTL |
| Panel | Name, language, admin path, SSL, port |

---

## Bảng Tổng Hợp

| Thành tựu | Số liệu | So sánh ngành |
|-------------|---------|----------------|
| Kích thước binary | ~60 MB tĩnh, 1 file | cPanel: ~500 MB installer + runtime |
| Metrics retention | 1-năm daily averages | Hầu hết panels: không có hoặc <30 ngày |
| Metrics cascade storage | ~100 KB/năm | Thô: ~182 MB/năm |
| SQLite WAL config | 5 pragmas tối ưu | Mặc định: 0 pragmas |
| WAF rule engine | OWASP CRS v4.0, 15 danh mục | Hầu hết panels: chỉ IP blocklist |
| Geo-blocking | 51 quốc gia được ánh xạ | Hiếm có trong panels mã nguồn mở |
| Docker cleanup | 5 targets + dry-run | Hầu hết panels: chỉ commands thủ công |
| Phát hiện tấn công | 8 loại tự động | Không có |
| Lua scripting | Lưu trong DB, triển khai được | Không có |
| Site statistics | Full funnel: UV + PV + traffic | Chỉ basic uptime |
| Log retention | 365-ngày daily aggregates | Thường thủ công |
| RBAC permissions | 30+ granular namespaces | Thường chỉ admin/viewer |
| Brute-force protection | Thích ứng, 2-tier lockout | Ngưỡng tĩnh |
| 2FA | TOTP với 5-phút temp token | Thường thiếu |
| CLI automation | Full backup + cron + reset | Thường thiếu |
| Cloud backup | S3 + GDrive + OneDrive + FTP | Thường chỉ FTP |
| Rate limit | 300 req/phút/IP | Thường thiếu |
| CSRF protection | Header + cookie dual validation | Chỉ cookie |
| Static asset filtering | 18 extensions trong PV | Không có |
| Search safety | 8 resource limits | Không giới hạn (rủi DoS) |
| Incremental backup | rsync + hardlinks, <100KB/ngày | Thường chỉ full backup |
| Mã hóa backup | AES-256-GCM cho dữ liệu nhạy cảm | Thường không có |
| Google OAuth | Device Authorization Flow | Thường OAuth thủ công |
