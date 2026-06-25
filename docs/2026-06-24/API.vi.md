# ITDLUPanel — Tài Liệu API

> **Phiên bản:** 1.0.0 · **Base URL:** `https://host:8888/api/v1` · **Cập nhật lần cuối:** 2026-06-24

---

## 1. Tổng Quan

Tất cả endpoint nằm dưới `/api/v1`. Mỗi endpoint yêu cầu xác thực:

```
Authorization: Bearer <access_token>
```

Endpoint WebSocket sử dụng tham số query `?token=<access_token>` thay thế.

### Định Dạng Phản Hồi

Tất cả endpoint REST trả về:

```json
// Thành công
{ "code": 200, "data": { ... } }

// Đã tạo
{ "code": 201, "data": { ... } }

// Lỗi validation
{ "code": 422, "errors": [{ "field": "...", "message": "..." }] }

// Phân trang
{ "code": 200, "data": [...], "page": 1, "per_page": 20, "total": 100, "total_pages": 5 }
```

### Mã Trạng Thái HTTP

| Mã | Ý nghĩa |
|----|----------|
| 200 | OK |
| 201 | Đã tạo |
| 400 | Yêu cầu không hợp lệ |
| 401 | Chưa xác thực |
| 403 | Không có quyền |
| 404 | Không tìm thấy |
| 409 | Xung đột |
| 422 | Lỗi validation |
| 429 | Vượt giới hạn tốc độ |
| 500 | Lỗi server nội bộ |

---

## 2. Xác Thực

### `POST /auth/login`

**Auth:** Công khai

**Request:**
```json
{ "username": "admin", "password": "secret" }
```

**Response (không có 2FA):**
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

**Response (yêu cầu 2FA):**
```json
{
  "code": 200,
  "data": { "require_2fa": true, "temp_token": "<jwt>" }
}
```

---

### `POST /auth/refresh`

**Auth:** Refresh token (cookie)

Trả về access token mới. Refresh token được gửi qua `Cookie: refresh_token=<token>`.

**Response:**
```json
{ "code": 200, "data": { "access_token": "<jwt>", "expires_in": 900 } }
```

---

### `POST /auth/2fa/verify`

**Auth:** Công khai (sử dụng temp_token từ login)

**Request:**
```json
{ "temp_token": "...", "code": "123456" }
```

**Response:** Giống như login thành công.

---

### `POST /auth/logout`

**Auth:** JWT

Xóa refresh token cookie.

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

Trả về tổng quan hệ thống (CPU, RAM, disk, network, uptime, trạng thái dịch vụ).

---

### `GET /dashboard/software`

**Auth:** JWT

Trả về phần mềm đã cài đặt và trạng thái dịch vụ.

---

## 4. Health

### `GET /health`

**Auth:** Không

**Response:**
```json
{ "code": 200, "data": { "status": "ok", "version": "1.0.0" } }
```

---

## 5. Sites

### `GET /sites`

**Auth:** JWT + `sites.read`

**Query:** `?page=1&per_page=20`

Danh sách phân trang các website.

---

### `POST /sites`

**Auth:** JWT + `sites.create`

**Request:**
```json
{
  "domain": "example.com",
  "php_version": "8.2",
  "web_server": "nginx",
  "path": "/www/example.com",
  "site_type": "php"
}
```

---

### `GET /sites/php-versions`

**Auth:** JWT + `sites.read`

Trả về các phiên bản PHP đã cài đặt trên hệ thống.

---

### `GET /sites/rewrite-templates`

**Auth:** JWT + `sites.read`

**Query:** `?webserver=nginx`

Trả về danh sách tên mẫu rewrite có sẵn.

---

### `GET /sites/rewrite-templates/:name`

**Auth:** JWT + `sites.read`

Trả về nội dung của một mẫu rewrite cụ thể.

---

### `GET /sites/:id`

**Auth:** JWT + `sites.read`

Trả về chi tiết website.

---

### `PUT /sites/:id`

**Auth:** JWT + `sites.edit`

---

### `DELETE /sites/:id`

**Auth:** JWT + `sites.delete`

---

### `POST /sites/:id/start`

**Auth:** JWT + `sites.edit`

Bật và reload cấu hình site.

---

### `POST /sites/:id/stop`

**Auth:** JWT + `sites.edit`

Tắt cấu hình site.

---

### `GET /sites/:id/config`

**Auth:** JWT + `sites.config`

