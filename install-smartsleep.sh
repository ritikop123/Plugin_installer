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

download_file() {
    local url="$1"
    local dest="$2"
    curl -sL -H 'Cache-Control: no-cache, no-store' "${url}?$(date +%s%N)" -o "${dest}"
}

prompt_config_credentials() {
    local target_file="$1"
    echo ""
    echo -e "${C_CYAN}Please enter your Pterodactyl details for the node daemon:${C_RESET}"
    echo -e "  ${C_YELLOW}Panel URL:${C_RESET} Base URL of your Pterodactyl panel (e.g. https://panel.igc.in.net)"
    echo -e "  ${C_YELLOW}Application API Key (ptla_...):${C_RESET} Created at Admin -> Application API (/admin/api)."
    echo -e "    ${C_GREEN}IMPORTANT:${C_RESET} Give ${C_BOLD}READ${C_RESET} permission to ${C_BOLD}Servers, Nodes, and Allocations${C_RESET}."
    echo -e "  ${C_YELLOW}Client API Key (ptlc_...):${C_RESET} Created at Account -> API Credentials (/account/api)."
    echo ""
    read -rp "  Pterodactyl Panel URL (e.g. https://panel.example.com): " CONF_URL
    CONF_URL="${CONF_URL%/}"
    read -rp "  Pterodactyl Application API Key (ptla_...): " CONF_APP_KEY
    read -rp "  Pterodactyl Client API Key (ptlc_...): " CONF_CLIENT_KEY
    read -rp "  This Node ID in Pterodactyl (default 1): " CONF_NODE_ID
    CONF_NODE_ID=${CONF_NODE_ID:-1}

    mkdir -p "$(dirname "${target_file}")"
    cat <<EOF > "${target_file}"
panel:
  url: "${CONF_URL}"
  api_key: "${CONF_APP_KEY}"
  client_api_key: "${CONF_CLIENT_KEY}"
  node_id: ${CONF_NODE_ID}

sleep:
  enabled: true
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
    log_success "Configuration saved at ${target_file}"
}

