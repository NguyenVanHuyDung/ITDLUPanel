# ITDLUPanel — Hướng Dẫn Triển Khai

## Tổng Quan

Gói này chứa mọi thứ cần thiết để triển khai ITDLUPanel lên server mới.

**Phiên bản:** 7.0.0  
**Ngày phát hành:** 2026-06-27  
**Đường dẫn cài đặt mặc định:** `/ITDLUPanel/server/panel`

## Có Gì Mới Trong v7

### Docker Auto-Cleanup
- **Quy tắc dọn dẹp theo lịch** — Định nghĩa quy tắc tự động dọn dẹp tài nguyên Docker không sử dụng
- **Hành động có thể cấu hình** — Xóa images treo, container dừng, volume không dùng, build cache
- **Lịch sử thực thi** — Theo dõi các lần dọn dẹp với log chi tiết
- **Chế độ dry-run** — Xem trước những gì sẽ bị xóa trước khi áp dụng

### Quản Lý Docker Image
- **Upload image local** — Upload Docker images trực tiếp từ panel
- **Hỗ trợ kéo-thả** — Upload image dễ dàng với theo dõi tiến trình

### Cải Tiến Hệ Thống Backup
- **Chiến lược Full/Incremental** — Chọn giữa backup tar.gz đầy đủ hoặc snapshot tăng dần
- **Snapshot tăng dần** — Backup nhanh dùng rsync + hardlinks (chỉ lưu thay đổi)
- **Tích hợp cloud storage** — Upload backup lên Google Drive, S3, FTP, OneDrive
- **Upload bất đồng bộ + resumable** — Upload file lớn đáng tin cậy với theo dõi tiến trình
- **Mã hóa backup** — Bảo vệ backup bằng mã hóa AES-256-GCM

### Hệ Thống Thông Báo
- **Đa kênh thông báo** — Email, Telegram, Discord, Slack, Webhook
- **Thông báo theo sự kiện** — Nhận thông báo về các sự kiện nghiêm trọng trên server
- **Quy tắc tùy chỉnh** — Cấu hình sự kiện nào kích hoạt thông báo nào

### Web Application Firewall (WAF)
- **Tích hợp HAProxy + Coraza** — Module WAF đầy đủ tính năng
- **Bộ rules OWASP** — Bảo vệ sẵn chống SQL injection, XSS, LFI, RCE
- **Rules tùy chỉnh** — Tạo và quản lý rules WAF riêng
- **Log request** — Theo dõi đầy đủ với geolocation IP

### Cron Job Templates
- **Templates có sẵn** — Các cron job phổ biến sẵn sàng sử dụng
- **Lập lịch backup** — Các job backup tự động

### Cải Tiến Giao Diện
- **Monitor realtime** — Dashboard theo dõi server trực tiếp
- **Font rendering cố định** — Typography nhất quán
- **Hiển thị wildcard certificate** — Xử lý SSL certificate tốt hơn
- **Cảnh báo storage trên Dashboard** — Nhắc khi storage providers chưa cài đặt

### Cơ Sở Hạ Tầng
- **Hỗ trợ Ubuntu 24.04** — Tương thích LTS mới nhất
- **Cải tiến PostgreSQL** — Auto-seed PostgreSQL local trong pgAdmin
- **Nâng cấp Go 1.26.2** — Toolchain mới

## Nội Dung Gói

```
itdlupanel/
├── itdlupanel              # Panel binary (Go, single file)
├── deploy.sh               # Script triển khai tự động
├── itdlupanel.service      # systemd unit file
├── config/
│   └── panel.json          # Cấu hình mặc định
├── data/                   # Thư mục database (tự tạo)
├── DEPLOY.md               # File này (English)
└── DEPLOY.vi.md           # Phiên bản tiếng Việt
```

## Yêu Cầu

| Yêu cầu | Tối thiểu |
|---|---|
| OS | Ubuntu 20.04+ / Debian 11+ / AlmaLinux 8+ / Rocky 8+ |
| RAM | 512 MB |
| Disk | 1 GB trống |
| Quyền | Root (sudo) |
| Ports | 8888 (mặc định) |

## Triển Khai Nhanh

### 1. Copy đến server đích

```bash
scp itdlupanel-v7-linux-amd64.tar.gz root@<server-ip>:/tmp/
```

### 2. Giải nén trên server

```bash
ssh root@<server-ip>
cd /tmp
tar -xzf itdlupanel-v7-linux-amd64.tar.gz
```

### 3. Chạy deploy

```bash
cd /tmp/itdlupanel
bash deploy.sh
```

