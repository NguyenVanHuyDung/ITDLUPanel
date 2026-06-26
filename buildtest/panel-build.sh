#!/bin/bash
# =============================================================================
# ITDLUPanel Build & Restart Tool
# Builds the panel binary and restarts the service
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BINARY_NAME="itdlupanel"
BINARY_PATH="$PROJECT_DIR/bin/$BINARY_NAME"
CONFIG_PATH="$PROJECT_DIR/config/panel.json"
MAKEFILE="$PROJECT_DIR/Makefile"

# Panel config (cached)
PANEL_HOST=""
PANEL_PORT=""
PANEL_SSL=""

# =============================================================================
# Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Find Go binary (prefer newer versions)
find_go() {
    local go_paths=(
        "/usr/local/go/bin/go"
        "/usr/local/go-old/bin/go"
        "/usr/bin/go"
    )
    
    for go_path in "${go_paths[@]}"; do
        if [ -x "$go_path" ]; then
            local version=$("$go_path" version 2>/dev/null | grep -oP 'go\K[0-9]+\.[0-9]+' || echo "0")
            local major=$(echo "$version" | cut -d. -f1)
            local minor=$(echo "$version" | cut -d. -f2)
            
            # Prefer Go 1.21+
            if [ "$major" -ge 2 ] || [ "$major" -eq 1 ] && [ "$minor" -ge 21 ]; then
                echo "$go_path"
                return 0
            fi
        fi
    done
    
    log_error "No suitable Go installation found (need Go 1.21+)"
    return 1
}

# Load panel config once
load_panel_config() {
    if [ -n "$PANEL_HOST" ]; then
        return
    fi
    
    if [ -f "$CONFIG_PATH" ]; then
        PANEL_HOST=$(grep -oP '"host"\s*:\s*"\K[^"]+' "$CONFIG_PATH" 2>/dev/null || echo "0.0.0.0")
        PANEL_PORT=$(grep -oP '"port"\s*:\s*\K[0-9]+' "$CONFIG_PATH" 2>/dev/null || echo "8888")
        PANEL_SSL=$(grep -oP '"ssl"\s*:\s*\K(true|false)' "$CONFIG_PATH" 2>/dev/null || echo "false")
    else
        PANEL_HOST="0.0.0.0"
        PANEL_PORT="8888"
        PANEL_SSL="false"
    fi
}

# Get panel PID
get_panel_pid() {
    # Find the actual itdlupanel binary process (not bash wrapper)
    pgrep -x itdlupanel 2>/dev/null | head -1 || echo ""
}

# Check panel health
check_health() {
    load_panel_config
    
    local scheme="http"
    if [ "$PANEL_SSL" = "true" ]; then
        scheme="https"
    fi
    
    # Try localhost first
    local url="${scheme}://localhost:${PANEL_PORT}/api/v1/health"
    
    if curl -s -k --connect-timeout 5 "$url" 2>/dev/null | grep -q '"status"'; then
        return 0
    fi
    
    # Try with host IP if not 0.0.0.0
    if [ "$PANEL_HOST" != "0.0.0.0" ] && [ "$PANEL_HOST" != "localhost" ]; then
        url="${scheme}://${PANEL_HOST}:${PANEL_PORT}/api/v1/health"
        if curl -s -k --connect-timeout 5 "$url" 2>/dev/null | grep -q '"status"'; then
            return 0
        fi
    fi
    
    return 1
}

# Build the panel
build_panel() {
    log_info "Finding Go installation..."
    GO_BIN=$(find_go)
    log_success "Using: $GO_BIN ($($GO_BIN version | grep -oP 'go version go\K.*'))"
    
    log_info "Building $BINARY_NAME..."
    
    # Use make if available
    if [ -f "$MAKEFILE" ]; then
        cd "$PROJECT_DIR"
        make build 2>&1 | while read line; do
            echo "  $line"
        done
    else
        # Direct build
        mkdir -p "$PROJECT_DIR/bin"
        cd "$PROJECT_DIR"
        
        local ldflags="-X main.version=1.0.0 -X main.buildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        $GO_BIN build -ldflags "$ldflags" -o "$BINARY_PATH" ./cmd/panel 2>&1 | while read line; do
            echo "  $line"
        done
    fi
    
    if [ $? -eq 0 ]; then
        log_success "Build successful!"
    else
        log_error "Build failed!"
        return 1
    fi
}

# Stop the panel
stop_panel() {
    local pid=$(get_panel_pid)
    
    if [ -z "$pid" ]; then
        log_warn "Panel not running"
        return 0
    fi
    
    log_info "Stopping panel (PID: $pid)..."
    kill "$pid" 2>/dev/null || true
    
    # Wait for process to stop
    local count=0
    while [ $count -lt 10 ]; do
        if ! kill -0 "$pid" 2>/dev/null; then
            log_success "Panel stopped"
            return 0
        fi
        sleep 0.5
        count=$((count + 1))
    done
    
    # Force kill if still running
    log_warn "Force killing panel..."
    kill -9 "$pid" 2>/dev/null || true
    sleep 1
    log_success "Panel stopped"
}

