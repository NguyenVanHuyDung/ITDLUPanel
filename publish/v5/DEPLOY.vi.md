# ITDLUPanel — Hướng Dẫn Triển Khai

## Tổng Quan

Gói này chứa mọi thứ cần thiết để triển khai ITDLUPanel lên máy chủ mới.

**Phiên bản:** 5.0.0  
**Ngày xuất bản:** 2026-04-28  
**Đường dẫn cài đặt mặc định:** `/ITDLUPanel/server/panel`

## Tính Năng Mới v5

### Docker Auto-Cleanup (Dọn Dẹp Docker Tự Động)
- **Tự động dọn dẹp tài nguyên Docker** — Lên lịch hoặc kích hoạt dọn dẹp: container đã dừng, image dangling, volume không dùng, network không dùng, build cache
- **Ba chế độ kích hoạt**: Thủ công, Lịch Cron (5 trường), Ngưỡng (tự chạy khi disk vượt % cấu hình)
- **Dry-run xem trước** — Xem chính xác những gì sẽ bị xóa và dung lượng ước tính trước khi thực hiện
- **Quản lý rule** — Tạo, sửa, bật/tắt nhiều rule dọn dẹp có tên
- **Nhật ký dọn dẹp** — Lịch sử đầy đủ: dung lượng thu hồi, số mục đã xóa theo danh mục, thời gian chạy, trạng thái
- **Bảng thống kê Disk & Docker** — Tổng quan trực tiếp: disk usage, số image, container, volume, build cache
- **Tích hợp thông báo** — Kết quả dọn dẹp gửi qua Email/Telegram
- **An toàn đồng thời** — Cùng một rule không thể chạy hai lần song song

### Cải Tiến Trình Cài Đặt Phần Mềm
- **Hỗ trợ Ubuntu 24.04 (Noble)** — Trình cài đặt MongoDB, MySQL/MariaDB, Nginx, pgAdmin, PHP tự động fallback về codename được hỗ trợ cho Ubuntu/Debian mới hơn
- **Mapping codename tự động**: noble→jammy, oracular→jammy, mantic→jammy, bookworm→bullseye

### Viết Lại Hệ Thống Thông Báo
- **Giao diện hoàn toàn mới** — Layout dạng card cho channel và rule với thao tác test, sửa inline
- **Subject/body tùy chỉnh** theo từng rule thông báo
- **Form cấu hình channel** — Modal cấu hình SMTP và Telegram rõ ràng hơn

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
scp itdlupanel-v5-linux-amd64.tar.gz root@<server-ip>:/tmp/
```

### 2. Giải nén trên máy chủ đích

```bash
ssh root@<server-ip>
cd /tmp
tar -xzf itdlupanel-v5-linux-amd64.tar.gz
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
tar -xzf itdlupanel-v5-linux-amd64.tar.gz
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
cd publish/v5
bash publish.sh --arch amd64
```

Kết quả: `publish/v5/itdlupanel-v5-linux-amd64.tar.gz`
