#!/bin/bash
# Build ITDLUPanel for multiple platforms
# Builds: linux/amd64, linux/arm64

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Variables ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${PROJECT_ROOT}/dist"
WEB_DIR="${PROJECT_ROOT}/web"

VERSION=$(git -C "${PROJECT_ROOT}" describe --tags --always 2>/dev/null || echo "0.1.0")
BUILD_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
GO_VERSION=$(go version | awk '{print $3}')

LDFLAGS="-s -w -X main.version=${VERSION} -X main.buildTime=${BUILD_TIME}"

PLATFORMS=("amd64" "arm64")

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      ITDLUPanel Build                         ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════╝${NC}"
echo ""
info "Version:    ${VERSION}"
info "Build time: ${BUILD_TIME}"
info "Go:         ${GO_VERSION}"
echo ""

# ── Clean ────────────────────────────────────────────────────────────────────
info "Cleaning dist directory..."
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

# ── Build Frontend ───────────────────────────────────────────────────────────
echo -e "\n${BOLD}▶ Building frontend...${NC}"

if [[ ! -f "${WEB_DIR}/package.json" ]]; then
    error "Frontend not found at ${WEB_DIR}"
fi

cd "${WEB_DIR}"

if [[ ! -d "node_modules" ]]; then
    info "Installing dependencies..."
    npm ci --silent
fi

npm run build
success "Frontend built."

cd "${PROJECT_ROOT}"

# ── Build Backend ────────────────────────────────────────────────────────────
echo -e "\n${BOLD}▶ Building backend...${NC}"

for ARCH in "${PLATFORMS[@]}"; do
    info "Building linux/${ARCH}..."

    CGO_ENABLED=0 GOOS=linux GOARCH="${ARCH}" go build \
        -ldflags "${LDFLAGS}" \
        -o "${DIST_DIR}/itdlupanel-linux-${ARCH}" \
        ./cmd/panel

    success "Built: dist/itdlupanel-linux-${ARCH}"
done

# ── Package ──────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}▶ Packaging...${NC}"

for ARCH in "${PLATFORMS[@]}"; do
    tar -czf "${DIST_DIR}/itdlupanel-linux-${ARCH}.tar.gz" \
        -C "${DIST_DIR}" "itdlupanel-linux-${ARCH}"
    success "Packaged: dist/itdlupanel-linux-${ARCH}.tar.gz"
done

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Build complete!${NC}"
echo ""
ls -lh "${DIST_DIR}/"*.tar.gz
echo ""
