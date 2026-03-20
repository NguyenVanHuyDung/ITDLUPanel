#!/bin/bash
# ITDLUPanel Installation Script
# Usage: curl -sSL https://install.itdlupanel.com | bash
#
# Supported OS: Ubuntu 22/24, AlmaLinux 8/9, CentOS Stream 8/9
# Requirements: 512MB RAM, 5GB disk

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Globals ──────────────────────────────────────────────────────────────────
INSTALL_DIR="/ITDLUPanel"
SERVER_DIR="${INSTALL_DIR}/server"
BACKUP_DIR="${INSTALL_DIR}/backup"
LOGS_DIR="${INSTALL_DIR}/logs"
WWWROOT_DIR="${INSTALL_DIR}/wwwroot"
SERVICE_NAME="itdlupanel"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
PANEL_USER="root"
PANEL_PORT=8888
DOWNLOAD_BASE="https://github.com/ITDLUPanel/panel/releases/latest/download"

# ── Helper Functions ─────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
success() { echo -e "${GREEN}[OK]${NC}      $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; }
error()   { echo -e "${RED}[ERROR]${NC}   $*"; }
step()    { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }

abort() {
    error "$*"
    exit 1
}

# ── Root Check ───────────────────────────────────────────────────────────────
check_root() {
    if [[ $EUID -ne 0 ]]; then
        abort "This script must be run as root. Try: sudo bash $0"
    fi
}

# ── OS Detection ─────────────────────────────────────────────────────────────
detect_os() {
    step "Detecting operating system..."

    if [[ ! -f /etc/os-release ]]; then
        abort "Cannot detect OS. /etc/os-release not found."
    fi

    # shellcheck disable=SC1091
    source /etc/os-release

    OS_ID="${ID:-unknown}"
    OS_VERSION="${VERSION_ID:-0}"
    OS_NAME="${PRETTY_NAME:-Unknown}"
    OS_MAJOR="${OS_VERSION%%.*}"

    case "${OS_ID}" in
        ubuntu)
            if [[ "${OS_MAJOR}" -lt 22 ]]; then
                abort "Ubuntu ${OS_VERSION} is not supported. Minimum: Ubuntu 22.04"
            fi
            PKG_MANAGER="apt"
            ;;
        almalinux|rocky)
            if [[ "${OS_MAJOR}" -lt 8 ]]; then
                abort "${OS_NAME} is not supported. Minimum: version 8"
            fi
            PKG_MANAGER="dnf"
            ;;
        centos)
            if [[ "${OS_MAJOR}" -lt 8 ]]; then
                abort "CentOS ${OS_VERSION} is not supported. Minimum: CentOS Stream 8"
            fi
            PKG_MANAGER="dnf"
            ;;
        *)
            warn "Untested OS: ${OS_NAME}. Proceeding anyway..."
            if command -v apt &>/dev/null; then
                PKG_MANAGER="apt"
            elif command -v dnf &>/dev/null; then
                PKG_MANAGER="dnf"
            elif command -v yum &>/dev/null; then
                PKG_MANAGER="yum"
            else
                abort "No supported package manager found (apt/dnf/yum)."
            fi
            ;;
    esac

    success "OS: ${OS_NAME} | Package manager: ${PKG_MANAGER}"
}

# ── Architecture Detection ───────────────────────────────────────────────────
detect_arch() {
    local machine
    machine=$(uname -m)

    case "${machine}" in
        x86_64|amd64)   ARCH="amd64" ;;
        aarch64|arm64)   ARCH="arm64" ;;
        *)               abort "Unsupported architecture: ${machine}" ;;
    esac

    success "Architecture: ${ARCH}"
}

# ── System Requirements ──────────────────────────────────────────────────────
check_requirements() {
    step "Checking system requirements..."

    # Check RAM (minimum 512MB)
    local total_mem_kb
    total_mem_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    local total_mem_mb=$((total_mem_kb / 1024))

    if [[ ${total_mem_mb} -lt 460 ]]; then
        abort "Insufficient memory: ${total_mem_mb}MB. Minimum required: 512MB"
    fi
    success "Memory: ${total_mem_mb}MB (minimum 512MB)"

    # Check disk space (minimum 5GB on /)
    local avail_kb
    avail_kb=$(df / | tail -1 | awk '{print $4}')
    local avail_gb=$((avail_kb / 1024 / 1024))

    if [[ ${avail_gb} -lt 5 ]]; then
        abort "Insufficient disk space: ${avail_gb}GB available. Minimum required: 5GB"
    fi
    success "Disk space: ${avail_gb}GB available (minimum 5GB)"
}

