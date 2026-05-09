# ITDLUPanel — Bảng Điều Khiển Quản Lý Máy Chủ Linux

[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-University_Project-blue)](#giấy-phép)

Bảng điều khiển quản lý máy chủ Linux **mã nguồn mở, đóng gói thành một tệp nhị phân duy nhất**, được phát triển bởi **Đại học Đà Lạt (DLU)** phục vụ quản lý hạ tầng CNTT. ITDLUPanel cung cấp giao diện web hiện đại và tích hợp toàn diện để quản lý máy chủ Ubuntu/Debian — từ lưu trữ website, quản trị cơ sở dữ liệu, Docker container, tường lửa ứng dụng web (WAF) đến tăng cường bảo mật.

---

## Điểm nổi bật

- **Triển khai tệp nhị phân duy nhất** — Backend Go tích hợp sẵn frontend React; không yêu cầu runtime bên ngoài
- **Cơ sở dữ liệu SQLite** — lưu trữ ở chế độ WAL, không cần cấu hình
- **Phân quyền đa người dùng (RBAC)** — ba vai trò tích hợp sẵn (admin / operator / viewer) với kiểm soát quyền chi tiết
- **Xác thực hai yếu tố** — 2FA dựa trên TOTP với quản lý phiên JWT
- **Bảo vệ WAF** — Tường lửa ứng dụng web HAProxy + Coraza với bộ quy tắc OWASP
- **Dọn dẹp Docker tự động** — dọn dẹp container/image/volume thông minh với lập lịch và chế độ thử nghiệm
- **Xây dựng cho Đại học Đà Lạt** — thiết kế phục vụ quản lý hạ tầng đại học và môi trường giáo dục

### Nền tảng hỗ trợ

| Hệ điều hành | Phiên bản   |
|--------------|------------|
| Ubuntu       | 20.04+     |
| Debian       | 11+        |

---

## Tính năng

### Tường lửa ứng dụng web (WAF)

- **Tích hợp HAProxy + Coraza** — stack WAF proxy đầy đủ với chế độ trong suốt và SSL passthrough
- **Bộ quy tắc OWASP** — 15 danh mục tấn công được thiết lập sẵn: SQLi, XSS, LFI, RFI, RCE, CRLF, Path Traversal, PHP Injection, Java Injection, Node.js Injection và nhiều hơn nữa
- **Quy tắc tùy chỉnh** — tạo quy tắc phase-1 và phase-2 với hành động chặn hoặc chỉ ghi log
- **Chặn theo vị trí địa lý** — chặn/cho phép lưu lượng theo quốc gia sử dụng MaxMind GeoIP
- **Danh sách IP** — danh sách trắng, danh sách đen với hỗ trợ CIDR, theo dõi số lần truy cập và tự động hết hạn
- **Danh sách URI** — cho phép hoặc chặn các mẫu URL cụ thể
- **Danh sách User-Agent** — lọc theo bot đã biết hoặc mẫu UA độc hại
- **Chữ ký tấn công** — mẫu tự động học từ phân tích nhật ký WAF
- **Thống kê lưu lượng thời gian thực** — băng thông hàng giờ, số yêu cầu, phân vị thời gian phản hồi (p95)
- **Thống kê địa lý** — số yêu cầu và tỷ lệ chặn theo từng quốc gia
- **Phát hiện yêu cầu chậm** — nhận diện các yêu cầu vượt quá ngưỡng độ trễ có thể cấu hình
- **Kịch bản Lua** — kịch bản Lua HAProxy tùy chỉnh được lưu trong cơ sở dữ liệu và triển khai khi khởi động lại

### Quản lý máy chủ

- **Bảng điều khiển thời gian thực** — giám sát CPU, RAM, ổ đĩa và mạng trực tiếp qua WebSocket (chu kỳ 2 giây)
- **Chỉ số lịch sử** — xem xu hướng trong 1 ngày, 7 ngày hoặc 30 ngày với tổng hợp dữ liệu tự động (thô → 5 phút → 1 giờ → 1 ngày)
- **Quản lý tiến trình** — xem toàn bộ bảng tiến trình, gửi tín hiệu hoặc dừng tiến trình trực tiếp từ giao diện
- **Trình cài đặt phần mềm** — cài đặt một chạm cho nginx, Apache, OpenLiteSpeed, PHP (nhiều phiên bản), MySQL/MariaDB, PostgreSQL, MongoDB, Redis, Memcached, Supervisor và nhiều hơn nữa

### Lưu trữ website

- **Quản lý đa website** — tạo và quản lý virtual host cho nginx, Apache và OpenLiteSpeed
- **Loại website** — cấu hình PHP, Node.js, Python và Static site
- **Chuyển đổi phiên bản PHP** — thay đổi phiên bản PHP cho từng website mà không cần cấu hình thủ công
- **Quản lý tên miền & bí danh** — thêm tên miền, tên miền phụ và bí danh máy chủ
- **Chứng chỉ SSL** — cấp phát tự động qua Let's Encrypt, hỗ trợ DNS-01 challenge, tải lên chứng chỉ tùy chỉnh
- **Trình chỉnh sửa vhost** — chỉnh sửa trực tiếp trên trình duyệt với Monaco Editor (tô sáng cú pháp, tự động hoàn thành)
- **Quy tắc rewrite** — rewrite URL, bảo vệ hotlink, quy tắc chuyển hướng, reverse proxy (HTTP/WebSocket)
- **Liên kết thư mục con** — lưu trữ nhiều thư mục con dưới cùng một tên miền
- **Kiểm soát truy cập** — bảo vệ bằng mật khẩu, danh sách cho phép/chặn IP, giới hạn theo URL
- **Thống kê website** — phân tích nhật ký truy cập với băng thông và số yêu cầu theo từng khoảng thời gian
- **Tích hợp Composer** — chạy `composer install/update/require/dump-autoload` trực tiếp từ bảng điều khiển
- **Chế độ bảo trì** — phục vụ trang bảo trì tùy chỉnh với các mẫu có sẵn

### Quản lý tệp tin

- **Trình quản lý tệp đầy đủ tính năng** — chế độ xem danh sách và lưới, tải lên kéo-thả, điều hướng breadcrumb
- **Trình soạn thảo mã nguồn** — trình soạn thảo dựa trên Monaco để chỉnh sửa trực tiếp tệp trên máy chủ
- **Tích hợp terminal** — mở phiên terminal tại đường dẫn thư mục hiện tại
- **Đánh dấu & tìm kiếm** — đánh dấu các đường dẫn thường truy cập; tìm kiếm theo tên tệp hoặc nội dung tệp
- **Thao tác nén** — nén và giải nén tệp zip, tar và tar.gz
- **Tải xuống từ xa** — tải tệp từ URL trực tiếp về máy chủ
- **Thao tác hàng loạt** — chọn nhiều tệp để sao chép, di chuyển, xóa và thay đổi quyền
- **Quản lý quyền** — thiết lập quyền tệp/thư mục (chmod) và quyền sở hữu (chown)

### Cơ sở dữ liệu & FTP

- **CRUD cơ sở dữ liệu** — tạo, quản lý và xóa cơ sở dữ liệu và người dùng MySQL/MariaDB/PostgreSQL/MongoDB
- **phpMyAdmin / pgAdmin** — truy cập một chạm vào công cụ quản trị cơ sở dữ liệu
- **Sao lưu & phục hồi** — sao lưu cơ sở dữ liệu theo yêu cầu và theo lịch
- **Nhập SQL** — tải lên và nhập tệp `.sql` hoặc `.sql.gz` trực tiếp
- **Hạn mức & kiểm soát truy cập** — hạn mức ổ đĩa và giới hạn truy cập máy chủ từ xa
- **Tài khoản FTP** — quản lý người dùng FTP qua PureFTPd với kiểm soát thư mục và hạn mức cho từng người dùng
- **Quản lý Redis** — CLI Redis trên trình duyệt với chỉnh sửa cấu hình, danh sách client, phân tích bộ nhớ, slowlog

### Docker

- **Vòng đời container** — khởi động, dừng, khởi động lại, xóa, tạm dừng/bỏ tạm dừng và xem nhật ký Docker container
- **Quản lý image** — tải image mới, liệt kê image hiện có, xóa image không sử dụng, tìm kiếm Docker Hub
- **Networks & volumes** — tạo, kết nối và quản lý mạng và ổ đĩa Docker
- **Docker Compose** — tạo, up, down, khởi động lại, xóa và xem nhật ký cho các dự án compose
- **Thông tin hệ thống** — xem thông tin Docker daemon, dung lượng ổ đĩa và thống kê toàn hệ thống
- **Registry mirrors** — cấu hình Docker registry mirrors tùy chỉnh
- **Dọn dẹp tự động** — quy tắc dọn dẹp thông minh với thực thi theo lịch, kích hoạt theo ngưỡng ổ đĩa và chế độ thử nghiệm

### Bảo mật

- **Quản lý tường lửa** — quy tắc UFW cho cổng và IP, chặn ICMP, tổng quan cổng đang lắng nghe
- **Tăng cường SSH** — quản lý cài đặt SSH daemon, mật khẩu root và người dùng SSH
- **Tích hợp Fail2ban** — xem và quản lý Fail2ban jail, IP bị cấm và cấu hình jail
- **Quản lý khóa SSH** — thêm, xóa, tạo (ED25519/RSA) và tải xuống khóa công khai SSH cho từng người dùng
- **2FA (TOTP)** — bật/tắt xác thực hai yếu tố với cấu hình mã QR

### Giám sát

- **Chỉ số thời gian thực qua WebSocket** — CPU, bộ nhớ, I/O ổ đĩa và thông lượng mạng được đẩy mỗi 2 giây
- **Tổng hợp dữ liệu lịch sử** — thô → trung bình 5 phút → trung bình 1 giờ → trung bình 1 ngày
- **Thời gian lưu trữ có thể cấu hình** — đặt thời gian lưu trữ cho từng cấp độ tổng hợp
- **Bảng tiến trình** — danh sách tiến trình có thể sắp xếp với khả năng sắp xếp theo CPU/bộ nhớ và gửi tín hiệu dừng
- **Trạng thái dịch vụ** — tổng quan nhanh về tất cả các dịch vụ được quản lý (nginx, mysql, v.v.)

### Các tính năng khác

- **Lập lịch cron** — trình tạo cron trực quan với mẫu có sẵn và hỗ trợ biểu thức thủ công
- **Sao lưu & phục hồi** — tạo và phục hồi bản sao lưu toàn bộ hoặc một phần của website và cơ sở dữ liệu; sao lưu ra local, FTP, S3, Google Drive hoặc OneDrive
- **Nhật ký kiểm toán** — mọi hành động người dùng đều được ghi lại với thời gian, IP và chi tiết
- **SSL bảng điều khiển** — bảo mật bảng điều khiển bằng HTTPS
- **Đa ngôn ngữ (i18n)** — hỗ trợ giao diện tiếng Anh và tiếng Việt
- **Giao diện** — chủ đề tối và sáng với tự động phát hiện tùy chọn hệ thống
- **Terminal đa tab** — xterm.js với WebSocket PTY và nhiều tab phiên

---

## Kiến trúc hệ thống

```
┌──────────────────────────────────────────────────────────────┐
│               Trình duyệt (React 19 SPA)                     │
│  Ant Design v6 · Tailwind v4 · Monaco Editor · xterm.js       │
│  Recharts · Zustand · TanStack Query · i18next              │
└───────────────────┬──────────────────────────────────────────┘
                    │  REST API (~220 endpoint)  │  WebSocket (2)
                    │  HTTPS / JWT Bearer        │  PTY Terminal + Monitor
                    ▼                            ▼
┌──────────────────────────────────────────────────────────────┐
│              Single Go Binary  (go:embed SPA)                 │
│                                                              │
│  ┌──────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │   Gin    │→ │ 26 REST Handlers  │→ │ 38 Services      │   │
│  │  Router  │  │                  │  │ 25 Installers     │   │
│  └──────────┘  └──────────────────┘  │ 4 Vhost Gens     │   │
│  ┌──────────┐  ┌──────────────────┐  │ WAF (HAProxy +   │   │
│  │   WS     │→ │  Terminal WS     │  │   Coraza SPOA)   │   │
│  │   Hub    │  │  Monitor WS      │  └────────┬────────┘   │
│  └──────────┘  └──────────────────┘           │            │
│  ┌──────────────────────────────────────────────┴────────┐  │
│  │  Middleware Stack (11 layers)                          │  │
│  │  Recovery·Logger·SecurityHeaders·CORS·Compress·Lang  │  │
│  │  RateLimit·CSRF·AuditLog·Auth(JWT)·RBAC              │  │
│  └──────────────────────────────────────────────┬─────────┘  │
│  ┌──────────────────────────────────────────────┴─────────┐  │
│  │  SQLite (18 bảng, chế độ WAL)  modernc.org/sqlite      │  │
│  │  17 migrations · 38 bảng cơ sở dữ liệu tổng cộng     │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────┬───────────────────────────────────┘
                             │  systemctl · exec · /proc · Docker API
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                 Linux Host (Ubuntu / Debian)                   │
│   Nginx/Apache/OLS · PHP-FPM · MySQL/MariaDB · PostgreSQL    │
│   Redis · Memcached · Docker · Fail2ban · PureFTPd · Certbot │
│   HAProxy · Coraza WAF                                        │
└──────────────────────────────────────────────────────────────┘
```

### Ngăn xếp công nghệ

#### Backend

| Thành phần    | Công nghệ                          | Phiên bản        |
|--------------|------------------------------------|-----------------|
| Ngôn ngữ      | Go                                 | 1.25.0          |
| HTTP Framework| Gin                               | 1.12.0          |
| Cơ sở dữ liệu| SQLite (CGO-free)                  | modernc.org/sqlite 1.47.0 |
| WebSocket     | gorilla/websocket                   | 1.5.3           |
| Auth / JWT    | golang-jwt/jwt                    | 5.3.1           |
| 2FA (TOTP)   | pquerna/otp                       | 1.5.0           |
| Hash mật khẩu | bcrypt (golang.org/x/crypto)      | —               |
| Giám sát hệ thống| gopsutil                      | 3.24.5          |
| Terminal PTY | creack/pty                        | 1.1.24          |
| Logging       | zerolog + lumberjack               | 1.34.0          |
| Validation    | go-playground/validator           | 10.30.1         |
| Object Storage| minio-go                         | 7.0.100         |
| OAuth2        | golang.org/x/oauth2               | 0.36.0          |
| FTP Client    | jlaffaye/ftp                      | 0.2.0           |
| TLS Multiplexing| soheilhy/cmux                    | 0.1.5           |

#### Frontend

| Thành phần     | Công nghệ                        | Phiên bản        |
|---------------|-----------------------------------|-----------------|
| Framework      | React                            | 19.2.4          |
| Ngôn ngữ       | TypeScript                       | 5.9.3           |
| Thư viện UI    | Ant Design                       | 6.3.3           |
| Công cụ build  | Vite                             | 8.0.1           |
| CSS            | Tailwind CSS                     | 4.2.2           |
| Trạng thái     | Zustand                          | 5.0.12          |
| Data Fetching  | TanStack React Query            | 5.91.2          |
| HTTP Client    | Axios                            | 1.13.6          |
| Biểu đồ        | Recharts                         | 3.8.0           |
| Trình soạn thảo| Monaco Editor                    | 4.7.0           |
| Terminal       | xterm.js                         | 6.0.0           |
| Routing        | React Router                     | 6.30.3          |
| i18n           | i18next                          | 25.8.20          |
| Ngày           | Day.js                           | 1.11.20         |

---

## Bắt đầu nhanh

### Biên dịch từ mã nguồn

```bash
# Sao chép kho lưu trữ
git clone https://github.com/itdlu/ITDLUPanel.git
cd ITDLUPanel

# Biên dịch (biên dịch Go binary + React frontend)
make build

# Tệp nhị phân đầu ra: ./bin/itdlupanel
```

### Chạy

```bash
# Khởi động bảng điều khiển với cấu hình mặc định
./bin/itdlupanel -config config/panel.json
```

### Truy cập

```
URL:             https://<server-ip>:8888
Tên đăng nhập:  admin
Mật khẩu:       admin@123456
```

> **Quan trọng:** Hãy thay đổi thông tin đăng nhập mặc định ngay sau lần đăng nhập đầu tiên.

---

## Tổng quan API

ITDLUPanel cung cấp **~220 REST endpoint** dưới tiền tố `/api/v1/`, được tổ chức theo tài nguyên:

| Danh mục         | Tiền tố                      | Mô tả                                    |
|-----------------|-----------------------------|------------------------------------------|
| Auth            | `/api/v1/auth/`              | Đăng nhập, đăng xuất, 2FA, làm mới token |
| Dashboard       | `/api/v1/dashboard/`         | Thống kê hệ thống, trạng thái phần mềm  |
| Sites           | `/api/v1/sites/`             | CRUD website, tên miền, chuyển đổi PHP   |
| SSL             | `/api/v1/ssl/`               | Quản lý chứng chỉ                        |
| Databases       | `/api/v1/databases/`         | CRUD MySQL/MariaDB/PostgreSQL + sao lưu  |
| Redis           | `/api/v1/redis/`             | CLI Redis, cấu hình, clients, bộ nhớ    |
| Files           | `/api/v1/files/`             | Thao tác tệp, tải lên, tải xuống        |
| FTP             | `/api/v1/ftp/`               | Quản lý tài khoản FTP                    |
| Docker          | `/api/v1/docker/`            | Container, image, networks, volumes       |
| Docker Cleanup  | `/api/v1/docker/cleanup/`    | Quy tắc dọn dẹp, nhật ký, thống kê      |
| Docker Compose  | `/api/v1/docker/compose/`    | Quản lý dự án Docker Compose             |
| Cron            | `/api/v1/crons/`             | Quản lý cron job                         |
| Firewall        | `/api/v1/firewall/`          | Quy tắc cổng/IP, quản lý UFW            |
| WAF             | `/api/v1/waf/`               | Trang WAF, quy tắc, nhật ký, IP, thống kê|
| Software        | `/api/v1/software/`          | Cài đặt/gỡ cài đặt phần mềm             |
| Monitor         | `/api/v1/monitor/`          | Chỉ số hệ thống, lịch sử, tiến trình   |
| Security        | `/api/v1/security/`          | SSH, Fail2ban, khóa SSH                  |
| Backup          | `/api/v1/backups/`           | Quản lý sao lưu và phục hồi             |
| FTP Storage     | `/api/v1/ftp-storages/`      | Quản lý đích sao lưu FTP                |
| Cloud Storage   | `/api/v1/cloud-storages/`    | Đích sao lưu S3, Google Drive, OneDrive  |
| Settings        | `/api/v1/settings/`          | Cấu hình bảng điều khiển                 |
| Notifications   | `/api/v1/notifications/`     | Kênh thông báo, quy tắc, mẫu            |
| Logs            | `/api/v1/logs/`              | Nhật ký panel, website, SSH, kiểm toán  |
| Users           | `/api/v1/users/`             | Quản lý người dùng và vai trò           |
| Roles           | `/api/v1/roles/`             | Quản lý vai trò RBAC                     |
| Tasks           | `/api/v1/tasks/`             | Trạng thái và nhật ký tác vụ nền        |
| Plugins         | `/api/v1/plugins/`           | Quản lý plugin                           |

### Endpoint WebSocket

| Endpoint                          | Mô tả                                      |
|-----------------------------------|--------------------------------------------|
| `/api/v1/terminal`               | Phiên shell tương tác (xterm.js)          |
| `/api/v1/monitor/realtime`       | Chỉ số hệ thống thời gian thực (2 giây)  |

### Xác thực & Bảo mật

- **JWT Bearer token** — truyền qua header `Authorization: Bearer <token>`
- **Giới hạn tốc độ** — 300 yêu cầu/phút trên mỗi IP (in-memory)
- **Bảo vệ CSRF** — cookie + header `X-CSRF-Token`
- **Nhật ký kiểm toán** — tất cả thao tác thay đổi trạng thái đều được ghi lại với người dùng, IP và thời gian

> Tài liệu tham chiếu API đầy đủ với tất cả endpoint và ví dụ request/response có tại [API.vi.md](./API.vi.md).

---

## Cấu trúc dự án

```
ITDLUPanel/
├── cmd/panel/main.go               # Điểm khởi chạy, CLI sub-commands
├── internal/
│   ├── app/                        # Bootstrap, router, TLS multiplexing
│   ├── api/v1/                     # 26 tệp REST handler
│   │   ├── auth.go · dashboard.go · site.go · database.go
│   │   ├── redis.go · ftp.go · file.go · docker.go
│   │   ├── docker_cleanup.go · docker_compose.go · cron.go
│   │   ├── security.go · waf.go · ssl.go · backup.go
│   │   ├── ftp_storage.go · cloud_storage.go · software.go
│   │   ├── monitor.go · task.go · user.go · role.go
│   │   ├── plugin.go · settings.go · notification.go · log.go
│   ├── api/ws/                     # 2 WebSocket handlers
│   │   ├── terminal.go             # Cầu nối xterm.js ↔ creack/pty
│   │   └── monitor.go             # Đẩy chỉ số thời gian thực
│   ├── service/                    # 38 dịch vụ business-logic
│   │   ├── auth_service.go · totp_service.go · jwt.go
│   │   ├── user_service.go · role_service.go
│   │   ├── site_service.go · ssl_service.go · ssl_renewer.go
│   │   ├── site_defaults.go · site_statistics_service.go
│   │   ├── database_service.go · redis_service.go
│   │   ├── ftp_service.go · file_service.go
│   │   ├── cron_service.go
│   │   ├── firewall_service.go · security_service.go
│   │   ├── waf_service.go · waf_log_service.go
│   │   ├── haproxy_manager.go · coraza_spoa.go · geo_service.go
│   │   ├── backup_service.go · ftp_storage_service.go
│   │   ├── cloud_storage_service.go
│   │   ├── software_service.go
│   │   ├── docker_service.go · docker_compose_service.go
│   │   ├── docker_cleanup_service.go
│   │   ├── monitor_service.go · metrics_collector.go
│   │   ├── notification_service.go · email_service.go
│   │   ├── telegram_service.go · log_service.go
│   │   ├── settings_service.go · terminal_service.go
│   │   ├── installer/              # 25 trình cài đặt phần mềm
│   │   │   ├── nginx.go · apache.go · ols.go
│   │   │   ├── php.go · mysql.go · postgresql.go · mongodb.go
│   │   │   ├── redis.go · memcached.go · supervisor.go
│   │   │   ├── nodejs.go · python.go · golang.go · tomcat.go
│   │   │   ├── pureftpd.go · phpmyadmin.go · pgadmin.go
│   │   │   ├── elasticsearch.go · ftp_storage.go
│   │   │   ├── google_drive.go · onedrive.go · s3_storage.go
│   │   │   └── envoy.go
│   │   └── vhost/                  # 4 trình tạo vhost
│   │       ├── nginx.go · apache.go · ols.go · vhost.go
│   ├── database/                   # Kết nối SQLite, migrations
│   │   ├── migrations/             # 17 migrations → 38 bảng tổng cộng
│   │   └── models/                 # Mô hình cơ sở dữ liệu
│   ├── middleware/                  # Auth, CORS, rate limiter, audit, CSRF
│   ├── websocket/                  # WS hub, broadcast, sự kiện
│   ├── system/                     # Shell execution, OS detection
│   ├── plugin/                     # Plugin interface và manager
│   ├── config/                     # Tải cấu hình JSON
│   ├── i18n/                       # Bản dịch EN/VI backend
│   ├── pkg/                        # crypto · errors · logger · response
│   └── task/                       # Task queue nền (4 workers)
├── web/
│   └── src/
│       ├── pages/                  # 17 module trang (lazy-loaded)
│       ├── components/             # Thành phần UI dùng chung
│       ├── stores/                 # Zustand state stores
│       ├── services/              # Lớp API client (Axios)
│       └── hooks/                  # React hooks dùng chung
├── docs/                           # Tài liệu
├── Makefile                        # Các mục tiêu biên dịch
└── go.mod                          # Định nghĩa Go module
```

---

## Cấu hình

Bảng điều khiển được cấu hình qua `config/panel.json`. Giá trị mặc định:

```jsonc
{
  "server": {
    "host": "0.0.0.0",       // Địa chỉ lắng nghe
    "port": 8888,             // Cổng lắng nghe
    "mode": "release"          // Chế độ Gin: debug | release
  },
  "database": {
    "path": "data/panel.db",  // Đường dẫn tệp SQLite
    "max_connections": 10     // Kích thước pool kết nối
  },
  "auth": {
    "jwt_secret": "",         // Khóa ký JWT (tự động tạo nếu để trống)
    "token_expire": 24,       // Thời gian hết hạn token (giờ)
    "max_login_attempts": 5,  // Ngưỡng khóa tài khoản
    "lockout_duration": 15    // Thời gian khóa (phút)
  },
  "paths": {
    "backup_dir": "data/backups",
    "temp_dir": "data/tmp",
    "log_dir": "data/logs"
  },
  "panel": {
    "name": "ITDLUPanel",    // Tên hiển thị bảng điều khiển
    "language": "en",         // Ngôn ngữ mặc định: en | vi
    "ssl_enabled": false,      // Bật HTTPS cho panel
    "ssl_cert": "",            // Đường dẫn chứng chỉ SSL
    "ssl_key": ""             // Đường dẫn khóa riêng SSL
  }
}
```

---

## Yêu cầu hệ thống

### Môi trường chạy

| Tài nguyên    | Tối thiểu           | Khuyến nghị            |
|--------------|---------------------|------------------------|
| Hệ điều hành | Ubuntu 20.04 / Debian 11 | Ubuntu 22.04+ / Debian 12+ |
| RAM          | 512 MB              | 1 GB+                  |
| Ổ đĩa       | 1 GB trống         | 10 GB+ trống          |
| Mạng         | IP công khai hoặc nội bộ | IP công khai với DNS |

### Phụ thuộc biên dịch

| Công cụ  | Phiên bản | Mục đích              |
|---------|----------|-----------------------|
| Go      | 1.25+    | Trình biên dịch backend|
| Node.js | 18+      | Biên dịch frontend     |
| Make    | bất kỳ   | Tự động hóa biên dịch |

> **Lưu ý:** Phụ thuộc biên dịch chỉ cần thiết khi biên dịch từ mã nguồn. Tệp nhị phân sau khi biên dịch không yêu cầu phụ thuộc runtime bên ngoài.

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