Trả về cấu hình vhost thô.

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

Áp dụng chứng chỉ hiện có vào site bằng cách sao chép từ domain khác.

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

**Query:** `?days=7` (mặc định 7)

Trả về thống kê nhật ký truy cập (yêu cầu, băng thông).

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
{ "name": "myapp", "db_type": "mysql", "username": "appuser", "password": "..." }
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

Multipart form: trường `file` với tệp `.sql` hoặc `.sql.gz`.

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

**Auth:** JWT + `redis.read`

---

### `GET /redis/config`

**Auth:** JWT + `redis.read`

---

### `PUT /redis/config`

**Auth:** JWT + `redis.manage`

**Request:**
```json
{ "key": "maxmemory", "value": "256mb" }
```

---

### `GET /redis/config-file`

**Auth:** JWT + `redis.read`

---

### `PUT /redis/config-file`

**Auth:** JWT + `redis.manage`

---

### `GET /redis/clients`

**Auth:** JWT + `redis.read`

---

### `DELETE /redis/clients/:id`

**Auth:** JWT + `redis.manage`

---

### `POST /redis/flush`

**Auth:** JWT + `redis.manage`

**Request:**
```json
{ "db": 0 }    // DB cụ thể
// hoặc
{ "all": true } // tất cả DB
```

---

### `GET /redis/dbsize`

**Auth:** JWT + `redis.read`

---

### `GET /redis/slowlog`

**Auth:** JWT + `redis.read`

---

### `GET /redis/memory`

**Auth:** JWT + `redis.read`

---

### `PUT /redis/password`

**Auth:** JWT + `redis.manage`

---

### `GET /redis/persistence`

**Auth:** JWT + `redis.read`

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

Multipart form với trường `files[]` hoặc `file`. **Query:** `?path=/www`

---

### `GET /files/download`

**Auth:** JWT + `files.read`

**Query:** `?path=/www/backup.tar.gz`

Hỗ trợ HTTP Range để tiếp tục tải.

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

Dung lượng ổ đĩa trên images, containers, volumes.

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

## 12. Docker Cleanup

### `POST /docker/cleanup/rules`

**Auth:** JWT + `docker.cleanup`

**Request:**
```json
{
  "name": "Weekly Cleanup",
  "cleanup_types": ["unused_images", "stopped_containers", "dangling_volumes"],
  "mode": "auto",
  "schedule": "0 2 * * 0",
  "threshold_pct": 80,
  "enabled": true,
  "keep_last_log": 10
}
```

---

### `GET /docker/cleanup/rules`

**Auth:** JWT + `docker.cleanup`

---

### `GET /docker/cleanup/rules/:id`

**Auth:** JWT + `docker.cleanup`

---

### `PUT /docker/cleanup/rules/:id`

**Auth:** JWT + `docker.cleanup`

---

### `DELETE /docker/cleanup/rules/:id`

**Auth:** JWT + `docker.cleanup`

---

### `POST /docker/cleanup/rules/:id/run`

**Auth:** JWT + `docker.cleanup`

Thực thi dọn dẹp thủ công.

---

### `GET /docker/cleanup/logs`

**Auth:** JWT + `docker.cleanup`

**Query:** `?page=1&per_page=20`

---

### `GET /docker/cleanup/logs/:rule_id`

**Auth:** JWT + `docker.cleanup`

---

### `DELETE /docker/cleanup/logs/:rule_id`

**Auth:** JWT + `docker.cleanup`

Xóa nhật ký của một quy tắc.

---

### `GET /docker/cleanup/stats`

**Auth:** JWT + `docker.cleanup`

Trả về thống kê dọn dẹp tổng hợp (tổng dung lượng đã giải phóng, số lượng mục).

---

### `POST /docker/cleanup/dry-run`

**Auth:** JWT + `docker.cleanup`

**Request:**
```json
{ "cleanup_types": ["unused_images", "dangling_volumes"] }
```

Trả về những gì sẽ được dọn dẹp mà không thực sự xóa.

---

## 13. Cron

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

## 14. WAF

### Trạng thái & Dịch vụ

### `GET /waf/status`

**Auth:** JWT + `waf.read`

Trả về trạng thái dịch vụ WAF, trạng thái cài đặt và cài đặt toàn cục.

---

### `POST /waf/install`

**Auth:** JWT + `waf.manage`

Cài đặt HAProxy và Coraza SPOA.

