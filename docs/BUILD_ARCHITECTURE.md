# ITDLUPanel — Build Architecture

## Tại sao Go + React lại thành 1 file binary duy nhất?

ITDLUPanel sử dụng tính năng **`embed`** của Go (từ Go 1.16+) để **nhúng toàn bộ frontend React đã build** vào bên trong file binary Go tại thời điểm biên dịch. Kết quả là **một file duy nhất** chứa cả backend API lẫn frontend UI — không cần Node.js, không cần thư mục static riêng, không cần reverse proxy.

---

## Quy trình build — 2 giai đoạn

```
┌────────────────────────────────────────────────────────────┐
│            GIAI ĐOẠN 1: Build Frontend (React)             │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  cd web/                                                   │
│  npm ci            ← Cài dependencies                      │
│  npm run build     ← Vite build React → web/dist/          │
│                                                            │
│  Kết quả:                                                  │
│  web/dist/                                                 │
│  ├── index.html         (entry point SPA)                  │
│  ├── assets/                                               │
│  │   ├── index-xxx.js   (React bundle, ~500KB)             │
│  │   ├── index-xxx.css  (styles)                           │
│  │   └── ...            (chunks, fonts, images)            │
│  └── favicon.ico                                           │
│                                                            │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│         GIAI ĐOẠN 2: Build Backend (Go + Embed)            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  go build ./cmd/panel                                      │
│                                                            │
│  Go compiler đọc directive //go:embed trong web.go         │
│  → Nhúng toàn bộ web/dist/ vào binary                      │
│  → Binary ~15MB chứa cả Go code + React assets             │
│                                                            │
└────────────────────────────────────────────────────────────┘
                          ↓
                   itdlupanel (binary)
                   Chạy được trên bất kỳ Linux nào
                   Không cần cài thêm gì
```

---

## Cách hoạt động chi tiết

### 1. File nhúng frontend — `web.go`

```go
package panel

import "embed"

//go:embed all:web/dist
var WebDistFS embed.FS
```

- Directive `//go:embed all:web/dist` ra lệnh cho Go compiler **đóng gói toàn bộ thư mục `web/dist/`** vào binary
- `WebDistFS` trở thành một **virtual filesystem** — truy cập file giống như đọc từ ổ đĩa, nhưng thực tế đọc từ bộ nhớ
- Từ khóa `all:` đảm bảo cả file ẩn (dotfiles) cũng được nhúng

### 2. Entry point — `cmd/panel/main.go`

```go
func main() {
    // Load config, mở SQLite DB, khởi tạo services
    application, err := app.New(configPath)

    // Chạy HTTP server
    srv := &http.Server{
        Addr:    ":" + port,
        Handler: application.Router,  // Gin engine
    }
    srv.ListenAndServeTLS(certFile, keyFile)
}
```

### 3. Router phục vụ cả API + SPA — `internal/app/router.go`

```go
func setupSPAHandler(engine *gin.Engine) {
    // Tạo sub-filesystem từ embedded FS
    distFS, _ := fs.Sub(panel.WebDistFS, "web/dist")
    fileServer := http.FileServer(http.FS(distFS))

    engine.NoRoute(func(c *gin.Context) {
        path := c.Request.URL.Path

        // /api/* → trả JSON 404
        if strings.HasPrefix(path, "/api/") {
            c.JSON(404, gin.H{"message": "API not found"})
            return
        }

        // Thử serve file tĩnh (JS, CSS, image)
        if f, err := distFS.Open(cleanPath); err == nil {
            f.Close()
            fileServer.ServeHTTP(c.Writer, c.Request)
            return
        }

        // Fallback: trả index.html cho React Router xử lý
        c.Request.URL.Path = "/"
        fileServer.ServeHTTP(c.Writer, c.Request)
    })
}
```

**Logic routing:**

| Request | Xử lý bởi | Ví dụ |
|---------|-----------|-------|
| `/api/v1/*` | Go handler | `GET /api/v1/sites` → SiteHandler |
| `/assets/*.js` | Embedded FS | `index-B3qT.js` từ web/dist/ |
| `/itdlu` | React SPA | index.html → React Router render |
| `/itdlu/websites` | React SPA | index.html → React Router render |

