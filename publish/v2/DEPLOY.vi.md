# ITDLUPanel — Hướng Dẫn Triển Khai

## Tổng Quan

Gói này chứa mọi thứ cần thiết để triển khai ITDLUPanel lên máy chủ mới.

**Phiên bản:** 2.0.0  
**Ngày xuất bản:** 2026-03-31T07:01:30Z  
**Đường dẫn cài đặt mặc định:** `/ITDLUPanel/server/panel`

## Nội Dung Gói

```
itdlupanel/
├── itdlupanel              # Binary chương trình (Go, tập tin đơn)
├── deploy.sh               # Script triển khai tự động
├── itdlupanel.service      # File unit systemd
├── config/
│   └── panel.json          # Cấu hình mặc định
├── data/                   # Thư mục cơ sở dữ liệu (tự tạo)
├── DEPLOY.md               # Hướng dẫn tiếng Anh
└── DEPLOY.vi.md            # File này
```

## Yêu Cầu Hệ Thống

| Yêu cầu       | Tối thiểu                                    |
| -------------- | --------------------------------------------- |
| Hệ điều hành  | Ubuntu 20.04+ / Debian 11+ / AlmaLinux 8+    |
| RAM            | 512 MB                                        |
| Ổ đĩa         | 1 GB trống                                    |
| Quyền truy cập | Root (sudo)                                  |
| Cổng           | 8888 (mặc định)                              |

## Triển Khai Nhanh

### 1. Chuyển gói sang máy chủ đích

```bash
scp itdlupanel-v2-linux-amd64.tar.gz root@<ip-máy-chủ>:/tmp/
```

### 2. Giải nén trên máy chủ đích

```bash
ssh root@<ip-máy-chủ>
cd /tmp
tar -xzf itdlupanel-v2-linux-amd64.tar.gz
```

### 3. Chạy triển khai

```bash
cd /tmp/itdlupanel
bash deploy.sh
```

Script sẽ tự động:
- Tạo cấu trúc thư mục tại `/ITDLUPanel/`
- Cài binary vào `/ITDLUPanel/server/panel/`
- Tạo JWT secret bảo mật
- Cài đặt và kích hoạt dịch vụ systemd
- Mở cổng trên tường lửa
- Khởi động panel

### 4. Truy cập panel

```
http://<ip-máy-chủ>:8888
Tên đăng nhập: admin
Mật khẩu: admin@123456
```

> ⚠️ **Hãy đổi mật khẩu mặc định ngay sau lần đăng nhập đầu tiên!**

## Tùy Chọn Triển Khai

```bash
# Cổng tùy chỉnh
bash deploy.sh --port 9999

# Cài đặt không khởi động
bash deploy.sh --no-start

# Cập nhật bản cài đặt hiện có (giữ nguyên cấu hình & dữ liệu)
bash deploy.sh --update
```

## Cấu Trúc Thư Mục (Sau Triển Khai)

```
/ITDLUPanel/
├── server/
│   ├── panel/                    # Ứng dụng panel
│   │   ├── itdlupanel           # Binary
│   │   ├── config/panel.json    # Cấu hình
│   │   └── data/panel.db        # Cơ sở dữ liệu SQLite
│   ├── vhost/                   # Cấu hình vhost Nginx/Apache
│   ├── nginx/                   # Symlink Nginx
│   ├── php/                     # Symlink PHP
│   └── mysql/                   # Symlink MySQL
├── backup/                      # Lưu trữ sao lưu
├── logs/                        # Nhật ký panel & lỗi
│   ├── panel.log
│   └── panel-error.log
└── wwwroot/                     # Thư mục gốc website
```

## Lệnh Quản Lý

Sau triển khai, sử dụng lệnh `itdlupanel`:

```bash
itdlupanel start            # Khởi động panel
itdlupanel stop             # Dừng panel
itdlupanel restart          # Khởi động lại panel
itdlupanel status           # Hiển thị trạng thái (PID, cổng, phiên bản)
itdlupanel logs             # Xem nhật ký trực tiếp
itdlupanel version          # Hiển thị phiên bản
itdlupanel reset-password   # Đặt lại mật khẩu admin
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
    "jwt_secret": "<tự-tạo>",
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

Sau khi chỉnh sửa cấu hình, khởi động lại panel:

```bash
itdlupanel restart
```

## Nâng Cấp Từ v1

Để nâng cấp từ v1 lên v2:

1. Chuyển gói v2 sang máy chủ
2. Giải nén và chạy với `--update`:

```bash
tar -xzf itdlupanel-v2-linux-amd64.tar.gz
cd itdlupanel
bash deploy.sh --update
```

Cấu hình và cơ sở dữ liệu sẽ được giữ nguyên. Binary cũ tự động được sao lưu.

## Cập Nhật

Để cập nhật bản cài đặt v2 hiện có:

1. Chuyển gói mới sang máy chủ
2. Giải nén và chạy với `--update`:

```bash
tar -xzf itdlupanel-v2-linux-amd64.tar.gz
cd itdlupanel
bash deploy.sh --update
```

Cấu hình và cơ sở dữ liệu sẽ được giữ nguyên.

## Gỡ Cài Đặt

```bash
# Dừng và vô hiệu hóa dịch vụ
systemctl stop itdlupanel
systemctl disable itdlupanel

# Xóa file dịch vụ
rm -f /etc/systemd/system/itdlupanel.service
systemctl daemon-reload

# Xóa lệnh quản lý
rm -f /usr/local/bin/itdlupanel

# Xóa tất cả dữ liệu (CHÚ Ý: xóa luôn website, cơ sở dữ liệu, sao lưu)
rm -rf /ITDLUPanel
```

## Xử Lý Sự Cố

**Panel không khởi động được:**
```bash
# Kiểm tra nhật ký
journalctl -u itdlupanel -n 50
cat /ITDLUPanel/logs/panel-error.log

# Kiểm tra xung đột cổng
ss -tlnp | grep 8888
```

**Không truy cập được panel:**
```bash
# Kiểm tra tường lửa
ufw status        # Ubuntu
firewall-cmd --list-ports  # CentOS/Alma

# Kiểm tra dịch vụ
systemctl status itdlupanel
```

**Đặt lại mật khẩu admin:**
```bash
itdlupanel reset-password -password "MatKhauMoiBaoMat123!"
itdlupanel restart
```

## Build Từ Mã Nguồn

Trên máy build (yêu cầu Go 1.25+ và Node.js 18+):

```bash
cd /đường-dẫn/đến/ITDLUPanel
cd publish/v2
bash publish.sh --arch amd64
```

Kết quả: `publish/v2/itdlupanel-v2-linux-amd64.tar.gz`