---

### `POST /waf/uninstall`

**Auth:** JWT + `waf.manage`

Xóa dịch vụ WAF và cấu hình.

---

### `POST /waf/restart`

**Auth:** JWT + `waf.manage`

Khởi động lại dịch vụ WAF.

---

### `GET /waf/config`

**Auth:** JWT + `waf.read`

Trả về đường dẫn đến các file cấu hình HAProxy và Coraza.

---

### `GET /waf/config/:type`

**Auth:** JWT + `waf.read`

**type:** `haproxy` | `coraza` | `global`

Trả về nội dung file cấu hình được chỉ định.

---

### Trang WAF

### `GET /waf/sites`

**Auth:** JWT + `waf.read`

**Query:** `?page=1&per_page=20`

---

### `POST /waf/sites`

**Auth:** JWT + `waf.manage`

**Request:**
```json
{
  "name": "My Protected Site",
  "domain": "example.com",
  "backend_url": "http://127.0.0.1:8080",
  "listen_port": 80,
  "ssl_port": 443,
  "mode": "blocking",
  "max_connections": 2000,
  "timeout_client": 30000,
  "timeout_server": 30000,
  "health_check_path": "/health"
}
```

---

### `GET /waf/sites/:id`

**Auth:** JWT + `waf.read`

---

### `PUT /waf/sites/:id`

**Auth:** JWT + `waf.manage`

---

### `DELETE /waf/sites/:id`

**Auth:** JWT + `waf.manage`

---

### `PUT /waf/sites/:id/toggle`

**Auth:** JWT + `waf.manage`

**Request:**
```json
{ "enabled": true }
```

---

### Quy tắc WAF

### `GET /waf/rules`

**Auth:** JWT + `waf.read`

**Query:** `?page=1&per_page=20&category=SQLi&enabled=true`

---

### `POST /waf/rules`

**Auth:** JWT + `waf.manage`

**Request:**
```json
{
  "name": "Block SQL Comments",
  "rule_type": "custom",
  "category": "SQLi",
  "phase": 1,
  "action": "block",
  "rule_content": "SecRule ARGS \"@rx --\" \"deny\"",
  "enabled": true,
  "priority": 50,
  "log_level": "alert"
}
```

---

### `GET /waf/rules/:id`

**Auth:** JWT + `waf.read`

---

### `PUT /waf/rules/:id`

**Auth:** JWT + `waf.manage`

---

### `DELETE /waf/rules/:id`

**Auth:** JWT + `waf.manage`

---

### `PUT /waf/rules/:id/toggle`

**Auth:** JWT + `waf.manage`

---

### Danh mục OWASP

### `GET /waf/owasp-categories`

**Auth:** JWT + `waf.read`

Trả về tất cả danh mục quy tắc OWASP với trạng thái bật/tắt.

---

### `PUT /waf/owasp-categories/:categoryId`

**Auth:** JWT + `waf.manage`

**Request:**
```json
{ "enabled": false }
```

Bật/tắt một danh mục OWASP.

---

### Nhật ký WAF

### `GET /waf/logs`

**Auth:** JWT + `waf.read`

**Query:** `?page=1&per_page=50&site_id=1&action=blocked&start_date=...&end_date=...`

Trả về nhật ký kiểm toán WAF với bộ lọc theo site, hành động, mức độ nghiêm trọng, IP và khoảng thời gian.

---

### `GET /waf/logs/:id`

**Auth:** JWT + `waf.read`

Trả về mục nhật ký chi tiết bao gồm header và body yêu cầu.

---

### `DELETE /waf/logs`

**Auth:** JWT + `waf.manage`

**Query:** `?before=2026-01-01`

Xóa nhật ký WAF cũ.

---

### Thống kê WAF

### `GET /waf/stats`

**Auth:** JWT + `waf.read`

**Query:** `?site_id=1&period=daily&days=30`

Trả về thống kê WAF tổng hợp (yêu cầu, chặn, loại tấn công).

---

### `GET /waf/stats/traffic`

**Auth:** JWT + `waf.read`

**Query:** `?site_id=1&period=hourly&hours=24`

Trả về thống kê lưu lượng (băng thông, số yêu cầu, thời gian phản hồi, p95).

---

### `GET /waf/stats/geo`

**Auth:** JWT + `waf.read`

**Query:** `?site_id=1&period=daily&days=7`

