# ITDLUPanel — Hướng Dẫn Triển Khai

## Tổng Quan

Gói này chứa mọi thứ cần thiết để triển khai ITDLUPanel lên máy chủ mới.

**Phiên bản:** 6.0.0  
**Ngày xuất bản:** 2026-05-08  
**Đường dẫn cài đặt mặc định:** `/ITDLUPanel/server/panel`

## Tính Năng Mới v6

### Web Application Firewall (WAF)
- **Tích hợp HAProxy + Coraza** — Module WAF đầy đủ tính năng với quản lý rule
- **Dashboard tổng quan** — Thống kê request, tổng quan phát hiện mối đe dọa, request bị chặn, top kẻ tấn công
- **CRUD WAF rules** — Tạo, sửa, bật/tắt custom WAF rules
- **Ghi log request** — Theo dõi đầy đủ: IP, method, path, status, rule matched
- **Bộ rule OWASP** — Bảo vệ sẵn có chống SQL injection, XSS, LFI, RCE, và hơn thế

### Quản Lý Log với Định Vị Địa Lý
- **Định vị IP** — Tra cứu quốc gia/thành phố tự động cho mọi log entry
- **Trình xem log nâng cao** — Hiển thị phong phú với cờ địa lý và metadata
- **Parsing log tốt hơn** — Xử lý cải thiện cho nhiều định dạng log

### Quản Lý Redis
- **Trình duyệt Keys** — Duyệt, tìm kiếm, quản lý Redis keys với hiển thị theo type
- **Redis CLI** — Giao diện dòng lệnh tương tác trong panel
- **Giám sát Replication** — Theo dõi trạng thái master/slave replication
- **Quản lý Database** — Tạo và quản lý nhiều Redis databases

### Cải Tiến Thiết Kế & UX
- **Sửa font rendering** — Typography nhất quán trên UI và terminal
- **Cải tiến log viewer** — Text wrapping tốt hơn cho HTTP methods dài
- **Cải tiến NGINX** — Loại bỏ reuseport khỏi QUIC, thêm ACME root cho challenges
- **Cải tiến certificate** — Hiển thị wildcard certificate (VD: *.dlu.edu.vn)

### Infrastructure
- **PostgreSQL nâng cao** — Auto-seed PostgreSQL local trong pgAdmin
- **Nâng cấp Go 1.26.2** — Toolchain mới cho hiệu năng tốt hơn

## Nội Dung Gói

```
itdlupanel/
├── itdlupanel              # File nhị phân panel (Go, một file duy nhất)
├── deploy.sh               # Script triển khai tự động
├── itdlupanel.service      # File unit systemd
├── config/
│   └── panel.json          # Cấu hình mặc định
├── data/                   # Thư mục database (tự tạo)
├── DEPLOY.md               # Hướng dẫn tiếng Anh
└── DEPLOY.vi.md            # File này
```

## Yêu Cầu Hệ Thống

| Yêu cầu | Tối thiểu |
|---|---|
| HĐH | Ubuntu 20.04+ / Debian 11+ / AlmaLinux 8+ / Rocky 8+ |
| RAM | 512 MB |
| Disk | 1 GB trống |
| Quyền | Root (sudo) |
| Cổng | 8888 (mặc định) |

## Triển Khai Nhanh

### 1. Chuyển file lên máy chủ đích

```bash
scp itdlupanel-v6-linux-amd64.tar.gz root@<server-ip>:/tmp/
```

### 2. Giải nén trên máy chủ đích

```bash
ssh root@<server-ip>
cd /tmp
tar -xzf itdlupanel-v6-linux-amd64.tar.gz
```

### 3. Chạy script triển khai

```bash
cd /tmp/itdlupanel
bash deploy.sh
```

Script sẽ tự động:
- Tạo cấu trúc thư mục tại `/ITDLUPanel/`
- Cài đặt binary vào `/ITDLUPanel/server/panel/`
- Tạo JWT secret an toàn
- Cài đặt và bật systemd service
- Mở cổng tường lửa (UFW/firewalld)
- Khởi động panel

### 4. Truy cập panel

```
http://<server-ip>:8888
Tên đăng nhập: admin
Mật khẩu: admin@123456
```

> ⚠️ **Thay đổi mật khẩu mặc định ngay sau lần đăng nhập đầu tiên!**

## Tùy Chọn Triển Khai

```bash
# Cổng tùy chỉnh
bash deploy.sh --port 9999

# Cài đặt không khởi động
bash deploy.sh --no-start

# Cập nhật cài đặt hiện có (giữ nguyên config & dữ liệu)
bash deploy.sh --update
```

## Cấu Trúc Thư Mục (Sau Khi Triển Khai)

```
/ITDLUPanel/
├── server/
│   ├── panel/                    # Ứng dụng panel
│   │   ├── itdlupanel           # Binary
│   │   ├── config/panel.json    # Cấu hình
│   │   └── data/panel.db        # Database SQLite
│   ├── vhost/                   # Cấu hình vhost Nginx/Apache
│   ├── nginx/                   # Symlinks Nginx
│   ├── php/                     # Symlinks PHP
│   └── mysql/                   # Symlinks MySQL
├── backup/                      # Lưu trữ backup
├── logs/                        # Log panel & lỗi
│   ├── panel.log
│   └── panel-error.log
└── wwwroot/                     # Document root website
```

## Lệnh Quản Lý

Sau khi triển khai, sử dụng lệnh `itdlupanel`:

```bash
itdlupanel start            # Khởi động panel
itdlupanel stop             # Dừng panel
itdlupanel restart          # Khởi động lại panel
itdlupanel status           # Xem trạng thái (PID, cổng, phiên bản)
itdlupanel logs             # Xem log trực tiếp
itdlupanel version          # Xem phiên bản
itdlupanel reset-password   # Đặt lại mật khẩu admin
```

## Nâng Cấp Từ v1–v4

1. Chuyển gói v5 lên máy chủ
2. Giải nén và chạy với `--update`:

```bash
tar -xzf itdlupanel-v6-linux-amd64.tar.gz
cd itdlupanel
bash deploy.sh --update
```

Dữ liệu và cấu hình hiện có được giữ nguyên. Binary cũ được tự động backup.

## Gỡ Cài Đặt

```bash
# Dừng và vô hiệu hóa service
systemctl stop itdlupanel
systemctl disable itdlupanel

# Xóa file service
rm -f /etc/systemd/system/itdlupanel.service
systemctl daemon-reload

# Xóa lệnh quản lý
rm -f /usr/local/bin/itdlupanel

# Xóa toàn bộ dữ liệu (CẢNH BÁO: xóa website, database, backup)
rm -rf /ITDLUPanel
```

## Xử Lý Sự Cố

**Panel không khởi động:**
```bash
# Kiểm tra log
journalctl -u itdlupanel -n 50
cat /ITDLUPanel/logs/panel-error.log

# Kiểm tra xung đột cổng
ss -tlnp | grep 8888
```

**Không truy cập được panel:**
```bash
# Kiểm tra tường lửa
ufw status                     # Ubuntu
firewall-cmd --list-ports      # CentOS/Alma

# Kiểm tra service
systemctl status itdlupanel
```

**Đặt lại mật khẩu admin:**
```bash
itdlupanel reset-password -password "MatKhauMoi123!"
itdlupanel restart
```

## Build Từ Mã Nguồn

Trên máy build (cần Go 1.23+ và Node.js 18+):

```bash
cd /path/to/ITDLUPanel
cd publish/v6
bash publish.sh --arch amd64
```

Kết quả: `publish/v6/itdlupanel-v6-linux-amd64.tar.gz`
