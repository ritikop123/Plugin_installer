#!/bin/bash
set -eo pipefail

echo -e "\033[0;36m================================================================\033[0m"
echo -e "\033[0;36m  Pterodactyl Addon Suite - All-in-One Comprehensive Updater    \033[0m"
echo -e "\033[0;36m  (World Manager, Plugins, Mods, Modpacks, Software, Analytics) \033[0m"
echo -e "\033[0;36m================================================================\033[0m"

# 1. Root Check
if [ "$EUID" -ne 0 ]; then
  echo -e "\033[0;31m[✗] Please run this script as root (sudo bash ...).\033[0m"
  exit 1
fi

PTERO_DIR="/var/www/pterodactyl"
if [ ! -d "$PTERO_DIR" ]; then
  if [ -f "artisan" ] && [ -d "resources/scripts" ]; then
    PTERO_DIR="$(pwd)"
  else
    echo -e "\033[0;31m[✗] Cannot find Pterodactyl directory (/var/www/pterodactyl).\033[0m"
    exit 1
  fi
fi

cd "$PTERO_DIR"
CACHE_BUST=$(date +%s)
BASE_URL="https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon"

echo -e "\033[0;32m[+] 1/9 Downloading updated backend controllers...\033[0m"
mkdir -p app/Http/Controllers/Api/Client/Servers
mkdir -p app/Http/Controllers/Api/Client
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PluginInstallerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ModInstallerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/ModInstallerController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ModpackInstallerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/ModpackInstallerController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/OptionsController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/OptionsController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/SoftwareInstallerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/SoftwareInstallerController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PlayerManagerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/PlayerManagerController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/WorldManagerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/WorldManagerController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/SupportLookupController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/SupportLookupController.php

echo -e "\033[0;32m[+] 2/9 Downloading updated React frontend components...\033[0m"
mkdir -p resources/scripts/components/server/plugin-installer
mkdir -p resources/scripts/components/server/mod-installer
mkdir -p resources/scripts/components/server/modpack-installer
mkdir -p resources/scripts/components/server/software-installer
mkdir -p resources/scripts/components/server/player-manager
mkdir -p resources/scripts/components/server/options
mkdir -p resources/scripts/components/server/world-manager
mkdir -p resources/scripts/components/dashboard
mkdir -p resources/scripts/components/dashboard/dashboard

curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PluginInstallerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/plugin-installer/PluginInstallerContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ModInstallerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/mod-installer/ModInstallerContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ModpackInstallerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/modpack-installer/ModpackInstallerContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/SoftwareInstallerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/software-installer/SoftwareInstallerContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PlayerManagerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/player-manager/PlayerManagerContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/OptionsContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/options/OptionsContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/WorldManagerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/world-manager/WorldManagerContainer.tsx

curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ServerExpiryCard.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/ServerExpiryCard.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ServerExpiryBadge.tsx?t=${CACHE_BUST}" -o resources/scripts/components/dashboard/ServerExpiryBadge.tsx
cp resources/scripts/components/dashboard/ServerExpiryBadge.tsx resources/scripts/components/server/ServerExpiryBadge.tsx 2>/dev/null || true
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ServerUptime.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/ServerUptime.tsx
cp resources/scripts/components/server/ServerUptime.tsx resources/scripts/components/dashboard/ServerUptime.tsx 2>/dev/null || true
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ServerSupportId.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/ServerSupportId.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/AdminSupportIdSearch.tsx?t=${CACHE_BUST}" -o resources/scripts/components/dashboard/AdminSupportIdSearch.tsx
cp resources/scripts/components/dashboard/AdminSupportIdSearch.tsx resources/scripts/components/dashboard/dashboard/AdminSupportIdSearch.tsx 2>/dev/null || true

echo -e "\033[0;32m[+] 3/9 Registering API and Frontend routes (including /world & /worlds)...\033[0m"
cat << 'PHP_ROUTER_PATCH_EOF' > /tmp/ptero_sync_routes.php
<?php
$routesPhp = 'routes/api-client.php';
$routesTs = 'resources/scripts/routers/routes.ts';

