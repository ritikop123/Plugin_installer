#!/bin/bash
set -eo pipefail

# ================================================================
#    Arix Theme Unified Addon Installer (Clean Native Build)
#    Repository: https://github.com/ritikop123/Plugin_installer
# ================================================================

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}    Arix Theme Unified Addon Installer (Plugins & Mods)         ${NC}"
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

# Check what is currently installed
HAS_EXISTING_PLUGINS=false
[ -f "app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php" ] && HAS_EXISTING_PLUGINS=true

HAS_EXISTING_MODS=false
[ -f "app/Http/Controllers/Api/Client/Servers/ModInstallerController.php" ] && HAS_EXISTING_MODS=true

# 4. Determine What to Install
CHOICE="${1:-}"

if [ -z "$CHOICE" ]; then
  if [ -t 0 ]; then
    echo -e "\n${BOLD}Select an installation option:${NC}"
    echo -e "  ${CYAN}1)${NC} ${BOLD}Both: Plugin Installer + Mods Installer${NC} ${GREEN}(Recommended)${NC}"
    echo -e "  ${CYAN}2)${NC} Plugin Installer only (/plugins)"
    echo -e "  ${CYAN}3)${NC} Mods Installer only (/mods)"
    echo -e "  ${CYAN}4)${NC} Uninstall All"
    read -r -p "Enter choice [1-4] (Default: 1): " USER_INPUT
    USER_INPUT="${USER_INPUT:-1}"
    case "$USER_INPUT" in
      1) CHOICE="both" ;;
      2) CHOICE="plugins" ;;
      3) CHOICE="mods" ;;
      4) CHOICE="uninstall" ;;
      *) CHOICE="both" ;;
    esac
  else
    # Piped via curl (non-interactive): default to installing both
    CHOICE="both"
  fi
fi

case "$CHOICE" in
  both|all)
    INSTALL_PLUGINS=true
    INSTALL_MODS=true
    echo -e "${GREEN}[*] Selected mode: Installing BOTH (Plugin Installer + Mods Installer)...${NC}"
    ;;
  plugins|plugin)
    INSTALL_PLUGINS=true
    INSTALL_MODS=false
    echo -e "${GREEN}[*] Selected mode: Installing Plugin Installer only...${NC}"
    ;;
  mods|mod)
    INSTALL_PLUGINS=false
    INSTALL_MODS=true
    echo -e "${GREEN}[*] Selected mode: Installing Mods Installer only...${NC}"
    ;;
  uninstall)
    echo -e "${YELLOW}[*] Selected mode: Uninstalling addons...${NC}"
    bash <(curl -sH 'Cache-Control: no-cache' "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/uninstall-arix.sh?$(date +%s)")
    exit 0
    ;;
  *)
    INSTALL_PLUGINS=true
    INSTALL_MODS=true
    echo -e "${GREEN}[*] Defaulting to: Installing BOTH (Plugin Installer + Mods Installer)...${NC}"
    ;;
esac

# Retain existing addon if user installs one individually
ENABLE_PLUGINS=false
if [ "$INSTALL_PLUGINS" = true ] || [ "$HAS_EXISTING_PLUGINS" = true ]; then
  ENABLE_PLUGINS=true
fi

ENABLE_MODS=false
if [ "$INSTALL_MODS" = true ] || [ "$HAS_EXISTING_MODS" = true ]; then
  ENABLE_MODS=true
fi

# 5. Create Safe Backup
BACKUP_DIR="/var/backups/arix-addon-installer/$(date +%Y%m%d_%H%M%S)"
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
  rm -f /tmp/ptero_clean_api.php /tmp/ptero_reg_routes.php
  echo -e "${YELLOW}[!] Original files restored from ${BACKUP_DIR}.${NC}"
  exit 1
}

trap 'rollback "$LINENO" "$BASH_COMMAND" "$?"' ERR

# 6. Clean Prior Configurations & Reinstalled Files
echo -e "${CYAN}[*] Cleaning old configurations...${NC}"

if [ "$INSTALL_PLUGINS" = true ]; then
  rm -rf "resources/scripts/components/server/plugin-installer" 2>/dev/null || true
  rm -f "app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php" 2>/dev/null || true
