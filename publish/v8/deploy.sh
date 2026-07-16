#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════════╗
# ║  ITDLUPanel — Server Deployment Script                               ║
# ║  Installs ITDLUPanel to /ITDLUPanel/server/panel on target server    ║
# ╚═══════════════════════════════════════════════════════════════════════╝
#
# Usage: bash deploy.sh [--port 8888] [--no-start] [--update]

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

info()    { echo -e "  ${CYAN}●${NC} $*"; }
success() { echo -e "  ${GREEN}✔${NC} $*"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $*"; }
error()   { echo -e "  ${RED}✘${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}  ▸ $*${NC}"; }

BASE_DIR="/ITDLUPanel"
PANEL_DIR="${BASE_DIR}/server/panel"
BINARY_NAME="itdlupanel"
SERVICE_NAME="itdlupanel"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
MGMT_SCRIPT="/usr/local/bin/itdlupanel"

PANEL_PORT=8888
NO_START=false
UPDATE_MODE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)     PANEL_PORT="$2"; shift 2 ;;
        --no-start) NO_START=true; shift ;;
        --update)   UPDATE_MODE=true; shift ;;
        --help|-h)
            echo "Usage: bash deploy.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --port <port>   Panel port (default: 8888)"
            echo "  --no-start      Don't start service after install"
            echo "  --update        Update existing installation"
            echo "  --help          Show this help"
            exit 0
            ;;
        *) error "Unknown option: $1" ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${BOLD}  ╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}  ║                                                   ║${NC}"
echo -e "${BOLD}  ║   ${CYAN}ITDLUPanel${NC}${BOLD} — Server Deployment v8              ║${NC}"
echo -e "${BOLD}  ║   ${DIM}Dalat University Server Management Panel${NC}${BOLD}       ║${NC}"
echo -e "${BOLD}  ║                                                   ║${NC}"
echo -e "${BOLD}  ╚═══════════════════════════════════════════════════╝${NC}"
echo ""

step "Pre-flight checks"

if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root. Try: sudo bash deploy.sh"
fi
success "Running as root"

if [[ ! -f /etc/os-release ]]; then
    error "Cannot detect OS. /etc/os-release not found."
fi
source /etc/os-release
OS_ID="${ID:-unknown}"
OS_VERSION="${VERSION_ID:-0}"
OS_MAJOR="${OS_VERSION%%.*}"

case "${OS_ID}" in
    ubuntu)
        [[ "${OS_MAJOR}" -lt 20 ]] && error "Ubuntu ${OS_VERSION} not supported. Minimum: 20.04" ;;
    debian)
        [[ "${OS_MAJOR}" -lt 11 ]] && error "Debian ${OS_VERSION} not supported. Minimum: 11" ;;
    almalinux|rocky|centos)
        [[ "${OS_MAJOR}" -lt 8 ]] && error "${PRETTY_NAME} not supported. Minimum: version 8" ;;
    *)
        warn "Untested OS: ${PRETTY_NAME}. Proceeding anyway..." ;;
esac
success "OS: ${PRETTY_NAME}"

if [[ ! -f "${SCRIPT_DIR}/${BINARY_NAME}" ]]; then
    error "Binary not found: ${SCRIPT_DIR}/${BINARY_NAME}"
fi
success "Binary found"

if ! command -v systemctl &>/dev/null; then
    error "systemd not found. This script requires systemd."
fi
success "systemd available"

if [[ "${UPDATE_MODE}" == true ]]; then
    step "Updating existing installation"
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        info "Stopping current service..."
        systemctl stop "${SERVICE_NAME}"
        success "Service stopped"
    fi
    if [[ -f "${PANEL_DIR}/${BINARY_NAME}" ]]; then
        BACKUP_NAME="${BINARY_NAME}.bak.$(date +%Y%m%d%H%M%S)"
        cp "${PANEL_DIR}/${BINARY_NAME}" "${BASE_DIR}/backup/${BACKUP_NAME}" 2>/dev/null || true
        info "Previous binary backed up as ${BACKUP_NAME}"
    fi
fi

step "Creating directory structure"

dirs=(
    "${BASE_DIR}" "${PANEL_DIR}" "${PANEL_DIR}/config" "${PANEL_DIR}/data"
    "${BASE_DIR}/backup" "${BASE_DIR}/logs" "${BASE_DIR}/wwwroot"
    "${BASE_DIR}/server/vhost" "${BASE_DIR}/server/nginx"
    "${BASE_DIR}/server/php" "${BASE_DIR}/server/mysql"
)
for d in "${dirs[@]}"; do mkdir -p "${d}"; done
success "Directory tree created at ${BASE_DIR}/"

step "Installing binary"
cp "${SCRIPT_DIR}/${BINARY_NAME}" "${PANEL_DIR}/${BINARY_NAME}"
chmod 755 "${PANEL_DIR}/${BINARY_NAME}"
success "Binary installed to ${PANEL_DIR}/${BINARY_NAME}"

step "Configuring panel"
CONFIG_FILE="${PANEL_DIR}/config/panel.json"

if [[ -f "${CONFIG_FILE}" && "${UPDATE_MODE}" == true ]]; then
    info "Existing config preserved: ${CONFIG_FILE}"