---

## Cấu trúc bên trong binary

```
itdlupanel (15MB, statically linked ELF binary)
│
├── Go Runtime
│
├── Go Application Code
│   ├── cmd/panel/         → main(), CLI commands
│   ├── internal/app/      → Router, bootstrap
│   ├── internal/api/v1/   → 20+ API handlers
│   ├── internal/service/  → Business logic
│   └── internal/model/    → Data models
│
├── Go Dependencies (vendored)
│   ├── gin (HTTP framework)
│   ├── sqlite (embedded database)
│   ├── jwt (authentication)
│   ├── websocket (terminal, monitoring)
│   └── acme (Let's Encrypt)
│
└── Embedded Filesystem (web/dist/)    ← React được nhúng ở đây
    ├── index.html
    └── assets/
        ├── index-xxx.js    (React app)
        ├── index-xxx.css   (styles)
        ├── Websites-xxx.js (lazy-loaded page)
        ├── AppStore-xxx.js (lazy-loaded page)
        └── ...
```

---

## Lệnh build đầy đủ

```bash
# Build thủ công
cd /root/ITDLUPanel
cd web && npm ci && npm run build && cd ..   # Bước 1: React
CGO_ENABLED=0 go build \                     # Bước 2: Go + Embed
    -ldflags "-s -w -X main.version=2.0.0" \
    -o bin/itdlupanel \
    ./cmd/panel

# Hoặc dùng publish script
cd publish/v2 && bash publish.sh --arch amd64
```

**Giải thích flags:**

| Flag | Ý nghĩa |
|------|---------|
| `CGO_ENABLED=0` | Không dùng C bindings → binary static, chạy mọi Linux |
| `-s -w` | Bỏ symbol table + debug info → giảm kích thước |
| `-X main.version=2.0.0` | Inject version string vào binary lúc compile |
| `./cmd/panel` | Compile từ package main trong cmd/panel/ |

---

## Tại sao kiến trúc này tốt?

| Ưu điểm | Giải thích |
|----------|-----------|
| **Deploy đơn giản** | Copy 1 file, chạy ngay. Không cần cài Node.js, nginx, hay serve static |
| **Không dependency** | Binary static, không cần glibc. Chạy trên Alpine, Ubuntu, CentOS,... |
| **Version đồng bộ** | Frontend & backend luôn cùng phiên bản vì ở chung binary |
| **Hiệu suất cao** | Embedded FS đọc từ memory, nhanh hơn đọc từ disk |
| **Bảo mật** | Không expose thư mục static ra ngoài, frontend chỉ truy cập qua Go server |
| **Atomic update** | Thay 1 file = cập nhật cả frontend lẫn backend |

---

## So sánh với cách deploy truyền thống

```
Cách truyền thống:                    ITDLUPanel:
┌──────────────┐                      ┌──────────────────┐
│   Nginx      │ ←── static files     │                  │
│   (port 80)  │                      │   itdlupanel     │
├──────────────┤                      │   (port 8888)    │
│ proxy_pass   │                      │                  │
│   ↓          │                      │  Go server       │
│ Node/Go API  │ ←── port 3000        │  + Embedded SPA  │
│ (port 3000)  │                      │  + SQLite DB     │
├──────────────┤                      │  + WebSocket     │
│   Database   │ ←── port 5432        │                  │
│  (Postgres)  │                      │  = 1 file, 1 port│
└──────────────┘                      └──────────────────┘
   4 processes                           1 process
   3 ports                               1 port
   3 config files                        1 config file
```

---

## File liên quan

| File | Vai trò |
|------|---------|
| `web.go` | Khai báo `//go:embed` để nhúng frontend |
| `cmd/panel/main.go` | Entry point, khởi động server |
| `internal/app/router.go` | Setup SPA handler cho embedded FS |
| `internal/app/app.go` | Bootstrap: config → DB → router → services |
| `web/` | Source code React (TypeScript + Vite) |
| `web/dist/` | Frontend build output (được embed vào binary) |
| `publish/v2/publish.sh` | Script build + đóng gói release |
