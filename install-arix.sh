#!/bin/bash
set -eo pipefail

# ================================================================
#    Arix Theme Unified Addon Suite (Clean Native Build)
#    Plugins, Mods, Modpacks, Software, & Options for Pterodactyl Panel
#    Repository: https://github.com/ritikop123/Plugin_installer
# ================================================================

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}    Arix Theme Unified Addon Suite (Plugins, Mods, Modpacks, Software, Options) ${NC}"
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

HAS_EXISTING_MODPACKS=false
[ -f "app/Http/Controllers/Api/Client/Servers/ModpackInstallerController.php" ] && HAS_EXISTING_MODPACKS=true

HAS_EXISTING_SOFTWARE=false
[ -f "app/Http/Controllers/Api/Client/Servers/SoftwareInstallerController.php" ] && HAS_EXISTING_SOFTWARE=true

HAS_EXISTING_OPTIONS=false
[ -f "app/Http/Controllers/Api/Client/Servers/OptionsController.php" ] && HAS_EXISTING_OPTIONS=true

# 4. Determine What to Install
CHOICE="${1:-}"

if [ -z "$CHOICE" ]; then
  if [ -t 0 ]; then
    echo -e "\n${BOLD}Select an installation option:${NC}"
    echo -e "  ${CYAN}1)${NC} ${BOLD}All: Plugins + Mods + Modpacks + Software + Options${NC} ${GREEN}(Recommended)${NC}"
    echo -e "  ${CYAN}2)${NC} Plugin Installer only (/plugins)"
    echo -e "  ${CYAN}3)${NC} Mods Installer only (/mods)"
    echo -e "  ${CYAN}4)${NC} Modpacks Installer only (/modpacks)"
    echo -e "  ${CYAN}5)${NC} Software Installer only (/software)"
    echo -e "  ${CYAN}6)${NC} Server Options & Properties only (/options)"
    echo -e "  ${CYAN}7)${NC} Uninstall All"
    read -r -p "Enter choice [1-7] (Default: 1): " USER_INPUT
    USER_INPUT="${USER_INPUT:-1}"
    case "$USER_INPUT" in
      1) CHOICE="all" ;;
      2) CHOICE="plugins" ;;
      3) CHOICE="mods" ;;
      4) CHOICE="modpacks" ;;
      5) CHOICE="software" ;;
      6) CHOICE="options" ;;
      7) CHOICE="uninstall" ;;
      *) CHOICE="all" ;;
    esac
  else
    # Piped via curl (non-interactive): default to installing all
    CHOICE="all"
  fi
fi

case "$CHOICE" in
  all|both)
    INSTALL_PLUGINS=true
    INSTALL_MODS=true
    INSTALL_MODPACKS=true
    INSTALL_SOFTWARE=true
    INSTALL_OPTIONS=true
    echo -e "${GREEN}[*] Selected mode: Installing ALL addons (Plugins + Mods + Modpacks + Software + Options)...${NC}"
    ;;
  plugins|plugin)
    INSTALL_PLUGINS=true
    INSTALL_MODS=false
    INSTALL_MODPACKS=false
    INSTALL_SOFTWARE=false
    INSTALL_OPTIONS=false
    echo -e "${GREEN}[*] Selected mode: Installing Plugin Installer only...${NC}"
    ;;
  mods|mod)
    INSTALL_PLUGINS=false
    INSTALL_MODS=true
    INSTALL_MODPACKS=false
    INSTALL_SOFTWARE=false
    INSTALL_OPTIONS=false
    echo -e "${GREEN}[*] Selected mode: Installing Mods Installer only...${NC}"
    ;;
  modpacks|modpack)
    INSTALL_PLUGINS=false
    INSTALL_MODS=false
    INSTALL_MODPACKS=true
    INSTALL_SOFTWARE=false
    INSTALL_OPTIONS=false
    echo -e "${GREEN}[*] Selected mode: Installing Modpacks Installer only...${NC}"
    ;;
  software)
    INSTALL_PLUGINS=false
    INSTALL_MODS=false
    INSTALL_MODPACKS=false
    INSTALL_SOFTWARE=true
    INSTALL_OPTIONS=false
    echo -e "${GREEN}[*] Selected mode: Installing Software Installer only...${NC}"
    ;;
  options|option|properties)
    INSTALL_PLUGINS=false
    INSTALL_MODS=false
    INSTALL_MODPACKS=false
    INSTALL_SOFTWARE=false
    INSTALL_OPTIONS=true
    echo -e "${GREEN}[*] Selected mode: Installing Server Options & Properties only...${NC}"
    ;;
  uninstall)
    echo -e "${YELLOW}[*] Selected mode: Uninstalling addons...${NC}"
    bash <(curl -sH 'Cache-Control: no-cache' "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/uninstall-arix.sh?$(date +%s)")
    exit 0
    ;;
  *)
    INSTALL_PLUGINS=true
    INSTALL_MODS=true
    INSTALL_MODPACKS=true
    INSTALL_SOFTWARE=true
    INSTALL_OPTIONS=true
    echo -e "${GREEN}[*] Defaulting to: Installing ALL addons...${NC}"
    ;;