install_node_daemon() {
    print_banner
    echo -e "${C_BOLD}=== STEP 1: Installing SmartSleep Node Daemon ===${C_RESET}\n"

    ensure_root
    install_go_if_missing

    mkdir -p "${SMARTSLEEP_DIR}"
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
    CLEANUP_BUILD=0

    if [ -n "$SCRIPT_DIR" ] && [ -d "${SCRIPT_DIR}/smartsleep/daemon" ]; then
        log_info "Using local repository source files from ${SCRIPT_DIR}..."
        SRC_DIR="${SCRIPT_DIR}/smartsleep/daemon"
    elif command -v git &>/dev/null; then
        log_info "Cloning latest SmartSleep source from GitHub..."
        BUILD_DIR="/tmp/smartsleep-build-$(date +%s)"
        rm -rf "${BUILD_DIR}"
        git clone --depth=1 https://github.com/ritikop123/Plugin_installer.git "${BUILD_DIR}"
        SRC_DIR="${BUILD_DIR}/smartsleep/daemon"
        CLEANUP_BUILD=1
    else
        log_info "Downloading SmartSleep daemon source files..."
        BUILD_DIR="/tmp/smartsleep-build-$(date +%s)"
        mkdir -p "${BUILD_DIR}/cmd/smartsleep"
        mkdir -p "${BUILD_DIR}/internal/config"
        mkdir -p "${BUILD_DIR}/internal/ptero"
        mkdir -p "${BUILD_DIR}/internal/gateway"
        mkdir -p "${BUILD_DIR}/internal/monitor"
        mkdir -p "${BUILD_DIR}/internal/security"

        download_file "${REPO_BASE}/smartsleep/daemon/go.mod" "${BUILD_DIR}/go.mod"
        download_file "${REPO_BASE}/smartsleep/daemon/cmd/smartsleep/main.go" "${BUILD_DIR}/cmd/smartsleep/main.go"
        download_file "${REPO_BASE}/smartsleep/daemon/internal/config/config.go" "${BUILD_DIR}/internal/config/config.go"
        download_file "${REPO_BASE}/smartsleep/daemon/internal/ptero/client.go" "${BUILD_DIR}/internal/ptero/client.go"
        download_file "${REPO_BASE}/smartsleep/daemon/internal/gateway/java_listener.go" "${BUILD_DIR}/internal/gateway/java_listener.go"
        download_file "${REPO_BASE}/smartsleep/daemon/internal/gateway/bedrock_listener.go" "${BUILD_DIR}/internal/gateway/bedrock_listener.go"
        download_file "${REPO_BASE}/smartsleep/daemon/internal/gateway/port_manager.go" "${BUILD_DIR}/internal/gateway/port_manager.go"
        download_file "${REPO_BASE}/smartsleep/daemon/internal/security/ratelimit.go" "${BUILD_DIR}/internal/security/ratelimit.go"
        download_file "${REPO_BASE}/smartsleep/daemon/internal/monitor/tracker.go" "${BUILD_DIR}/internal/monitor/tracker.go"
        SRC_DIR="${BUILD_DIR}"
        CLEANUP_BUILD=1
    fi

    log_info "Compiling SmartSleep binary..."
    cd "${SRC_DIR}"
    go mod tidy
    CGO_ENABLED=0 go build -ldflags="-s -w" -o "${BINARY_PATH}" cmd/smartsleep/main.go
    chmod +x "${BINARY_PATH}"
    if [ "$CLEANUP_BUILD" -eq 1 ]; then
        rm -rf "${BUILD_DIR}"
    fi
    log_success "SmartSleep binary built at ${BINARY_PATH}"

    # Configure /etc/smartsleep/config.yaml
    CONFIG_FILE="${SMARTSLEEP_DIR}/config.yaml"
    RECONFIGURE=0
    if [ -f "${CONFIG_FILE}" ]; then
        echo ""
        read -rp "  Existing config found at ${CONFIG_FILE}. Keep existing settings? [Y/n]: " KEEP_CONF
        if [[ "$KEEP_CONF" =~ ^[Nn] ]]; then
            RECONFIGURE=1
        fi
    else
        RECONFIGURE=1
    fi

    if [ "$RECONFIGURE" -eq 1 ]; then
        prompt_config_credentials "${CONFIG_FILE}"
    else
        log_info "Preserving existing configuration at ${CONFIG_FILE}."
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
    systemctl enable smartsleep
    systemctl restart smartsleep
    log_success "SmartSleep systemd service enabled and restarted!"
    echo ""
    systemctl status smartsleep --no-pager --lines=8 || true
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
    if [ -n "$SCRIPT_DIR" ] && [ -f "${SCRIPT_DIR}/smartsleep/panel-addon/SmartSleepController.php" ]; then
        cp "${SCRIPT_DIR}/smartsleep/panel-addon/SmartSleepController.php" "${CTRL_DIR}/SmartSleepController.php"
    else
        download_file "${REPO_BASE}/smartsleep/panel-addon/SmartSleepController.php" "${CTRL_DIR}/SmartSleepController.php"
    fi
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

    # 2b. Ensure smartsleep_enabled database column exists (Default: 1 / Enabled for all servers)
    log_info "Ensuring smartsleep_enabled database column exists..."
    php artisan tinker --execute="
    if (!\Illuminate\Support\Facades\Schema::hasColumn('servers', 'smartsleep_enabled')) {
        \Illuminate\Support\Facades\Schema::table('servers', function (\$table) {
            \$table->boolean('smartsleep_enabled')->default(true);
        });
        echo 'Database column smartsleep_enabled added.';
    }
    " || true

    # 2c. Inject SmartSleep into Admin Server Build View (where RAM/CPU/Disk are defined)
    BUILD_VIEW="${PTERO_DIR}/resources/views/admin/servers/view/build.blade.php"
    if [ -f "${BUILD_VIEW}" ] && ! grep -q "pSmartSleepEnabled" "${BUILD_VIEW}"; then
        log_info "Injecting SmartSleep toggle into Admin Server Build configuration..."
        SMARTSLEEP_BUILD_HTML='<div class="col-xs-12"><div class="box box-primary"><div class="box-header with-border"><h3 class="box-title">SmartSleep Optimization</h3></div><div class="box-body"><div class="form-group"><label for="pSmartSleepEnabled" class="control-label">SmartSleep Auto-Hibernation</label><div><select name="smartsleep_enabled" id="pSmartSleepEnabled" class="form-control"><option value="1" {{ ($server->smartsleep_enabled ?? 1) ? "selected" : "" }}>Enabled (Default: Auto-hibernate when 0 players to save RAM/CPU)</option><option value="0" {{ !($server->smartsleep_enabled ?? 1) ? "selected" : "" }}>Disabled (Keep 24/7 Always On - e.g. Velocity / BungeeCord / Hub)</option></select></div><p class="text-muted small">Controls whether SmartSleep can hibernate this server. Defaults to <strong>Enabled</strong> for all servers. Set to <strong>Disabled</strong> for proxy servers or servers that must never sleep.</p></div></div></div></div>'
        sed -i "/<\/form>/i \\$SMARTSLEEP_BUILD_HTML" "${BUILD_VIEW}" || true
    fi

    # 2d. Update ServerBuildController.php to save smartsleep_enabled
    BUILD_CTRL="${PTERO_DIR}/app/Http/Controllers/Admin/Servers/ServerBuildController.php"
    if [ -f "${BUILD_CTRL}" ] && ! grep -q "smartsleep_enabled" "${BUILD_CTRL}"; then
        log_info "Updating ServerBuildController to save smartsleep_enabled setting..."
        sed -i "s/'oom_disabled' => \$request->input('oom_disabled'),/'oom_disabled' => \$request->input('oom_disabled'),\n            'smartsleep_enabled' => (bool) \$request->input('smartsleep_enabled', true),/" "${BUILD_CTRL}" || true
    fi

    # 2e. Update ServerTransformer.php to export smartsleep_enabled to Application API
    TRANSFORMER="${PTERO_DIR}/app/Transformers/Api/Application/ServerTransformer.php"
    if [ -f "${TRANSFORMER}" ] && ! grep -q "smartsleep_enabled" "${TRANSFORMER}"; then
        log_info "Exporting smartsleep_enabled in ServerTransformer..."
        sed -i "s/'created_at' => \$server->created_at->toIso8601String(),/'created_at' => \$server->created_at->toIso8601String(),\n            'smartsleep_enabled' => (bool) (\$server->smartsleep_enabled ?? true),/" "${TRANSFORMER}" || true
    fi

    # 3. Install React Component
    COMP_DIR="${PTERO_DIR}/resources/scripts/components/server/smartsleep"
    mkdir -p "${COMP_DIR}"
    log_info "Installing SmartSleepContainer.tsx..."
    if [ -n "$SCRIPT_DIR" ] && [ -f "${SCRIPT_DIR}/smartsleep/panel-addon/SmartSleepContainer.tsx" ]; then
        cp "${SCRIPT_DIR}/smartsleep/panel-addon/SmartSleepContainer.tsx" "${COMP_DIR}/SmartSleepContainer.tsx"
    else
        download_file "${REPO_BASE}/smartsleep/panel-addon/SmartSleepContainer.tsx" "${COMP_DIR}/SmartSleepContainer.tsx"
    fi
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
    log_info "Rebuilding panel frontend assets with Webpack & Yarn..."
    export NODE_OPTIONS="--openssl-legacy-provider --max-old-space-size=4096"
    NODE_OPTIONS="--openssl-legacy-provider --max-old-space-size=4096" yarn build:production || \
    NODE_OPTIONS="--openssl-legacy-provider --max-old-space-size=4096" npm run build:production || \
    yarn build:production || \
    npm run build:production || true

    # 7. Clear Laravel Caches & Set Permissions
    log_info "Clearing Laravel caches and setting permissions..."
    php artisan view:clear || true
    php artisan cache:clear || true
    php artisan config:clear || true
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

toggle_node_smartsleep() {
    print_banner
    echo -e "${C_BOLD}=== Toggle SmartSleep ON/OFF on this Node ===${C_RESET}\n"

    ensure_root
    if [ ! -f "${BINARY_PATH}" ] || [ ! -f "${SMARTSLEEP_DIR}/config.yaml" ]; then
        log_error "SmartSleep is not installed on this node."
        exit 1
    fi

    echo -e "Current status:"
    ${BINARY_PATH} -status || true
    echo ""
    echo "  [1] ENABLE SmartSleep on this node"
    echo "  [2] DISABLE SmartSleep on this node"
    echo "  [3] Cancel"
    echo ""
    read -rp "Enter choice [1-3]: " TOGGLE_CHOICE

    case "$TOGGLE_CHOICE" in
        1)
            ${BINARY_PATH} -enable
            systemctl restart smartsleep || true
            log_success "SmartSleep enabled on this node and daemon restarted."
            ;;
        2)
            ${BINARY_PATH} -disable
            systemctl restart smartsleep || true
            log_success "SmartSleep disabled on this node and daemon restarted."
            ;;
        *)
            echo "Cancelled."
            ;;
    esac
}

