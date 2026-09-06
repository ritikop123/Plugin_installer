#!/usr/bin/env bash

# ==============================================================================
# Arix Theme Native Plugin Installer for Pterodactyl Panel
# GitHub: https://github.com/ritikop123/Plugin_installer
# ==============================================================================

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}"
echo "================================================================"
echo "    Arix Theme Plugin Installer Setup (Clean Native Build)      "
echo "           https://github.com/ritikop123/Plugin_installer       "
echo "================================================================"
echo -e "${NC}"

# 1. Require Root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[✗] Error: This installer must be run as root.${NC}"
  echo -e "Please run: sudo bash install-arix.sh"
  exit 1
fi

# 2. Detect Pterodactyl Directory
PTERO_DIR="${PTERO_DIR:-/var/www/pterodactyl}"

if [ ! -d "$PTERO_DIR" ] || [ ! -f "$PTERO_DIR/artisan" ]; then
  echo -e "${RED}[✗] Error: Pterodactyl installation not found at: ${PTERO_DIR}${NC}"
  echo -e "Please specify PTERO_DIR=/path/to/pterodactyl if installed elsewhere."
  exit 1
fi

cd "$PTERO_DIR"

# 3. Detect Expected Pterodactyl Source Structure
ROUTES_TS="resources/scripts/routers/routes.ts"
SERVER_ROUTER="resources/scripts/routers/ServerRouter.tsx"
ROUTES_PHP="routes/api-client.php"
PACKAGE_JSON="package.json"

if [ ! -f "$ROUTES_TS" ] || [ ! -f "$SERVER_ROUTER" ] || [ ! -f "$ROUTES_PHP" ] || [ ! -f "$PACKAGE_JSON" ]; then
  echo -e "${RED}Incompatible Pterodactyl source structure detected. No files were modified.${NC}"
  exit 1
fi

if ! grep -q "server:" "$ROUTES_TS"; then
  echo -e "${RED}Incompatible Pterodactyl source structure detected. No files were modified.${NC}"
  exit 1
fi

if ! grep -q "react-router" "$PACKAGE_JSON"; then
  echo -e "${RED}Incompatible Pterodactyl source structure detected. No files were modified.${NC}"
  exit 1
fi

# 4. Create Timestamped Backup
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="/var/backups/arix-plugin-installer/${TIMESTAMP}"

mkdir -p "$BACKUP_DIR"
cp "$ROUTES_TS" "$BACKUP_DIR/routes.ts"
cp "$ROUTES_PHP" "$BACKUP_DIR/api-client.php"
cp "$SERVER_ROUTER" "$BACKUP_DIR/ServerRouter.tsx"

echo -e "${GREEN}[✓] Backup created at: ${BACKUP_DIR}${NC}"

# Setup Automatic Rollback on Failure
rollback() {
  local failed_line="$1"
  local failed_cmd="$2"
  local failed_code="$3"
  echo -e "\n${RED}[✗] Installation failed on line ${failed_line}! Command: '${failed_cmd}' exited with code ${failed_code}.${NC}"
  echo -e "${YELLOW}[*] Rolling back to original state...${NC}"
  cp "$BACKUP_DIR/routes.ts" "$ROUTES_TS" 2>/dev/null || true
  cp "$BACKUP_DIR/api-client.php" "$ROUTES_PHP" 2>/dev/null || true
  cp "$BACKUP_DIR/ServerRouter.tsx" "$SERVER_ROUTER" 2>/dev/null || true
  rm -rf "resources/scripts/components/server/plugin-installer" 2>/dev/null || true
  rm -f "app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php" 2>/dev/null || true
  echo -e "${YELLOW}[!] Original files restored from ${BACKUP_DIR}.${NC}"
  exit 1
}

trap 'rollback "$LINENO" "$BASH_COMMAND" "$?"' ERR

# 5. Clean Old Implementation
echo -e "${CYAN}[*] Cleaning any previous plugin installer files...${NC}"

# Remove old component & controller
rm -rf "resources/scripts/components/server/plugin-installer" 2>/dev/null || true
rm -f "app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php" 2>/dev/null || true
rm -f "public/plugins/index.html" 2>/dev/null || true
rm -rf "public/plugins" 2>/dev/null || true

# Clean old additions from routes/api-client.php
php -r '
$file = "routes/api-client.php";
if (file_exists($file)) {
    $c = file_get_contents($file);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX PLUGIN INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX PLUGIN INSTALLER END\s*<<<\s*\*\/\s*/s", "", $c);
    $c = preg_replace("/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/plugins[\x27\x22]\],.*?\}\);\s*/s", "", $c);
    file_put_contents($file, $c);
}
' 2>/dev/null || true

# Clean any previous router modifications from ServerRouter.tsx (which shouldn't have been edited)
sed -i '/PluginInstallerContainer/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/\/plugins/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/\/mcplugins/d' "$SERVER_ROUTER" 2>/dev/null || true

