# ITDLUPanel — Điểm nổi bật (Highlights)

> Ngày: 2026-06-24 — Tổng hợp các điểm nổi bật chính của ITDLUPanel

---

## 1. Tổng quan

**ITDLUPanel** là một web-based Linux Server Management Panel được phát triển cho **Đại học Đà Lạt**, Vietnam.

- **Go 1.26** backend với Gin 1.12
- **React 19** + TypeScript 5.9 frontend
- **Single binary ~60MB** — deploy bằng một file duy nhất (go:embed)
- **SQLite** database với 21 migrations → 40+ bảng
- **~160 REST API** endpoints + 2 WebSocket endpoints
- **145 Go files**, **27 Handlers**, **71 Services**

---

## 2. Kiến trúc độc đáo

### Single Binary Deployment
Không giống cPanel, VestACP hay aaPanel — toàn bộ frontend (React build) được embed vào binary Go qua `go:embed`. Chỉ cần upload một file và chạy.

### Handler → Service → Repository Pattern
- **27 Handlers** → **71 Services** → **SQLite** (40+ bảng, 21 migrations)
- Tách biệt rõ ràng, dễ mở rộng

### Middleware Chain (11 lớp)
JWT Auth → RBAC → Rate Limit → CSRF → Audit Log → CORS → Compression → IP Allowlist → ...

### Connection Multiplexing (cmux)
HTTP và HTTPS chạy trên **cùng một port** với tự động redirect HTTP → HTTPS.

---

## 3. Tính năng nổi bật

| Module | Điểm đáng chú ý |
|---|---|
| **Dashboard** | Monitoring real-time: CPU, RAM, disk, network (Recharts), tự động cài đặt phần mềm |
| **Terminal** | WebSocket PTY, multi-tab, fullscreen (xterm.js) |
| **Websites** | Nginx / Apache / OLS, PHP version switching, vhost builder, AddWebsiteModal mới |
| **Databases** | MySQL/MariaDB — create, backup, restore, user management; Redis dashboard redesign |
| **Docker** | 38 one-click app templates, containers/images/networks/volumes, **image upload drag-drop** |
| **Security** | UFW Firewall, Fail2ban, WAF (Coraza), IP blocking |
| **SSL** | Let's Encrypt auto-issue, auto-renewal, custom upload |
| **Backup** | FTP, S3/MinIO, Google Drive, OneDrive — **incremental rsync+hardlinks**, **AES-256-GCM encryption** |
| **Cron** | 30 templates, schedule builder, execution history, **cron-to-storage mapping** |
| **File Manager** | Monaco Editor tích hợp, compress/decompress, permissions, bookmarks |
| **Monitor** | Historical + realtime metrics: CPU, memory, disk I/O, network |
| **Logs** | Audit log redesign với rich analytics và filters |
| **App Store** | One-click install: Nginx, Apache, PHP, MySQL, Redis, Docker, ... |
| **Storage** | Google OAuth Device Authorization Flow, async resumable upload pipeline |
| **Users/RBAC** | 3 roles (Admin/Operator/Viewer), 2FA (TOTP), per-user resource quota |
| **Theme** | Accent palette picker với 8 color presets |

---

## 4. WebSocket Real-time

Custom hub implementation phục vụ:
- **Terminal** — PTY qua WebSocket, multi-tab, fullscreen
- **Monitor** — Streaming metrics real-time, không cần poll

---

## 5. Nền tảng hỗ trợ

| OS | Web Server | Database | PHP |
|---|---|---|---|
| Ubuntu 14.04 → 24.04 | Nginx, Apache, OpenLiteSpeed | MySQL, MariaDB | 5.6 → 8.4 |
| Debian 8 → 12 | Tất cả tương thích | SQLite (panel DB) | Multiple versions |

---

## 6. Bảo mật

- **JWT** authentication với refresh token
- **RBAC** với permission caching (in-memory, 5-min TTL)
- **2FA** (TOTP) — Google Authenticator compatible
- **Rate Limiting** — chống brute-force (300 req/min/IP)
- **CSRF Protection** — middleware chain
- **Audit Logging** — ghi log hành động người dùng
- **GeoIP Logging** — enrich logs với thông tin địa lý IP
- **WAF** — Coraza Web Application Firewall với OWASP CRS v4.0
- **Backup Encryption** — AES-256-GCM cho dữ liệu backup nhạy cảm

---

## 7. Điểm khác biệt với các panel khác

| | ITDLUPanel | cPanel | aaPanel | VestACP |
|---|---|---|---|---|
| Single binary | ✅ | ❌ | ❌ | ❌ |
| ~60MB total | ✅ | ~500MB+ | ~200MB | ~150MB |
| WAF tích hợp | ✅ Coraza | Plugin | Plugin | ❌ |
| Cloud backup native | ✅ S3/GDrive/OneDrive | Plugin | Plugin | FTP only |
| Incremental backup | ✅ rsync+hardlinks | ✅ | ❌ | ❌ |
| Backup mã hóa | ✅ AES-256-GCM | Plugin | ❌ | ❌ |
| Google OAuth flow | ✅ Device Auth Flow | ❌ | ❌ | ❌ |
| Auto HTTPS on boot | ✅ | ❌ | ❌ | ❌ |
| Dark/Light + Accent | ✅ 8 presets | ✅ | ✅ | Limited |

---

## 8. CLI Subcommands

```bash
./itdlupanel                        # Khởi động panel
./itdlupanel reset-password         # Reset mật khẩu admin
./itdlupanel backup                 # Chạy backup manual
./itdlupanel cron-run <id>          # Chạy cron job thủ công
```

---

## 9. I18n

Hỗ trợ đa ngôn ngữ: **English** và **Tiếng Việt** qua i18next.

---

## 10. Cấu trúc số liệu

| Chỉ số | Giá trị |
|---|---|
| Go files | 145 |
| REST Handlers | 27 |
| Services | 71 |
| Database migrations | 21 (001-020) |
| Database tables | 40+ |
| Frontend TSX files | 66 |
| Static asset extensions (PV) | 18 |
| OWASP WAF categories | 15 |
| Docker one-click templates | 38 |
| Cron job templates | 30 |
| Middleware layers | 11 |
| RBAC permission namespaces | 30+ |