if (file_exists($routesPhp)) {
    $c = file_get_contents($routesPhp);
    
    // Ensure Client namespace is imported
    if (strpos($c, 'use Pterodactyl\Http\Controllers\Api\Client;') === false) {
        $c = preg_replace('/<\?php\s*/', "<?php\n\nuse Pterodactyl\\Http\\Controllers\\Api\\Client;\n", $c, 1);
    }
    
    // Clean old world manager routes
    $c = preg_replace('/\/\*\s*>>>\s*ARIX WORLD MANAGER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX WORLD MANAGER END\s*<<<\s*\*\/\s*/s', '', $c);
    $c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/worlds[\x27\x22]\],.*?\}\);\s*/s', '', $c);
    
    $worldRoute = <<<'PHP'

/* >>> ARIX WORLD MANAGER START >>> */
Route::group(['prefix' => '/servers/{server}/worlds'], function () {
    Route::get('/', [Client\Servers\WorldManagerController::class, 'index']);
    Route::get('/options', [Client\Servers\WorldManagerController::class, 'options']);
    Route::post('/options', [Client\Servers\WorldManagerController::class, 'updateOptions']);
    Route::post('/gamerule', [Client\Servers\WorldManagerController::class, 'updateGamerule']);
    Route::post('/optimize', [Client\Servers\WorldManagerController::class, 'optimize']);
    Route::post('/force-upgrade', [Client\Servers\WorldManagerController::class, 'forceUpgrade']);
    Route::post('/download', [Client\Servers\WorldManagerController::class, 'download']);
    Route::post('/upload', [Client\Servers\WorldManagerController::class, 'upload']);
    Route::post('/active', [Client\Servers\WorldManagerController::class, 'setActive']);
    Route::post('/create', [Client\Servers\WorldManagerController::class, 'create']);
    Route::post('/reset-dimension', [Client\Servers\WorldManagerController::class, 'resetDimension']);
    Route::post('/delete', [Client\Servers\WorldManagerController::class, 'delete']);
    Route::post('/backup', [Client\Servers\WorldManagerController::class, 'backup']);
});
/* <<< ARIX WORLD MANAGER END <<< */
PHP;
    $c = rtrim($c) . "\n" . $worldRoute . "\n";
    file_put_contents($routesPhp, $c);
}

if (file_exists($routesTs)) {
    $c = file_get_contents($routesTs);
    
    // Clean existing world routes & imports
    $c = preg_replace('/import\s+WorldManagerContainer[^\n]*\n?/s', '', $c);
    $c = preg_replace('/\s*\{\s*path:\s*[\x27\x22]\/worlds?[\x27\x22][^\}]*\},?/s', '', $c);
    $c = preg_replace('/[^\n]*WorldManagerContainer[^\n]*\n?/', '', $c);
    
    $import = "import WorldManagerContainer from '@/components/server/world-manager/WorldManagerContainer';\n";
    $routeEntries = "\n        { path: '/worlds', permission: 'file.*', name: 'World Manager', component: WorldManagerContainer, exact: true }," .
                    "\n        { path: '/world', permission: 'file.*', component: WorldManagerContainer, exact: true },";
    
    $c = $import . $c;
    $c = preg_replace('/(server:\s*\[)/', '$1' . $routeEntries, $c, 1);
    file_put_contents($routesTs, $c);
}
echo "[✓] World routes registered in routes/api-client.php and routes.ts\n";
PHP_ROUTER_PATCH_EOF

php /tmp/ptero_sync_routes.php || true
rm -f /tmp/ptero_sync_routes.php

echo -e "\033[0;32m[+] 4/9 Downloading database migrations and running migrate...\033[0m"
mkdir -p database/migrations
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/migrations/2026_09_07_000000_add_auto_suspension_to_servers_table.php?t=${CACHE_BUST}" -o database/migrations/2026_09_07_000000_add_auto_suspension_to_servers_table.php 2>/dev/null || true
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/migrations/2026_09_07_000001_add_plan_details_to_servers_table.php?t=${CACHE_BUST}" -o database/migrations/2026_09_07_000001_add_plan_details_to_servers_table.php 2>/dev/null || true
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/migrations/2026_10_09_000002_add_support_id_to_servers_table.php?t=${CACHE_BUST}" -o database/migrations/2026_10_09_000002_add_support_id_to_servers_table.php 2>/dev/null || true
php artisan migrate --force || true

