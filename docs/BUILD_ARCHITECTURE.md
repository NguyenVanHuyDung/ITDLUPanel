# ITDLUPanel — Build Architecture

> How Go + React becomes a single binary

---

## 1. Overview

ITDLUPanel compiles into a **single static binary** (~60 MB) that includes:
- Go HTTP server (Gin)
- Compiled React SPA (HTML/JS/CSS)
- SQLite engine (CGO-free, pure Go)
- All dependencies statically linked

**Zero runtime dependencies** — the binary runs on any Linux system without Go, Node.js, or any library installed.

---

## 2. Build Pipeline

```
┌─────────────────────────────────────────────────────────┐
│ Phase 1: Frontend Build                                  │
│                                                          │
│  web/src/*.tsx ─── TypeScript ──► Vite 8 ──► web/dist/  │
│                    React 19        Build      ├── index.html
│                    Ant Design 6               ├── assets/*.js
│                                               └── assets/*.css
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 2: Go Embed & Compile                              │
│                                                          │
│  web.go:                                                 │
│    //go:embed all:web/dist                              │
│    var WebDistFS embed.FS                                │
│                                                          │
│  go build ──► Embeds web/dist/ into binary              │
│              ──► Compiles all Go code                     │
│              ──► Links SQLite (pure Go)                   │
│              ──► Output: bin/itdlupanel (~60MB)          │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Key Files

### `web.go` — Frontend Embedding

```go
package main

import "embed"

//go:embed all:web/dist
var WebDistFS embed.FS
```

Go's `embed` directive includes the entire `web/dist/` directory into the compiled binary at build time. At runtime, the SPA is served directly from memory.

### `Makefile`

```makefile
VERSION ?= 0.1.0
BUILD_TIME := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)

build:
    CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o bin/itdlupanel ./cmd/panel

build-linux-amd64:
    GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o bin/itdlupanel-linux-amd64 ./cmd/panel
```

- **CGO_ENABLED=0**: Pure Go compilation — no C compiler needed, fully static binary
- **LDFLAGS**: Injects version and build time at compile

### `Dockerfile` — Multi-Stage Build

```dockerfile
# Stage 1: Build frontend
FROM node:22-alpine AS frontend
WORKDIR /app
COPY web/package*.json ./
RUN npm ci --production=false
COPY web/ ./
RUN npx vite build

# Stage 2: Build backend
FROM golang:1.25-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/dist web/dist
RUN CGO_ENABLED=0 go build -ldflags "..." -o itdlupanel ./cmd/panel

# Stage 3: Minimal runtime
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
COPY --from=backend /app/itdlupanel /usr/local/bin/
EXPOSE 8888
CMD ["itdlupanel"]
```

**Final image size: ~15 MB** (Alpine + static binary)

---

## 4. Frontend Build Details

| Tool | Purpose |
|------|---------|
| Vite 8 | Fast bundler with tree-shaking |
| TypeScript 5.9 | Type checking (non-blocking: `tsc -b` errors don't block Vite) |
| React 19 | UI framework |
| Ant Design 6 | Component library |
| Tailwind CSS 4 | Utility CSS (minimal usage — most styling is inline) |

**Build command:**
```bash
cd web && npx vite build    # Outputs to web/dist/
```

> **Note:** `npm run build` runs `tsc -b && vite build`. Pre-existing TS errors may block `tsc`. Use `npx vite build` directly if needed.

**Output structure:**
```
web/dist/
├── index.html              # SPA entry point
└── assets/
    ├── index-*.js          # Main bundle (~611 KB gzipped: ~194 KB)
    ├── jsx-runtime-*.js    # React runtime
    ├── Docker-*.js         # Docker page (code-split)
    ├── AppStore-*.js       # App store page
    ├── Websites-*.js       # Website management
    ├── editor.api2-*.js    # Monaco Editor (~3.6 MB, lazy-loaded)
    ├── xterm-*.js          # Terminal (~346 KB, lazy-loaded)
    └── ...                 # ~70 code-split chunks
```

---

## 5. Backend Build Details

| Tool | Purpose |
|------|---------|
| Go 1.25 | Compiler |
| modernc.org/sqlite | Pure-Go SQLite (no CGO) |
| go:embed | Static file embedding |
| ldflags | Version injection |

**Build command:**
```bash
export PATH=/usr/local/go/bin:$PATH
CGO_ENABLED=0 go build -ldflags "-X main.version=0.1.0 -X main.buildTime=..." -o bin/itdlupanel ./cmd/panel
```

**Binary contents:**
- Go HTTP server (Gin router + middleware + handlers)
- 33 service implementations
- 14 software installers
- SQLite engine (pure Go)
- Embedded React SPA (~12 MB compressed)
- i18n translations (EN + VI)

---

## 6. Development Workflow

### Quick Iteration

```bash
# Terminal 1: Frontend dev server with hot reload
cd web && npm run dev    # → http://localhost:3000 (proxies /api to :8888)

# Terminal 2: Backend
make build && ./bin/itdlupanel -config config/panel.json
```

### Production Build

```bash
# Full build (frontend → embed → binary)
cd web && npm ci && npx vite build && cd ..
make build

# Start
nohup ./bin/itdlupanel -config config/panel.json > logs/panel.log 2>&1 &
```

### Cross-Compilation

```bash
# Linux AMD64 (servers)
GOOS=linux GOARCH=amd64 make build-linux-amd64

# Linux ARM64 (Raspberry Pi, ARM servers)
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -o bin/itdlupanel-arm64 ./cmd/panel
```

---

## 7. Why This Architecture?

| Decision | Rationale |
|----------|-----------|
| Single binary | Zero-dependency deployment; copy and run |
| go:embed | No separate file server; SPA always matches API version |
| CGO_ENABLED=0 | Static linking; cross-compile anywhere |
| Pure-Go SQLite | No C compiler needed; works on all platforms |
| Vite (not webpack) | 10x faster builds; native ES modules |
| Code splitting | Monaco Editor (3.6 MB) only loads when editing files |
