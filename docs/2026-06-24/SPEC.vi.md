# ITDLUPanel — Thông Số Kỹ Thuật

> **Phiên bản:** 1.0.0 · **Cập nhật lần cuối:** 2026-06-24

---

## 1. Lược Đồ Cơ Sở Dữ Liệu (SQLite — 38 bảng)

### 1.1 Bảng Cốt Lõi

#### `users`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| username | TEXT | UNIQUE NOT NULL |
| email | TEXT | UNIQUE |
| password | TEXT | NOT NULL (bcrypt cost=12) |
| role | TEXT | DEFAULT 'viewer' |
| totp_secret | TEXT | NULL (mã hóa base32) |
| totp_enabled | INTEGER | DEFAULT 0 |
| status | INTEGER | DEFAULT 1 (1=hoạt động, 0=vô hiệu) |
| last_login | DATETIME | NULL |
| last_ip | TEXT | NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `roles`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| description | TEXT | |
| permissions | TEXT | Mảng JSON các chuỗi quyền |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**Vai trò hệ thống mặc định:**
- `admin` — `["*"]` (toàn quyền truy cập)
- `operator` — `["sites.*","databases.*","ftp.*","files.*","cron.*","docker.*","firewall.*","backup.*","terminal.access","monitor.read","logs.read"]`
- `viewer` — `["monitor.read","logs.read","dashboard.read"]`

#### `user_roles`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| user_id | INTEGER | FK → users.id |
| role_id | INTEGER | FK → roles.id |
| PRIMARY KEY | | (user_id, role_id) |

#### `settings`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| key | TEXT | PRIMARY KEY |
| value | TEXT | NOT NULL |
| description | TEXT | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `schema_migrations`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| version | INTEGER | PRIMARY KEY |
| applied_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

### 1.2 Bảng Ứng Dụng

#### `sites`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| domain | TEXT | NOT NULL |
| path | TEXT | NOT NULL |
| webserver | TEXT | NOT NULL |
| php_version | TEXT | Ví dụ: "8.2" |
| site_type | TEXT | DEFAULT 'php' ('php' / 'node' / 'python' / 'static') |
| ssl_enabled | INTEGER | DEFAULT 0 |
| ssl_type | TEXT | |
| ssl_expiry | DATETIME | |
| status | INTEGER | DEFAULT 1 |
| config_extra | TEXT | |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `domains`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| site_id | INTEGER | FK → sites.id ON DELETE CASCADE |
| domain | TEXT | NOT NULL |
| is_primary | INTEGER | DEFAULT 0 |
| UNIQUE | | (site_id, domain) |

#### `databases`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| db_type | TEXT | NOT NULL ('mysql' / 'mariadb' / 'postgresql' / 'mongodb') |
| username | TEXT | NOT NULL |
| password | TEXT | NOT NULL |
| charset | TEXT | DEFAULT 'utf8mb4' |
| collation | TEXT | DEFAULT 'utf8mb4_general_ci' |
| remote_access | TEXT | DEFAULT 'localhost' |
| size | INTEGER | DEFAULT 0 (bytes) |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | | (name, db_type) |