echo -e "\033[0;32m[+] 5/9 Applying Admin Sales Analytics & Dashboard Patches...\033[0m"
mkdir -p app/Console/Commands
mkdir -p app/Notifications
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/AutoSuspendServersCommand.php?t=${CACHE_BUST}" -o app/Console/Commands/AutoSuspendServersCommand.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ServerSuspensionWarningNotification.php?t=${CACHE_BUST}" -o app/Notifications/ServerSuspensionWarningNotification.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/patch-auto-suspend.php?t=${CACHE_BUST}" -o /tmp/ptero_patch_auto_suspend.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/patch-support-id.php?t=${CACHE_BUST}" -o /tmp/ptero_patch_support_id.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/patch-dashboard-card.php?t=${CACHE_BUST}" -o /tmp/ptero_patch_dashboard_card.php

php /tmp/ptero_patch_auto_suspend.php || true
php /tmp/ptero_patch_support_id.php || true
php /tmp/ptero_patch_dashboard_card.php || true
rm -f /tmp/ptero_patch_auto_suspend.php /tmp/ptero_patch_support_id.php /tmp/ptero_patch_dashboard_card.php

echo -e "\033[0;32m[+] 6/9 Setting up Auto-Suspend & Artisan Cron Job and Log File...\033[0m"
touch /var/log/pterodactyl-auto-suspend.log
chown www-data:www-data /var/log/pterodactyl-auto-suspend.log 2>/dev/null || true
chmod 664 /var/log/pterodactyl-auto-suspend.log

setup_panel_cron() {
  local target_user="$1"
  local cmd_prefix=""
  [ -n "$target_user" ] && cmd_prefix="crontab -u $target_user" || cmd_prefix="crontab"

  local current_cron
  current_cron=$($cmd_prefix -l 2>/dev/null || true)
  local filtered_cron
  filtered_cron=$(echo "$current_cron" | grep -v 'schedule:run' | grep -v 'ptero:auto-suspend' || true)

  {
    [ -n "$filtered_cron" ] && echo "$filtered_cron"
    echo "* * * * * cd $PTERO_DIR && php artisan schedule:run >> /dev/null 2>&1"
    echo "* * * * * cd $PTERO_DIR && php artisan ptero:auto-suspend >> /var/log/pterodactyl-auto-suspend.log 2>&1"
  } | $cmd_prefix - 2>/dev/null || true
}

setup_panel_cron ""
if id "www-data" >/dev/null 2>&1; then
  setup_panel_cron "www-data"
fi

# Run an immediate auto-suspend check to initialize log file
php artisan ptero:auto-suspend >> /var/log/pterodactyl-auto-suspend.log 2>&1 || true

echo -e "\033[0;32m[+] 7/9 Updating server support IDs...\033[0m"
php artisan tinker --execute="
try {
  \Illuminate\Support\Facades\DB::table('servers')->get()->each(function(\$s) {
      \$code = 'SUP-' . strtoupper(substr(str_replace('-', '', \$s->uuid), 0, 6));
      \Illuminate\Support\Facades\DB::table('servers')->where('id', \$s->id)->update(['support_id' => \$code]);
  });
} catch (\Throwable \$e) {}
" || true

echo -e "\033[0;32m[+] 8/9 Clearing caches and building production frontend assets...\033[0m"
php artisan optimize:clear
php artisan view:clear
php artisan config:clear
php artisan route:clear
php artisan cache:clear

export NODE_OPTIONS="--max-old-space-size=4096"
yarn build:production || npm run build:production

echo -e "\033[0;32m[+] 9/9 Reloading web server, PHP-FPM and setting permissions...\033[0m"
systemctl reload php8.3-fpm 2>/dev/null || systemctl reload php8.2-fpm 2>/dev/null || systemctl reload php8.1-fpm 2>/dev/null || systemctl reload php-fpm 2>/dev/null || true
systemctl reload nginx 2>/dev/null || systemctl reload apache2 2>/dev/null || true

chown -R www-data:www-data "$PTERO_DIR"/* 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR"/* 2>/dev/null || true
chmod -R 755 public 2>/dev/null || true

echo -e "\033[0;32m================================================================\033[0m"
echo -e "\033[0;32m[✓] All addons, updates & /world route updated successfully!    \033[0m"
echo -e "\033[0;32m================================================================\033[0m"
