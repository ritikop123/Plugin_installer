#!/bin/bash
# ====================================================================
# SmartSleep Gateway - 1-Click Installer & Manager
# Automated Minecraft Server Hibernation & Wake-on-Join for Pterodactyl
# ====================================================================

set -e

# Styling
C_RESET='\033[0m'
C_BOLD='\033[1m'
C_GREEN='\033[38;5;48m'
C_BLUE='\033[38;5;75m'
C_CYAN='\033[38;5;80m'
C_YELLOW='\033[38;5;220m'
C_RED='\033[38;5;196m'
C_PURPLE='\033[38;5;141m'

REPO_BASE="https://raw.githubusercontent.com/ritikop123/Plugin_installer/main"
PTERO_DIR="/var/www/pterodactyl"
SMARTSLEEP_DIR="/etc/smartsleep"
BINARY_PATH="/usr/local/bin/smartsleep"

print_banner() {
    clear
    echo -e "${C_PURPLE}${C_BOLD}"
    echo "  ███████╗███╗   ███╗ █████╗ ██████╗ ████████╗███████╗██╗     ███████╗███████╗██████╗ "
    echo "  ██╔════╝████╗ ████║██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██║     ██╔════╝██╔════╝██╔══██╗"
    echo "  ███████╗██╔████╔██║███████║██████╔╝   ██║   ███████╗██║     █████╗  █████╗  ██████╔╝"
    echo "  ╚════██║██║╚██╔╝██║██╔══██║██╔══██╗   ██║   ╚════██║██║     ██╔══╝  ██╔══╝  ██╔═══╝ "
    echo "  ███████║██║ ╚═╝ ██║██║  ██║██║  ██║   ██║   ███████║███████╗███████╗███████╗██║     "
    echo "  ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚══════╝╚══════╝╚══════╝╚═╝     "
    echo -e "${C_RESET}"
    echo -e "  ${C_CYAN}Automated Server Hibernation & Wake-on-Join System for Pterodactyl${C_RESET}"
    echo -e "  ${C_BLUE}Supports Java (TCP) & Bedrock / Geyser (UDP RakNet)${C_RESET}"
    echo -e "  ----------------------------------------------------------------------"
    echo ""
}

log_info() {
    echo -e " ${C_BLUE}[INFO]${C_RESET} $1"
}

log_success() {
    echo -e " ${C_GREEN}[SUCCESS]${C_RESET} $1"
}

log_warning() {
    echo -e " ${C_YELLOW}[WARNING]${C_RESET} $1"
}

log_error() {
    echo -e " ${C_RED}[ERROR]${C_RESET} $1"
}

ensure_root() {
    if [ "$(id -u)" != "0" ]; then
        log_error "This installer must be run as root (sudo)."
        exit 1
    fi
}

install_go_if_missing() {
    if command -v go &>/dev/null; then
        GO_VER=$(go version | awk '{print $3}')
        log_info "Found existing Go installation: ${GO_VER}"
        return
    fi

    log_info "Go compiler not found. Installing Go 1.21..."
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64) GO_ARCH="amd64" ;;
        aarch64|arm64) GO_ARCH="arm64" ;;
        *) log_error "Unsupported architecture: $ARCH"; exit 1 ;;
    esac

    TMP_TAR="/tmp/go1.21.6.linux-${GO_ARCH}.tar.gz"
    curl -sL -o "$TMP_TAR" "https://go.dev/dl/go1.21.6.linux-${GO_ARCH}.tar.gz"
    rm -rf /usr/local/go
    tar -C /usr/local -xzf "$TMP_TAR"
    rm -f "$TMP_TAR"

    export PATH=$PATH:/usr/local/go/bin
    if ! grep -q '/usr/local/go/bin' /etc/profile; then
        echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
    fi
    log_success "Go installed successfully ($(go version | awk '{print $3}'))."
}