Trả về thống kê theo quốc gia.

---

### `GET /waf/stats/attack-types`

**Auth:** JWT + `waf.read`

**Query:** `?site_id=1&days=7`

Trả về phân bố loại tấn công.

---

### Danh sách IP

### `GET /waf/ip-lists`

**Auth:** JWT + `waf.read`

**Query:** `?type=whitelist|blacklist`

---

### `POST /waf/ip-lists`

**Auth:** JWT + `waf.manage`

**Request:**
```json
{
  "ip_address": "1.2.3.4",
  "list_type": "whitelist",
  "description": "Trusted partner IP",
  "expires_at": "2026-12-31T23:59:59Z"
}
```

---

### `DELETE /waf/ip-lists/:id`

**Auth:** JWT + `waf.manage`

---

### `GET /waf/ip-lists/:id`

**Auth:** JWT + `waf.read`

---

### Danh sách URI

### `GET /waf/uri-lists`

**Auth:** JWT + `waf.read`

**Query:** `?type=whitelist|blacklist`

---

### `POST /waf/uri-lists`

**Auth:** JWT + `waf.manage`

**Request:**
```json
{
  "uri_pattern": "/api/public/*",
  "list_type": "whitelist",
  "action": "allow",
  "description": "Public API endpoints",
  "enabled": true,
  "priority": 50
}
```

---

### `PUT /waf/uri-lists/:id`

**Auth:** JWT + `waf.manage`

---

### `DELETE /waf/uri-lists/:id`

**Auth:** JWT + `waf.manage`

---

### Danh sách User-Agent

### `GET /waf/ua-lists`

**Auth:** JWT + `waf.read`

**Query:** `?type=whitelist|blacklist`

---

### `POST /waf/ua-lists`

**Auth:** JWT + `waf.manage`

**Request:**
```json
{
  "ua_pattern": "Googlebot*",
  "list_type": "whitelist",
  "description": "Allow Googlebot"
}
```

---

### `DELETE /waf/ua-lists/:id`

**Auth:** JWT + `waf.manage`

---

### Chữ ký tấn công

### `GET /waf/attack-signatures`

**Auth:** JWT + `waf.read`

**Query:** `?attack_type=SQLi&days=30`

---

### `DELETE /waf/attack-signatures/:id`

**Auth:** JWT + `waf.manage`

---

### Kịch bản Lua

### `GET /waf/lua-scripts`

**Auth:** JWT + `waf.read`

---

### `POST /waf/lua-scripts`

**Auth:** JWT + `waf.manage`

**Request:**
```json
{
  "name": "Rate Limiter",
  "description": "Custom rate limiting script",
  "script_content": "...",
  "enabled": true,
  "priority": 50
}
```

---

### `PUT /waf/lua-scripts/:id`

**Auth:** JWT + `waf.manage`

---

### `DELETE /waf/lua-scripts/:id`

**Auth:** JWT + `waf.manage`

---

### Yêu cầu chậm

### `GET /waf/slow-requests`

**Auth:** JWT + `waf.read`

**Query:** `?site_id=1&threshold_ms=5000&days=7`

---

### Cài đặt WAF

### `GET /waf/settings`

**Auth:** JWT + `waf.read`

Trả về cài đặt WAF toàn cục (chế độ, paranoia level, anomaly threshold, geo-blocking, log retention).

---

### `PUT /waf/settings`

**Auth:** JWT + `waf.manage`

**Request:**
```json
{
  "global_mode": "blocking",
  "paranoia_level": "1",
  "anomaly_threshold": "5",
  "log_requests": "blocked",
  "log_retention_days": "30",
  "geo_blocking_enabled": "true",
  "geo_blocked_countries": ["CN", "RU"]
}
```

---

## 15. Security

### Tường lửa

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

Tải xuống file khóa riêng.

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

## 16. SSL

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

Khởi tạo DNS-01 challenge. Trả về bản ghi TXT cần thêm.

---

### `POST /ssl/letsencrypt-dns/complete`

**Auth:** JWT + Admin

Xác minh DNS và phát hành chứng chỉ.

---

### `POST /ssl/upload`

**Auth:** JWT + Admin

Multipart form: các trường `domain`, `cert`, `key`.
Hoặc body JSON:
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

Tải lên hoặc cấu hình chứng chỉ SSL cho panel.

---

### `POST /ssl/panel/self-signed`

**Auth:** JWT + Admin

