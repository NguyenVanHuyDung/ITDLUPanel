# ITDLUPanel — Bảng Điều Khiển Quản Lý Máy Chủ Linux

[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-University_Project-blue)](#giấy-phép)

Bảng điều khiển quản lý máy chủ Linux mã nguồn mở được phát triển bởi **Đại học Đà Lạt (DLU)**. ITDLUPanel cung cấp giao diện web hiện đại, tích hợp toàn diện để quản lý máy chủ Ubuntu/Debian — từ lưu trữ website, quản trị cơ sở dữ liệu đến Docker container và tăng cường bảo mật.

---

## Tổng quan

- **Triển khai tệp nhị phân duy nhất** — Backend Go tích hợp sẵn frontend React; không yêu cầu runtime bên ngoài
- **Cơ sở dữ liệu SQLite** — lưu trữ dữ liệu không cần cấu hình ở chế độ WAL; không cần máy chủ cơ sở dữ liệu riêng
- **Phân quyền đa người dùng (RBAC)** — ba vai trò (admin / operator / viewer) với kiểm soát quyền chi tiết
- **Xác thực hai yếu tố** — 2FA dựa trên TOTP với quản lý phiên JWT
- **Xây dựng cho Đại học Đà Lạt (DLU)** — thiết kế phục vụ quản lý hạ tầng đại học và môi trường giáo dục

### Nền tảng hỗ trợ

| Hệ điều hành   | Phiên bản   |
| -------------- | ----------- |
| Ubuntu         | 20.04+      |
| Debian         | 11+         |

---

## Tính năng chính

### Quản lý máy chủ

- **Bảng điều khiển thời gian thực** — giám sát CPU, RAM, ổ đĩa và mạng trực tiếp qua WebSocket (chu kỳ 2 giây)
- **Chỉ số lịch sử** — xem xu hướng trong 1 ngày, 7 ngày hoặc 30 ngày với tổng hợp dữ liệu tự động
- **Quản lý tiến trình** — xem toàn bộ bảng tiến trình, gửi tín hiệu hoặc dừng tiến trình trực tiếp từ giao diện
- **Trình cài đặt phần mềm** — cài đặt một chạm cho nginx, Apache, OpenLiteSpeed, PHP (nhiều phiên bản), MySQL, Redis, PureFTPd và phpMyAdmin

### Lưu trữ website

- **Quản lý đa website** — tạo và quản lý virtual host cho nginx, Apache và OpenLiteSpeed
- **Chuyển đổi phiên bản PHP** — thay đổi phiên bản PHP cho từng website mà không cần cấu hình thủ công
- **Quản lý tên miền & bí danh** — thêm tên miền, tên miền phụ và bí danh máy chủ
- **Chứng chỉ SSL** — cấp phát tự động qua Let's Encrypt, tải lên chứng chỉ tùy chỉnh và quản lý chủ sở hữu chứng chỉ
- **Trình chỉnh sửa cấu hình website** — chỉnh sửa trực tiếp trên trình duyệt với Monaco Editor (tô sáng cú pháp, tự động hoàn thành)

### Quản lý tệp tin

- **Trình quản lý tệp đầy đủ tính năng** — chế độ xem danh sách và lưới, tải lên kéo-thả, điều hướng breadcrumb
- **Trình soạn thảo mã nguồn** — trình soạn thảo dựa trên Monaco để chỉnh sửa trực tiếp tệp trên máy chủ
- **Tích hợp terminal** — mở cửa sổ terminal tại đường dẫn thư mục hiện tại
- **Đánh dấu & tìm kiếm** — đánh dấu các đường dẫn thường truy cập; tìm kiếm theo tên tệp hoặc nội dung tệp
- **Thao tác nén** — nén và giải nén tệp zip, tar và tar.gz
- **Tải xuống từ xa** — tải tệp từ URL trực tiếp về máy chủ
- **Thao tác hàng loạt** — chọn nhiều tệp để sao chép, di chuyển, xóa và thay đổi quyền
- **Quản lý quyền** — thiết lập quyền tệp/thư mục và quyền sở hữu (user:group)

### Cơ sở dữ liệu & FTP

- **CRUD cơ sở dữ liệu** — tạo, quản lý và xóa cơ sở dữ liệu cùng người dùng MySQL/MariaDB/PostgreSQL
- **Tích hợp phpMyAdmin** — truy cập qua cổng 888 cho các thao tác cơ sở dữ liệu nâng cao
- **Tài khoản FTP** — quản lý tài khoản người dùng FTP qua PureFTPd với kiểm soát thư mục và hạn mức cho từng người dùng

### Docker

- **Vòng đời container** — khởi động, dừng, khởi động lại, xóa và xem nhật ký Docker container
- **Quản lý image** — tải image mới, liệt kê image hiện có và xóa image không sử dụng
- **Thông tin hệ thống** — xem thông tin Docker daemon, dung lượng ổ đĩa và thống kê toàn hệ thống

### Bảo mật

- **Quản lý tường lửa** — thêm/xóa quy tắc cổng và IP, chặn ICMP, xem các cổng đang lắng nghe
- **Cấu hình SSH** — quản lý cài đặt SSH daemon từ bảng điều khiển
- **Tích hợp Fail2ban** — xem và quản lý jail Fail2ban cùng các IP bị cấm

### Giám sát

- **Chỉ số thời gian thực qua WebSocket** — CPU, bộ nhớ, I/O ổ đĩa và thông lượng mạng được đẩy mỗi 2 giây
- **Quy trình tổng hợp dữ liệu** — dữ liệu thô → trung bình 5 phút → trung bình 1 giờ → trung bình 1 ngày
- **Thời gian lưu trữ tùy chỉnh** — cấu hình thời gian lưu trữ cho từng cấp độ tổng hợp
- **Bảng tiến trình** — danh sách tiến trình có thể sắp xếp với khả năng gửi tín hiệu dừng

### Khác

- **Lập lịch cron** — trình tạo cron trực quan với mẫu có sẵn và hỗ trợ biểu thức thủ công
- **Sao lưu & phục hồi** — tạo và phục hồi bản sao lưu toàn bộ hoặc một phần của website và cơ sở dữ liệu
- **Nhật ký kiểm toán** — mọi hành động người dùng đều được ghi lại với thời gian, IP và chi tiết
- **SSL bảng điều khiển** — bảo mật bảng điều khiển bằng HTTPS
- **Đa ngôn ngữ (i18n)** — hỗ trợ tiếng Anh và tiếng Việt
- **Giao diện** — chủ đề tối và sáng với tự động phát hiện tùy chọn hệ thống

---

## Kiến trúc hệ thống

```
┌─────────────────────────────────────────────┐
│          Frontend (React 19 + TS)           │
│  Ant Design v6 │ Tailwind v4 │ Vite 8      │
│  Monaco Editor │ xterm.js │ Recharts        │
└──────────────────┬──────────────────────────┘
                   │ REST API + WebSocket
┌──────────────────┴──────────────────────────┐
│           Backend (Go 1.25 + Gin)           │
│  JWT Auth │ RBAC │ Rate Limiting │ CSRF     │
│  Task Queue (4 workers) │ WS Hub            │
├─────────────────────────────────────────────┤
│  Services: Auth, Site, SSL, DB, File, FTP,  │
│  Docker, Cron, Firewall, Monitor, Backup,   │
│  Software, Security, Settings, Terminal     │
├─────────────────────────────────────────────┤
│  SQLite (WAL mode) │ 16+ tables             │
│  Metrics Collector │ SSL Renewer             │
└─────────────────────────────────────────────┘
```

### Công nghệ sử dụng

| Tầng         | Công nghệ                                            |
| ------------ | ----------------------------------------------------- |
| Backend      | Go 1.25, Gin framework, modernc.org/sqlite (CGo-free) |
| Frontend     | React 19, TypeScript, Ant Design v6, Tailwind CSS v4  |
| Bundler      | Vite 8                                                |
| Cơ sở dữ liệu | SQLite (WAL mode)                                   |
| Trình soạn thảo | Monaco Editor (mã nguồn), xterm.js (terminal)     |
| Biểu đồ     | Recharts                                              |
| Quản lý trạng thái | Zustand                                        |
| HTTP Client  | Axios                                                 |

---

## Bắt đầu nhanh

### Biên dịch từ mã nguồn

```bash
# Sao chép kho lưu trữ
git clone https://github.com/itdlu/ITDLUPanel.git
cd ITDLUPanel

# Biên dịch (biên dịch Go binary + React frontend)
make build

# Tệp nhị phân đầu ra tại ./bin/itdlupanel
```

### Chạy

```bash
# Khởi động bảng điều khiển với cấu hình mặc định
./bin/itdlupanel -config config/panel.json
```

### Truy cập

```
URL:             http://<server-ip>:8888
Tên đăng nhập:  admin
Mật khẩu:       admin@123456
```

> **⚠️ Quan trọng:** Hãy thay đổi thông tin đăng nhập mặc định ngay sau lần đăng nhập đầu tiên.

---

## Tổng quan API

ITDLUPanel cung cấp **hơn 150 REST endpoint** dưới tiền tố `/api/v1/`, được tổ chức theo tài nguyên:

| Danh mục       | Tiền tố                   | Mô tả                              |
| -------------- | ------------------------- | ----------------------------------- |
| Auth           | `/api/v1/auth/`           | Đăng nhập, đăng xuất, 2FA, làm mới token |
| Dashboard      | `/api/v1/dashboard/`      | Thống kê hệ thống, mức sử dụng tài nguyên |
| Sites          | `/api/v1/sites/`          | CRUD website, cấu hình vhost       |
| SSL            | `/api/v1/ssl/`            | Quản lý chứng chỉ                  |
| Databases      | `/api/v1/databases/`      | Quản lý cơ sở dữ liệu và người dùng |
| Files          | `/api/v1/files/`          | Thao tác tệp, tải lên, tải xuống  |
| FTP            | `/api/v1/ftp/`            | Quản lý tài khoản FTP              |
| Docker         | `/api/v1/docker/`         | Container, image, thông tin hệ thống |
| Cron           | `/api/v1/cron/`           | Quản lý cron job                   |
| Firewall       | `/api/v1/firewall/`       | Quy tắc cổng/IP, ICMP, cổng lắng nghe |
| Software       | `/api/v1/software/`       | Cài đặt/gỡ cài đặt phần mềm       |
| Monitor        | `/api/v1/monitor/`        | Chỉ số lịch sử                     |
| Security       | `/api/v1/security/`       | SSH, Fail2ban                       |
| Backup         | `/api/v1/backup/`         | Sao lưu và phục hồi                |
| Settings       | `/api/v1/settings/`       | Cấu hình bảng điều khiển           |
| Users          | `/api/v1/users/`          | Quản lý người dùng và vai trò      |

### Endpoint WebSocket

| Endpoint                        | Mô tả                                    |
| ------------------------------- | ----------------------------------------- |
| `/api/v1/terminal`              | Phiên shell tương tác (xterm.js)          |
| `/api/v1/monitor/realtime`      | Chỉ số hệ thống thời gian thực (chu kỳ 2 giây) |

### Xác thực & Bảo mật

- **JWT Bearer token** — truyền qua header `Authorization: Bearer <token>`
- **Giới hạn tốc độ** — 60 yêu cầu mỗi phút trên mỗi IP
- **Bảo vệ CSRF** — CSRF dựa trên token cho các thao tác thay đổi trạng thái
- **Nhật ký kiểm toán** — tất cả lệnh gọi API đều được ghi lại với người dùng, IP và thời gian

> Tài liệu tham chiếu đầy đủ các endpoint có tại [SPECIFICATION.md](../SPECIFICATION.md).

---

## Cấu trúc dự án

```
ITDLUPanel/
├── cmd/panel/main.go              # Điểm khởi chạy ứng dụng
├── internal/
│   ├── app/                       # Khởi tạo ứng dụng, thiết lập router, đăng ký middleware
│   ├── api/v1/                    # HTTP handler (15 tệp handler)
│   ├── api/ws/                    # WebSocket handler (terminal, monitor)
│   ├── service/                   # Tầng logic nghiệp vụ (20+ service)
│   ├── service/installer/         # Trình cài đặt phần mềm (nginx, Apache, PHP, MySQL, v.v.)
│   ├── service/vhost/             # Trình tạo virtual host (nginx, Apache, OpenLiteSpeed)
│   ├── database/                  # Kết nối SQLite, migration schema
│   ├── middleware/                # Auth, CORS, rate limiter, audit logger, CSRF
│   ├── websocket/                 # WebSocket hub, quản lý client, định tuyến sự kiện
│   └── config/                    # Tải và xác thực cấu hình
├── web/
│   └── src/
│       ├── pages/                 # 16 module trang (Dashboard, Sites, Files, v.v.)
│       ├── components/            # Thành phần UI dùng chung
│       ├── stores/                # Zustand state store
│       ├── services/              # Tầng API client (Axios)
│       └── hooks/                 # React hook dùng chung
├── config/
│   └── panel.json                 # Tệp cấu hình bảng điều khiển
├── data/
│   └── panel.db                   # Cơ sở dữ liệu SQLite (tạo khi chạy)
├── docs/                          # Tài liệu
├── Makefile                       # Các mục tiêu biên dịch
└── go.mod                         # Định nghĩa Go module
```

---

## Cấu hình

Bảng điều khiển được cấu hình qua `config/panel.json`. Dưới đây là cấu trúc với các giá trị mặc định:

```jsonc
{
  // Cài đặt máy chủ
  "server": {
    "host": "0.0.0.0",       // Địa chỉ lắng nghe
    "port": 8888,             // Cổng lắng nghe
    "mode": "release"         // Chế độ Gin: debug | release
  },

  // Cài đặt cơ sở dữ liệu
  "database": {
    "path": "data/panel.db",  // Đường dẫn tệp cơ sở dữ liệu SQLite
    "max_connections": 10     // Kích thước pool kết nối
  },

  // Xác thực
  "auth": {
    "jwt_secret": "",         // Khóa ký JWT (tự động tạo nếu để trống)
    "token_expire": 24,       // Thời gian hết hạn token (giờ)
    "max_login_attempts": 5,  // Khóa tài khoản sau N lần đăng nhập thất bại
    "lockout_duration": 15    // Thời gian khóa (phút)
  },

  // Đường dẫn tệp
  "paths": {
    "backup_dir": "data/backups",
    "temp_dir": "data/tmp",
    "log_dir": "data/logs"
  },

  // Cài đặt bảng điều khiển
  "panel": {
    "name": "ITDLUPanel",     // Tên hiển thị bảng điều khiển
    "language": "en",         // Ngôn ngữ mặc định: en | vi
    "ssl_enabled": false,     // Bật HTTPS cho bảng điều khiển
    "ssl_cert": "",           // Đường dẫn chứng chỉ SSL
    "ssl_key": ""             // Đường dẫn khóa riêng SSL
  }
}
```

---

## Yêu cầu hệ thống

### Môi trường chạy

| Tài nguyên    | Tối thiểu  | Khuyến nghị  |
| ------------- | ---------- | ------------ |
| Hệ điều hành | Ubuntu 20.04 / Debian 11 | Ubuntu 22.04+ / Debian 12+ |
| RAM           | 512 MB     | 1 GB+        |
| Ổ đĩa        | 1 GB trống | 10 GB+ trống |
| Mạng          | IP công khai hoặc nội bộ | IP công khai với DNS |

### Phụ thuộc biên dịch

| Công cụ  | Phiên bản | Mục đích            |
| -------- | --------- | ------------------- |
| Go       | 1.25+     | Trình biên dịch backend |
| Node.js  | 18+       | Biên dịch frontend  |
| Make     | bất kỳ    | Tự động hóa biên dịch |

> **Lưu ý:** Các phụ thuộc biên dịch chỉ cần thiết khi biên dịch từ mã nguồn. Tệp nhị phân sau khi biên dịch không yêu cầu phụ thuộc runtime bên ngoài.

---

## Phát triển

```bash
# Khởi động backend ở chế độ phát triển
go run cmd/panel/main.go -config config/panel.json

# Khởi động frontend dev server (trong terminal riêng)
cd web
npm install
npm run dev
```

Vite dev server chuyển tiếp các yêu cầu API đến Go backend, cho phép hot-reload trong quá trình phát triển frontend.

---

## Đóng góp

Chúng tôi hoan nghênh mọi đóng góp! Vui lòng tuân theo các hướng dẫn sau:

1. Fork kho lưu trữ và tạo nhánh tính năng
2. Tuân theo phong cách và quy ước mã nguồn hiện có
3. Viết thông điệp commit rõ ràng
4. Kiểm thử các thay đổi trên nền tảng được hỗ trợ
5. Gửi pull request kèm mô tả về các thay đổi của bạn

---

## Giấy phép

Đây là dự án đại học được phát triển tại **Đại học Đà Lạt (DLU)**, Việt Nam.

---

<p align="center">
  Được xây dựng với ❤️ bởi đội ngũ CNTT tại <strong>Đại học Đà Lạt (DLU)</strong>
</p>