esac

# Retain existing addons if user installs one individually
ENABLE_PLUGINS=false
if [ "$INSTALL_PLUGINS" = true ] || [ "$HAS_EXISTING_PLUGINS" = true ]; then
  ENABLE_PLUGINS=true
fi

ENABLE_MODS=false
if [ "$INSTALL_MODS" = true ] || [ "$HAS_EXISTING_MODS" = true ]; then
  ENABLE_MODS=true
fi

ENABLE_MODPACKS=false
if [ "$INSTALL_MODPACKS" = true ] || [ "$HAS_EXISTING_MODPACKS" = true ]; then
  ENABLE_MODPACKS=true
fi

ENABLE_SOFTWARE=false
if [ "$INSTALL_SOFTWARE" = true ] || [ "$HAS_EXISTING_SOFTWARE" = true ]; then
  ENABLE_SOFTWARE=true
fi

ENABLE_OPTIONS=false
if [ "$INSTALL_OPTIONS" = true ] || [ "$HAS_EXISTING_OPTIONS" = true ]; then
  ENABLE_OPTIONS=true
fi

# 5. Create Safe Backup
BACKUP_DIR="/var/backups/arix-addon-installer/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp "$ROUTES_TS" "$BACKUP_DIR/routes.ts"
cp "$ROUTES_PHP" "$BACKUP_DIR/api-client.php"
[ -f "$SERVER_ROUTER" ] && cp "$SERVER_ROUTER" "$BACKUP_DIR/ServerRouter.tsx" || true
[ -f "resources/views/admin/servers/new.blade.php" ] && cp "resources/views/admin/servers/new.blade.php" "$BACKUP_DIR/new.blade.php" || true
[ -f "resources/views/admin/servers/view/details.blade.php" ] && cp "resources/views/admin/servers/view/details.blade.php" "$BACKUP_DIR/details.blade.php" || true
[ -f "resources/views/admin/servers/view/build.blade.php" ] && cp "resources/views/admin/servers/view/build.blade.php" "$BACKUP_DIR/build.blade.php" || true
[ -f "app/Http/Controllers/Admin/Servers/CreateServerController.php" ] && cp "app/Http/Controllers/Admin/Servers/CreateServerController.php" "$BACKUP_DIR/CreateServerController.php" || true
[ -f "app/Http/Controllers/Admin/ServersController.php" ] && cp "app/Http/Controllers/Admin/ServersController.php" "$BACKUP_DIR/ServersController.php" || true
[ -f "app/Console/Kernel.php" ] && cp "app/Console/Kernel.php" "$BACKUP_DIR/Kernel.php" || true
[ -f "app/Models/Server.php" ] && cp "app/Models/Server.php" "$BACKUP_DIR/Server.php" || true

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
  [ -f "$BACKUP_DIR/new.blade.php" ] && cp "$BACKUP_DIR/new.blade.php" "resources/views/admin/servers/new.blade.php" 2>/dev/null || true
  [ -f "$BACKUP_DIR/details.blade.php" ] && cp "$BACKUP_DIR/details.blade.php" "resources/views/admin/servers/view/details.blade.php" 2>/dev/null || true
  [ -f "$BACKUP_DIR/build.blade.php" ] && cp "$BACKUP_DIR/build.blade.php" "resources/views/admin/servers/view/build.blade.php" 2>/dev/null || true
  [ -f "$BACKUP_DIR/CreateServerController.php" ] && cp "$BACKUP_DIR/CreateServerController.php" "app/Http/Controllers/Admin/Servers/CreateServerController.php" 2>/dev/null || true
  [ -f "$BACKUP_DIR/ServersController.php" ] && cp "$BACKUP_DIR/ServersController.php" "app/Http/Controllers/Admin/ServersController.php" 2>/dev/null || true
  [ -f "$BACKUP_DIR/Kernel.php" ] && cp "$BACKUP_DIR/Kernel.php" "app/Console/Kernel.php" 2>/dev/null || true
  [ -f "$BACKUP_DIR/Server.php" ] && cp "$BACKUP_DIR/Server.php" "app/Models/Server.php" 2>/dev/null || true
  rm -f /tmp/ptero_clean_api.php /tmp/ptero_reg_api.php /tmp/ptero_reg_routes.php /tmp/ptero_patch_auto_suspend.php
  chmod -R 755 public 2>/dev/null || true
  chown -R www-data:www-data "$PTERO_DIR" 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR" 2>/dev/null || true
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

