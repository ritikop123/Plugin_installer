#!/bin/bash
set -eo pipefail

# ================================================================
#   Arix Theme Minecraft Mods Manager Setup
#   Repository: https://github.com/ritikop123/Plugin_installer
# ================================================================

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}    Arix Theme Minecraft Mods Manager Setup                     ${NC}"
echo -e "${CYAN}           https://github.com/ritikop123/Plugin_installer       ${NC}"
echo -e "${CYAN}================================================================${NC}"

# 1. Root Check
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[✗] Please run this script as root (sudo bash ...).${NC}"
  exit 1
fi

# 2. Locate Pterodactyl Installation
PTERO_DIR="/var/www/pterodactyl"
if [ ! -d "$PTERO_DIR" ]; then
  echo -e "${YELLOW}[!] Default /var/www/pterodactyl not found. Checking current directory...${NC}"
  if [ -f "artisan" ] && [ -d "resources/scripts" ]; then
    PTERO_DIR="$(pwd)"
  else
    echo -e "${RED}[✗] Cannot find Pterodactyl directory. Exiting.${NC}"
    exit 1
  fi
fi

cd "$PTERO_DIR"
echo -e "${GREEN}[✓] Working in Pterodactyl directory: ${PTERO_DIR}${NC}"

# 3. Check Required Files
ROUTES_TS="resources/scripts/routers/routes.ts"
ROUTES_PHP="routes/api-client.php"
SERVER_ROUTER="resources/scripts/routers/ServerRouter.tsx"

if [ ! -f "$ROUTES_TS" ] || [ ! -f "$ROUTES_PHP" ]; then
  echo -e "${RED}[✗] Required Pterodactyl files ($ROUTES_TS or $ROUTES_PHP) missing.${NC}"
  exit 1
fi

# 4. Create Safe Backup
BACKUP_DIR="/var/backups/arix-mod-installer/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp "$ROUTES_TS" "$BACKUP_DIR/routes.ts"
cp "$ROUTES_PHP" "$BACKUP_DIR/api-client.php"
[ -f "$SERVER_ROUTER" ] && cp "$SERVER_ROUTER" "$BACKUP_DIR/ServerRouter.tsx" || true

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
  [ -f "$BACKUP_DIR/ServerRouter.tsx" ] && cp "$BACKUP_DIR/ServerRouter.tsx" "$SERVER_ROUTER" 2>/dev/null || true
  rm -rf "resources/scripts/components/server/mod-installer" 2>/dev/null || true
  rm -f "app/Http/Controllers/Api/Client/Servers/ModInstallerController.php" 2>/dev/null || true
  echo -e "${YELLOW}[!] Original files restored from ${BACKUP_DIR}.${NC}"
  exit 1
}

trap 'rollback "$LINENO" "$BASH_COMMAND" "$?"' ERR

# 5. Clean Old Implementation
echo -e "${CYAN}[*] Cleaning any previous mod installer files...${NC}"

# Remove old component & controller
rm -rf "resources/scripts/components/server/mod-installer" 2>/dev/null || true
rm -f "app/Http/Controllers/Api/Client/Servers/ModInstallerController.php" 2>/dev/null || true

# Clean old additions from routes/api-client.php
php -r '
$file = "routes/api-client.php";
if (file_exists($file)) {
    $c = file_get_contents($file);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX MOD INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX MOD INSTALLER END\s*<<<\s*\*\/\s*/s", "", $c);
    $c = preg_replace("/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/mods[\x27\x22]\],.*?\}\);\s*/s", "", $c);
    file_put_contents($file, $c);
}
' 2>/dev/null || true

# Clean old additions from routes.ts
php -r '
$file = "resources/scripts/routers/routes.ts";
if (file_exists($file)) {
    $c = file_get_contents($file);
    $c = preg_replace("/import\s+ModInstallerContainer[^\n]*\n?/s", "", $c);
    $c = preg_replace("/\s*\{\s*path:\s*[\x27\x22]\/mods[\x27\x22][^\}]*\},?/s", "", $c);
    $c = preg_replace("/[^\n]*ModInstallerContainer[^\n]*\n?/", "", $c);
    file_put_contents($file, $c);
}
' 2>/dev/null || true

# 6. Install PHP Backend Controller
echo -e "${CYAN}[*] Installing ModInstallerController.php...${NC}"
CONTROLLER_TARGET="app/Http/Controllers/Api/Client/Servers/ModInstallerController.php"
mkdir -p "app/Http/Controllers/Api/Client/Servers"

