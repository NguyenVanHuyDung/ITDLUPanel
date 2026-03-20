#!/bin/bash
# ITDLUPanel Management Script
# Usage: itdlupanel {start|stop|restart|status|version|update|uninstall}

set -euo pipefail

# ── Constants ────────────────────────────────────────────────────────────────
SERVICE_NAME="itdlupanel"
INSTALL_DIR="/ITDLUPanel"
SERVER_DIR="${INSTALL_DIR}/server"
BACKUP_DIR="${INSTALL_DIR}/backup"
LOGS_DIR="${INSTALL_DIR}/logs"
BINARY="${SERVER_DIR}/itdlupanel"
DOWNLOAD_BASE="https://github.com/ITDLUPanel/panel/releases/latest/download"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Root Check ───────────────────────────────────────────────────────────────
require_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This command must be run as root."
    fi
}

# ── Commands ─────────────────────────────────────────────────────────────────
cmd_start() {
    require_root
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        warn "ITDLUPanel is already running."
    else
        systemctl start "${SERVICE_NAME}"
        success "ITDLUPanel started."
    fi
}

cmd_stop() {
    require_root
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        systemctl stop "${SERVICE_NAME}"
        success "ITDLUPanel stopped."
    else
        warn "ITDLUPanel is not running."
    fi
}

cmd_restart() {
    require_root
    systemctl restart "${SERVICE_NAME}"
    success "ITDLUPanel restarted."
}

cmd_status() {
    echo -e "${BOLD}── ITDLUPanel Status ──${NC}"
    echo ""

    # Service state
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        echo -e "  Service:  ${GREEN}● running${NC}"
    else
        echo -e "  Service:  ${RED}● stopped${NC}"
    fi

    # PID
    local pid
    pid=$(systemctl show -p MainPID --value "${SERVICE_NAME}" 2>/dev/null || echo "0")
    if [[ "${pid}" -gt 0 ]]; then
        echo -e "  PID:      ${pid}"

        # Memory usage
        local mem_kb
        mem_kb=$(grep -s VmRSS "/proc/${pid}/status" 2>/dev/null | awk '{print $2}' || echo "0")
        if [[ "${mem_kb}" -gt 0 ]]; then
            local mem_mb=$((mem_kb / 1024))
            echo -e "  Memory:   ${mem_mb}MB"
        fi
    fi

    # Port
    echo -e "  Port:     ${CYAN}8888${NC}"

    # Version
    if [[ -x "${BINARY}" ]]; then
        local ver
        ver=$("${BINARY}" -version 2>&1 || echo "unknown")
        echo -e "  Version:  ${ver}"
    fi

    # Uptime
    local active_since
    active_since=$(systemctl show -p ActiveEnterTimestamp --value "${SERVICE_NAME}" 2>/dev/null || echo "")
    if [[ -n "${active_since}" && "${active_since}" != "n/a" ]]; then
        echo -e "  Since:    ${active_since}"
    fi

    echo ""
}

cmd_version() {
    if [[ -x "${BINARY}" ]]; then
        "${BINARY}" -version
    else
        error "Binary not found at ${BINARY}"
    fi
}

cmd_update() {
    require_root

    echo -e "${BOLD}── ITDLUPanel Update ──${NC}"
    echo ""

    # Detect architecture
    local machine arch
    machine=$(uname -m)
    case "${machine}" in
        x86_64|amd64)  arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        *)             error "Unsupported architecture: ${machine}" ;;
    esac

    local tarball="itdlupanel-linux-${arch}.tar.gz"
    local url="${DOWNLOAD_BASE}/${tarball}"
    local tmp_dir
    tmp_dir=$(mktemp -d)

    info "Downloading latest release (${arch})..."
    if ! curl -fsSL --connect-timeout 30 --max-time 300 -o "${tmp_dir}/${tarball}" "${url}"; then
        rm -rf "${tmp_dir}"
        error "Download failed from ${url}"
    fi

    info "Extracting..."
    tar -xzf "${tmp_dir}/${tarball}" -C "${tmp_dir}"

    local new_binary
    new_binary=$(find "${tmp_dir}" -name "itdlupanel*" -type f ! -name "*.tar.gz" | head -1)
    if [[ -z "${new_binary}" ]]; then
        rm -rf "${tmp_dir}"
        error "Binary not found in archive."
    fi

    # Backup current binary
    if [[ -f "${BINARY}" ]]; then
        local backup_name="itdlupanel.bak.$(date +%Y%m%d%H%M%S)"
        cp "${BINARY}" "${BACKUP_DIR}/${backup_name}"
        info "Current binary backed up to ${BACKUP_DIR}/${backup_name}"
    fi

    # Stop, replace, start
    info "Stopping service..."
    systemctl stop "${SERVICE_NAME}" 2>/dev/null || true

    cp "${new_binary}" "${BINARY}"
    chmod +x "${BINARY}"
    rm -rf "${tmp_dir}"

    info "Starting service..."
    systemctl start "${SERVICE_NAME}"

    success "ITDLUPanel updated successfully!"
    cmd_version
}

cmd_uninstall() {
    require_root

    echo -e "${RED}${BOLD}╔═══════════════════════════════════════════════╗${NC}"
    echo -e "${RED}${BOLD}║      ITDLUPanel Uninstall                     ║${NC}"
    echo -e "${RED}${BOLD}╚═══════════════════════════════════════════════╝${NC}"
    echo ""

    read -rp "Are you sure you want to uninstall ITDLUPanel? [y/N]: " confirm
    if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
        info "Uninstall cancelled."
        exit 0
    fi

    info "Stopping service..."
    systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
    systemctl disable "${SERVICE_NAME}" 2>/dev/null || true

    info "Removing service file..."
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload

    info "Removing management script..."
    rm -f /usr/local/bin/itdlupanel

    read -rp "Remove all data (${INSTALL_DIR})? [y/N]: " remove_data
    if [[ "${remove_data}" == "y" || "${remove_data}" == "Y" ]]; then
        rm -rf "${INSTALL_DIR}"
        success "All data removed."
    else
        info "Data preserved at ${INSTALL_DIR}"
    fi

    success "ITDLUPanel has been uninstalled."
}

# ── Usage ────────────────────────────────────────────────────────────────────
usage() {
    echo -e "${BOLD}ITDLUPanel Management Script${NC}"
    echo ""
    echo "Usage: itdlupanel <command>"
    echo ""
    echo "Commands:"
    echo "  start       Start ITDLUPanel"
    echo "  stop        Stop ITDLUPanel"
    echo "  restart     Restart ITDLUPanel"
    echo "  status      Show service status (port, PID, memory)"
    echo "  version     Show current version"
    echo "  update      Update to latest release"
    echo "  uninstall   Uninstall ITDLUPanel"
    echo ""
}

# ── Main ─────────────────────────────────────────────────────────────────────
case "${1:-}" in
    start)     cmd_start ;;
    stop)      cmd_stop ;;
    restart)   cmd_restart ;;
    status)    cmd_status ;;
    version)   cmd_version ;;
    update)    cmd_update ;;
    uninstall) cmd_uninstall ;;
    *)         usage ;;
esac