#### `ftps`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| username | TEXT | UNIQUE NOT NULL |
| password | TEXT | NOT NULL |
| path | TEXT | NOT NULL |
| status | INTEGER | DEFAULT 1 |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `crons`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | NOT NULL ('shell' / 'url') |
| schedule | TEXT | NOT NULL (biểu thức cron) |
| command | TEXT | NOT NULL |
| status | INTEGER | DEFAULT 1 |
| last_run | DATETIME | NULL |
| last_status | TEXT | NULL |
| last_output | TEXT | NULL |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `tasks`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| type | TEXT | NOT NULL |
| name | TEXT | NOT NULL |
| status | TEXT | DEFAULT 'pending' ('pending' / 'running' / 'done' / 'failed') |
| progress | INTEGER | DEFAULT 0 (0–100) |
| log | TEXT | |
| result | TEXT | |
| error | TEXT | |
| created_by | INTEGER | FK → users.id |
| started_at | DATETIME | NULL |
| completed_at | DATETIME | NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `software`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| display_name | TEXT | NOT NULL |
| version | TEXT | NOT NULL |
| type | TEXT | NOT NULL |
| status | INTEGER | DEFAULT 1 |
| config_path | TEXT | |
| install_path | TEXT | |
| service_name | TEXT | |
| installed_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `backups`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| type | TEXT | NOT NULL ('site' / 'database' / 'panel') |
| name | TEXT | NOT NULL |
| target_id | INTEGER | NULL |
| target_name | TEXT | |
| file_path | TEXT | NOT NULL |
| file_size | INTEGER | DEFAULT 0 |
| storage | TEXT | DEFAULT 'local' |
| checksum | TEXT | |
| status | TEXT | DEFAULT 'completed' |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `firewall_rules`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| type | TEXT | NOT NULL |
| protocol | TEXT | DEFAULT 'tcp' |
| port | TEXT | |
| ip | TEXT | |
| action | TEXT | NOT NULL ('allow' / 'deny') |
| direction | TEXT | DEFAULT 'in' |
| description | TEXT | |
| status | INTEGER | DEFAULT 1 |
| sort_order | INTEGER | DEFAULT 0 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `plugins`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| display_name | TEXT | NOT NULL |
| version | TEXT | NOT NULL |
| description | TEXT | |
| author | TEXT | |
| homepage | TEXT | |
| status | INTEGER | DEFAULT 1 |
| config | TEXT | |
| installed_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `audit_logs`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| user_id | INTEGER | FK → users.id |
| username | TEXT | |
| action | TEXT | NOT NULL |
| resource | TEXT | NOT NULL |
| resource_id | TEXT | |
| detail | TEXT | |
| ip | TEXT | |
| user_agent | TEXT | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `docker_containers`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| container_id | TEXT | NOT NULL UNIQUE |
| name | TEXT | NOT NULL |
| image | TEXT | NOT NULL |
| status | TEXT | |
| ports | TEXT | |
| volumes | TEXT | |
| env | TEXT | |
| restart_policy | TEXT | DEFAULT 'no' |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `ftp_storages`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| host | TEXT | NOT NULL |
| port | INTEGER | DEFAULT 21 |
| username | TEXT | NOT NULL |
| password | TEXT | NOT NULL |
| remote_path | TEXT | DEFAULT "/" |
| is_default | INTEGER | DEFAULT 0 |
| is_active | INTEGER | DEFAULT 1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `cloud_storages`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | NOT NULL ('s3' / 'google_drive' / 'onedrive') |
| config | TEXT | JSON (thông tin xác thực đã mã hóa) |
| is_default | INTEGER | DEFAULT 0 |
| is_active | INTEGER | DEFAULT 1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `notification_channels`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| type | TEXT | NOT NULL ('email' / 'telegram' / 'webhook') |
| config | TEXT | JSON (server, token, URL) |
| is_enabled | INTEGER | DEFAULT 1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `notification_rules`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| channel_id | INTEGER | FK → notification_channels.id |
| event_type | TEXT | NOT NULL |
| is_enabled | INTEGER | DEFAULT 1 |
| custom_subject | TEXT | NULL |
| custom_body | TEXT | NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `notification_logs`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| channel_id | INTEGER | FK → notification_channels.id |
| event_type | TEXT | |
| message | TEXT | |
| status | TEXT | ('sent' / 'failed') |
| error_message | TEXT | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `docker_cleanup_rules`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| cleanup_types | TEXT | NOT NULL DEFAULT '[]' |
| mode | TEXT | NOT NULL DEFAULT 'manual' ('manual' / 'auto') |
| schedule | TEXT | |
| threshold_pct | INTEGER | |
| enabled | INTEGER | DEFAULT 1 |
| keep_last_log | INTEGER | DEFAULT 10 |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### `docker_cleanup_logs`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| rule_id | INTEGER | FK → docker_cleanup_rules.id ON DELETE SET NULL |
| triggered_by | TEXT | NOT NULL DEFAULT 'manual' |
| started_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| finished_at | DATETIME | |
| space_reclaimed | INTEGER | NOT NULL DEFAULT 0 |
| items_removed | TEXT | NOT NULL DEFAULT '{}' |
| errors | TEXT | NOT NULL DEFAULT '[]' |
| status | TEXT | NOT NULL DEFAULT 'running' |

### 1.3 Bảng WAF (migration 016 & 017)