if [ "$INSTALL_MODPACKS" = true ]; then
  rm -rf "resources/scripts/components/server/modpack-installer" 2>/dev/null || true
  rm -f "app/Http/Controllers/Api/Client/Servers/ModpackInstallerController.php" 2>/dev/null || true
fi

if [ "$INSTALL_SOFTWARE" = true ]; then
  rm -rf "resources/scripts/components/server/software-installer" 2>/dev/null || true
  rm -f "app/Http/Controllers/Api/Client/Servers/SoftwareInstallerController.php" 2>/dev/null || true
fi

if [ "$INSTALL_OPTIONS" = true ]; then
  rm -rf "resources/scripts/components/server/options" 2>/dev/null || true
  rm -f "app/Http/Controllers/Api/Client/Servers/OptionsController.php" 2>/dev/null || true
fi

sed -i '/PluginInstallerContainer/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/ModInstallerContainer/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/ModpackInstallerContainer/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/SoftwareInstallerContainer/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '/OptionsContainer/d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '\#/plugins#d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '\#/mods#d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '\#/modpacks#d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '\#/software#d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '\#/options#d' "$SERVER_ROUTER" 2>/dev/null || true
sed -i '\#/mcplugins#d' "$SERVER_ROUTER" 2>/dev/null || true

rm -f "resources/scripts/routers/ServerRouter.tsx.bak" 2>/dev/null || true
rm -f "routes/api-client.php.bak" 2>/dev/null || true
rm -f "resources/scripts/routers/routes.ts.bak" 2>/dev/null || true

CACHE_BUST="$(date +%s%N)"

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

# 9. Download Modpacks Installer (if installing modpacks)
if [ "$INSTALL_MODPACKS" = true ]; then
  echo -e "${CYAN}[*] Downloading Modpacks Installer files...${NC}"
  mkdir -p "app/Http/Controllers/Api/Client/Servers"
  curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/ModpackInstallerController.php?t=${CACHE_BUST}" \
    -o "app/Http/Controllers/Api/Client/Servers/ModpackInstallerController.php"

  mkdir -p "resources/scripts/components/server/modpack-installer"
  curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/ModpackInstallerContainer.tsx?t=${CACHE_BUST}" \
    -o "resources/scripts/components/server/modpack-installer/ModpackInstallerContainer.tsx"
fi