# ── Install Dependencies ─────────────────────────────────────────────────────
install_dependencies() {
    step "Installing dependencies..."

    local deps=(curl wget tar)
    local missing=()

    for dep in "${deps[@]}"; do
        if ! command -v "${dep}" &>/dev/null; then
            missing+=("${dep}")
        fi
    done

    if [[ ${#missing[@]} -eq 0 ]]; then
        success "All dependencies already installed."
        return
    fi

    info "Installing: ${missing[*]}"

    case "${PKG_MANAGER}" in
        apt)
            apt-get update -qq
            apt-get install -y -qq "${missing[@]}"
            ;;
        dnf|yum)
            "${PKG_MANAGER}" install -y -q "${missing[@]}"
            ;;
    esac

    success "Dependencies installed: ${missing[*]}"
}

# ── Create Directory Structure ───────────────────────────────────────────────
create_directories() {
    step "Creating directory structure..."

    local dirs=("${SERVER_DIR}" "${BACKUP_DIR}" "${LOGS_DIR}" "${WWWROOT_DIR}")

    for dir in "${dirs[@]}"; do
        if [[ ! -d "${dir}" ]]; then
            mkdir -p "${dir}"
            info "Created ${dir}"
        else
            info "Already exists: ${dir}"
        fi
    done

    success "Directory structure ready."
}

# ── Download Binary ──────────────────────────────────────────────────────────
download_binary() {
    step "Downloading ITDLUPanel (${ARCH})..."

    local tarball="itdlupanel-linux-${ARCH}.tar.gz"
    local url="${DOWNLOAD_BASE}/${tarball}"
    local tmp_dir
    tmp_dir=$(mktemp -d)

    info "URL: ${url}"

    if ! curl -fsSL --connect-timeout 30 --max-time 300 -o "${tmp_dir}/${tarball}" "${url}"; then
        rm -rf "${tmp_dir}"
        abort "Failed to download from ${url}"
    fi

    info "Extracting..."
    tar -xzf "${tmp_dir}/${tarball}" -C "${tmp_dir}"

    # Find the binary inside the tarball
    local binary
    binary=$(find "${tmp_dir}" -name "itdlupanel*" -type f ! -name "*.tar.gz" | head -1)

    if [[ -z "${binary}" ]]; then
        rm -rf "${tmp_dir}"
        abort "Binary not found in downloaded archive."
    fi

    # Backup existing binary if present
    if [[ -f "${SERVER_DIR}/itdlupanel" ]]; then
        local backup_name="itdlupanel.bak.$(date +%Y%m%d%H%M%S)"
        cp "${SERVER_DIR}/itdlupanel" "${BACKUP_DIR}/${backup_name}"
        info "Existing binary backed up to ${BACKUP_DIR}/${backup_name}"
    fi

    cp "${binary}" "${SERVER_DIR}/itdlupanel"
    chmod +x "${SERVER_DIR}/itdlupanel"
    rm -rf "${tmp_dir}"

    success "Binary installed to ${SERVER_DIR}/itdlupanel"
}

# ── Install Systemd Service ──────────────────────────────────────────────────
install_service() {
    step "Installing systemd service..."

    cat > "${SERVICE_FILE}" <<'UNIT'
[Unit]
Description=ITDLUPanel - Linux Server Management Panel
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/ITDLUPanel/server
ExecStart=/ITDLUPanel/server/itdlupanel
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:/ITDLUPanel/logs/panel.log
StandardError=append:/ITDLUPanel/logs/panel-error.log

[Install]
WantedBy=multi-user.target
UNIT

    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}" &>/dev/null

    success "Systemd service installed and enabled."
}

# ── Generate Initial Config ──────────────────────────────────────────────────
generate_config() {
    step "Generating initial configuration..."

    local config_file="${SERVER_DIR}/config.json"

    if [[ -f "${config_file}" ]]; then
        warn "Config file already exists. Skipping generation."
        return
    fi

    cat > "${config_file}" <<EOF
{
  "host": "0.0.0.0",
  "port": ${PANEL_PORT},
  "ssl": false,
  "data_dir": "/ITDLUPanel/server/data",
  "log_dir": "/ITDLUPanel/logs",
  "backup_dir": "/ITDLUPanel/backup",
  "wwwroot": "/ITDLUPanel/wwwroot"
}
EOF

    success "Config written to ${config_file}"
}