#### `waf_sites`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| domain | TEXT | NOT NULL |
| backend_url | TEXT | NOT NULL |
| listen_port | INTEGER | NOT NULL DEFAULT 80 |
| ssl_port | INTEGER | NOT NULL DEFAULT 443 |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| mode | TEXT | NOT NULL DEFAULT 'blocking' |
| ssl_enabled | INTEGER | NOT NULL DEFAULT 0 |
| ssl_cert_path | TEXT | |
| ssl_key_path | TEXT | |
| health_check_path | TEXT | |
| max_connections | INTEGER | NOT NULL DEFAULT 2000 |
| timeout_client | INTEGER | NOT NULL DEFAULT 30000 |
| timeout_server | INTEGER | NOT NULL DEFAULT 30000 |
| description | TEXT | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_rules`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| rule_type | TEXT | NOT NULL DEFAULT 'custom' |
| category | TEXT | NOT NULL DEFAULT 'custom' |
| phase | INTEGER | NOT NULL DEFAULT 1 |
| action | TEXT | NOT NULL DEFAULT 'block' |
| rule_content | TEXT | NOT NULL |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| priority | INTEGER | NOT NULL DEFAULT 100 |
| log_level | TEXT | NOT NULL DEFAULT 'alert' |
| description | TEXT | |
| rule_group | TEXT | |
| owasp_rule_id | TEXT | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_owasp_categories`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| category_id | TEXT | NOT NULL UNIQUE |
| name | TEXT | NOT NULL |
| description | TEXT | |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| severity | TEXT | NOT NULL DEFAULT 'warning' |
| mitre_technique | TEXT | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_logs`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| timestamp | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| site_id | INTEGER | REFERENCES waf_sites(id) ON DELETE SET NULL |
| client_ip | TEXT | NOT NULL |
| method | TEXT | |
| uri | TEXT | |
| host | TEXT | |
| rule_id | TEXT | |
| rule_message | TEXT | |
| rule_severity | TEXT | |
| rule_category | TEXT | |
| action_taken | TEXT | NOT NULL DEFAULT 'allowed' |
| anomaly_score | REAL | |
| geo_country | TEXT | |
| user_agent | TEXT | |
| referer | TEXT | |
| response_code | INTEGER | |
| request_body | TEXT | |
| request_headers | TEXT | |
| matched_data | TEXT | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_stats`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| period | TEXT | NOT NULL |
| period_key | TEXT | NOT NULL |
| site_id | INTEGER | REFERENCES waf_sites(id) ON DELETE CASCADE |
| total_requests | INTEGER | NOT NULL DEFAULT 0 |
| blocked_requests | INTEGER | NOT NULL DEFAULT 0 |
| allowed_requests | INTEGER | NOT NULL DEFAULT 0 |
| sqli_count | INTEGER | NOT NULL DEFAULT 0 |
| xss_count | INTEGER | NOT NULL DEFAULT 0 |
| lfi_count | INTEGER | NOT NULL DEFAULT 0 |
| rce_count | INTEGER | NOT NULL DEFAULT 0 |
| other_count | INTEGER | NOT NULL DEFAULT 0 |
| top_blocked_ips | TEXT | |
| top_triggered_rules | TEXT | |
| avg_anomaly_score | REAL | |
| attack_types | TEXT | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | | (period, period_key, site_id) |

#### `waf_settings`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| key | TEXT | PRIMARY KEY |
| value | TEXT | NOT NULL |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_ip_list`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| ip_address | TEXT | NOT NULL |
| list_type | TEXT | NOT NULL DEFAULT 'whitelist' |
| description | TEXT | |
| expires_at | DATETIME | |
| created_by | INTEGER | REFERENCES users(id) |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| hit_count | INTEGER | NOT NULL DEFAULT 0 |
| last_hit | DATETIME | |
| is_cidr | INTEGER | NOT NULL DEFAULT 0 |
| source | TEXT | DEFAULT 'manual' |
| UNIQUE | | (ip_address, list_type) |

#### `waf_traffic_stats`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| site_id | INTEGER | REFERENCES waf_sites(id) ON DELETE CASCADE |
| period | TEXT | NOT NULL |
| period_key | TEXT | NOT NULL |
| hour | INTEGER | |
| date_key | TEXT | |
| total_bytes_in | INTEGER | NOT NULL DEFAULT 0 |
| total_bytes_out | INTEGER | NOT NULL DEFAULT 0 |
| total_requests | INTEGER | NOT NULL DEFAULT 0 |
| blocked_requests | INTEGER | NOT NULL DEFAULT 0 |
| avg_response_ms | REAL | NOT NULL DEFAULT 0 |
| max_response_ms | INTEGER | NOT NULL DEFAULT 0 |
| min_response_ms | INTEGER | NOT NULL DEFAULT 0 |
| p95_response_ms | INTEGER | NOT NULL DEFAULT 0 |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | | (period, period_key, site_id, hour, date_key) |

#### `waf_uri_list`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| uri_pattern | TEXT | NOT NULL |
| list_type | TEXT | NOT NULL DEFAULT 'whitelist' |
| action | TEXT | NOT NULL DEFAULT 'block' |
| description | TEXT | |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| priority | INTEGER | NOT NULL DEFAULT 100 |
| created_by | INTEGER | REFERENCES users(id) |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | | (uri_pattern, list_type) |

#### `waf_lua_scripts`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| description | TEXT | |
| script_content | TEXT | NOT NULL |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| priority | INTEGER | NOT NULL DEFAULT 100 |
| created_by | INTEGER | REFERENCES users(id) |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_ua_list`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| ua_pattern | TEXT | NOT NULL |
| list_type | TEXT | NOT NULL DEFAULT 'whitelist' |
| description | TEXT | |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| created_by | INTEGER | REFERENCES users(id) |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| UNIQUE | | (ua_pattern, list_type) |