# 10. Download Software Installer (if installing software)
if [ "$INSTALL_SOFTWARE" = true ]; then
  echo -e "${CYAN}[*] Downloading Software Installer files...${NC}"
  mkdir -p "app/Http/Controllers/Api/Client/Servers"
  curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/SoftwareInstallerController.php?t=${CACHE_BUST}" \
    -o "app/Http/Controllers/Api/Client/Servers/SoftwareInstallerController.php"

  mkdir -p "resources/scripts/components/server/software-installer"
  curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/SoftwareInstallerContainer.tsx?t=${CACHE_BUST}" \
    -o "resources/scripts/components/server/software-installer/SoftwareInstallerContainer.tsx"
fi

# 11. Download Server Options & Properties (if installing options)
if [ "$INSTALL_OPTIONS" = true ]; then
  echo -e "${CYAN}[*] Downloading Server Options & Properties files...${NC}"
  mkdir -p "app/Http/Controllers/Api/Client/Servers"
  curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/OptionsController.php?t=${CACHE_BUST}" \
    -o "app/Http/Controllers/Api/Client/Servers/OptionsController.php"

  mkdir -p "resources/scripts/components/server/options"
  curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/OptionsContainer.tsx?t=${CACHE_BUST}" \
    -o "resources/scripts/components/server/options/OptionsContainer.tsx"

  # Download Sagarmatha default server logos & ensure public/resourcepacks directory exists
  mkdir -p "public/images"
  curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/logo_highqualtiy.png?t=${CACHE_BUST}" \
    -o "public/images/sagarmatha_logo.png" 2>/dev/null || true
  curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/logo_minecraft.png?t=${CACHE_BUST}" \
    -o "public/images/sagarmatha_mc_logo.png" 2>/dev/null || true

  mkdir -p "public/resourcepacks"
  chmod 755 "public/resourcepacks" 2>/dev/null || true
  chown -R www-data:www-data "public/resourcepacks" 2>/dev/null || chown -R nginx:nginx "public/resourcepacks" 2>/dev/null || true
fi

# 11. Register API Routes in routes/api-client.php
echo -e "${CYAN}[*] Registering API routes in routes/api-client.php...${NC}"

cat << 'PHP_REG_API_EOF' > /tmp/ptero_reg_api.php
<?php
$file = $argv[1];
$enablePlugins = ($argv[2] === 'true');
$enableMods = ($argv[3] === 'true');
$enableModpacks = ($argv[4] === 'true');
$enableSoftware = ($argv[5] === 'true');
$enableOptions = (isset($argv[6]) && $argv[6] === 'true');

if (!file_exists($file)) {
    exit(0);
}

$c = file_get_contents($file);

// Clean old routes
$c = preg_replace('/\/\*\s*>>>\s*ARIX PLUGIN INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX PLUGIN INSTALLER END\s*<<<\s*\*\/\s*/s', '', $c);
$c = preg_replace('/\/\*\s*>>>\s*ARIX MOD INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX MOD INSTALLER END\s*<<<\s*\*\/\s*/s', '', $c);
$c = preg_replace('/\/\*\s*>>>\s*ARIX MODPACK INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX MODPACK INSTALLER END\s*<<<\s*\*\/\s*/s', '', $c);
$c = preg_replace('/\/\*\s*>>>\s*ARIX SOFTWARE INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX SOFTWARE INSTALLER END\s*<<<\s*\*\/\s*/s', '', $c);
$c = preg_replace('/\/\*\s*>>>\s*ARIX OPTIONS MANAGER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX OPTIONS MANAGER END\s*<<<\s*\*\/\s*/s', '', $c);
$c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/plugins[\x27\x22]\],.*?\}\);\s*/s', '', $c);
$c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/mods[\x27\x22]\],.*?\}\);\s*/s', '', $c);
$c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/modpacks[\x27\x22]\],.*?\}\);\s*/s', '', $c);
$c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/software[\x27\x22]\],.*?\}\);\s*/s', '', $c);
$c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/options[\x27\x22]\],.*?\}\);\s*/s', '', $c);