# Start the panel
start_panel() {
    log_info "Starting $BINARY_NAME..."
    cd "$PROJECT_DIR"
    nohup "$BINARY_PATH" -config "$CONFIG_PATH" > /var/log/itdlupanel.log 2>&1 &
    
    local pid=$!
    sleep 2
    
    if kill -0 "$pid" 2>/dev/null; then
        log_success "Panel started (PID: $pid)"
    else
        log_error "Failed to start panel"
        return 1
    fi
}

# Restart the panel (main function)
restart_panel() {
    echo "========================================"
    echo "  ITDLUPanel Build & Restart"
    echo "========================================"
    echo ""
    
    # Check project directory
    if [ ! -f "$PROJECT_DIR/cmd/panel/main.go" ]; then
        log_error "Project not found at $PROJECT_DIR"
        log_error "Please run this script from the buildtest directory"
        exit 1
    fi
    
    log_info "Project: $PROJECT_DIR"
    log_info "Binary: $BINARY_PATH"
    echo ""
    
    # Load config
    load_panel_config
    log_info "Panel config: $PANEL_HOST:$PANEL_PORT (SSL: $PANEL_SSL)"
    echo ""
    
    # Check if panel is running
    local current_pid=$(get_panel_pid)
    if [ -n "$current_pid" ]; then
        log_info "Panel currently running (PID: $current_pid)"
        stop_panel
        echo ""
    else
        log_info "Panel not running"
    fi
    
    # Build
    build_panel
    echo ""
    
    # Start panel
    start_panel
    echo ""
    
    # Wait for health check
    log_info "Waiting for panel to be ready..."
    local health_ok=false
    for i in {1..10}; do
        if check_health; then
            health_ok=true
            break
        fi
        sleep 1
    done
    
    echo ""
    if [ "$health_ok" = true ]; then
        load_panel_config
        local scheme="http"
        [ "$PANEL_SSL" = "true" ] && scheme="https"
        
        log_success "Panel is healthy and ready!"
        echo ""
        echo "========================================"
        echo -e "  ${GREEN}Panel restarted successfully!${NC}"
        echo "========================================"
        echo ""
        echo "  URL: ${scheme}://localhost:${PANEL_PORT}"
        echo "  PID: $(get_panel_pid)"
        echo ""
    else
        log_warn "Panel started but health check failed"
        log_warn "Check logs: tail -f /var/log/itdlupanel.log"
        echo ""
        exit 1
    fi
}

# Show status
show_status() {
    echo "========================================"
    echo "  ITDLUPanel Status"
    echo "========================================"
    echo ""
    
    load_panel_config
    
    local pid=$(get_panel_pid)
    
    if [ -n "$pid" ]; then
        log_success "Panel is RUNNING"
        echo ""
        echo "  PID:        $pid"
        echo "  Binary:     $(readlink -f /proc/$pid/exe 2>/dev/null || echo 'N/A')"
        echo "  Started:    $(ps -o lstart= -p $pid 2>/dev/null || echo 'N/A')"
        echo "  Memory:     $(ps -o rss= -p $pid 2>/dev/null | awk '{printf "%.1f MB", $1/1024}')"
        echo ""
        
        # Health check
        if check_health; then
            log_success "Health: OK"
        else
            log_error "Health: FAILED"
        fi
    else
        log_warn "Panel is NOT running"
    fi
    
    echo ""
}

# Show logs
show_logs() {
    local lines="${1:-50}"
    if [ -f /var/log/itdlupanel.log ]; then
        echo "Last $lines lines of panel log:"
        echo ""
        tail -n "$lines" /var/log/itdlupanel.log
    else
        log_warn "No log file found at /var/log/itdlupanel.log"
    fi
}

# =============================================================================
# Main
# =============================================================================

case "${1:-restart}" in
    restart|start)
        restart_panel
        ;;
    stop)
        stop_panel
        ;;
    build)
        build_panel
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "${2:-50}"
        ;;
    health)
        check_health && log_success "Panel is healthy" || log_error "Panel is not responding"
        ;;
    *)
        echo "Usage: $0 {restart|start|stop|build|status|logs|health}"
        echo ""
        echo "Commands:"
        echo "  restart  - Build and restart the panel (default)"
        echo "  start    - Build and restart the panel"
        echo "  stop     - Stop the panel"
        echo "  build    - Only build, don't restart"
        echo "  status   - Show panel status"
        echo "  logs     - Show panel logs (optional: number of lines)"
        echo "  health   - Check panel health"
        echo ""
        exit 1
        ;;
esac