#### `waf_attack_signatures`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| signature | TEXT | NOT NULL UNIQUE |
| attack_type | TEXT | NOT NULL |
| severity | TEXT | NOT NULL DEFAULT 'warning' |
| pattern | TEXT | NOT NULL |
| description | TEXT | |
| match_count | INTEGER | NOT NULL DEFAULT 0 |
| last_seen | DATETIME | |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_slow_requests`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| log_id | INTEGER | REFERENCES waf_logs(id) ON DELETE CASCADE |
| site_id | INTEGER | REFERENCES waf_sites(id) ON DELETE SET NULL |
| client_ip | TEXT | NOT NULL |
| method | TEXT | |
| uri | TEXT | |
| host | TEXT | |
| response_ms | INTEGER | NOT NULL |
| threshold_ms | INTEGER | NOT NULL DEFAULT 5000 |
| timestamp | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| created_at | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### `waf_geo_stats`

| Cột | Kiểu | Ràng buộc |
|------|------|------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| site_id | INTEGER | REFERENCES waf_sites(id) ON DELETE CASCADE |
| country_code | TEXT | NOT NULL |
| total_requests | INTEGER | NOT NULL DEFAULT 0 |
| blocked_requests | INTEGER | NOT NULL DEFAULT 0 |
| period | TEXT | NOT NULL |
| period_key | TEXT | NOT NULL |
| UNIQUE | | (country_code, period, period_key, site_id) |

---

## 2. Cấu Hình

### 2.1 Cấu Hình Panel (`config/panel.json`)

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8888,
    "mode": "release"
  },
  "database": {
    "path": "data/panel.db",
    "max_connections": 10
  },
  "auth": {
    "jwt_secret": "",
    "token_expire": 24,
    "max_login_attempts": 5,
    "lockout_duration": 15,
    "bcrypt_cost": 12
  },
  "paths": {
    "base": "/ITDLUPanel",
    "backup_dir": "data/backups",
    "temp_dir": "data/tmp",
    "log_dir": "data/logs"
  },
  "panel": {
    "name": "ITDLUPanel",
    "language": "en",
    "ssl_enabled": false,
    "ssl_cert": "",
    "ssl_key": "",
    "admin_path": "/"
  }
}
```

### 2.2 Biến Môi Trường

| Biến | Mô tả | Mặc định |
|-------|--------|----------|
| `PANEL_PORT` | Cổng HTTP | 8888 |
| `PANEL_HOST` | Địa chỉ bind | 0.0.0.0 |
| `PANEL_CONFIG` | Đường dẫn file cấu hình | config/panel.json |
| `GIN_MODE` | Chế độ Gin (release/debug) | debug |

---

## 3. Loại Sự Kiện Thông Báo

