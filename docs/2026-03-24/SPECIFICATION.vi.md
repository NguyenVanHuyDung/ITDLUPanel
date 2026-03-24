# ITDLUPanel — Đặc Tả Chức Năng

> **Dự án:** ITDLUPanel — Bảng Điều Khiển Quản Lý Máy Chủ Linux  
> **Phát triển bởi:** Đại học Đà Lạt (DLU)  
> **Công nghệ:** Go (backend) + React (frontend)  
> **Ngày:** 2026-03-24  
> **Phiên bản:** 1.0

---

## Mục Lục

1. [Xác Thực & Phân Quyền](#1-xác-thực--phân-quyền)
2. [Bảng Điều Khiển](#2-bảng-điều-khiển)
3. [Quản Lý Website](#3-quản-lý-website)
4. [Quản Lý SSL](#4-quản-lý-ssl)
5. [Quản Lý Cơ Sở Dữ Liệu](#5-quản-lý-cơ-sở-dữ-liệu)
6. [Quản Lý Tập Tin](#6-quản-lý-tập-tin)
7. [Quản Lý FTP](#7-quản-lý-ftp)
8. [Docker](#8-docker)
9. [Kho Ứng Dụng (Phần Mềm)](#9-kho-ứng-dụng-phần-mềm)
10. [Tác Vụ Định Kỳ (Cron)](#10-tác-vụ-định-kỳ-cron)
11. [Tường Lửa](#11-tường-lửa)
12. [Giám Sát](#12-giám-sát)
13. [Bảo Mật](#13-bảo-mật)
14. [Cài Đặt](#14-cài-đặt)
15. [Quản Lý Người Dùng](#15-quản-lý-người-dùng)
16. [Nhật Ký](#16-nhật-ký)
17. [Terminal](#17-terminal)
18. [Quản Lý Tác Vụ](#18-quản-lý-tác-vụ)
19. [Sao Lưu](#19-sao-lưu)
20. [Plugin](#20-plugin)

---

## 1. Xác Thực & Phân Quyền

### 1.1 Đăng Nhập

- **Xác thực tên người dùng/mật khẩu** — form đăng nhập chuẩn với thông tin xác thực.
- **Xác minh 2FA** — xác thực hai yếu tố dựa trên TOTP sử dụng mã 6 chữ số. Người dùng quét mã QR bằng ứng dụng xác thực (Google Authenticator, Authy, v.v.) để đăng ký.
- **Chọn ngôn ngữ** — chuyển đổi giữa Tiếng Anh và Tiếng Việt (`en` / `vi`) trên trang đăng nhập. Lựa chọn được lưu qua localStorage và gửi trong header `Accept-Language`.
- **Token JWT**:
  - Access token: hết hạn sau **15 phút**, gửi dưới dạng `Authorization: Bearer <token>`.
  - Refresh token: hết hạn sau **7 ngày**, lưu trong cookie HTTP-only bảo mật.
  - Xoay vòng token: khi cấp access token mới qua `/auth/refresh` cũng đồng thời xoay vòng refresh token.

### 1.2 RBAC (Kiểm Soát Truy Cập Theo Vai Trò)

Ba vai trò tích hợp sẵn với quyền phân cấp:

| Vai trò    | Mô tả                                               |
| ---------- | ---------------------------------------------------- |
| `admin`    | Toàn quyền truy cập tất cả module và cài đặt.       |
| `operator` | Quyền đọc/ghi trên các module vận hành.              |
| `viewer`   | Chỉ quyền xem; không thể thay đổi bất kỳ tài nguyên nào. |

Phân quyền chi tiết theo module sử dụng ký hiệu wildcard:

- `sites.*` — tất cả thao tác website
- `databases.*` — tất cả thao tác cơ sở dữ liệu
- `files.*` — tất cả thao tác quản lý tập tin
- `docker.*` — tất cả thao tác Docker
- `firewall.*` — tất cả thao tác tường lửa
- `crons.*` — tất cả thao tác tác vụ định kỳ
- `software.*` — tất cả thao tác kho ứng dụng
- `monitor.*` — tất cả thao tác giám sát
- `security.*` — tất cả cài đặt bảo mật
- `settings.*` — tất cả cài đặt panel
- `users.*` — tất cả thao tác quản lý người dùng
- `logs.*` — tất cả thao tác xem nhật ký
- `backups.*` — tất cả thao tác sao lưu
- `plugins.*` — tất cả thao tác plugin
- `terminal.*` — quyền truy cập terminal
- `ftp.*` — tất cả thao tác FTP

### 1.3 API Endpoints

```
POST /api/v1/auth/login          # Xác thực bằng tên người dùng/mật khẩu; trả về cặp JWT
POST /api/v1/auth/refresh         # Làm mới access token sử dụng refresh token cookie
POST /api/v1/auth/2fa/verify      # Gửi mã TOTP 6 chữ số sau khi đăng nhập
POST /api/v1/auth/logout          # Hủy phiên hiện tại và xóa refresh cookie
GET  /api/v1/auth/me              # Trả về thông tin người dùng hiện tại và quyền hạn
PUT  /api/v1/auth/password        # Đổi mật khẩu người dùng hiện tại (yêu cầu mật khẩu cũ)
GET  /api/v1/auth/2fa/qrcode      # Tạo TOTP secret và trả về QR code dạng data URI
POST /api/v1/auth/2fa/enable      # Bật 2FA sau khi xác minh mã TOTP ban đầu
POST /api/v1/auth/2fa/disable     # Tắt 2FA (yêu cầu mã TOTP hiện tại hoặc mật khẩu)
```

---

## 2. Bảng Điều Khiển

### 2.1 Tính Năng

- **Đồng hồ trạng thái hệ thống** — Mức sử dụng CPU, RAM và Load hiển thị dưới dạng vòng tròn. Mỗi đồng hồ có thể nhấp để mở rộng popover với thông tin chi tiết:
  - CPU: mức sử dụng từng lõi, phần trăm steal/iowait.
  - RAM: phân tích used/free/cached/buffers.
  - Load: trung bình 1 phút / 5 phút / 15 phút.
- **Sử dụng đĩa** — bảng các điểm mount hiển thị dung lượng tổng/đã dùng/còn trống, loại hệ thống tập tin, thống kê I/O đọc/ghi, và sử dụng inode (đã dùng/tổng/phần trăm).
- **Thẻ tổng quan** — các thẻ đếm nhanh cho:
  - Website (tổng / đang chạy / đã dừng)
  - Tài khoản FTP (tổng / đang hoạt động)
  - Cơ sở dữ liệu (tổng số)
  - Cảnh báo bảo mật (IP bị chặn, lần đăng nhập thất bại)
- **Lưới phần mềm đã cài** — lưới các gói phần mềm đã cài với chỉ báo trạng thái (đang chạy = xanh, đã dừng = đỏ, chưa cài = xám). Nhấp vào ô phần mềm để chuyển đến trang quản lý.
- **Biểu đồ lưu lượng mạng** — biểu đồ vùng hiển thị băng thông vào/ra trong 30 điểm dữ liệu gần nhất (mỗi phút một điểm mặc định). Tooltip khi di chuột với giá trị chính xác.
- **Modal quản lý Nginx** — modal truy cập nhanh từ bảng điều khiển để khởi động lại/tải lại Nginx, xem trạng thái và số kết nối đang hoạt động.

### 2.2 API Endpoints

```
GET /api/v1/dashboard             # Trả về thông số hệ thống, số lượng tổng quan, thông tin đĩa, thống kê mạng
GET /api/v1/dashboard/software    # Trả về danh sách phần mềm đã cài với tên, phiên bản và trạng thái
```

**Schema phản hồi cho `GET /api/v1/dashboard`:**

```json
{
  "cpu": { "usage": 23.5, "cores": [...] },
  "memory": { "total": 8192, "used": 4096, "free": 2048, "cached": 2048 },
  "load": { "load1": 0.5, "load5": 0.8, "load15": 0.6 },
  "disk": [
    { "mount": "/", "fs": "ext4", "total": 50000, "used": 30000, "free": 20000, "io_read": 1024, "io_write": 512, "inodes_used": 50000, "inodes_total": 500000 }
  ],
  "network": { "points": [...], "rx_rate": 1024, "tx_rate": 512 },
  "overview": { "sites": 5, "ftp": 3, "databases": 8, "security_alerts": 2 },
  "uptime": 86400,
  "hostname": "server01"
}
```

---

## 3. Quản Lý Website

### 3.1 Tính Năng

- **CRUD website** — tạo, xem, cập nhật và xóa cấu hình website. Tạo website sẽ tự động tạo server block Nginx (hoặc Apache vhost / OLS listener), tạo thư mục gốc và thiết lập quyền sở hữu.
- **Quản lý tên miền** — thêm/xóa tên miền và alias cho mỗi website. Chỉ định tên miền chính. Tự động tạo lại cấu hình Nginx khi thay đổi tên miền.
- **Chuyển đổi phiên bản PHP** — chọn phiên bản PHP riêng cho từng website từ các phiên bản PHP đã cài (ví dụ: 7.4, 8.0, 8.1, 8.2, 8.3). Chuyển đổi sẽ cập nhật tham chiếu socket PHP-FPM trong cấu hình web server.
- **Trình sửa cấu hình** — trình soạn thảo Monaco để chỉnh sửa trực tiếp file cấu hình Nginx/Apache/OLS cho website. Tô sáng cú pháp cho cấu hình Nginx. Kiểm tra hợp lệ trước khi lưu để tránh cấu hình bị lỗi.
- **Quản lý SSL** (theo từng website):
  - **Thông tin chứng chỉ hiện tại** — hiển thị nhà phát hành, tên miền, ngày hết hạn và trạng thái hợp lệ.
  - **Let's Encrypt** — cấp chứng chỉ một nhấp qua ACME (thử thách HTTP-01). Tự động gia hạn qua cron.
  - **Tải lên tùy chỉnh** — tải lên chứng chỉ (PEM) và khóa riêng tùy chỉnh.
  - **Kho chứng chỉ** — hiển thị chứng chỉ đang hoạt động và cho phép chuyển đổi giữa các chứng chỉ có sẵn.

### 3.2 API Endpoints

```
GET    /api/v1/sites                    # Liệt kê tất cả website với phân trang và lọc
POST   /api/v1/sites                    # Tạo website mới
GET    /api/v1/sites/:id                # Lấy chi tiết website theo ID
PUT    /api/v1/sites/:id                # Cập nhật cài đặt website (tên, thư mục gốc, v.v.)
DELETE /api/v1/sites/:id                # Xóa website và tùy chọn xóa tập tin
POST   /api/v1/sites/:id/start          # Khởi động/kích hoạt website (bật server block Nginx)
POST   /api/v1/sites/:id/stop           # Dừng/vô hiệu hóa website (tắt server block Nginx)
GET    /api/v1/sites/:id/config         # Lấy cấu hình web server thô của website
PUT    /api/v1/sites/:id/config         # Cập nhật cấu hình web server thô (có kiểm tra hợp lệ)
PUT    /api/v1/sites/:id/php            # Chuyển đổi phiên bản PHP cho website
POST   /api/v1/sites/:id/domains        # Thêm tên miền/alias cho website
DELETE /api/v1/sites/:id/domains/:did   # Xóa tên miền/alias khỏi website
GET    /api/v1/sites/:id/domains        # Liệt kê tất cả tên miền của website
GET    /api/v1/sites/:id/ssl            # Lấy trạng thái SSL/TLS và thông tin chứng chỉ
POST   /api/v1/sites/:id/ssl/enable     # Bật SSL cho website
POST   /api/v1/sites/:id/ssl/disable    # Tắt SSL cho website
POST   /api/v1/sites/:id/ssl/apply      # Áp dụng chứng chỉ cụ thể cho website
GET    /api/v1/sites/php-versions       # Liệt kê tất cả phiên bản PHP khả dụng
```

---

## 4. Quản Lý SSL

### 4.1 Tính Năng

- **Kho chứng chỉ toàn cục** — xem tất cả chứng chỉ SSL trên máy chủ, bao gồm Let's Encrypt, tự ký và chứng chỉ tải lên tùy chỉnh.
- **Cấp Let's Encrypt** — cấp chứng chỉ cho một hoặc nhiều tên miền. Hỗ trợ xác thực thử thách HTTP-01. Tự động cấu hình Nginx cho đường dẫn thử thách.
- **Tải lên chứng chỉ tùy chỉnh** — tải lên chuỗi chứng chỉ mã hóa PEM và khóa riêng. Kiểm tra khớp cặp chứng chỉ/khóa.
- **Gia hạn chứng chỉ** — kích hoạt gia hạn thủ công cho chứng chỉ Let's Encrypt. Hiển thị số ngày đến hạn.
- **SSL Panel** — quản lý chứng chỉ SSL cho chính ITDLUPanel. Tùy chọn: tạo tự ký, tải lên tùy chỉnh.

### 4.2 API Endpoints

```
GET    /api/v1/ssl/certificates          # Liệt kê tất cả chứng chỉ SSL trên máy chủ
GET    /api/v1/ssl/certificates/:domain  # Lấy chi tiết chứng chỉ cho tên miền cụ thể
DELETE /api/v1/ssl/certificates/:domain  # Xóa chứng chỉ cho tên miền cụ thể
POST   /api/v1/ssl/letsencrypt           # Cấp chứng chỉ Let's Encrypt mới
POST   /api/v1/ssl/upload                # Tải lên chứng chỉ và khóa riêng tùy chỉnh
POST   /api/v1/ssl/renew/:domain         # Gia hạn chứng chỉ Let's Encrypt cho tên miền
GET    /api/v1/ssl/panel                 # Lấy thông tin chứng chỉ SSL hiện tại của panel
POST   /api/v1/ssl/panel                 # Tải lên/áp dụng chứng chỉ SSL tùy chỉnh cho panel
POST   /api/v1/ssl/panel/self-signed     # Tạo và áp dụng chứng chỉ tự ký cho panel
```

---

## 5. Quản Lý Cơ Sở Dữ Liệu

### 5.1 Tính Năng

- **Hỗ trợ đa engine** — MySQL, MariaDB và PostgreSQL. Engine được tự động phát hiện dựa trên phần mềm đã cài.
- **CRUD cơ sở dữ liệu** — tạo và xóa cơ sở dữ liệu. Tên cơ sở dữ liệu được kiểm tra hợp lệ (chữ cái, số + dấu gạch dưới).
- **Quản lý người dùng** — mỗi cơ sở dữ liệu có một người dùng liên kết được tạo cùng lúc. Quyền người dùng được giới hạn trong cơ sở dữ liệu của họ.
- **Đổi mật khẩu** — thay đổi mật khẩu cho người dùng cơ sở dữ liệu. Nút "tạo" mật khẩu ngẫu nhiên an toàn.
- **Sao lưu/phục hồi** — sao lưu cơ sở dữ liệu theo yêu cầu (`.sql.gz`) và phục hồi từ file dump đã tải lên.
- **Liên kết phpMyAdmin** — liên kết trực tiếp đến phpMyAdmin trên cổng 888 cho cơ sở dữ liệu MySQL/MariaDB. Xác thực trước qua token khi có thể.
- **Giám sát dung lượng** — xem kích thước cơ sở dữ liệu (dữ liệu + chỉ mục) trong danh sách.

### 5.2 API Endpoints

```
GET    /api/v1/databases              # Liệt kê tất cả cơ sở dữ liệu với dung lượng, engine và thông tin người dùng
POST   /api/v1/databases              # Tạo cơ sở dữ liệu mới và người dùng liên kết
GET    /api/v1/databases/:id          # Lấy chi tiết cơ sở dữ liệu (tên, người dùng, dung lượng, engine, charset)
DELETE /api/v1/databases/:id          # Xóa cơ sở dữ liệu và người dùng liên kết
PUT    /api/v1/databases/:id/password  # Đổi mật khẩu người dùng cơ sở dữ liệu
POST   /api/v1/databases/:id/backup   # Kích hoạt sao lưu cơ sở dữ liệu (trả về URL tải xuống hoặc task ID)
POST   /api/v1/databases/:id/restore  # Phục hồi cơ sở dữ liệu từ file dump đã tải lên
GET    /api/v1/databases/:id/size     # Lấy dung lượng hiện tại (dữ liệu + chỉ mục)
```

---

## 6. Quản Lý Tập Tin

### 6.1 Tính Năng

- **Hai chế độ hiển thị** — chế độ danh sách (bảng) và chế độ lưới (biểu tượng thumbnail). Chuyển đổi qua nút trên thanh công cụ.
- **Điều hướng breadcrumb** — các đoạn đường dẫn có thể nhấp để duyệt thư mục nhanh.
- **Dấu trang** — dấu trang do người dùng định nghĩa cho các đường dẫn thường truy cập. Dấu trang mặc định: `/www/wwwroot`.
- **Thao tác trên thanh công cụ**:
  - Tải lên tập tin (kéo thả + chọn file)
  - Tạo thư mục mới / tập tin mới
  - Tìm kiếm (tìm theo tên tập tin trong thư mục hiện tại)
  - Phím tắt terminal (mở terminal popup `cd` đến đường dẫn hiện tại)
  - Bật/tắt hiển thị tập tin ẩn
- **Bảng tập tin** — các cột: Tên, Kích thước, Ngày sửa đổi, Quyền, Chủ sở hữu. Có thể sắp xếp theo từng cột. Tùy chọn phân trang: 25 / 50 / 100 / 200 mục mỗi trang.
- **Menu ngữ cảnh** — nhấp chuột phải vào tập tin/thư mục: Mở, Sửa, Đổi tên, Sao chép, Di chuyển, Xóa, Tải xuống, Nén, Quyền, Thuộc tính.
- **Trình soạn thảo Monaco** — chỉnh sửa tập tin trực tuyến với tô sáng cú pháp (tự động phát hiện theo phần mở rộng). Lưu bằng `Ctrl+S`.
- **Terminal popup** — terminal nhúng mở sẵn tại đường dẫn hiện tại của trình quản lý tập tin.
- **Tải lên kéo thả** — kéo tập tin/thư mục vào danh sách để tải lên. Chỉ báo tiến trình cho từng tập tin.
- **Nén/giải nén** — hỗ trợ định dạng `.zip`, `.tar`, `.tar.gz`. Nén các tập tin/thư mục đã chọn. Giải nén kho lưu trữ tại chỗ hoặc đến đường dẫn chỉ định.
- **Tải xuống từ xa** — tải tập tin từ URL trực tiếp về máy chủ. Hiển thị tiến trình.
- **Thao tác hàng loạt** — chọn nhiều tập tin qua ô chọn để xóa, di chuyển, sao chép, nén, thay đổi quyền hàng loạt.
- **Quản lý quyền/chủ sở hữu** — hộp thoại chmod và chown với ký hiệu số (ví dụ: `755`) và ký hiệu ký tự (rwxr-xr-x). Tùy chọn đệ quy cho thư mục.
- **Tìm kiếm nội dung tập tin** — tìm kiếm trong nội dung tập tin (kiểu grep) xuyên suốt cây thư mục.
- **Chỉ báo đang tải** — spinner/lớp phủ tiến trình cho các thao tác chạy lâu (tải lên lớn, nén, tải xuống từ xa).

### 6.2 API Endpoints

```
GET    /api/v1/files                  # Liệt kê nội dung thư mục (query: path, page, per_page, sort, show_hidden)
GET    /api/v1/files/content          # Lấy nội dung tập tin dạng văn bản (query: path, encoding)
PUT    /api/v1/files/content          # Lưu nội dung tập tin (body: path, content, encoding)
POST   /api/v1/files/upload           # Tải lên tập tin qua multipart form (body: path, files[])
GET    /api/v1/files/download         # Tải xuống tập tin (query: path; trả về file stream)
POST   /api/v1/files/mkdir            # Tạo thư mục mới (body: path)
POST   /api/v1/files/create           # Tạo tập tin trống mới (body: path)
POST   /api/v1/files/rename           # Đổi tên tập tin hoặc thư mục (body: old_path, new_path)
POST   /api/v1/files/copy             # Sao chép tập tin/thư mục (body: sources[], destination)
POST   /api/v1/files/move             # Di chuyển tập tin/thư mục (body: sources[], destination)
DELETE /api/v1/files                  # Xóa tập tin/thư mục (body: paths[])
PUT    /api/v1/files/permissions      # Thay đổi quyền tập tin (body: path, mode, recursive)
PUT    /api/v1/files/owner            # Thay đổi chủ sở hữu/nhóm (body: path, owner, group, recursive)
POST   /api/v1/files/compress         # Nén tập tin (body: paths[], destination, format)
POST   /api/v1/files/decompress       # Giải nén kho lưu trữ (body: path, destination)
GET    /api/v1/files/search           # Tìm kiếm tên tập tin (query: path, keyword)
GET    /api/v1/files/search-content   # Tìm kiếm trong nội dung tập tin (query: path, keyword, extensions)
POST   /api/v1/files/calculate-size   # Tính tổng kích thước tập tin/thư mục (body: paths[])
POST   /api/v1/files/remote-download  # Tải tập tin từ URL về máy chủ (body: url, destination)
```

---

## 7. Quản Lý FTP

### 7.1 Tính Năng

- **CRUD tài khoản FTP** — tạo, xem, cập nhật và xóa tài khoản người dùng FTP. Dựa trên người dùng ảo Pure-FTPd.
- **Thư mục gốc** — mỗi người dùng FTP được chroot-jail vào thư mục gốc được chỉ định.
- **Quản lý mật khẩu** — đổi mật khẩu người dùng FTP. Chỉ báo độ mạnh mật khẩu.
- **Bật/tắt** — chuyển đổi trạng thái hoạt động/không hoạt động của tài khoản FTP mà không cần xóa.
- **Tổng quan trạng thái** — liệt kê tất cả tài khoản FTP với tên người dùng, thư mục gốc, trạng thái (hoạt động/không hoạt động) và hạn mức đĩa.

### 7.2 API Endpoints

```
GET    /api/v1/ftp                # Liệt kê tất cả tài khoản FTP
POST   /api/v1/ftp                # Tạo tài khoản FTP mới (body: username, password, home_dir)
GET    /api/v1/ftp/:id            # Lấy chi tiết tài khoản FTP
PUT    /api/v1/ftp/:id            # Cập nhật cài đặt tài khoản FTP (home_dir, quota)
DELETE /api/v1/ftp/:id            # Xóa tài khoản FTP
PUT    /api/v1/ftp/:id/password   # Đổi mật khẩu tài khoản FTP
PUT    /api/v1/ftp/:id/status     # Bật hoặc tắt tài khoản FTP (body: enabled)
```

---

## 8. Docker

### 8.1 Tính Năng

- **Phát hiện Docker** — khi Docker chưa được cài đặt, hiển thị banner cảnh báo với nút "Cài đặt Docker" một nhấp kích hoạt tác vụ cài đặt nền.
- **Quản lý container**:
  - Liệt kê tất cả container (đang chạy, đã dừng, tạm dừng) với tên, image, trạng thái, cổng và ngày tạo.
  - Khởi động / dừng / khởi động lại container.
  - Xóa container (với tùy chọn dọn dẹp volume).
  - Xem nhật ký container (tail với tùy chọn follow).
  - Xem thống kê tài nguyên container (CPU%, bộ nhớ, I/O mạng, I/O đĩa).
- **Quản lý image**:
  - Liệt kê tất cả image cục bộ với repository, tag, kích thước và ngày tạo.
  - Kéo image từ Docker Hub (với chỉ định tag).
  - Xóa image không sử dụng.
- **Thông tin hệ thống** — phiên bản Docker engine, storage driver, số lượng container/image, sử dụng đĩa.
- **Mạng & volume** — xem mạng Docker và volume (chỉ đọc).

### 8.2 API Endpoints

```
GET    /api/v1/docker/info                  # Thông tin hệ thống Docker và phiên bản
GET    /api/v1/docker/containers            # Liệt kê tất cả container (query: all, filters)
POST   /api/v1/docker/containers            # Tạo và khởi động container mới
GET    /api/v1/docker/containers/:id        # Lấy chi tiết container (inspect)
DELETE /api/v1/docker/containers/:id        # Xóa container (query: force, volumes)
POST   /api/v1/docker/containers/:id/start   # Khởi động container đã dừng
POST   /api/v1/docker/containers/:id/stop    # Dừng container đang chạy (query: timeout)
POST   /api/v1/docker/containers/:id/restart # Khởi động lại container
GET    /api/v1/docker/containers/:id/logs    # Lấy nhật ký container (query: tail, since, follow)
GET    /api/v1/docker/containers/:id/stats   # Lấy thống kê tài nguyên container (stream hoặc snapshot)
GET    /api/v1/docker/images                 # Liệt kê tất cả image cục bộ
POST   /api/v1/docker/images/pull            # Kéo image (body: image, tag)
DELETE /api/v1/docker/images/:id             # Xóa image cục bộ (query: force)
GET    /api/v1/docker/networks               # Liệt kê mạng Docker
GET    /api/v1/docker/volumes                # Liệt kê volume Docker
```

---

## 9. Kho Ứng Dụng (Phần Mềm)

### 9.1 Tính Năng

- **Ba tab**:
  - **Đã cài đặt** — phần mềm hiện đang cài trên máy chủ, với phiên bản và trạng thái.
  - **Có sẵn** — phần mềm có thể cài từ kho ITDLUPanel.
  - **Stack** — bộ phần mềm được cấu hình sẵn để triển khai một nhấp.
- **Chọn phiên bản** — khi cài đặt, người dùng có thể chọn phiên bản cụ thể từ các phiên bản có sẵn.
- **Tiến trình cài đặt** — các lần cài đặt chạy dưới dạng tác vụ nền trong hàng đợi. Tiến trình thời gian thực qua WebSocket.
- **Quản lý dịch vụ** — khởi động, dừng, khởi động lại dịch vụ phần mềm đã cài trực tiếp từ giao diện.
- **Trình sửa cấu hình** — trình soạn thảo Monaco để chỉnh sửa file cấu hình phần mềm (ví dụ: `nginx.conf`, `my.cnf`, `php.ini`). Tô sáng cú pháp theo loại cấu hình.
- **Modal quản lý Nginx** — modal truy cập nhanh cho các thao tác Nginx: khởi động lại, tải lại, kiểm tra cấu hình, xem kết nối đang hoạt động.

### 9.2 Stack Được Định Nghĩa Sẵn

| Stack | Thành phần                        |
| ----- | --------------------------------- |
| LEMP  | Nginx + MySQL + PHP               |
| LOMP  | OpenLiteSpeed + MySQL + PHP       |
| LAMP  | Apache + MySQL + PHP              |

### 9.3 Phần Mềm Được Hỗ Trợ

| Phần mềm       | Ghi chú                                            |
| --------------- | --------------------------------------------------- |
| Nginx           | Web server / reverse proxy                          |
| Apache          | HTTP server (mod_php hoặc PHP-FPM)                  |
| OpenLiteSpeed   | Web server hiệu suất cao                           |
| PHP             | Nhiều phiên bản đồng thời (7.4–8.3+)               |
| MySQL           | Cơ sở dữ liệu quan hệ                             |
| Redis           | Kho dữ liệu trong bộ nhớ / cache                   |
| Pure-FTPd       | Máy chủ FTP để truyền tập tin                      |
| phpMyAdmin      | Quản trị MySQL/MariaDB qua web (cổng 888)           |

### 9.4 API Endpoints

```
GET    /api/v1/software                        # Liệt kê tất cả phần mềm (đã cài + có sẵn)
POST   /api/v1/software/install                # Cài đặt gói phần mềm (body: name, version)
POST   /api/v1/software/install-stack          # Cài đặt stack đầy đủ (body: stack_name, options)
DELETE /api/v1/software/:name                  # Gỡ cài đặt gói phần mềm
POST   /api/v1/software/:name/start            # Khởi động dịch vụ phần mềm
POST   /api/v1/software/:name/stop             # Dừng dịch vụ phần mềm
POST   /api/v1/software/:name/restart          # Khởi động lại dịch vụ phần mềm
GET    /api/v1/software/:name/status           # Lấy trạng thái dịch vụ (đang chạy/đã dừng/chưa cài)
GET    /api/v1/software/:name/config           # Lấy nội dung file cấu hình phần mềm
PUT    /api/v1/software/:name/config           # Cập nhật file cấu hình phần mềm
POST   /api/v1/software/:name/reload           # Tải lại cấu hình phần mềm không cần khởi động lại
GET    /api/v1/software/:name/metrics          # Lấy thông số phần mềm (kết nối, bộ nhớ, v.v.)
GET    /api/v1/software/:name/error-log        # Lấy nhật ký lỗi gần đây của phần mềm
GET    /api/v1/software/:name/optimization     # Lấy tham số tối ưu hóa hiện tại
PUT    /api/v1/software/:name/optimization     # Áp dụng tham số tối ưu hóa
```

---

## 10. Tác Vụ Định Kỳ (Cron)

### 10.1 Tính Năng

- **CRUD tác vụ** — tạo, xem, cập nhật và xóa tác vụ cron. Mỗi tác vụ bao gồm lịch trình và lệnh thực thi.
- **Trình tạo lịch trình trực quan** — giao diện tương tác để chọn:
  - Phút (0–59, hoặc `*`)
  - Giờ (0–23, hoặc `*`)
  - Ngày trong tháng (1–31, hoặc `*`)
  - Tháng (1–12, hoặc `*`)
  - Ngày trong tuần (0–6, hoặc `*`)
  - Mẫu phổ biến: mỗi phút, hàng giờ, hàng ngày, hàng tuần, hàng tháng.
- **Biểu thức cron tùy chỉnh** — chế độ nâng cao để nhập biểu thức cron thô (ví dụ: `*/5 * * * *`).
- **Tab mẫu** — các mẫu tác vụ cron sẵn có cho các tác vụ phổ biến: sao lưu cơ sở dữ liệu, xóa cache, xoay vòng nhật ký, cập nhật chứng chỉ SSL.
- **Chạy ngay** — kích hoạt thực thi ngay lập tức cho một tác vụ cron.
- **Bật/tắt** — chuyển đổi trạng thái hoạt động/không hoạt động của tác vụ mà không cần xóa.
- **Nhật ký thực thi** — nhật ký mỗi lần chạy của tác vụ với thời gian, mã thoát, đầu ra stdout/stderr và thời lượng.

### 10.2 API Endpoints

```
GET    /api/v1/crons              # Liệt kê tất cả tác vụ cron
POST   /api/v1/crons              # Tạo tác vụ cron mới (body: schedule, command, name)
GET    /api/v1/crons/:id          # Lấy chi tiết tác vụ cron
PUT    /api/v1/crons/:id          # Cập nhật tác vụ cron (schedule, command, name)
DELETE /api/v1/crons/:id          # Xóa tác vụ cron
PUT    /api/v1/crons/:id/status   # Bật hoặc tắt tác vụ cron (body: enabled)
GET    /api/v1/crons/:id/log      # Lấy nhật ký thực thi tác vụ cron (query: limit, offset)
POST   /api/v1/crons/:id/run      # Kích hoạt thực thi ngay lập tức tác vụ cron
```

---

## 11. Tường Lửa

### 11.1 Tính Năng

- **Quy tắc cổng** — quản lý quy tắc tường lửa theo số cổng. Chỉ định cổng, giao thức (TCP/UDP/cả hai), hướng (vào/ra) và hành động (cho phép/từ chối). Hỗ trợ dải cổng (ví dụ: `8000-9000`).
- **Quy tắc IP** — cho phép hoặc chặn lưu lượng từ địa chỉ IP hoặc dải CIDR cụ thể.
- **IP bị chặn** — chế độ xem riêng cho các IP trong danh sách đen. Thêm/xóa IP thủ công. Hiển thị nguồn (thủ công, Fail2ban).
- **Cổng đang lắng nghe** — danh sách thời gian thực các cổng đang sử dụng với tên tiến trình và PID liên kết.
- **Bật/tắt toàn cục** — công tắc chính để bật hoặc tắt toàn bộ tường lửa.
- **Chặn ICMP** — tùy chọn chặn yêu cầu ICMP (ping).
- **Thao tác hàng loạt** — chọn nhiều quy tắc để bật/tắt/xóa hàng loạt.

### 11.2 API Endpoints

```
GET    /api/v1/firewall/rules              # Liệt kê tất cả quy tắc tường lửa
POST   /api/v1/firewall/rules              # Tạo quy tắc tường lửa mới (body: port, protocol, direction, action, source_ip)
DELETE /api/v1/firewall/rules/:id          # Xóa quy tắc tường lửa
PUT    /api/v1/firewall/rules/:id/status   # Bật hoặc tắt quy tắc (body: enabled)
GET    /api/v1/firewall/settings           # Lấy cài đặt toàn cục tường lửa (enabled, icmp_block, v.v.)
PUT    /api/v1/firewall/settings           # Cập nhật cài đặt toàn cục tường lửa
GET    /api/v1/firewall/port-status        # Liệt kê các cổng đang lắng nghe với thông tin tiến trình
GET    /api/v1/firewall/blocked-ips        # Liệt kê tất cả địa chỉ IP bị chặn
POST   /api/v1/firewall/blocked-ips        # Chặn một địa chỉ IP (body: ip, reason)
DELETE /api/v1/firewall/blocked-ips        # Bỏ chặn một địa chỉ IP (body: ip)
```

---

## 12. Giám Sát

### 12.1 Tính Năng

- **Biểu đồ lịch sử** — biểu đồ chuỗi thời gian cho CPU, RAM, đĩa và thông số mạng. Xây dựng bằng thư viện biểu đồ (Recharts).
- **Bộ chọn khoảng thời gian** — chuyển đổi giữa 1 ngày, 7 ngày và 30 ngày dữ liệu lịch sử.
- **Bảng tiến trình** — danh sách thời gian thực các tiến trình đang chạy với các cột: PID, Tên, Người dùng, CPU%, RAM%, Lệnh. Có thể sắp xếp theo bất kỳ cột nào. Tìm kiếm/lọc theo tên.
- **Dừng tiến trình** — chọn tiến trình và gửi tín hiệu kill (SIGTERM hoặc SIGKILL).
- **Thông số WebSocket thời gian thực** — thông số cập nhật trực tiếp qua WebSocket cho đồng hồ và biểu đồ bảng điều khiển. Đẩy dữ liệu mỗi 2 giây.

### 12.2 API Endpoints

```
GET    /api/v1/monitor/system              # Ảnh chụp thông số hệ thống hiện tại (CPU, RAM, swap, load)
GET    /api/v1/monitor/processes           # Liệt kê tiến trình đang chạy (query: sort_by, order, search)
POST   /api/v1/monitor/processes/kill      # Dừng tiến trình (body: pid, signal)
GET    /api/v1/monitor/services            # Liệt kê dịch vụ systemd và trạng thái
GET    /api/v1/monitor/network             # Thống kê giao diện mạng hiện tại (rx/tx bytes, packets, errors)
GET    /api/v1/monitor/disk                # Sử dụng đĩa và thống kê I/O theo điểm mount
GET    /api/v1/monitor/history             # Thông số lịch sử (query: metric, range)
DELETE /api/v1/monitor/history             # Xóa dữ liệu thông số lịch sử (query: before_date)
GET    /api/v1/monitor/settings            # Lấy cài đặt giám sát (khoảng thu thập, thời gian giữ)
PUT    /api/v1/monitor/settings            # Cập nhật cài đặt giám sát
WS     /api/v1/monitor/realtime            # Luồng WebSocket cho thông số hệ thống thời gian thực
```

---

## 13. Bảo Mật

### 13.1 Tính Năng

- **Cấu hình SSH**:
  - Thay đổi cổng SSH (mặc định: 22).
  - Bật/tắt đăng nhập root (`PermitRootLogin`).
  - Bật/tắt xác thực bằng mật khẩu (`PasswordAuthentication`).
  - Đặt số lần xác thực tối đa (`MaxAuthTries`).
  - Đặt thời gian chờ đăng nhập (`LoginGraceTime`).
  - Các thay đổi được áp dụng bằng cách ghi lại `/etc/ssh/sshd_config` và khởi động lại sshd.
- **Quản lý Fail2ban**:
  - Bật/tắt dịch vụ Fail2ban.
  - Cấu hình thời gian cấm (giây).
  - Cấu hình giới hạn thử lại tối đa trước khi cấm.
  - Cấu hình thời gian tìm kiếm (cửa sổ quan sát).
  - Quản lý danh sách IP trắng (IP không bao giờ bị cấm).
  - Xem các IP đang bị cấm với lý do và thời gian hết hạn.

### 13.2 API Endpoints

```
GET    /api/v1/security/ssh        # Lấy cấu hình SSH hiện tại
PUT    /api/v1/security/ssh        # Cập nhật cấu hình SSH (body: port, root_login, password_auth, max_attempts, timeout)
GET    /api/v1/security/fail2ban   # Lấy cấu hình và trạng thái Fail2ban
PUT    /api/v1/security/fail2ban   # Cập nhật cấu hình Fail2ban (body: enabled, ban_time, max_retry, find_time, whitelist)
```

---

## 14. Cài Đặt

### 14.1 Tính Năng

- **Cài đặt chung**:
  - Cổng panel — thay đổi cổng lắng nghe của ITDLUPanel (mặc định: 8443).
  - Đường dẫn quản trị — tùy chỉnh tiền tố đường dẫn URL (ví dụ: `/admin` → `/custom-path`).
  - Ngôn ngữ — đặt ngôn ngữ mặc định cho panel (Tiếng Anh / Tiếng Việt).
- **SSL Panel**:
  - Xem thông tin chứng chỉ hiện tại (nhà phát hành, hạn, tên miền).
  - Tạo chứng chỉ tự ký cho panel.
  - Tải lên chứng chỉ tùy chỉnh cho panel.
- **Thông tin panel**:
  - Phiên bản ITDLUPanel.
  - Hệ điều hành và phiên bản kernel.
  - Thời gian hoạt động máy chủ.
  - Phiên bản Go runtime.
- **Vùng nguy hiểm**:
  - Đặt lại cài đặt panel về mặc định.
  - Gỡ cài đặt ITDLUPanel (xóa panel nhưng giữ website/cơ sở dữ liệu).
  - Sao lưu cấu hình và dữ liệu panel.
  - Phục hồi panel từ bản sao lưu.
  - Xóa tất cả nhật ký panel.

### 14.2 API Endpoints

```
GET    /api/v1/settings               # Lấy tất cả cài đặt panel
PUT    /api/v1/settings               # Cập nhật cài đặt panel (hàng loạt)
PUT    /api/v1/settings/panel-port    # Thay đổi cổng lắng nghe panel (body: port)
PUT    /api/v1/settings/panel-ssl     # Tải lên/cập nhật chứng chỉ SSL panel
GET    /api/v1/settings/panel-info    # Lấy phiên bản panel, thông tin OS, thời gian hoạt động, runtime
PUT    /api/v1/settings/admin-path    # Thay đổi tiền tố đường dẫn quản trị (body: path)
PUT    /api/v1/settings/language      # Thay đổi ngôn ngữ mặc định (body: language)
```

---

## 15. Quản Lý Người Dùng

### 15.1 Tính Năng

- **CRUD người dùng** — tạo, cập nhật và xóa tài khoản người dùng panel.
- **Gán vai trò** — gán một trong ba vai trò (`admin`, `operator`, `viewer`) cho mỗi người dùng. Vai trò xác định phạm vi quyền.
- **Đặt lại mật khẩu** — quản trị viên có thể đặt lại mật khẩu cho bất kỳ người dùng nào. Yêu cầu độ phức tạp mật khẩu (tối thiểu 8 ký tự, chữ hoa/thường, số, ký tự đặc biệt).
- **Bật/tắt** — vô hiệu hóa tài khoản người dùng mà không cần xóa. Người dùng bị vô hiệu hóa không thể đăng nhập.
- **Thao tác hàng loạt** — chọn nhiều người dùng để thay đổi vai trò, bật/tắt hoặc xóa hàng loạt.

### 15.2 API Endpoints

```
GET    /api/v1/users                # Liệt kê tất cả người dùng panel (query: page, per_page, search, role)
POST   /api/v1/users                # Tạo người dùng panel mới (body: username, password, email, role)
PUT    /api/v1/users/:id            # Cập nhật thông tin người dùng (body: email, role, enabled)
PUT    /api/v1/users/:id/password   # Đặt lại mật khẩu người dùng (body: new_password)
DELETE /api/v1/users/:id            # Xóa người dùng panel
```

---

## 16. Nhật Ký

### 16.1 Tính Năng

- **Nhật ký panel** — nhật ký ứng dụng ITDLUPanel dạng JSON. Lọc theo mức nhật ký (debug, info, warn, error, fatal). Tìm kiếm theo nội dung tin nhắn. Tùy chọn tự động làm mới.
- **Nhật ký SSH** — nhật ký xác thực SSH đã phân tích hiển thị lần đăng nhập, IP nguồn, tên người dùng và trạng thái thành công/thất bại.
- **Nhật ký kiểm toán** — ghi lại tất cả hành động người dùng trong panel (ai đã làm gì, khi nào). Bao gồm: người dùng, hành động, tài nguyên, thời gian, địa chỉ IP, kết quả. Xuất được ra CSV.
- **Nhật ký website** — nhật ký truy cập và lỗi theo từng website. Nhật ký truy cập hiển thị phương thức yêu cầu, URL, mã trạng thái, kích thước phản hồi, referrer, user agent. Nhật ký lỗi hiển thị thông báo lỗi với thời gian.

### 16.2 API Endpoints

```
GET    /api/v1/logs/panel                # Lấy nhật ký ứng dụng panel (query: level, search, limit, offset)
GET    /api/v1/logs/website/:id/access   # Lấy nhật ký truy cập website (query: limit, offset, search)
GET    /api/v1/logs/website/:id/error    # Lấy nhật ký lỗi website (query: limit, offset, search)
GET    /api/v1/logs/ssh                  # Lấy nhật ký xác thực SSH (query: limit, offset)
GET    /api/v1/logs/audit                # Lấy nhật ký kiểm toán (query: user, action, resource, from, to, limit, offset)
DELETE /api/v1/logs/:type                # Xóa nhật ký theo loại (panel, ssh, audit)
GET    /api/v1/logs/search               # Tìm kiếm toàn văn bản qua tất cả loại nhật ký (query: keyword, types[], from, to)
```

---

## 17. Terminal

### 17.1 Tính Năng

- **Phiên terminal đa tab** — mở nhiều tab terminal đồng thời. Mỗi tab là một phiên shell độc lập.
- **xterm.js** — trình giả lập terminal đầy đủ tính năng trong trình duyệt sử dụng xterm.js với WebGL renderer để tăng hiệu suất.
- **Tự động thay đổi kích thước** — kích thước terminal tự động điều chỉnh theo cửa sổ/container trình duyệt. Gửi SIGWINCH đến PTY.
- **Lịch sử cuộn** — bộ đệm cuộn có thể cấu hình (mặc định: 5000 dòng).
- **Toàn màn hình** — chế độ toàn màn hình để sử dụng terminal không bị phân tâm.
- **Dựa trên WebSocket** — I/O terminal được truyền qua kết nối WebSocket. Token JWT truyền qua tham số query để xác thực.
- **Duy trì phiên** — phiên terminal hoạt động khi tab trình duyệt mở. Tự động kết nối lại khi ngắt kết nối ngắn.

### 17.2 API Endpoints

```
WS /api/v1/terminal?token=<JWT>    # Endpoint WebSocket cho phiên terminal
```

**Giao thức thông điệp WebSocket:**

| Hướng    | Loại     | Payload                                |
| -------- | -------- | -------------------------------------- |
| Client→  | `input`  | `{ "type": "input", "data": "ls\n" }` |
| Client→  | `resize` | `{ "type": "resize", "cols": 80, "rows": 24 }` |
| →Client  | `output` | `{ "type": "output", "data": "..." }` |
| →Client  | `exit`   | `{ "type": "exit", "code": 0 }`       |

---

## 18. Quản Lý Tác Vụ

### 18.1 Tính Năng

- **Hàng đợi tác vụ** — hệ thống thực thi tác vụ nền cho các thao tác chạy lâu (cài đặt phần mềm, sao lưu, thao tác hàng loạt).
- **Theo dõi trạng thái tác vụ** — mỗi tác vụ có trạng thái: `pending` (đang chờ), `running` (đang chạy), `completed` (hoàn thành), `failed` (thất bại), `cancelled` (đã hủy).
- **Nhật ký tác vụ** — đầu ra nhật ký thời gian thực cho mỗi tác vụ, có thể truyền qua polling hoặc WebSocket.
- **Tóm tắt tác vụ** — đếm tổng quan theo trạng thái (ví dụ: 3 đang chạy, 5 hoàn thành, 1 thất bại).
- **Dọn dẹp tác vụ** — xóa các tác vụ đã hoàn thành/thất bại khỏi lịch sử.

### 18.2 API Endpoints

```
GET    /api/v1/tasks              # Liệt kê tất cả tác vụ (query: status, page, per_page)
GET    /api/v1/tasks/summary      # Lấy tóm tắt số lượng tác vụ theo trạng thái
GET    /api/v1/tasks/:id          # Lấy chi tiết tác vụ (name, status, progress, created_at, started_at, finished_at)
GET    /api/v1/tasks/:id/log      # Lấy đầu ra nhật ký tác vụ (query: offset; hỗ trợ streaming)
DELETE /api/v1/tasks/:id          # Xóa tác vụ đã hoàn thành/thất bại khỏi lịch sử
```

---

## 19. Sao Lưu

### 19.1 Tính Năng

- **Sao lưu toàn hệ thống** — tạo bản sao lưu tất cả dữ liệu panel, cấu hình website, cơ sở dữ liệu và chứng chỉ SSL.
- **Sao lưu có chọn lọc** — chọn thành phần cần bao gồm (website, cơ sở dữ liệu, SSL, cài đặt panel).
- **Lên lịch sao lưu** — (qua Tác Vụ Cron) lên lịch sao lưu tự động.
- **Phục hồi** — phục hồi từ file sao lưu. Hỗ trợ phục hồi có chọn lọc từng thành phần riêng lẻ.
- **Tải xuống** — tải file sao lưu trực tiếp từ panel.
- **Quản lý sao lưu** — liệt kê, xem chi tiết và xóa các bản sao lưu cũ. Hiển thị kích thước và ngày tạo bản sao lưu.

### 19.2 API Endpoints

```
GET    /api/v1/backups                  # Liệt kê tất cả bản sao lưu (query: page, per_page)
POST   /api/v1/backups                  # Tạo bản sao lưu mới (body: components[], description)
GET    /api/v1/backups/:id              # Lấy chi tiết bản sao lưu (components, size, status, created_at)
DELETE /api/v1/backups/:id              # Xóa file sao lưu
POST   /api/v1/backups/:id/restore     # Phục hồi từ bản sao lưu (body: components[])
GET    /api/v1/backups/:id/download     # Tải xuống file sao lưu
```

---

## 20. Plugin

### 20.1 Tính Năng

- **Hệ thống plugin** — kiến trúc mở rộng cho phép plugin bên thứ ba thêm trang, API endpoint và tính năng mới cho ITDLUPanel.
- **Kho plugin** — duyệt và cài đặt plugin từ kho plugin ITDLUPanel.
- **Quản lý plugin** — bật/tắt plugin đã cài mà không cần gỡ cài đặt. Xem thông tin plugin (tên, phiên bản, tác giả, mô tả).
- **Cấu hình plugin** — trang cài đặt riêng cho từng plugin được render từ schema cấu hình do plugin định nghĩa.
- **Vòng đời plugin** — cài đặt, kích hoạt, vô hiệu hóa, gỡ cài đặt. Plugin có thể hook vào các sự kiện panel (tạo website, hoàn thành sao lưu, v.v.).

### 20.2 API Endpoints

```
GET    /api/v1/plugins                    # Liệt kê plugin đã cài với trạng thái
GET    /api/v1/plugins/store              # Duyệt plugin có sẵn trong kho
POST   /api/v1/plugins/:name/install      # Cài đặt plugin từ kho
DELETE /api/v1/plugins/:name              # Gỡ cài đặt plugin
PUT    /api/v1/plugins/:name/status       # Bật hoặc tắt plugin (body: enabled)
GET    /api/v1/plugins/:name/config       # Lấy cấu hình plugin
PUT    /api/v1/plugins/:name/config       # Cập nhật cấu hình plugin
```

---

## Phụ Lục A: Quy Ước API Chung

### URL Gốc

```
https://<server-ip>:<panel-port>/api/v1/
```

### Xác Thực

Tất cả API endpoint (trừ `/auth/login` và `/auth/refresh`) yêu cầu access token JWT hợp lệ:

```
Authorization: Bearer <access_token>
```

### Định Dạng Phản Hồi Chuẩn

**Thành công:**

```json
{
  "success": true,
  "data": { ... },
  "message": "Thao tác hoàn thành thành công"
}
```

**Lỗi:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu đầu vào không hợp lệ",
    "details": [ ... ]
  }
}
```

### Phân Trang

Các endpoint danh sách hỗ trợ phân trang qua tham số query:

```
?page=1&per_page=25
```

Phản hồi bao gồm metadata phân trang:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 25,
    "total": 150,
    "total_pages": 6
  }
}
```

### Mã Trạng Thái HTTP

| Mã  | Ý nghĩa                                |
| --- | --------------------------------------- |
| 200 | Thành công                              |
| 201 | Đã tạo                                 |
| 204 | Không có nội dung (xóa thành công)      |
| 400 | Yêu cầu không hợp lệ / Lỗi kiểm tra   |
| 401 | Chưa xác thực (token không hợp lệ/hết hạn) |
| 403 | Bị cấm (không đủ quyền)                |
| 404 | Không tìm thấy                         |
| 409 | Xung đột (tài nguyên đã tồn tại)       |
| 422 | Không thể xử lý thực thể               |
| 429 | Quá nhiều yêu cầu (bị giới hạn tốc độ) |
| 500 | Lỗi máy chủ nội bộ                     |

### Giới Hạn Tốc Độ

- Endpoint đăng nhập: **5 yêu cầu mỗi phút** mỗi IP.
- Endpoint API: **60 yêu cầu mỗi phút** mỗi người dùng.
- Tải lên tập tin: **10 yêu cầu mỗi phút** mỗi người dùng.

---

## Phụ Lục B: Endpoint WebSocket

| Endpoint                       | Mục đích                              | Xác thực          |
| ------------------------------ | ------------------------------------- | ------------------ |
| `/api/v1/terminal?token=<JWT>` | Phiên terminal tương tác              | JWT tham số query  |
| `/api/v1/monitor/realtime`     | Luồng thông số hệ thống thời gian thực | JWT tham số query  |

---

## Phụ Lục C: Công Nghệ Sử Dụng

| Thành phần         | Công nghệ                              |
| ------------------- | --------------------------------------- |
| Backend             | Go (Gin framework)                      |
| Frontend            | React + TypeScript                      |
| Thư viện UI         | Ant Design / Tailwind CSS               |
| Trình soạn thảo     | Monaco Editor                           |
| Terminal            | xterm.js                                |
| Biểu đồ            | Recharts                                |
| Quản lý trạng thái  | Zustand                                 |
| Công cụ build       | Vite                                    |
| Cơ sở dữ liệu      | SQLite (dữ liệu panel)                 |
| Xác thực            | JWT (HS256)                             |
| Đa ngôn ngữ         | react-i18next (Tiếng Anh + Tiếng Việt) |
| WebSocket           | gorilla/websocket                       |
| Quản lý tiến trình  | Tích hợp systemd                        |
| SSL/TLS             | ACME (Let's Encrypt)                    |

---

*Tài liệu đặc tả này được duy trì bởi đội ngũ phát triển ITDLU. Mọi câu hỏi hoặc đóng góp, vui lòng liên hệ nhóm quản lý dự án ITDLUPanel.*
