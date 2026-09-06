#!/usr/bin/env bash

# ==============================================================================
# Arix Theme Addon Uninstaller (Plugins & Mods)
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
echo "          Arix Theme Addon Uninstaller (Plugins & Mods)         "
echo "================================================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[✗] Error: This script must be run as root.${NC}"
  exit 1
fi

PTERO_DIR="${PTERO_DIR:-/var/www/pterodactyl}"

if [ ! -d "$PTERO_DIR" ] || [ ! -f "$PTERO_DIR/artisan" ]; then
  if [ -f "artisan" ] && [ -d "resources/scripts" ]; then
    PTERO_DIR="$(pwd)"
  else
    echo -e "${RED}[✗] Error: Pterodactyl installation not found at: ${PTERO_DIR}${NC}"
    exit 1
  fi
fi

cd "$PTERO_DIR"

ROUTES_TS="resources/scripts/routers/routes.ts"
ROUTES_PHP="routes/api-client.php"
SERVER_ROUTER="resources/scripts/routers/ServerRouter.tsx"

echo -e "${CYAN}[*] Removing plugin and mod installer components & controllers...${NC}"
rm -rf "resources/scripts/components/server/plugin-installer" 2>/dev/null || true
rm -rf "resources/scripts/components/server/mod-installer" 2>/dev/null || true
rm -f "app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php" 2>/dev/null || true
rm -f "app/Http/Controllers/Api/Client/Servers/ModInstallerController.php" 2>/dev/null || true

echo -e "${CYAN}[*] Cleaning routes from routes/api-client.php...${NC}"
php -r '
$file = "routes/api-client.php";
if (file_exists($file)) {
    $c = file_get_contents($file);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX PLUGIN INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX PLUGIN INSTALLER END\s*<<<\s*\*\/\s*/s", "", $c);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX MOD INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX MOD INSTALLER END\s*<<<\s*\*\/\s*/s", "", $c);
    $c = preg_replace("/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/plugins[\x27\x22]\],.*?\}\);\s*/s", "", $c);
    $c = preg_replace("/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/mods[\x27\x22]\],.*?\}\);\s*/s", "", $c);
    file_put_contents($file, $c);
}
' 2>/dev/null || true

echo -e "${CYAN}[*] Cleaning routes from resources/scripts/routers/routes.ts...${NC}"
php -r '
$file = "resources/scripts/routers/routes.ts";
if (file_exists($file)) {
    $c = file_get_contents($file);
    $c = preg_replace("/import\s+PluginInstallerContainer[^\n]*\n?/s", "", $c);
    $c = preg_replace("/import\s+ModInstallerContainer[^\n]*\n?/s", "", $c);
    $c = preg_replace("/\s*\{\s*path:\s*[\x27\x22]\/plugins[\x27\x22][^\}]*\},?/s", "", $c);
    $c = preg_replace("/\s*\{\s*path:\s*[\x27\x22]\/mods[\x27\x22][^\}]*\},?/s", "", $c);
    $c = preg_replace("/[^\n]*PluginInstallerContainer[^\n]*\n?/", "", $c);
    $c = preg_replace("/[^\n]*ModInstallerContainer[^\n]*\n?/", "", $c);
    file_put_contents($file, $c);
}
' 2>/dev/null || true

echo -e "${CYAN}[*] Cleaning any legacy ServerRouter.tsx references...${NC}"
sed -i '/PluginInstallerContainer/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/ModInstallerContainer/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/\/plugins/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/\/mods/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/\/mcplugins/d' "$SERVER_ROUTER" 2>/dev/null || true

echo -e "${CYAN}[*] Rebuilding frontend assets...${NC}"
if command -v yarn &> /dev/null; then
  yarn build:production
elif command -v npm &> /dev/null; then
  npm run build:production
fi

echo -e "${CYAN}[*] Clearing caches...${NC}"
php artisan route:clear
php artisan view:clear
php artisan config:clear

chown -R www-data:www-data "$PTERO_DIR" 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR" 2>/dev/null || true

echo ""
echo -e "${GREEN}[✓] Addons uninstalled successfully.${NC}"
