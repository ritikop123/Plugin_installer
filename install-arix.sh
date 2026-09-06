#!/usr/bin/env bash

# ==============================================================================
# Arix Theme Native Plugin Installer for Pterodactyl Panel (PHP Backend + React)
# GitHub: https://github.com/ritikop123/Plugin_installer
# ==============================================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "================================================================"
echo "    Arix Theme Plugin Installer (PHP Backend + Native Inject)   "
echo "           https://github.com/ritikop123/Plugin_installer       "
echo "================================================================"
echo -e "${NC}"

PTERO_DIR="/var/www/pterodactyl"

if [ ! -d "$PTERO_DIR" ]; then
  echo -e "${RED}[✗] Error: Pterodactyl directory not found at $PTERO_DIR!${NC}"
  echo -e "Please run this script directly on your Pterodactyl VPS as root."
  exit 1
fi

cd "$PTERO_DIR"

echo -e "${CYAN}[1/6] Backing up critical files...${NC}"
cp routes/api-client.php routes/api-client.php.bak 2>/dev/null || true
cp resources/scripts/routers/ServerRouter.tsx resources/scripts/routers/ServerRouter.tsx.bak 2>/dev/null || true

echo -e "${CYAN}[2/6] Installing PHP Backend Controller...${NC}"
CONTROLLER_DIR="app/Http/Controllers/Api/Client/Servers"
mkdir -p "$CONTROLLER_DIR"
curl -sSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/PluginInstallerController.php" \
  -o "${CONTROLLER_DIR}/PluginInstallerController.php"

echo -e "${CYAN}[3/6] Registering PHP API Routes in routes/api-client.php...${NC}"
ROUTES_FILE="routes/api-client.php"

# Clean old routes if present
sed -i '/PluginInstallerController/d' "$ROUTES_FILE" 2>/dev/null || true

# Inject PHP controller use statement and routes
if ! grep -q "PluginInstallerController" "$ROUTES_FILE"; then
  cat << 'EOF' >> "$ROUTES_FILE"

// Arix Plugin Installer Routes
Route::group(['prefix' => '/servers/{server}/plugins'], function () {
    Route::get('/', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'index']);
    Route::get('/versions', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'versions']);
    Route::post('/install', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'install']);
});
EOF
fi

echo -e "${GREEN}[✓] PHP Backend Controller & API routes registered!${NC}"

echo -e "${CYAN}[4/6] Installing native Arix React Frontend Component...${NC}"
COMPONENT_DIR="resources/scripts/components/server/plugin-installer"
mkdir -p "$COMPONENT_DIR"
curl -sSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/PluginInstallerContainer.tsx" \
  -o "${COMPONENT_DIR}/PluginInstallerContainer.tsx"

echo -e "${CYAN}[5/6] Injecting Route into ServerRouter.tsx...${NC}"
ROUTER_FILE="resources/scripts/routers/ServerRouter.tsx"

# Clean previous additions
sed -i '/PluginInstallerContainer/d' "$ROUTER_FILE" 2>/dev/null || true

# Inject Import at top
sed -i '1s/^/import PluginInstallerContainer from '\''@\/components\/server\/plugin-installer\/PluginInstallerContainer'\'';\n/' "$ROUTER_FILE"

# Inject Route with match.path and exact path to guarantee matching in Arix
sed -i "0,/<\/Switch>/s//    <Route path={\`\${match.path}\/plugins\`} component={PluginInstallerContainer} exact \/>\n    <Route path={'\/server\/:id\/plugins'} component={PluginInstallerContainer} exact \/>\n    <Route path={\`\${match.path}\/mcplugins\`} component={PluginInstallerContainer} exact \/>\n&/" "$ROUTER_FILE"

echo -e "${GREEN}[✓] ServerRouter injected successfully!${NC}"

echo -e "${CYAN}[6/6] Recompiling panel frontend assets with yarn...${NC}"
if command -v yarn &> /dev/null; then
  yarn build:production
elif command -v npm &> /dev/null; then
  npm run build:production
else
  echo -e "${YELLOW}[!] Build tool not found. Running composer / artisan cache clear...${NC}"
fi

# Clear all Laravel caches
php artisan route:clear 2>/dev/null || true
php artisan view:clear 2>/dev/null || true
php artisan config:clear 2>/dev/null || true

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  ✓ ARIX THEME PLUGIN INSTALLER INSTALLED SUCCESSFULLY!         ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo -e "Now in your Arix Theme settings on the panel:"
echo -e "Go to ${YELLOW}'Create link in Server Tools'${NC} and set:"
echo ""
echo -e "  [Field]          [What to Enter]"
echo -e "  --------------------------------------------------------"
echo -e "  Name:            ${CYAN}Plugin Installer${NC}  (or Plugins)"
echo -e "  URL:             ${CYAN}/plugins${NC}"
echo -e "  Icon:            ${CYAN}HiOutlinePuzzle${NC}"
echo -e "  Enable link:     ${CYAN}ON (Checked)${NC}"
echo -e "  --------------------------------------------------------"
echo ""
echo -e "When clicked, it loads directly inside your Arix server dashboard!"
echo -e "${GREEN}================================================================${NC}"