# ── Install Management Script ────────────────────────────────────────────────
install_management_script() {
    step "Installing management script..."

    local script_url="${DOWNLOAD_BASE}/itdlupanel.sh"
    local target="/usr/local/bin/itdlupanel"

    # Write a minimal management wrapper if download fails
    cat > "${target}" <<'MGMT'
#!/bin/bash
set -euo pipefail
SERVICE="itdlupanel"
SERVER_DIR="/ITDLUPanel/server"

case "${1:-}" in
    start)   systemctl start "$SERVICE" && echo "ITDLUPanel started." ;;
    stop)    systemctl stop "$SERVICE" && echo "ITDLUPanel stopped." ;;
    restart) systemctl restart "$SERVICE" && echo "ITDLUPanel restarted." ;;
    status)  systemctl status "$SERVICE" --no-pager ;;
    version) "${SERVER_DIR}/itdlupanel" -version 2>/dev/null || echo "Unknown" ;;
    *)       echo "Usage: itdlupanel {start|stop|restart|status|version|update|uninstall}" ;;
esac
MGMT

    chmod +x "${target}"
    success "Management command installed: itdlupanel {start|stop|restart|status}"
}

# ── Start Service ────────────────────────────────────────────────────────────
start_service() {
    step "Starting ITDLUPanel..."

    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        systemctl restart "${SERVICE_NAME}"
        success "ITDLUPanel restarted."
    else
        systemctl start "${SERVICE_NAME}"
        success "ITDLUPanel started."
    fi
}

# ── Show Completion Banner ───────────────────────────────────────────────────
show_banner() {
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    ip="${ip:-127.0.0.1}"

    echo ""
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  ✅ ITDLUPanel installed successfully!${NC}"
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}Panel URL:${NC}       http://${ip}:${PANEL_PORT}"
    echo -e "  ${BOLD}Default User:${NC}    admin"
    echo -e "  ${BOLD}Default Pass:${NC}    itdlupanel"
    echo ""
    echo -e "  ${BOLD}Install Dir:${NC}     ${INSTALL_DIR}"
    echo -e "  ${BOLD}Manage:${NC}          itdlupanel {start|stop|restart|status}"
    echo -e "  ${BOLD}Logs:${NC}            ${LOGS_DIR}"
    echo ""
    echo -e "  ${YELLOW}⚠  Please change the default password immediately!${NC}"
    echo ""
}

# ── Uninstall ────────────────────────────────────────────────────────────────
uninstall() {
    check_root

    echo -e "${RED}${BOLD}╔═══════════════════════════════════════════════╗${NC}"
    echo -e "${RED}${BOLD}║      ITDLUPanel Uninstall                     ║${NC}"
    echo -e "${RED}${BOLD}╚═══════════════════════════════════════════════╝${NC}"
    echo ""

    read -rp "Are you sure you want to uninstall ITDLUPanel? [y/N]: " confirm
    if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
        info "Uninstall cancelled."
        exit 0
    fi

    step "Stopping service..."
    systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
    systemctl disable "${SERVICE_NAME}" 2>/dev/null || true

    step "Removing service file..."
    rm -f "${SERVICE_FILE}"
    systemctl daemon-reload

    step "Removing management script..."
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

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
    echo ""
    echo -e "${CYAN}${BOLD}╔═══════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}${BOLD}║      ITDLUPanel Installer v1.0                ║${NC}"
    echo -e "${CYAN}${BOLD}║      Linux Server Management Panel            ║${NC}"
    echo -e "${CYAN}${BOLD}╚═══════════════════════════════════════════════╝${NC}"
    echo ""

    check_root
    detect_os
    detect_arch
    check_requirements
    install_dependencies
    create_directories
    download_binary
    install_service
    generate_config
    install_management_script
    start_service
    show_banner
}

# Handle --uninstall flag
if [[ "${1:-}" == "--uninstall" || "${1:-}" == "uninstall" ]]; then
    uninstall
    exit 0
fi

main "$@"