# Clean old .bak files
rm -f "resources/scripts/routers/ServerRouter.tsx.bak" 2>/dev/null || true
rm -f "routes/api-client.php.bak" 2>/dev/null || true
rm -f "resources/scripts/routers/routes.ts.bak" 2>/dev/null || true

# Clean old additions from routes.ts
php -r '
$file = "resources/scripts/routers/routes.ts";
if (file_exists($file)) {
    $c = file_get_contents($file);
    $c = preg_replace("/import PluginInstallerContainer[^\n]*\n?/", "", $c);
    $c = preg_replace("/\s*\{\s*path:\s*[\x27\x22]\/plugins[\x27\x22][^\}]*\},?/", "", $c);
    file_put_contents($file, $c);
}
' 2>/dev/null || true

# 6. Install PHP Backend Controller
echo -e "${CYAN}[*] Installing PluginInstallerController.php...${NC}"
CONTROLLER_TARGET="app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php"
mkdir -p "app/Http/Controllers/Api/Client/Servers"

CACHE_BUST="$(date +%s)"
curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/PluginInstallerController.php?t=${CACHE_BUST}" \
  -o "$CONTROLLER_TARGET"

# Verify Controller Download
if [ ! -s "$CONTROLLER_TARGET" ]; then
  echo -e "${RED}[✗] Failed to download PluginInstallerController.php.${NC}"
  false
fi

# 7. Register Backend API Routes in routes/api-client.php
echo -e "${CYAN}[*] Registering API routes in routes/api-client.php...${NC}"
cat << 'EOF' >> "$ROUTES_PHP"

/* >>> ARIX PLUGIN INSTALLER START >>> */
Route::group(['prefix' => '/servers/{server}/plugins'], function () {
    Route::get('/', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'index']);
    Route::get('/versions', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'versions']);
    Route::get('/tags', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'tags']);
    Route::post('/install', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'install']);
});
/* <<< ARIX PLUGIN INSTALLER END <<< */
EOF

# 8. Install React Frontend Component
echo -e "${CYAN}[*] Installing PluginInstallerContainer.tsx...${NC}"
COMPONENT_TARGET_DIR="resources/scripts/components/server/plugin-installer"
mkdir -p "$COMPONENT_TARGET_DIR"

curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/PluginInstallerContainer.tsx?t=${CACHE_BUST}" \
  -o "${COMPONENT_TARGET_DIR}/PluginInstallerContainer.tsx"

if [ ! -s "${COMPONENT_TARGET_DIR}/PluginInstallerContainer.tsx" ]; then
  echo -e "${RED}[✗] Failed to download PluginInstallerContainer.tsx.${NC}"
  false
fi

# 9. Register Route in resources/scripts/routers/routes.ts
echo -e "${CYAN}[*] Registering route in resources/scripts/routers/routes.ts...${NC}"
php -r '
$file = "resources/scripts/routers/routes.ts";
$c = file_get_contents($file);
if (strpos($c, "PluginInstallerContainer") === false) {
    $c = "import PluginInstallerContainer from \x27@/components/server/plugin-installer/PluginInstallerContainer\x27;\n" . $c;
    $route = "\n        { path: \x27/plugins\x27, permission: \x27file.*\x27, name: undefined, component: PluginInstallerContainer, exact: true },";
    $c = preg_replace("/(server:\s*\[)/", "$1" . $route, $c, 1);
    file_put_contents($file, $c);
}
'

# Verify route registration
if ! grep -q "path: '/plugins'" "$ROUTES_TS"; then
  echo -e "${RED}[✗] Failed to register /plugins in routes.ts.${NC}"
  false
fi

# 10. Rebuild Frontend Assets
echo -e "${CYAN}[*] Building production frontend assets (yarn build:production)...${NC}"
if command -v yarn &> /dev/null; then
  yarn --frozen-lockfile || yarn
  yarn build:production
elif command -v npm &> /dev/null; then
  npm install
  npm run build:production
else
  echo -e "${RED}[✗] No package manager found (yarn or npm required).${NC}"
  false
fi

# 11. Clear Laravel Caches
echo -e "${CYAN}[*] Clearing Laravel route, view, and config caches...${NC}"
php artisan route:clear
php artisan view:clear
php artisan config:clear

# Fix permissions
chown -R www-data:www-data "$PTERO_DIR" 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR" 2>/dev/null || true

# Turn off rollback trap on success
trap - ERR

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  ✓ ARIX PLUGIN INSTALLER INSTALLED SUCCESSFULLY!               ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo -e "Route ${CYAN}/server/<server-id>/plugins${NC} is now active natively in Pterodactyl."
echo ""
echo -e "In your Arix Theme settings -> ${YELLOW}'Create link in Server Tools'${NC}:"
echo -e "  • Name:            ${CYAN}Plugin Installer${NC}"
echo -e "  • URL:             ${CYAN}/plugins${NC}"
echo -e "  • Icon:            ${CYAN}HiOutlinePuzzle${NC}"
echo -e "  • Enable link:     ${CYAN}ON (Checked)${NC}"
echo ""
echo -e "${GREEN}================================================================${NC}"