Tạo chứng chỉ tự ký cho panel.

---

## 17. Backups

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

Tải xuống file sao lưu.

---

## 18. FTP Storage

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

## 19. Cloud Storage

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

Kiểm tra inline với config trong body.

---

### `GET /cloud-storages/:id/auth-url`

**Auth:** JWT + `backup.create`

Trả về URL OAuth cho ủy quyền Google Drive / OneDrive.

---

### `GET /cloud-storages/oauth/callback`

**Auth:** Không (chuyển hướng trình duyệt từ OAuth provider)

Xử lý chuyển hướng OAuth, lưu tokens.

---

## 20. Software

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

Trả về `202 Accepted` với `{ "task_id": 42 }`.

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

**Auth:** JWT + Admin (chỉ nginx)

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

### Quản lý PHP theo phiên bản

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

### Quản lý DB

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

## 21. Monitor

### `GET /monitor/system`

**Auth:** JWT

Chỉ số hệ thống đầy đủ (CPU, RAM, disk, network, uptime).

---

### `GET /monitor/processes`

**Auth:** JWT

**Query:** `?limit=50`

Top tiến trình theo CPU/bộ nhớ.

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

Trạng thái các dịch vụ được quản lý (nginx, mysql, v.v.).

---

### `GET /monitor/network`

**Auth:** JWT

Thống kê giao diện mạng tổng hợp.

---

### `GET /monitor/disk`

**Auth:** JWT

Dung lượng các phân vùng ổ đĩa.

---

### `GET /monitor/history`

**Auth:** JWT

**Query:** `?range=1d|7d|30d&resolution=auto`

Dữ liệu chỉ số lịch sử.

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

## 22. Tasks

### `GET /tasks`

**Auth:** JWT

**Query:** `?page=1&per_page=20&status=running|pending|done|failed`

---

### `GET /tasks/summary`

**Auth:** JWT

Trả về số lượng theo trạng thái.

---

### `GET /tasks/:id`

**Auth:** JWT

---

### `GET /tasks/:id/log`

**Auth:** JWT

---

### `DELETE /tasks/:id`

**Auth:** JWT

Hủy tác vụ đang chạy hoặc đang chờ.

---

## 23. Users

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

## 24. Roles

### `GET /roles`

**Auth:** JWT + Admin

---

### `GET /roles/permissions`

**Auth:** JWT + Admin

Trả về cây quyền đầy đủ cho UI.

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

## 25. Plugins

### `GET /plugins`

**Auth:** JWT + Admin

Liệt kê các plugin đã cài đặt.

---

### `GET /plugins/store`

**Auth:** JWT + Admin

Liệt kê các plugin có sẵn trong store.

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

## 26. Settings

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

## 27. Logs

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

**Query:** Tương tự như access log.

---

### `GET /logs/website/:id/dates`

**Auth:** JWT + `logs.read`

Trả về các ngày log đã xoay có sẵn.

---

### `DELETE /logs/website/:id/:logType`

**Auth:** JWT + `logs.manage`

`logType`: `access` hoặc `error`.

---

### `GET /logs/sites`

**Auth:** JWT + `logs.read`

Danh sách website tối thiểu cho dropdown.

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

## 28. Notifications

### Kênh

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

### Quy tắc

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

### Mẫu

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

### Nhật ký

### `GET /notifications/logs`

**Auth:** JWT + Admin

**Query:** `?page=1&per_page=20&channel_type=...&event_type=...&status=sent|failed`

---

### `DELETE /notifications/logs`

**Auth:** JWT + Admin

---

### Loại sự kiện

### `GET /notifications/event-types`

**Auth:** JWT + Admin

---

### `GET /notifications/event-types/critical`

**Auth:** JWT + Admin

---

## 29. Endpoint WebSocket

### Terminal

**URL:** `wss://host:8888/api/v1/terminal?token=<jwt>&cwd=/www`

**Auth:** JWT qua query param + quyền `terminal.access`

**Client → Server (resize):**
```json
{ "type": "resize", "cols": 120, "rows": 40 }
```

**Client → Server (input):** Bytes thô được chuyển tiếp đến stdin PTY.

**Server → Client:** Bytes stdout PTY thô (binary).

---

### Monitor

**URL:** `wss://host:8888/api/v1/monitor/realtime?token=<jwt>`

**Auth:** JWT + Auth middleware

**Server → Client (mỗi 2s):**
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