install_node_daemon() {
    print_banner
    echo -e "${C_BOLD}=== STEP 1: Installing SmartSleep Node Daemon ===${C_RESET}\n"

    ensure_root
    install_go_if_missing

    mkdir -p "${SMARTSLEEP_DIR}"
    BUILD_DIR="/tmp/smartsleep-build-$(date +%s)"
    mkdir -p "${BUILD_DIR}"

    log_info "Downloading SmartSleep daemon source..."
    mkdir -p "${BUILD_DIR}/cmd/smartsleep"
    mkdir -p "${BUILD_DIR}/internal/config"
    mkdir -p "${BUILD_DIR}/internal/ptero"
    mkdir -p "${BUILD_DIR}/internal/gateway"
    mkdir -p "${BUILD_DIR}/internal/monitor"
    mkdir -p "${BUILD_DIR}/internal/security"

    curl -sL "${REPO_BASE}/smartsleep/daemon/go.mod" -o "${BUILD_DIR}/go.mod"
    curl -sL "${REPO_BASE}/smartsleep/daemon/cmd/smartsleep/main.go" -o "${BUILD_DIR}/cmd/smartsleep/main.go"
    curl -sL "${REPO_BASE}/smartsleep/daemon/internal/config/config.go" -o "${BUILD_DIR}/internal/config/config.go"
    curl -sL "${REPO_BASE}/smartsleep/daemon/internal/ptero/client.go" -o "${BUILD_DIR}/internal/ptero/client.go"
    curl -sL "${REPO_BASE}/smartsleep/daemon/internal/gateway/java_listener.go" -o "${BUILD_DIR}/internal/gateway/java_listener.go"
    curl -sL "${REPO_BASE}/smartsleep/daemon/internal/gateway/bedrock_listener.go" -o "${BUILD_DIR}/internal/gateway/bedrock_listener.go"
    curl -sL "${REPO_BASE}/smartsleep/daemon/internal/gateway/port_manager.go" -o "${BUILD_DIR}/internal/gateway/port_manager.go"
    curl -sL "${REPO_BASE}/smartsleep/daemon/internal/security/ratelimit.go" -o "${BUILD_DIR}/internal/security/ratelimit.go"
    curl -sL "${REPO_BASE}/smartsleep/daemon/internal/monitor/tracker.go" -o "${BUILD_DIR}/internal/monitor/tracker.go"

    log_info "Compiling SmartSleep binary..."
    cd "${BUILD_DIR}"
    go mod tidy
    CGO_ENABLED=0 go build -ldflags="-s -w" -o "${BINARY_PATH}" cmd/smartsleep/main.go
    chmod +x "${BINARY_PATH}"
    rm -rf "${BUILD_DIR}"
    log_success "SmartSleep binary built at ${BINARY_PATH}"

    # Configure /etc/smartsleep/config.yaml
    CONFIG_FILE="${SMARTSLEEP_DIR}/config.yaml"
    if [ ! -f "${CONFIG_FILE}" ]; then
        echo ""
        echo -e "${C_CYAN}Please enter your Pterodactyl details for the node daemon:${C_RESET}"
        read -rp "  Pterodactyl Panel URL (e.g. https://panel.example.com): " CONF_URL
        read -rp "  Pterodactyl Application API Key (ptla_...): " CONF_APP_KEY
        read -rp "  Pterodactyl Client API Key (ptlc_...): " CONF_CLIENT_KEY
        read -rp "  This Node ID in Pterodactyl (default 1): " CONF_NODE_ID
        CONF_NODE_ID=${CONF_NODE_ID:-1}

        cat <<EOF > "${CONFIG_FILE}"
panel:
  url: "${CONF_URL}"
  api_key: "${CONF_APP_KEY}"
  client_api_key: "${CONF_CLIENT_KEY}"
  node_id: ${CONF_NODE_ID}

sleep:
  default_idle_timeout: 20m
  check_interval: 30s
  grace_period: 3m
  sleeping_motd: "§a%s §7[Sleeping]\n§eJoin server to wake it up!"
  wake_message: "§e[SmartSleep] §aServer is currently sleeping and is waking up!\n§fPlease wait §e30 seconds – 1 minute §ffor the server to start, then rejoin."
  bedrock_enabled: true
  bedrock_wake_message: "§e[SmartSleep] §aServer is sleeping and waking up now! Please wait 30s - 1m and rejoin."

security:
  wake_cooldown_seconds: 60
  max_wakes_per_window: 3
  window_seconds: 300
  crash_threshold_seconds: 45
EOF
        log_success "Configuration created at ${CONFIG_FILE}"
    else
        log_info "Existing config found at ${CONFIG_FILE}. Preserving settings."
    fi

    # Create systemd service
    log_info "Creating systemd service..."
    cat <<EOF > /etc/systemd/system/smartsleep.service
[Unit]
Description=SmartSleep Gateway Daemon
After=network.target wings.service
Wants=wings.service

[Service]
Type=simple
User=root
ExecStart=${BINARY_PATH} -config ${CONFIG_FILE}
Restart=always
RestartSec=5s
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable --now smartsleep
    log_success "SmartSleep systemd service enabled and started!"
    echo ""
    systemctl status smartsleep --no-pager --lines=5 || true
}