CACHE_BUST="$(date +%s)"
curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/ModInstallerController.php?t=${CACHE_BUST}" \
  -o "$CONTROLLER_TARGET"

if [ ! -s "$CONTROLLER_TARGET" ]; then
  echo -e "${RED}[✗] Failed to download ModInstallerController.php.${NC}"
  false
fi

# 7. Register Backend API Routes in routes/api-client.php
echo -e "${CYAN}[*] Registering API routes in routes/api-client.php...${NC}"
cat << 'EOF' >> "$ROUTES_PHP"

/* >>> ARIX MOD INSTALLER START >>> */
Route::group(['prefix' => '/servers/{server}/mods'], function () {
    Route::get('/', [\Pterodactyl\Http\Controllers\Api\Client\Servers\ModInstallerController::class, 'index']);
    Route::get('/versions', [\Pterodactyl\Http\Controllers\Api\Client\Servers\ModInstallerController::class, 'versions']);
    Route::get('/tags', [\Pterodactyl\Http\Controllers\Api\Client\Servers\ModInstallerController::class, 'tags']);
    Route::get('/installed', [\Pterodactyl\Http\Controllers\Api\Client\Servers\ModInstallerController::class, 'installed']);
    Route::post('/install', [\Pterodactyl\Http\Controllers\Api\Client\Servers\ModInstallerController::class, 'install']);
    Route::post('/delete', [\Pterodactyl\Http\Controllers\Api\Client\Servers\ModInstallerController::class, 'delete']);
});
/* <<< ARIX MOD INSTALLER END <<< */
EOF

# 8. Install React Frontend Component
echo -e "${CYAN}[*] Installing ModInstallerContainer.tsx...${NC}"
COMPONENT_TARGET_DIR="resources/scripts/components/server/mod-installer"
mkdir -p "$COMPONENT_TARGET_DIR"

curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/ModInstallerContainer.tsx?t=${CACHE_BUST}" \
  -o "${COMPONENT_TARGET_DIR}/ModInstallerContainer.tsx"

if [ ! -s "${COMPONENT_TARGET_DIR}/ModInstallerContainer.tsx" ]; then
  echo -e "${RED}[✗] Failed to download ModInstallerContainer.tsx.${NC}"
  false
fi

# 9. Register Route in resources/scripts/routers/routes.ts
echo -e "${CYAN}[*] Registering route in resources/scripts/routers/routes.ts...${NC}"
php -r '
$file = "resources/scripts/routers/routes.ts";
$c = file_get_contents($file);

// Clean any previous artifacts
$c = preg_replace("/import\s+ModInstallerContainer[^\n]*\n?/s", "", $c);
$c = preg_replace("/\s*\{\s*path:\s*[\x27\x22]\/mods[\x27\x22][^\}]*\},?/s", "", $c);
$c = preg_replace("/[^\n]*ModInstallerContainer[^\n]*\n?/", "", $c);

// Add import at the top
$c = "import ModInstallerContainer from \x27@/components/server/mod-installer/ModInstallerContainer\x27;\n" . $c;

// Insert route inside server: [ array
$route = "\n        { path: \x27/mods\x27, permission: \x27file.*\x27, name: undefined, component: ModInstallerContainer, exact: true },";
$c = preg_replace("/(server:\s*\[)/", "\${1}" . $route, $c, 1);

file_put_contents($file, $c);
'

# Verify route registration
if ! grep -q "/mods" "$ROUTES_TS" || ! grep -q "ModInstallerContainer" "$ROUTES_TS"; then
  echo -e "${RED}[✗] Failed to register /mods in routes.ts.${NC}"
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
echo -e "${GREEN}  ✓ ARIX MODS MANAGER INSTALLED SUCCESSFULLY!                   ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo -e "Route ${CYAN}/server/<server-id>/mods${NC} is now active natively in Pterodactyl."
echo ""
echo -e "In your Arix Theme settings -> ${YELLOW}'Create link in Server Tools'${NC}:"
echo -e "  • Name:            ${CYAN}Mods Manager${NC}"
echo -e "  • URL:             ${CYAN}/mods${NC}"
echo -e "  • Icon:            ${CYAN}HiOutlineCubeTransparent${NC} (or HiOutlinePuzzle)"
echo -e "  • Enable link:     ${CYAN}ON (Checked)${NC}"
echo ""
echo -e "${GREEN}================================================================${NC}"