fi

if [ "$INSTALL_MODS" = true ]; then
  rm -rf "resources/scripts/components/server/mod-installer" 2>/dev/null || true
  rm -f "app/Http/Controllers/Api/Client/Servers/ModInstallerController.php" 2>/dev/null || true
fi

sed -i '/PluginInstallerContainer/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/ModInstallerContainer/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/\/plugins/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/\/mods/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/\/mcplugins/d' "$SERVER_ROUTER" 2>/dev/null || true

rm -f "resources/scripts/routers/ServerRouter.tsx.bak" 2>/dev/null || true
rm -f "routes/api-client.php.bak" 2>/dev/null || true
rm -f "resources/scripts/routers/routes.ts.bak" 2>/dev/null || true

CACHE_BUST="$(date +%s)"

# 7. Download Plugin Installer (if installing plugins)
if [ "$INSTALL_PLUGINS" = true ]; then
  echo -e "${CYAN}[*] Downloading Plugin Installer files...${NC}"
  mkdir -p "app/Http/Controllers/Api/Client/Servers"
  curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/PluginInstallerController.php?t=${CACHE_BUST}" \
    -o "app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php"

  mkdir -p "resources/scripts/components/server/plugin-installer"
  curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/PluginInstallerContainer.tsx?t=${CACHE_BUST}" \
    -o "resources/scripts/components/server/plugin-installer/PluginInstallerContainer.tsx"
fi

# 8. Download Mods Installer (if installing mods)
if [ "$INSTALL_MODS" = true ]; then
  echo -e "${CYAN}[*] Downloading Mods Installer files...${NC}"
  mkdir -p "app/Http/Controllers/Api/Client/Servers"
  curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/ModInstallerController.php?t=${CACHE_BUST}" \
    -o "app/Http/Controllers/Api/Client/Servers/ModInstallerController.php"

  mkdir -p "resources/scripts/components/server/mod-installer"
  curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/ModInstallerContainer.tsx?t=${CACHE_BUST}" \
    -o "resources/scripts/components/server/mod-installer/ModInstallerContainer.tsx"
fi

# 9. Register API Routes in routes/api-client.php
echo -e "${CYAN}[*] Registering API routes in routes/api-client.php...${NC}"

cat << 'PHP_CLEAN_EOF' > /tmp/ptero_clean_api.php
<?php
$file = $argv[1];
if (file_exists($file)) {
    $c = file_get_contents($file);
    $c = preg_replace('/\/\*\s*>>>\s*ARIX PLUGIN INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX PLUGIN INSTALLER END\s*<<<\s*\*\/\s*/s', '', $c);
    $c = preg_replace('/\/\*\s*>>>\s*ARIX MOD INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX MOD INSTALLER END\s*<<<\s*\*\/\s*/s', '', $c);
    $c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/plugins[\x27\x22]\],.*?\}\);\s*/s', '', $c);
    $c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/mods[\x27\x22]\],.*?\}\);\s*/s', '', $c);
    file_put_contents($file, $c);
}
PHP_CLEAN_EOF

php /tmp/ptero_clean_api.php "$ROUTES_PHP"
rm -f /tmp/ptero_clean_api.php

if [ "$ENABLE_PLUGINS" = true ]; then
cat << 'EOF' >> "$ROUTES_PHP"

/* >>> ARIX PLUGIN INSTALLER START >>> */
Route::group(['prefix' => '/servers/{server}/plugins'], function () {
    Route::get('/', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'index']);
    Route::get('/versions', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'versions']);
    Route::get('/tags', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'tags']);
    Route::get('/installed', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'installed']);
    Route::post('/install', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'install']);
    Route::post('/delete', [\Pterodactyl\Http\Controllers\Api\Client\Servers\PluginInstallerController::class, 'delete']);
});
/* <<< ARIX PLUGIN INSTALLER END <<< */
EOF
fi

if [ "$ENABLE_MODS" = true ]; then
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
fi

# 10. Register Frontend Routes in resources/scripts/routers/routes.ts
echo -e "${CYAN}[*] Registering frontend routes in resources/scripts/routers/routes.ts...${NC}"

