#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════════╗
# ║  ITDLUPanel — Publish Package Builder                                ║
# ║  Creates a self-contained deployment archive for target servers      ║
# ╚═══════════════════════════════════════════════════════════════════════╝
#
# Usage: ./publish.sh [--arch amd64|arm64] [--skip-frontend]
# Output: publish/v1/itdlupanel-v1-linux-<arch>.tar.gz

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}  OK  ${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }

# ── Variables ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PUBLISH_DIR="${SCRIPT_DIR}"
WEB_DIR="${PROJECT_ROOT}/web"

VERSION="1.0.0"
BUILD_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
ARCH="amd64"
SKIP_FRONTEND=false

# ── Parse Args ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --arch)      ARCH="$2"; shift 2 ;;
        --skip-frontend) SKIP_FRONTEND=true; shift ;;
        *)           error "Unknown option: $1" ;;
    esac
done

# Validate architecture
case "${ARCH}" in
    amd64|arm64) ;;
    *) error "Unsupported architecture: ${ARCH}. Use amd64 or arm64." ;;
esac

LDFLAGS="-s -w -X main.version=${VERSION} -X main.buildTime=${BUILD_TIME}"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     ITDLUPanel — Publish Builder v1                   ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
info "Version:      ${VERSION}"
info "Architecture: linux/${ARCH}"
info "Build time:   ${BUILD_TIME}"
echo ""

# ── Stage directory ──────────────────────────────────────────────────────
STAGE_DIR=$(mktemp -d)
STAGE_PANEL="${STAGE_DIR}/itdlupanel"
trap 'rm -rf "${STAGE_DIR}"' EXIT

mkdir -p "${STAGE_PANEL}"

# ── Build Frontend ───────────────────────────────────────────────────────
if [[ "${SKIP_FRONTEND}" == false ]]; then
    echo -e "${BOLD}▶ Building frontend...${NC}"
    cd "${WEB_DIR}"
    if [[ ! -d "node_modules" ]]; then
        info "Installing dependencies..."
        npm ci --silent
    fi
    npm run build 2>&1 | tail -3
    success "Frontend built"
    cd "${PROJECT_ROOT}"
else
    warn "Skipping frontend build (--skip-frontend)"
fi

# ── Build Backend ────────────────────────────────────────────────────────
echo -e "\n${BOLD}▶ Building backend (linux/${ARCH})...${NC}"
cd "${PROJECT_ROOT}"

CGO_ENABLED=0 GOOS=linux GOARCH="${ARCH}" go build \
    -ldflags "${LDFLAGS}" \
    -o "${STAGE_PANEL}/itdlupanel" \
    ./cmd/panel

chmod +x "${STAGE_PANEL}/itdlupanel"
success "Binary built"

# ── Prepare config template ──────────────────────────────────────────────
echo -e "\n${BOLD}▶ Preparing configuration...${NC}"

mkdir -p "${STAGE_PANEL}/config"

cat > "${STAGE_PANEL}/config/panel.json" << 'CONFIGEOF'
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
    "jwt_secret": "",
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
  },
  "panel": {
    "language": "en",
    "admin_path": "/",
    "setup_completed": false,
    "version": ""
  }
}
CONFIGEOF

success "Config template created"

# ── Copy deployment scripts ──────────────────────────────────────────────
echo -e "\n${BOLD}▶ Packaging deployment scripts...${NC}"

cp "${PUBLISH_DIR}/deploy.sh"      "${STAGE_PANEL}/deploy.sh"
cp "${PUBLISH_DIR}/itdlupanel.service" "${STAGE_PANEL}/itdlupanel.service"
cp "${PUBLISH_DIR}/DEPLOY.md"      "${STAGE_PANEL}/DEPLOY.md"
cp "${PUBLISH_DIR}/DEPLOY.vi.md"   "${STAGE_PANEL}/DEPLOY.vi.md"
chmod +x "${STAGE_PANEL}/deploy.sh"

success "Scripts packaged"

# ── Create data directory placeholder ────────────────────────────────────
mkdir -p "${STAGE_PANEL}/data"
touch "${STAGE_PANEL}/data/.gitkeep"

# ── Package ──────────────────────────────────────────────────────────────
echo -e "\n${BOLD}▶ Creating archive...${NC}"

ARCHIVE_NAME="itdlupanel-v1-linux-${ARCH}.tar.gz"
tar -czf "${PUBLISH_DIR}/${ARCHIVE_NAME}" -C "${STAGE_DIR}" itdlupanel

ARCHIVE_SIZE=$(du -h "${PUBLISH_DIR}/${ARCHIVE_NAME}" | cut -f1)
success "Archive created: publish/v1/${ARCHIVE_NAME} (${ARCHIVE_SIZE})"

# ── Checksum ─────────────────────────────────────────────────────────────
cd "${PUBLISH_DIR}"
sha256sum "${ARCHIVE_NAME}" > "${ARCHIVE_NAME}.sha256"
success "Checksum: ${ARCHIVE_NAME}.sha256"

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║  Publish complete!                                    ║${NC}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Archive: publish/v1/${ARCHIVE_NAME}"
echo "  Size:    ${ARCHIVE_SIZE}"
echo ""
echo "  Deploy to target server:"
echo "    scp publish/v1/${ARCHIVE_NAME} root@<server>:/tmp/"
echo "    ssh root@<server>"
echo "    tar -xzf /tmp/${ARCHIVE_NAME} -C /tmp"
echo "    cd /tmp/itdlupanel && bash deploy.sh"
echo ""