else
    if [[ -f "${SCRIPT_DIR}/config/panel.json" ]]; then
        cp "${SCRIPT_DIR}/config/panel.json" "${CONFIG_FILE}"
    else
        cat > "${CONFIG_FILE}" << CFGEOF
{
  "server": {
    "host": "0.0.0.0",
    "port": ${PANEL_PORT},
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
CFGEOF
    fi

    [[ "${PANEL_PORT}" != "8888" ]] && \
        sed -i "s/\"port\": 8888/\"port\": ${PANEL_PORT}/" "${CONFIG_FILE}"

    success "Config created: ${CONFIG_FILE}"
fi

if grep -q '"jwt_secret": ""' "${CONFIG_FILE}" 2>/dev/null; then
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
    sed -i "s|\"jwt_secret\": \"\"|\"jwt_secret\": \"${JWT_SECRET}\"|" "${CONFIG_FILE}"
    success "JWT secret generated"
fi

step "Installing systemd service"

if [[ -f "${SCRIPT_DIR}/itdlupanel.service" ]]; then
    cp "${SCRIPT_DIR}/itdlupanel.service" "${SERVICE_FILE}"
else
    cat > "${SERVICE_FILE}" << SVCEOF
[Unit]
Description=ITDLUPanel - Linux Server Management Panel
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${PANEL_DIR}
ExecStart=${PANEL_DIR}/${BINARY_NAME} -config config/panel.json
ExecReload=/bin/kill -HUP \$MAINPID
Restart=on-failure
RestartSec=5
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal
NoNewPrivileges=false
ProtectSystem=false
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SVCEOF
fi

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" --quiet
success "Service installed and enabled"

step "Installing management command"

cat > "${MGMT_SCRIPT}" << 'MGMTEOF'
#!/bin/bash
set -euo pipefail

SERVICE_NAME="itdlupanel"
PANEL_DIR="/ITDLUPanel/server/panel"
BINARY="${PANEL_DIR}/itdlupanel"
BASE_DIR="/ITDLUPanel"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

case "${1:-help}" in
    start)
        systemctl start "${SERVICE_NAME}"
        echo -e "${GREEN}✔${NC} ITDLUPanel started"
        ;;
    stop)
        systemctl stop "${SERVICE_NAME}"
        echo -e "${GREEN}✔${NC} ITDLUPanel stopped"
        ;;
    restart)
        systemctl restart "${SERVICE_NAME}"
        echo -e "${GREEN}✔${NC} ITDLUPanel restarted"
        ;;
    status)
        echo -e "${BOLD}ITDLUPanel Status${NC}"
        echo ""
        if systemctl is-active --quiet "${SERVICE_NAME}"; then
            echo -e "  Service:  ${GREEN}● running${NC}"
        else
            echo -e "  Service:  ${RED}● stopped${NC}"
        fi
        pid=$(systemctl show -p MainPID --value "${SERVICE_NAME}" 2>/dev/null || echo "0")
        [[ "${pid}" -gt 0 ]] && echo "  PID:      ${pid}"
        port=$(grep -oP '"port":\s*\K[0-9]+' "${PANEL_DIR}/config/panel.json" 2>/dev/null || echo "8888")
        echo -e "  Port:     ${CYAN}${port}${NC}"
        [[ -x "${BINARY}" ]] && echo "  Version:  $("${BINARY}" -version 2>&1 || echo unknown)"
        echo ""
        ;;
    log|logs)
        tail -f "${BASE_DIR}/logs/panel.log"
        ;;
    version)
        [[ -x "${BINARY}" ]] && "${BINARY}" -version || echo "Binary not found"
        ;;
    reset-password)
        shift
        "${BINARY}" reset-password -config "${PANEL_DIR}/config/panel.json" "$@"
        ;;
    *)
        echo -e "${BOLD}ITDLUPanel${NC} — Server Management Panel"
        echo ""
        echo "Usage: itdlupanel <command>"
        echo ""
        echo "Commands:"
        echo "  start           Start the panel"
        echo "  stop            Stop the panel"
        echo "  restart         Restart the panel"
        echo "  status          Show service status"
        echo "  logs            Tail panel logs"
        echo "  version         Show version"
        echo "  reset-password  Reset admin password"
        echo ""
        ;;
esac
MGMTEOF

chmod 755 "${MGMT_SCRIPT}"
success "Management command installed: ${MGMT_SCRIPT}"

step "Configuring firewall"
if command -v ufw &>/dev/null; then
    ufw allow "${PANEL_PORT}/tcp" &>/dev/null || true
    success "UFW: port ${PANEL_PORT} allowed"
elif command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-port="${PANEL_PORT}/tcp" &>/dev/null || true
    firewall-cmd --reload &>/dev/null || true
    success "firewalld: port ${PANEL_PORT} allowed"
else
    info "No firewall detected. Ensure port ${PANEL_PORT} is open."
fi

if [[ "${NO_START}" == false ]]; then
    step "Starting ITDLUPanel"
    systemctl start "${SERVICE_NAME}"
    sleep 2
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        success "ITDLUPanel is running"
    else
        warn "Service may have failed to start. Check: journalctl -u ${SERVICE_NAME} -n 20"
    fi
fi

LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo -e "${GREEN}${BOLD}  ╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}  ║  Deployment complete!                              ║${NC}"
echo -e "${GREEN}${BOLD}  ╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Panel URL:${NC}    http://${LOCAL_IP}:${PANEL_PORT}"
echo -e "  ${BOLD}Login:${NC}        admin / admin@123456"
echo -e "  ${BOLD}Install dir:${NC}  ${PANEL_DIR}"
echo -e "  ${BOLD}Config:${NC}       ${PANEL_DIR}/config/panel.json"
echo -e "  ${BOLD}Logs:${NC}         ${BASE_DIR}/logs/panel.log"
echo ""
echo -e "  ${BOLD}Management commands:${NC}"
echo "    itdlupanel start          Start panel"
echo "    itdlupanel stop           Stop panel"
echo "    itdlupanel restart        Restart panel"
echo "    itdlupanel status         Show status"
echo "    itdlupanel logs           Tail logs"
echo "    itdlupanel reset-password Reset admin password"
echo ""
echo -e "  ${YELLOW}⚠ Change the default password immediately!${NC}"
echo ""