Script sẽ:
- Tạo cấu trúc thư mục tại `/ITDLUPanel/`
- Cài binary vào `/ITDLUPanel/server/panel/`
- Tạo JWT secret bảo mật
- Cài đặt và enable systemd service
- Mở firewall port (UFW/firewalld)
- Khởi động panel

### 4. Truy cập panel

```
http://<server-ip>:8888
Username: admin
Password: admin@123456
```

> **Cảnh báo:** Đổi mật khẩu mặc định ngay sau khi đăng nhập lần đầu!

## Tùy Chọn Deploy

```bash
# Port tùy chỉnh
bash deploy.sh --port 9999

# Cài đặt không khởi động
bash deploy.sh --no-start

# Cập nhật cài đặt hiện có (giữ nguyên config & data)
bash deploy.sh --update
```

## Cấu Trúc Thư Mục (Sau Deploy)

```
/ITDLUPanel/
├── server/
│   ├── panel/                    # Panel application
│   │   ├── itdlupanel           # Binary
│   │   ├── config/panel.json    # Cấu hình
│   │   └── data/panel.db       # SQLite database
│   ├── vhost/                   # Nginx/Apache vhost configs
│   ├── nginx/                   # Nginx symlinks
│   ├── php/                     # PHP symlinks
│   └── mysql/                   # MySQL symlinks
├── backup/                       # Lưu trữ backup
├── logs/                         # Panel & error logs
│   ├── panel.log
│   └── panel-error.log
└── wwwroot/                      # Website document roots
```

## Lệnh Quản Lý

Sau khi deploy, sử dụng lệnh `itdlupanel`:

```bash
itdlupanel start            # Khởi động panel
itdlupanel stop             # Dừng panel
itdlupanel restart          # Khởi động lại panel
itdlupanel status           # Xem trạng thái (PID, port, version)
itdlupanel logs             # Xem logs (live)
itdlupanel version          # Xem phiên bản
itdlupanel reset-password   # Reset mật khẩu admin
```

## Cấu Hình

File cấu hình: `/ITDLUPanel/server/panel/config/panel.json`

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8888,
    "ssl": false,
    "ssl_cert": "",
    "ssl_key": ""
  },
  "database": {
    "path": "data/panel.db"
  },
  "auth": {
    "jwt_secret": "<tự động tạo>",
    "access_token_ttl": 900,
    "refresh_token_ttl": 604800,
    "bcrypt_cost": 12
  },
  "paths": {
    "base": "/ITDLUPanel",
    "backup": "/ITDLUPanel/backup",
    "logs": "/ITDLUPanel/logs",
    "wwwroot": "/ITDLUPanel/wwwroot",
    "vhost": "/ITDLUPanel/server/vhost"
  }
}
```

Sau khi sửa config, restart panel:

```bash
itdlupanel restart
```

## Nâng Cấp Từ v1–v6

1. Copy gói v7 lên server
2. Giải nén và chạy với `--update`:

```bash
tar -xzf itdlupanel-v7-linux-amd64.tar.gz
cd itdlupanel
bash deploy.sh --update
```

Script sẽ giữ nguyên cấu hình và database. Binary cũ được tự động backup.

## Gỡ Cài Đặt

```bash
# Dừng và disable service
systemctl stop itdlupanel
systemctl disable itdlupanel

# Xóa service file
rm -f /etc/systemd/system/itdlupanel.service
systemctl daemon-reload

# Xóa script quản lý
rm -f /usr/local/bin/itdlupanel

# Xóa toàn bộ data (CẨN THẬN: xóa websites, databases, backups)
rm -rf /ITDLUPanel
```

## Xử Lý Sự Cố

**Panel không khởi động:**
```bash
# Kiểm tra logs
journalctl -u itdlupanel -n 50
cat /ITDLUPanel/logs/panel-error.log

# Kiểm tra port conflict
ss -tlnp | grep 8888
```

**Không truy cập được panel:**
```bash
# Kiểm tra firewall
ufw status        # Ubuntu
firewall-cmd --list-ports  # CentOS/Alma

# Kiểm tra service
systemctl status itdlupanel
```

**Reset mật khẩu admin:**
```bash
itdlupanel reset-password -password "MatKhauMoi123!"
itdlupanel restart
```

## Build Từ Source

Trên máy build (cần Go 1.23+ và Node.js 18+):

```bash
cd /path/to/ITDLUPanel
cd publish/v7
bash publish.sh --arch amd64
```

Output: `publish/v7/itdlupanel-v7-linux-amd64.tar.gz`