| Loại Sự Kiện | Mức Độ Nghiêm Trọng | Mô Tả |
|---------------|---------------------|--------|
| `backup_failed` | cao | Thao tác sao lưu thất bại |
| `backup_success` | thấp | Sao lưu hoàn thành thành công |
| `ssl_expiring` | cao | Chứng chỉ SSL sắp hết hạn |
| `ssl_expired` | nghiêm trọng | Chứng chỉ SSL đã hết hạn |
| `disk_full` | nghiêm trọng | Dung lượng ổ đĩa trên 90% |
| `disk_warning` | trung bình | Dung lượng ổ đĩa trên 80% |
| `cpu_high` | trung bình | CPU vượt ngưỡng |
| `memory_high` | trung bình | Bộ nhớ vượt ngưỡng |
| `service_down` | nghiêm trọng | Dịch vụ được quản lý đã dừng |
| `login_failed` | thấp | Đăng nhập thất bại |
| `login_success` | thấp | Đăng nhập thành công |
| `cron_failed` | cao | Cron job thất bại |
| `cron_success` | thấp | Cron job hoàn thành |
| `docker_crash` | cao | Container thoát bất thường |
| `security_alert` | nghiêm trọng | Sự kiện liên quan đến bảo mật |
| `waf_blocked` | trung bình | WAF chặn một yêu cầu |
| `waf_attack_detected` | cao | WAF phát hiện mẫu tấn công |

---

## 4. Phần Mềm & Phiên Bản Được Hỗ Trợ

### Máy Chủ Web

| Phần mềm | Cài đặt | Cấu hình | Giám sát | Phiên bản |
|----------|----------|----------|----------|----------|
| Nginx | ✅ | ✅ | ✅ | Mới nhất + cụ thể |
| Apache | ✅ | ✅ | ✅ | 2.4.x |
| OpenLiteSpeed | ✅ | ✅ | ✅ | Mới nhất |

### Cơ Sở Dữ Liệu

| Phần mềm | Cài đặt | Cấu hình | Giám sát | Phiên bản |
|----------|----------|----------|----------|----------|
| MySQL | ✅ | ✅ | ✅ | 5.7, 8.0 |
| MariaDB | ✅ | ✅ | ✅ | 10.x, 11.x |
| PostgreSQL | ✅ | ✅ | ✅ | Mới nhất |
| MongoDB | ✅ | ✅ | ✅ | Mới nhất |
| Redis | ✅ | ✅ | ✅ | Mới nhất |

### Runtime

| Phần mềm | Cài đặt | Cấu hình | Giám sát |
|----------|----------|----------|----------|
| PHP (nhiều phiên bản) | ✅ | ✅ | ✅ |
| Node.js | ✅ | ✅ | — |
| Python | ✅ | ✅ | — |
| Go | ✅ | — | — |
| Java/Tomcat | ✅ | — | — |

### Công Cụ Quản Lý

| Công cụ | Cài đặt | Cấu hình |
|---------|----------|----------|
| phpMyAdmin | ✅ | — |
| pgAdmin | ✅ | — |
| Supervisor | ✅ | ✅ |
| Memcached | ✅ | ✅ |
| Elasticsearch | ✅ | — |
| FTP (PureFTPd) | ✅ | ✅ |

### WAF / Proxy

| Phần mềm | Cài đặt | Cấu hình |
|----------|----------|----------|
| HAProxy | ✅ | ✅ |
| Coraza SPOA | ✅ | ✅ |

### Module Lưu Trữ

| Module | Mục đích |
|--------|----------|
| FTP Storage | Đích sao lưu FTP từ xa |
| S3 / MinIO | Lưu trữ đối tượng tương thích S3 |
| Google Drive | Sao lưu Google Drive qua OAuth2 |
| OneDrive | Sao lưu OneDrive qua OAuth2 |

---

## 5. Danh Sách Trình Cài Đặt Phần Mềm

`installerRegistry` hỗ trợ các phần mềm sau:

```
nginx · apache · openlitespeed
php (7.4, 8.0, 8.1, 8.2, 8.3, 8.4)
mysql · mariadb · postgresql · mongodb
redis · memcached · supervisor
python · nodejs · golang · java-tomcat
pureftpd · phpmyadmin · pgadmin
elasticsearch · envoy
ftp_storage · s3_storage · google_drive · onedrive
```

Mỗi installer triển khai:
- `IsInstalled() bool`
- `Install(ctx, version) error`
- `Uninstall() error`
- `GetVersion() (string, error)`
- `Start() error`
- `Stop() error`
- `Restart() error`
- `Reload() error`
- `GetConfig() (string, error)`
- `UpdateConfig(content) error`
- `Status() (string, error)`

---

## 6. Tham Chiếu Quyền RBAC

### Cây Quyền

