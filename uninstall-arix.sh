#!/usr/bin/env bash

# ==============================================================================
# Arix Theme Addon Suite Uninstaller (Plugins, Mods, Modpacks, Software, Options)
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
echo "    Arix Theme Addon Suite Uninstaller (All Addons)             "
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

echo -e "${CYAN}[*] Removing addons components and controllers...${NC}"
rm -rf "resources/scripts/components/server/plugin-installer" 2>/dev/null || true
rm -rf "resources/scripts/components/server/mod-installer" 2>/dev/null || true
rm -rf "resources/scripts/components/server/modpack-installer" 2>/dev/null || true
rm -rf "resources/scripts/components/server/software-installer" 2>/dev/null || true
rm -rf "resources/scripts/components/server/options" 2>/dev/null || true
rm -f "app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php" 2>/dev/null || true
rm -f "app/Http/Controllers/Api/Client/Servers/ModInstallerController.php" 2>/dev/null || true
rm -f "app/Http/Controllers/Api/Client/Servers/ModpackInstallerController.php" 2>/dev/null || true
rm -f "app/Http/Controllers/Api/Client/Servers/SoftwareInstallerController.php" 2>/dev/null || true
rm -f "app/Http/Controllers/Api/Client/Servers/OptionsController.php" 2>/dev/null || true
rm -f "app/Console/Commands/AutoSuspendServersCommand.php" 2>/dev/null || true
rm -f "app/Notifications/ServerSuspensionWarningNotification.php" 2>/dev/null || true
rm -f "database/migrations/2026_09_07_000000_add_auto_suspension_to_servers_table.php" 2>/dev/null || true

echo -e "${CYAN}[*] Cleaning routes from routes/api-client.php...${NC}"
cat << 'PHP_CLEAN_EOF' > /tmp/ptero_clean_api.php
<?php
$file = $argv[1];
if (file_exists($file)) {
    $c = file_get_contents($file);
    $c = preg_replace('/\/\*\s*>>>\s*ARIX PLUGIN INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX PLUGIN INSTALLER END\s*<<<\s*\*\/\s*/s', '', $c);
    $c = preg_replace('/\/\*\s*>>>\s*ARIX MOD INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX MOD INSTALLER END\s*<<<\s*\*\/\s*/s', '', $c);
    $c = preg_replace('/\/\*\s*>>>\s*ARIX MODPACK INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX MODPACK INSTALLER END\s*<<<\s*\*\/\s*/s', '', $c);
    $c = preg_replace('/\/\*\s*>>>\s*ARIX SOFTWARE INSTALLER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX SOFTWARE INSTALLER END\s*<<<\s*\*\/\s*/s', '', $c);
    $c = preg_replace('/\/\*\s*>>>\s*ARIX OPTIONS MANAGER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX OPTIONS MANAGER END\s*<<<\s*\*\/\s*/s', '', $c);
    $c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/plugins[\x27\x22]\],.*?\}\);\s*/s', '', $c);
    $c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/mods[\x27\x22]\],.*?\}\);\s*/s', '', $c);
    $c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/modpacks[\x27\x22]\],.*?\}\);\s*/s', '', $c);
    $c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/software[\x27\x22]\],.*?\}\);\s*/s', '', $c);
    file_put_contents($file, $c);
}
PHP_CLEAN_EOF

php /tmp/ptero_clean_api.php "$ROUTES_PHP"
rm -f /tmp/ptero_clean_api.php
php -l "$ROUTES_PHP" || true

echo -e "${CYAN}[*] Cleaning routes from resources/scripts/routers/routes.ts...${NC}"
cat << 'PHP_REG_EOF' > /tmp/ptero_clean_routes.php
<?php
$routesTs = $argv[1];
$c = file_get_contents($routesTs);

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

file_put_contents($routesTs, $c);
PHP_REG_EOF

php /tmp/ptero_clean_routes.php "$ROUTES_TS"
rm -f /tmp/ptero_clean_routes.php

echo -e "${CYAN}[*] Cleaning any legacy ServerRouter.tsx references...${NC}"
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


echo -e "${CYAN}[*] Cleaning auto-suspension patches from admin views and controllers...${NC}"
cat << 'PHP_UNPATCH_EOF' > /tmp/ptero_unpatch_auto_suspend.php
<?php
\$files = [
    'resources/views/admin/servers/new.blade.php',
    'resources/views/admin/servers/view/details.blade.php',
    'app/Http/Controllers/Admin/Servers/CreateServerController.php',
    'app/Http/Controllers/Admin/ServersController.php',
    'app/Console/Kernel.php',
    'app/Models/Server.php',
];

foreach (\$files as \$file) {
    if (file_exists(\$file)) {
        \$c = file_get_contents(\$file);
        \$c = preg_replace('/<!--\\s*>>>\\s*ARIX AUTO SUSPENSION START\\s*>>>\\s*-->.*?<!--\\s*<<<\\s*ARIX AUTO SUSPENSION END\\s*<<<\\s*-->\\s*/s', '', \$c);
        \$c = preg_replace('/\\/\\*\\s*>>>\\s*ARIX AUTO SUSPENSION START\\s*>>>\\s*\\*\\/.*?\\/\\*\\s*<<<\\s*ARIX AUTO SUSPENSION END\\s*<<<\\s*\\*\\/\\s*/s', '', \$c);
        file_put_contents(\$file, \$c);
    }
}
PHP_UNPATCH_EOF

php /tmp/ptero_unpatch_auto_suspend.php
rm -f /tmp/ptero_unpatch_auto_suspend.php

echo -e "${CYAN}[*] Rebuilding frontend assets without addons...${NC}"
if command -v yarn &> /dev/null; then
  yarn build:production
elif command -v npm &> /dev/null; then
  npm run build:production
fi

echo -e "${CYAN}[*] Clearing Laravel caches...${NC}"
php artisan route:clear
php artisan view:clear
php artisan config:clear

chown -R www-data:www-data "$PTERO_DIR" 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR" 2>/dev/null || true

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  ✓ Arix Theme Addon Suite uninstalled successfully!            ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