install_panel_addon() {
    print_banner
    echo -e "${C_BOLD}=== STEP 2: Installing SmartSleep Panel Addon ===${C_RESET}\n"

    ensure_root
    if [ ! -d "${PTERO_DIR}" ]; then
        log_error "Pterodactyl directory not found at ${PTERO_DIR}."
        exit 1
    fi

    cd "${PTERO_DIR}"

    # 1. Install Controller
    log_info "Installing SmartSleepController.php..."
    CTRL_DIR="${PTERO_DIR}/app/Http/Controllers/Api/Client/Servers"
    mkdir -p "${CTRL_DIR}"
    curl -sL "${REPO_BASE}/smartsleep/panel-addon/SmartSleepController.php" -o "${CTRL_DIR}/SmartSleepController.php"
    chown -R www-data:www-data "${CTRL_DIR}/SmartSleepController.php"

    # 2. Add Routes
    ROUTE_FILE="${PTERO_DIR}/routes/api-client.php"
    if ! grep -q "SmartSleepController" "${ROUTE_FILE}"; then
        log_info "Registering SmartSleep API routes..."
        cat << 'EOF' >> "${ROUTE_FILE}"

/* >>> SMARTSLEEP START >>> */
Route::group(['prefix' => '/servers/{server}/smartsleep'], function () {
    Route::get('/', [Client\Servers\SmartSleepController::class, 'index']);
    Route::post('/', [Client\Servers\SmartSleepController::class, 'update']);
    Route::post('/wake', [Client\Servers\SmartSleepController::class, 'wake']);
});
/* <<< SMARTSLEEP END <<< */
EOF
        log_success "API routes registered."
    else
        log_info "API routes already registered."
    fi

    # 3. Install React Component
    COMP_DIR="${PTERO_DIR}/resources/scripts/components/server/smartsleep"
    mkdir -p "${COMP_DIR}"
    log_info "Installing SmartSleepContainer.tsx..."
    curl -sL "${REPO_BASE}/smartsleep/panel-addon/SmartSleepContainer.tsx" -o "${COMP_DIR}/SmartSleepContainer.tsx"
    chown -R www-data:www-data "${COMP_DIR}"

    # 4. Inject into ServerRouter.tsx
    ROUTER_FILE="${PTERO_DIR}/resources/scripts/routers/ServerRouter.tsx"
    if [ -f "${ROUTER_FILE}" ] && ! grep -q "SmartSleepContainer" "${ROUTER_FILE}"; then
        log_info "Registering route in ServerRouter.tsx..."
        # Add import
        sed -i "1i import SmartSleepContainer from '@/components/server/smartsleep/SmartSleepContainer';" "${ROUTER_FILE}"
        # Add route before last switch close
        sed -i "/<\/Switch>/i \                <Route path={'/server/:id/smartsleep'} component={SmartSleepContainer} exact />" "${ROUTER_FILE}"
    fi

    # 5. Inject Navigation Link into Navigation Bar
    NAV_FILE="${PTERO_DIR}/resources/scripts/components/server/SubNavigation.tsx"
    if [ ! -f "${NAV_FILE}" ]; then
        NAV_FILE="${PTERO_DIR}/resources/scripts/components/server/ServerNavigationBar.tsx"
    fi

    if [ -f "${NAV_FILE}" ] && ! grep -q "smartsleep" "${NAV_FILE}"; then
        log_info "Injecting SmartSleep link into navigation..."
        if ! grep -q "faMoon" "${NAV_FILE}"; then
            sed -i "s/import {/import { faMoon,/" "${NAV_FILE}"
        fi
        sed -i "/<\/div>/i \                <NavLink to={\`\/server\/\${id}\/smartsleep\`}>\\n                    <FontAwesomeIcon icon={faMoon} \/> SmartSleep\\n                <\/NavLink>" "${NAV_FILE}" || true
    fi

    # 6. Rebuild Assets
    log_info "Rebuilding panel frontend assets with Yarn..."
    export NODE_OPTIONS="--max-old-space-size=4096"
    yarn build:production || npm run build:production
    chown -R www-data:www-data "${PTERO_DIR}"

    log_success "SmartSleep Panel Addon successfully installed!"
}