// Ensure Pterodactyl\Http\Controllers\Api\Client namespace is imported
if (strpos($c, 'use Pterodactyl\Http\Controllers\Api\Client;') === false) {
    $c = preg_replace('/<\?php\s*/', "<?php\n\nuse Pterodactyl\\Http\\Controllers\\Api\\Client;\n", $c, 1);
}

$append = '';

if ($enablePlugins) {
    $append .= "\n/* >>> ARIX PLUGIN INSTALLER START >>> */\n";
    $append .= "Route::group(['prefix' => '/servers/{server}/plugins'], function () {\n";
    $append .= "    Route::get('/', [Client\\Servers\\PluginInstallerController::class, 'index']);\n";
    $append .= "    Route::get('/versions', [Client\\Servers\\PluginInstallerController::class, 'versions']);\n";
    $append .= "    Route::get('/tags', [Client\\Servers\\PluginInstallerController::class, 'tags']);\n";
    $append .= "    Route::get('/installed', [Client\\Servers\\PluginInstallerController::class, 'installed']);\n";
    $append .= "    Route::post('/install', [Client\\Servers\\PluginInstallerController::class, 'install']);\n";
    $append .= "    Route::post('/delete', [Client\\Servers\\PluginInstallerController::class, 'delete']);\n";
    $append .= "});\n/* <<< ARIX PLUGIN INSTALLER END <<< */\n";
}

if ($enableMods) {
    $append .= "\n/* >>> ARIX MOD INSTALLER START >>> */\n";
    $append .= "Route::group(['prefix' => '/servers/{server}/mods'], function () {\n";
    $append .= "    Route::get('/', [Client\\Servers\\ModInstallerController::class, 'index']);\n";
    $append .= "    Route::get('/versions', [Client\\Servers\\ModInstallerController::class, 'versions']);\n";
    $append .= "    Route::get('/tags', [Client\\Servers\\ModInstallerController::class, 'tags']);\n";
    $append .= "    Route::get('/installed', [Client\\Servers\\ModInstallerController::class, 'installed']);\n";
    $append .= "    Route::post('/install', [Client\\Servers\\ModInstallerController::class, 'install']);\n";
    $append .= "    Route::post('/delete', [Client\\Servers\\ModInstallerController::class, 'delete']);\n";
    $append .= "});\n/* <<< ARIX MOD INSTALLER END <<< */\n";
}

if ($enableModpacks) {
    $append .= "\n/* >>> ARIX MODPACK INSTALLER START >>> */\n";
    $append .= "Route::group(['prefix' => '/servers/{server}/modpacks'], function () {\n";
    $append .= "    Route::get('/', [Client\\Servers\\ModpackInstallerController::class, 'index']);\n";
    $append .= "    Route::get('/versions', [Client\\Servers\\ModpackInstallerController::class, 'versions']);\n";
    $append .= "    Route::get('/categories', [Client\\Servers\\ModpackInstallerController::class, 'categories']);\n";
    $append .= "    Route::get('/installed', [Client\\Servers\\ModpackInstallerController::class, 'installed']);\n";
    $append .= "    Route::post('/prepare', [Client\\Servers\\ModpackInstallerController::class, 'prepare']);\n";
    $append .= "    Route::post('/install-batch', [Client\\Servers\\ModpackInstallerController::class, 'installBatch']);\n";
    $append .= "    Route::post('/finalize', [Client\\Servers\\ModpackInstallerController::class, 'finalize']);\n";
    $append .= "    Route::post('/uninstall', [Client\\Servers\\ModpackInstallerController::class, 'uninstall']);\n";
    $append .= "});\n/* <<< ARIX MODPACK INSTALLER END <<< */\n";
}

if ($enableSoftware) {
    $append .= "\n/* >>> ARIX SOFTWARE INSTALLER START >>> */\n";
    $append .= "Route::group(['prefix' => '/servers/{server}/software'], function () {\n";
    $append .= "    Route::get('/', [Client\\Servers\\SoftwareInstallerController::class, 'index']);\n";
    $append .= "    Route::get('/versions', [Client\\Servers\\SoftwareInstallerController::class, 'versions']);\n";
    $append .= "    Route::get('/builds', [Client\\Servers\\SoftwareInstallerController::class, 'builds']);\n";
    $append .= "    Route::post('/install', [Client\\Servers\\SoftwareInstallerController::class, 'install']);\n";
    $append .= "});\n/* <<< ARIX SOFTWARE INSTALLER END <<< */\n";
}