set_global_timeout() {
    print_banner
    echo -e "${C_BOLD}=== Set Global Inactivity Timeout for this Node ===${C_RESET}\n"

    ensure_root
    if [ ! -f "${BINARY_PATH}" ] || [ ! -f "${SMARTSLEEP_DIR}/config.yaml" ]; then
        log_error "SmartSleep is not installed on this node."
        exit 1
    fi

    echo -e "Current status:"
    ${BINARY_PATH} -status || true
    echo ""
    echo "Common options:"
    echo -e "  • ${C_GREEN}2m${C_RESET}   (Fast testing: hibernates after 2 minutes of 0 players)"
    echo -e "  • ${C_CYAN}5m${C_RESET}   (Short testing / aggressive savings)"
    echo -e "  • ${C_BLUE}20m${C_RESET}  (Standard recommended default)"
    echo -e "  • ${C_YELLOW}30m${C_RESET}  (Relaxed)"
    echo ""
    read -rp "Enter desired timeout (e.g. 2m, 5m, 20m): " NEW_TIMEOUT
    if [ -n "$NEW_TIMEOUT" ]; then
        ${BINARY_PATH} -timeout "${NEW_TIMEOUT}"
        systemctl restart smartsleep || true
        log_success "Global timeout updated to ${NEW_TIMEOUT} and smartsleep daemon restarted!"
    else
        echo "No changes made."
    fi
}