uninstall() {
    print_banner
    echo -e "${C_BOLD}=== Uninstalling SmartSleep ===${C_RESET}\n"

    # Stop and remove daemon
    if systemctl is-active --quiet smartsleep 2>/dev/null || [ -f /etc/systemd/system/smartsleep.service ]; then
        log_info "Stopping and removing SmartSleep systemd service..."
        systemctl stop smartsleep || true
        systemctl disable smartsleep || true
        rm -f /etc/systemd/system/smartsleep.service
        systemctl daemon-reload
    fi

    rm -f "${BINARY_PATH}"
    rm -rf "${SMARTSLEEP_DIR}"
    log_success "SmartSleep Node Daemon removed."

    # Remove Panel Addon files
    if [ -d "${PTERO_DIR}" ]; then
        rm -f "${PTERO_DIR}/app/Http/Controllers/Api/Client/Servers/SmartSleepController.php"
        rm -rf "${PTERO_DIR}/resources/scripts/components/server/smartsleep"
        sed -i '/\/\* >>> SMARTSLEEP START >>> \*\//,/\/\* <<< SMARTSLEEP END <<< \*\//d' "${PTERO_DIR}/routes/api-client.php" || true
        log_success "Panel routes and files removed. Run yarn build:production if you wish to rebuild assets."
    fi

    log_success "Uninstall completed."
}

# Parse command line flags or interactive menu
case "$1" in
    --node)
        install_node_daemon
        ;;
    --panel)
        install_panel_addon
        ;;
    --all)
        install_node_daemon
        install_panel_addon
        ;;
    --uninstall)
        uninstall
        ;;
    *)
        print_banner
        echo "Please select an installation mode:"
        echo ""
        echo "  [1] Install SmartSleep Node Daemon (Run on Wings node)"
        echo "  [2] Install SmartSleep Panel UI Addon (Run on Pterodactyl web server)"
        echo "  [3] Install Both (If your Panel and Wings node share the same VPS)"
        echo "  [4] Uninstall SmartSleep"
        echo "  [5] Exit"
        echo ""
        read -rp "Enter choice [1-5]: " CHOICE
        case "$CHOICE" in
            1) install_node_daemon ;;
            2) install_panel_addon ;;
            3) install_node_daemon; install_panel_addon ;;
            4) uninstall ;;
            *) echo "Exiting."; exit 0 ;;
        esac
        ;;
esac