if ($enableOptions) {
    $append .= "\n/* >>> ARIX OPTIONS MANAGER START >>> */\n";
    $append .= "Route::group(['prefix' => '/servers/{server}/options'], function () {\n";
    $append .= "    Route::get('/', [Client\\Servers\\OptionsController::class, 'index']);\n";
    $append .= "    Route::post('/', [Client\\Servers\\OptionsController::class, 'update']);\n";
    $append .= "    Route::post('/icon', [Client\\Servers\\OptionsController::class, 'uploadIcon']);\n";
    $append .= "    Route::delete('/icon', [Client\\Servers\\OptionsController::class, 'deleteIcon']);\n";
    $append .= "    Route::post('/resourcepack', [Client\\Servers\\OptionsController::class, 'uploadResourcePack']);\n";
    $append .= "    Route::delete('/resourcepack', [Client\\Servers\\OptionsController::class, 'deleteResourcePack']);\n";
    $append .= "});\n/* <<< ARIX OPTIONS MANAGER END <<< */\n";
}

$c = rtrim($c) . "\n" . $append;
file_put_contents($file, $c);
PHP_REG_API_EOF

php /tmp/ptero_reg_api.php "$ROUTES_PHP" "$ENABLE_PLUGINS" "$ENABLE_MODS" "$ENABLE_MODPACKS" "$ENABLE_SOFTWARE" "$ENABLE_OPTIONS"
rm -f /tmp/ptero_reg_api.php

# Verify PHP syntax of routes/api-client.php
php -l "$ROUTES_PHP" || {
  echo -e "${RED}[✗] Syntax error detected in $ROUTES_PHP!${NC}"
  false
}

# 12. Register Frontend Routes in resources/scripts/routers/routes.ts
echo -e "${CYAN}[*] Registering frontend routes in resources/scripts/routers/routes.ts...${NC}"

cat << 'PHP_REG_EOF' > /tmp/ptero_reg_routes.php
<?php
$routesTs = $argv[1];
$enablePlugins = ($argv[2] === 'true');
$enableMods = ($argv[3] === 'true');
$enableModpacks = ($argv[4] === 'true');
$enableSoftware = ($argv[5] === 'true');
$enableOptions = (isset($argv[6]) && $argv[6] === 'true');

$c = file_get_contents($routesTs);

// Clean old imports & routes
$c = preg_replace('/import\s+PluginInstallerContainer[^\n]*\n?/s', '', $c);
$c = preg_replace('/import\s+ModInstallerContainer[^\n]*\n?/s', '', $c);
$c = preg_replace('/import\s+ModpackInstallerContainer[^\n]*\n?/s', '', $c);
$c = preg_replace('/import\s+SoftwareInstallerContainer[^\n]*\n?/s', '', $c);
$c = preg_replace('/import\s+OptionsContainer[^\n]*\n?/s', '', $c);
$c = preg_replace('/\s*\{\s*path:\s*[\x27\x22]\/plugins[\x27\x22][^\}]*\},?/s', '', $c);
$c = preg_replace('/\s*\{\s*path:\s*[\x27\x22]\/mods[\x27\x22][^\}]*\},?/s', '', $c);
$c = preg_replace('/\s*\{\s*path:\s*[\x27\x22]\/modpacks[\x27\x22][^\}]*\},?/s', '', $c);
$c = preg_replace('/\s*\{\s*path:\s*[\x27\x22]\/software[\x27\x22][^\}]*\},?/s', '', $c);
$c = preg_replace('/\s*\{\s*path:\s*[\x27\x22]\/options[\x27\x22][^\}]*\},?/s', '', $c);
$c = preg_replace('/[^\n]*PluginInstallerContainer[^\n]*\n?/', '', $c);
$c = preg_replace('/[^\n]*ModInstallerContainer[^\n]*\n?/', '', $c);
$c = preg_replace('/[^\n]*ModpackInstallerContainer[^\n]*\n?/', '', $c);
$c = preg_replace('/[^\n]*SoftwareInstallerContainer[^\n]*\n?/', '', $c);
$c = preg_replace('/[^\n]*OptionsContainer[^\n]*\n?/', '', $c);

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

