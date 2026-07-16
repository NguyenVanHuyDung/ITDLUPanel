# ITDLUPanel — Hướng Dẫn Triển Khai

## Tổng Quan

Gói này chứa mọi thứ cần thiết để triển khai ITDLUPanel lên server mới.

**Phiên bản:** 8.0.0  
**Ngày phát hành:** 2026-07-16  
**Đường dẫn cài đặt mặc định:** `/ITDLUPanel/server/panel`

## Có Gì Mới Trong v8

### Bộ Chọn Ngôn Ngữ Với Cờ Quốc Gia
- **Biểu tượng cờ cho ngôn ngữ** — Bộ chọn ngôn ngữ trực quan với hình ảnh cờ quốc gia
- **Tích hợp flagcdn.com** — Biểu tượng cờ chất lượng cao từ flagcdn.com
- **Cải tiến dropdown UI** — Thiết kế bộ chọn ngôn ngữ hiện đại, sạch sẽ

### Cải Tiến Quản Lý Log
- **Hiển thị cờ quốc gia** — Xem cờ quốc gia của khách trong mục log
- **Định vị địa lý IP** — Biểu diễn trực quan vị trí khách truy cập
- **Trình xem log cải tiến** — Đọc dễ dàng hơn với nhận diện qua cờ

### Tạo Tài Liệu Chuyên Nghiệp
- **Tạo PDF nâng cao** — Cải tiến kiểu dáng và định dạng cho tài liệu xuất
- **Mẫu PPTX chuyên nghiệp** — Tạo slide thuyết trình tốt hơn
- **Thương hiệu nhất quán** — Phong cách hình ảnh thống nhất trên tất cả xuất

### Cải Tiến UI/UX
- **Hiển thị text ngôn ngữ** — Tùy chọn hiển thị tên ngôn ngữ bên cạnh cờ
- **Tinh chỉnh dropdown** — Cải thiện accessibility và UX cho các thành phần chọn

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
└── DEPLOY.vi.md            # Phiên bản tiếng Việt
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
scp itdlupanel-v8-linux-amd64.tar.gz root@<server-ip>:/tmp/
```

### 2. Giải nén trên server

```bash
ssh root@<server-ip>
cd /tmp
tar -xzf itdlupanel-v8-linux-amd64.tar.gz
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
│   │   └── data/panel.db        # SQLite database
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

## Nâng Cấp Từ v1–v7

1. Copy gói v8 lên server
2. Giải nén và chạy với `--update`:

```bash
tar -xzf itdlupanel-v8-linux-amd64.tar.gz
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
cd publish/v8
bash publish.sh --arch amd64
```

Output: `publish/v8/itdlupanel-v8-linux-amd64.tar.gz`