cat << 'PHP_REG_EOF' > /tmp/ptero_reg_routes.php
<?php
$routesTs = $argv[1];
$enablePlugins = ($argv[2] === 'true');
$enableMods = ($argv[3] === 'true');

$c = file_get_contents($routesTs);

// Clean old imports & routes
$c = preg_replace('/import\s+PluginInstallerContainer[^\n]*\n?/s', '', $c);
$c = preg_replace('/import\s+ModInstallerContainer[^\n]*\n?/s', '', $c);
$c = preg_replace('/\s*\{\s*path:\s*[\x27\x22]\/plugins[\x27\x22][^\}]*\},?/s', '', $c);
$c = preg_replace('/\s*\{\s*path:\s*[\x27\x22]\/mods[\x27\x22][^\}]*\},?/s', '', $c);
$c = preg_replace('/[^\n]*PluginInstallerContainer[^\n]*\n?/', '', $c);
$c = preg_replace('/[^\n]*ModInstallerContainer[^\n]*\n?/', '', $c);

$imports = '';
$routes = '';

if ($enablePlugins) {
    $imports .= "import PluginInstallerContainer from '@/components/server/plugin-installer/PluginInstallerContainer';\n";
    $routes .= "\n        { path: '/plugins', permission: 'file.*', name: undefined, component: PluginInstallerContainer, exact: true },";
}

if ($enableMods) {
    $imports .= "import ModInstallerContainer from '@/components/server/mod-installer/ModInstallerContainer';\n";
    $routes .= "\n        { path: '/mods', permission: 'file.*', name: undefined, component: ModInstallerContainer, exact: true },";
}

$c = $imports . $c;
$c = preg_replace('/(server:\s*\[)/', '$1' . $routes, $c, 1);

file_put_contents($routesTs, $c);
echo "Registered routes successfully in routes.ts\n";
PHP_REG_EOF

php /tmp/ptero_reg_routes.php "$ROUTES_TS" "$ENABLE_PLUGINS" "$ENABLE_MODS"
rm -f /tmp/ptero_reg_routes.php

# Verify registrations
if [ "$ENABLE_PLUGINS" = true ]; then
  if ! grep -q "/plugins" "$ROUTES_TS" || ! grep -q "PluginInstallerContainer" "$ROUTES_TS"; then
    echo -e "${RED}[✗] Failed to verify /plugins in routes.ts.${NC}"
    false
  fi
fi

if [ "$ENABLE_MODS" = true ]; then
  if ! grep -q "/mods" "$ROUTES_TS" || ! grep -q "ModInstallerContainer" "$ROUTES_TS"; then
    echo -e "${RED}[✗] Failed to verify /mods in routes.ts.${NC}"
    false
  fi
fi

# 11. Rebuild Frontend Assets
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

# 12. Clear Laravel Caches
echo -e "${CYAN}[*] Clearing Laravel route, view, and config caches...${NC}"
php artisan route:clear
php artisan view:clear
php artisan config:clear

chown -R www-data:www-data "$PTERO_DIR" 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR" 2>/dev/null || true

# Turn off rollback trap on success
trap - ERR

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  ✓ ARIX ADDONS INSTALLED SUCCESSFULLY!                         ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""

if [ "$ENABLE_PLUGINS" = true ]; then
  echo -e "• ${CYAN}Plugin Installer${NC}: Accessible at ${BOLD}/server/<server-id>/plugins${NC}"
  echo -e "  Arix Server Tools Link: URL=${CYAN}/plugins${NC}, Name=${CYAN}Plugin Installer${NC}, Icon=${CYAN}HiOutlinePuzzle${NC}"
fi

if [ "$ENABLE_MODS" = true ]; then
  echo -e "• ${CYAN}Mods Installer${NC}: Accessible at ${BOLD}/server/<server-id>/mods${NC}"
  echo -e "  Arix Server Tools Link: URL=${CYAN}/mods${NC}, Name=${CYAN}Mods Installer${NC}, Icon=${CYAN}HiOutlineCubeTransparent${NC}"
fi

echo ""
echo -e "${GREEN}================================================================${NC}"
