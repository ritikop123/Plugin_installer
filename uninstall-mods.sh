#!/bin/bash
set -eo pipefail

# ================================================================
#   Arix Theme Minecraft Mods Manager Uninstaller
#   Repository: https://github.com/ritikop123/Plugin_installer
# ================================================================

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}    Arix Theme Minecraft Mods Manager Uninstaller               ${NC}"
echo -e "${CYAN}================================================================${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[✗] Please run as root (sudo bash ...).${NC}"
  exit 1
fi

PTERO_DIR="/var/www/pterodactyl"
if [ ! -d "$PTERO_DIR" ]; then
  if [ -f "artisan" ] && [ -d "resources/scripts" ]; then
    PTERO_DIR="$(pwd)"
  else
    echo -e "${RED}[✗] Cannot find Pterodactyl directory. Exiting.${NC}"
    exit 1
  fi
fi

cd "$PTERO_DIR"
echo -e "${GREEN}[✓] Working in Pterodactyl directory: ${PTERO_DIR}${NC}"

ROUTES_TS="resources/scripts/routers/routes.ts"
ROUTES_PHP="routes/api-client.php"

# Backup before uninstall
BACKUP_DIR="/var/backups/arix-mod-installer/pre-uninstall_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp "$ROUTES_TS" "$BACKUP_DIR/routes.ts" 2>/dev/null || true
cp "$ROUTES_PHP" "$BACKUP_DIR/api-client.php" 2>/dev/null || true
echo -e "${GREEN}[✓] Pre-uninstall backup created at: ${BACKUP_DIR}${NC}"

echo -e "${CYAN}[*] Removing mod installer files...${NC}"
rm -rf "resources/scripts/components/server/mod-installer" 2>/dev/null || true
rm -f "app/Http/Controllers/Api/Client/Servers/ModInstallerController.php" 2>/dev/null || true

echo -e "${CYAN}[*] Removing API routes from routes/api-client.php...${NC}"
php -r '
$file = "routes/api-client.php";
if (file_exists($file)) {
    $c = file_get_contents($file);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX MOD INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX MOD INSTALLER END\s*<<<\s*\*\/\s*/s", "", $c);
    $c = preg_replace("/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/mods[\x27\x22]\],.*?\}\);\s*/s", "", $c);
    file_put_contents($file, $c);
}
'

echo -e "${CYAN}[*] Removing route registration from routes.ts...${NC}"
php -r '
$file = "resources/scripts/routers/routes.ts";
if (file_exists($file)) {
    $c = file_get_contents($file);
    $c = preg_replace("/import\s+ModInstallerContainer[^\n]*\n?/s", "", $c);
    $c = preg_replace("/\s*\{\s*path:\s*[\x27\x22]\/mods[\x27\x22][^\}]*\},?/s", "", $c);
    $c = preg_replace("/[^\n]*ModInstallerContainer[^\n]*\n?/", "", $c);
    file_put_contents($file, $c);
}
'

echo -e "${CYAN}[*] Rebuilding production assets...${NC}"
if command -v yarn &> /dev/null; then
  yarn build:production
elif command -v npm &> /dev/null; then
  npm run build:production
fi

echo -e "${CYAN}[*] Clearing Laravel cache...${NC}"
php artisan route:clear
php artisan view:clear
php artisan config:clear

chown -R www-data:www-data "$PTERO_DIR" 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR" 2>/dev/null || true

echo ""
echo -e "${GREEN}[✓] Mods Manager uninstalled successfully!${NC}"
