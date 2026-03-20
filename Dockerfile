# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci --silent
COPY web/ ./
RUN npm run build

# ── Stage 2: Build backend ──────────────────────────────────────────────────
FROM golang:1.24-alpine AS backend

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/web/dist ./web/dist
RUN CGO_ENABLED=0 go build \
    -ldflags "-s -w -X main.version=docker -X main.buildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -o itdlupanel ./cmd/panel

# ── Stage 3: Runtime ────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache bash curl ca-certificates tzdata

COPY --from=backend /app/itdlupanel /ITDLUPanel/server/itdlupanel

RUN mkdir -p /ITDLUPanel/logs /ITDLUPanel/backup /ITDLUPanel/wwwroot /ITDLUPanel/server/data

WORKDIR /ITDLUPanel/server

EXPOSE 8888

CMD ["/ITDLUPanel/server/itdlupanel"]