if ($enableModpacks) {
    $imports .= "import ModpackInstallerContainer from '@/components/server/modpack-installer/ModpackInstallerContainer';\n";
    $routes .= "\n        { path: '/modpacks', permission: 'file.*', name: undefined, component: ModpackInstallerContainer, exact: true },";
}

if ($enableSoftware) {
    $imports .= "import SoftwareInstallerContainer from '@/components/server/software-installer/SoftwareInstallerContainer';\n";
    $routes .= "\n        { path: '/software', permission: 'file.*', name: undefined, component: SoftwareInstallerContainer, exact: true },";
}

if ($enableOptions) {
    $imports .= "import OptionsContainer from '@/components/server/options/OptionsContainer';\n";
    $routes .= "\n        { path: '/options', permission: 'file.*', name: undefined, component: OptionsContainer, exact: true },";
}

$c = $imports . $c;
$c = preg_replace('/(server:\s*\[)/', '$1' . $routes, $c, 1);

file_put_contents($routesTs, $c);
echo "Registered routes successfully in routes.ts\n";
PHP_REG_EOF

php /tmp/ptero_reg_routes.php "$ROUTES_TS" "$ENABLE_PLUGINS" "$ENABLE_MODS" "$ENABLE_MODPACKS" "$ENABLE_SOFTWARE" "$ENABLE_OPTIONS"
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

if [ "$ENABLE_MODPACKS" = true ]; then
  if ! grep -q "/modpacks" "$ROUTES_TS" || ! grep -q "ModpackInstallerContainer" "$ROUTES_TS"; then
    echo -e "${RED}[✗] Failed to verify /modpacks in routes.ts.${NC}"
    false
  fi
fi

if [ "$ENABLE_SOFTWARE" = true ]; then
  if ! grep -q "/software" "$ROUTES_TS" || ! grep -q "SoftwareInstallerContainer" "$ROUTES_TS"; then
    echo -e "${RED}[✗] Failed to verify /software in routes.ts.${NC}"
    false
  fi
fi

if [ "$ENABLE_OPTIONS" = true ]; then
  if ! grep -q "/options" "$ROUTES_TS" || ! grep -q "OptionsContainer" "$ROUTES_TS"; then
    echo -e "${RED}[✗] Failed to verify /options in routes.ts.${NC}"
    false
  fi
fi


# 12. Install Auto Suspension, Expiration & Plan Details System
echo -e "${CYAN}[*] Setting up Server Auto-Suspension, Expiration & Plan Details system...${NC}"

# Download migrations
mkdir -p "database/migrations"
curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/migrations/2026_09_07_000000_add_auto_suspension_to_servers_table.php?t=${CACHE_BUST}" \
  -o "database/migrations/2026_09_07_000000_add_auto_suspension_to_servers_table.php"

curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/migrations/2026_09_07_000001_add_plan_details_to_servers_table.php?t=${CACHE_BUST}" \
  -o "database/migrations/2026_09_07_000001_add_plan_details_to_servers_table.php"

# Download Artisan command
mkdir -p "app/Console/Commands"
curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/AutoSuspendServersCommand.php?t=${CACHE_BUST}" \
  -o "app/Console/Commands/AutoSuspendServersCommand.php"

# Download Owner Notification
mkdir -p "app/Notifications"
curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/ServerSuspensionWarningNotification.php?t=${CACHE_BUST}" \
  -o "app/Notifications/ServerSuspensionWarningNotification.php"

