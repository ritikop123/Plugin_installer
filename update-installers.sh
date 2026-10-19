#!/bin/bash
set -eo pipefail

echo -e "\033[0;36m================================================================\033[0m"
echo -e "\033[0;36m  Updating Plugin, Mod, and Modpack Installers (CurseForge, SpigotMC, Hangar) \033[0m"
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

echo -e "\033[0;32m[+] Downloading updated backend controllers...\033[0m"
mkdir -p app/Http/Controllers/Api/Client/Servers
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PluginInstallerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ModInstallerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/ModInstallerController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ModpackInstallerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/ModpackInstallerController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/OptionsController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/OptionsController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/SoftwareInstallerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/SoftwareInstallerController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PlayerManagerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/PlayerManagerController.php

echo -e "\033[0;32m[+] Downloading updated React components with brand icons & providers...\033[0m"
mkdir -p resources/scripts/components/server/plugin-installer
mkdir -p resources/scripts/components/server/mod-installer
mkdir -p resources/scripts/components/server/modpack-installer
mkdir -p resources/scripts/components/server/software-installer
mkdir -p resources/scripts/components/server/player-manager
mkdir -p resources/scripts/components/server/options

curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PluginInstallerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/plugin-installer/PluginInstallerContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ModInstallerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/mod-installer/ModInstallerContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ModpackInstallerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/modpack-installer/ModpackInstallerContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/SoftwareInstallerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/software-installer/SoftwareInstallerContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PlayerManagerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/player-manager/PlayerManagerContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/OptionsContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/options/OptionsContainer.tsx


echo -e "\033[0;32m[+] Updating ServerExpiryCard component & auto-suspend / build config patches...\033[0m"
mkdir -p app/Console/Commands
mkdir -p app/Notifications
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/AutoSuspendServersCommand.php?t=${CACHE_BUST}" -o app/Console/Commands/AutoSuspendServersCommand.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ServerSuspensionWarningNotification.php?t=${CACHE_BUST}" -o app/Notifications/ServerSuspensionWarningNotification.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ServerExpiryCard.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/ServerExpiryCard.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/patch-auto-suspend.php?t=${CACHE_BUST}" -o /tmp/ptero_patch_auto_suspend.php
php /tmp/ptero_patch_auto_suspend.php || true

# Ensure system cron runs artisan schedule:run every minute and ptero:auto-suspend directly
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

echo -e "\033[0;32m[+] Updating ServerSupportId, AdminSupportIdSearch & SupportLookupController...\033[0m"
mkdir -p resources/scripts/components/dashboard
mkdir -p resources/scripts/components/dashboard/dashboard
mkdir -p app/Http/Controllers/Api/Client
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ServerSupportId.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/ServerSupportId.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ServerUptime.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/ServerUptime.tsx
cp resources/scripts/components/server/ServerUptime.tsx resources/scripts/components/dashboard/ServerUptime.tsx 2>/dev/null || true
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/AdminSupportIdSearch.tsx?t=${CACHE_BUST}" -o resources/scripts/components/dashboard/AdminSupportIdSearch.tsx
cp resources/scripts/components/dashboard/AdminSupportIdSearch.tsx resources/scripts/components/dashboard/dashboard/AdminSupportIdSearch.tsx 2>/dev/null || true
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/SupportLookupController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/SupportLookupController.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/patch-support-id.php?t=${CACHE_BUST}" -o /tmp/ptero_patch_support_id.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/patch-dashboard-card.php?t=${CACHE_BUST}" -o /tmp/ptero_patch_dashboard_card.php



php /tmp/ptero_patch_support_id.php || true
php /tmp/ptero_patch_dashboard_card.php || true


echo -e "\033[0;32m[+] Updating existing database support IDs to 6 characters (SUP-XXXXXX)...\033[0m"
php artisan tinker --execute="
try {
  \Illuminate\Support\Facades\DB::table('servers')->get()->each(function(\$s) {
      \$code = 'SUP-' . strtoupper(substr(str_replace('-', '', \$s->uuid), 0, 6));
      \Illuminate\Support\Facades\DB::table('servers')->where('id', \$s->id)->update(['support_id' => \$code]);
  });
} catch (\Throwable \$e) {}
" || true

echo -e "\033[0;32m[+] Clearing backend & blade view caches...\033[0m"
php artisan optimize:clear
php artisan view:clear

echo -e "\033[0;32m[+] Building production frontend assets (this may take a minute)...\033[0m"
export NODE_OPTIONS="--max-old-space-size=4096"
yarn build:production

echo -e "\033[0;32m[+] Reloading web server & PHP-FPM...\033[0m"
systemctl reload php8.3-fpm 2>/dev/null || systemctl reload php8.2-fpm 2>/dev/null || systemctl reload php8.1-fpm 2>/dev/null || systemctl reload php-fpm 2>/dev/null || true
systemctl reload nginx 2>/dev/null || systemctl reload apache2 2>/dev/null || true

echo -e "\033[0;32m[+] Setting correct permissions...\033[0m"
chown -R www-data:www-data "$PTERO_DIR"/* 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR"/* 2>/dev/null || true

echo -e "\033[0;32m================================================================\033[0m"
echo -e "\033[0;32m[✓] All installers successfully updated with CurseForge, SpigotMC & Hangar!\033[0m"
echo -e "\033[0;32m================================================================\033[0m"