reconfigure_credentials() {
    print_banner
    echo -e "${C_BOLD}=== Reconfigure SmartSleep API Credentials ===${C_RESET}\n"
    ensure_root
    prompt_config_credentials "${SMARTSLEEP_DIR}/config.yaml"
    systemctl restart smartsleep || true
    log_success "Credentials updated and daemon restarted!"
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
    --enable-node)
        ${BINARY_PATH} -enable && systemctl restart smartsleep
        ;;
    --disable-node)
        ${BINARY_PATH} -disable && systemctl restart smartsleep
        ;;
    --status-node)
        ${BINARY_PATH} -status
        ;;
    --timeout)
        if [ -n "$2" ]; then
            ${BINARY_PATH} -timeout "$2" && systemctl restart smartsleep
        else
            set_global_timeout
        fi
        ;;
    --config)
        reconfigure_credentials
        ;;
    --uninstall)
        uninstall
        ;;
    *)
        print_banner
        echo "Where to install SmartSleep:"
        echo -e "  ${C_CYAN}• Node VPS (Wings):${C_RESET} Runs the Go daemon to listen on sleeping ports & wake servers."
        echo -e "  ${C_CYAN}• Panel VPS (Web):${C_RESET}  Provides the UI tab for customers to customize sleep timers."
        echo ""
        echo "Please select an option:"
        echo ""
        echo "  [1] Install SmartSleep Node Daemon (Run on Wings node VPS)"
        echo "  [2] Install SmartSleep Panel UI Addon (Run on Pterodactyl web VPS)"
        echo "  [3] Install Both (If your Panel and Wings node share the same VPS)"
        echo "  [4] Toggle SmartSleep ON/OFF on this Node"
        echo "  [5] Change Global Inactivity Timeout (e.g. set 2m for fast testing)"
        echo "  [6] Reconfigure Panel URL & API Keys"
        echo "  [7] Uninstall SmartSleep"
        echo "  [8] Exit"
        echo ""
        read -rp "Enter choice [1-8]: " CHOICE
        case "$CHOICE" in
            1) install_node_daemon ;;
            2) install_panel_addon ;;
            3) install_node_daemon; install_panel_addon ;;
            4) toggle_node_smartsleep ;;
            5) set_global_timeout ;;
            6) reconfigure_credentials ;;
            7) uninstall ;;
            *) echo "Exiting."; exit 0 ;;
        esac
        ;;
esac