# Download Server Expiry & Plan Card component
mkdir -p "resources/scripts/components/server"
curl -fsSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/ServerExpiryCard.tsx?t=${CACHE_BUST}" \
  -o "resources/scripts/components/server/ServerExpiryCard.tsx"

# Run database migration
echo -e "${CYAN}[*] Running database migration for auto-suspension and plan details...${NC}"
php artisan migrate --force

# Apply patches for Admin views & controllers
echo -e "${CYAN}[*] Applying auto-suspension & plan detail patches to Admin panel...${NC}"
rm -f "/tmp/ptero_patch_auto_suspend.php"
curl -fsSL -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/patch-auto-suspend.php?t=${CACHE_BUST}" \
  -o "/tmp/ptero_patch_auto_suspend.php"

php /tmp/ptero_patch_auto_suspend.php
rm -f /tmp/ptero_patch_auto_suspend.php

# Apply patch to Server Dashboard to inject ServerExpiryCard below stat cards
echo -e "${CYAN}[*] Injecting Server Expiry & Plan Card into Server Dashboard...${NC}"
rm -f "/tmp/ptero_patch_dashboard_card.php"
curl -fsSL -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/patch-dashboard-card.php?t=${CACHE_BUST}" \
  -o "/tmp/ptero_patch_dashboard_card.php"

php /tmp/ptero_patch_dashboard_card.php
rm -f /tmp/ptero_patch_dashboard_card.php

# 13. Rebuild Frontend Assets
echo -e "${CYAN}[*] Building production frontend assets (yarn build:production)...${NC}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

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

# Ensure web server has read/execute permissions to all built assets
chmod -R 755 public

# 14. Clear Laravel Caches
echo -e "${CYAN}[*] Clearing Laravel route, view, and config caches...${NC}"
php artisan route:clear
php artisan view:clear
php artisan config:clear

chown -R www-data:www-data "$PTERO_DIR" 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR" 2>/dev/null || true

# Turn off rollback trap on success
trap - ERR

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  ✓ ARIX ADDON SUITE INSTALLED SUCCESSFULLY!                    ${NC}"
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

if [ "$ENABLE_MODPACKS" = true ]; then
  echo -e "• ${CYAN}Modpacks Installer${NC}: Accessible at ${BOLD}/server/<server-id>/modpacks${NC}"
  echo -e "  Arix Server Tools Link: URL=${CYAN}/modpacks${NC}, Name=${CYAN}Modpacks Installer${NC}, Icon=${CYAN}HiOutlineCollection${NC}"
fi

if [ "$ENABLE_SOFTWARE" = true ]; then
  echo -e "• ${CYAN}Software Installer${NC}: Accessible at ${BOLD}/server/<server-id>/software${NC}"
  echo -e "  Arix Server Tools Link: URL=${CYAN}/software${NC}, Name=${CYAN}Software Installer${NC}, Icon=${CYAN}HiOutlineServer${NC}"
fi

if [ "$ENABLE_OPTIONS" = true ]; then
  echo -e "• ${CYAN}Server Options${NC}: Accessible at ${BOLD}/server/<server-id>/options${NC}"
  echo -e "  Arix Server Tools Link: URL=${CYAN}/options${NC}, Name=${CYAN}Server Options${NC}, Icon=${CYAN}HiOutlineAdjustments${NC}"
fi

echo -e "• ${CYAN}Auto Suspension & Expiry System${NC}: Active via scheduled command (${BOLD}ptero:auto-suspend${NC})"
echo -e "  Admin Server Creation & Edit pages now feature ${CYAN}Expiration Date${NC}, ${CYAN}Plan Name${NC}, and ${CYAN}Plan Price${NC}."
echo -e "  Servers approaching expiration receive a courteous notice 3 days prior."
echo -e "• ${CYAN}Server Expiry & Plan Card${NC}: Displayed directly beneath stat cards on the dashboard."
echo -e "  Color-coded: ${YELLOW}Yellow${NC} when ≤ 3 days, ${RED}Red${NC} when ≤ 24 hours / expired."

echo ""
echo -e "${GREEN}================================================================${NC}"