```
sites.*
  sites.read
  sites.create
  sites.edit
  sites.delete
  sites.config
  sites.ssl
databases.*
  databases.read
  databases.create
  databases.edit
  databases.delete
  databases.backup
files.*
  files.read
  files.write
  files.delete
docker.*
  docker.read
  docker.create
  docker.manage
  docker.cleanup
cron.*
  cron.read
  cron.create
  cron.edit
  cron.delete
logs.*
  logs.read
  logs.manage
backup.*
  backup.read
  backup.create
  backup.delete
  backup.restore
terminal.access
security.*
  security.manage
firewall.*
  firewall.read
  firewall.manage
software.*
  software.read
  software.manage
ssl.*
ftp.*
  ftp.read
  ftp.create
  ftp.edit
  ftp.delete
redis.*
  redis.read
  redis.manage
waf.*
  waf.read
  waf.manage
*
```

---

## 7. Thông Số Build

### 7.1 Yêu Cầu Build

| Yêu cầu | Phiên bản |
|----------|----------|
| Go | 1.26.0+ |
| Node.js | 18+ |
| npm | 9+ |

### 7.2 Quy Trình Build

```
npm install
npx vite build       → web/dist/
go generate          → nhúng web/dist/ vào web.go
CGO_ENABLED=0 go build → bin/itdlupanel (~60MB tệp nhị phân đơn)
```

### 7.3 Docker Build (multi-stage)

```dockerfile
FROM node:22-alpine AS frontend
WORKDIR /app
COPY web/ .
RUN npm ci && npx vite build

FROM golang:1.26-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
COPY . .
COPY --from=frontend /app/web/dist web/dist/
RUN CGO_ENABLED=0 go build -ldflags "-s -w" -o itdlupanel ./cmd/panel

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
COPY --from=backend /app/itdlupanel /usr/local/bin/
EXPOSE 8888
ENTRYPOINT ["itdlupanel"]
```

### 7.4 Tham Chiếu Lệnh CLI

| Lệnh | Mô tả |
|------|-------|
| `itdlupanel -config config/panel.json` | Khởi động server |
| `itdlupanel -version` | In phiên bản |
| `itdlupanel reset-password -user admin -password secret123` | Đặt lại mật khẩu |
| `itdlupanel backup -type=site -all -max-keep=10` | Sao lưu tất cả site |
| `itdlupanel backup -type=database -target=mydb` | Sao lưu DB cụ thể |
| `itdlupanel backup -type=panel` | Sao lưu toàn bộ panel |
| `itdlupanel backup -type=site -target=example.com -storage=ftp -storage-id=1` | Sao lưu với upload từ xa |
| `itdlupanel cron-run -id=5` | Chạy cron job #5 thủ công |

---

## 8. Chính Sách Lưu Trữ Metrics

`MetricsCollector` lưu metrics trong SQLite với thời gian lưu trữ theo thời gian:

| Bảng | Độ phân giải | Thời gian lưu mặc định |
|------|-------------|------------------------|
| `metrics_raw` | Mỗi `interval` giây (mặc định 60s) | 7 ngày |
| `metrics_5m` | Tổng hợp 5 phút | 30 ngày |
| `metrics_1h` | Tổng hợp hàng giờ | 90 ngày |
| `metrics_1d` | Tổng hợp hàng ngày | 365 ngày |

---

## 9. Lưu Trữ Chứng Chỉ SSL

| Loại | Đường dẫn |
|------|----------|
| Chứng chỉ panel | `/ITDLUPanel/server/data/ssl/panel/fullchain.pem` |
| Khóa panel | `/ITDLUPanel/server/data/ssl/panel/privkey.pem` |
| Chứng chỉ domain | `/ITDLUPanel/server/data/ssl/sites/<domain>/fullchain.pem` |
| Khóa domain | `/ITDLUPanel/server/data/ssl/sites/<domain>/privkey.pem` |

---

## 10. Đường Dẫn Vhost

| Máy chủ Web | Đường dẫn Cấu hình |
|-------------|---------------------|
| Nginx | `/etc/nginx/sites-enabled/` + `/etc/nginx/sites-available/` |
| Apache | `/etc/apache2/sites-enabled/` + `/etc/apache2/sites-available/` |
| OLS | `/usr/local/lsws/conf/vhosts/` |

---

## 11. Mã Thoát CLI

| Mã | Ý nghĩa |
|----|---------|
| 0 | Thành công |
| 1 | Lỗi chung (tham số không hợp lệ, thao tác thất bại) |
| 2 | Không tìm thấy file cấu hình |
| 3 | Lỗi cơ sở dữ liệu |
| 4 | Sao lưu thất bại |
