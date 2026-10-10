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

echo -e "\033[0;32m[+] Downloading updated React components with brand icons & providers...\033[0m"
mkdir -p resources/scripts/components/server/plugin-installer
mkdir -p resources/scripts/components/server/mod-installer
mkdir -p resources/scripts/components/server/modpack-installer

curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PluginInstallerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/plugin-installer/PluginInstallerContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ModInstallerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/mod-installer/ModInstallerContainer.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ModpackInstallerContainer.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/modpack-installer/ModpackInstallerContainer.tsx

echo -e "\033[0;32m[+] Updating ServerExpiryCard component & auto-suspend / build config patches...\033[0m"
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ServerExpiryCard.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/ServerExpiryCard.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/patch-auto-suspend.php?t=${CACHE_BUST}" -o /tmp/ptero_patch_auto_suspend.php
php /tmp/ptero_patch_auto_suspend.php || true

echo -e "\033[0;32m[+] Updating ServerSupportId, AdminSupportIdSearch & SupportLookupController...\033[0m"
mkdir -p resources/scripts/components/dashboard
mkdir -p app/Http/Controllers/Api/Client
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ServerSupportId.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/ServerSupportId.tsx
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/AdminSupportIdSearch.tsx?t=${CACHE_BUST}" -o resources/scripts/components/dashboard/AdminSupportIdSearch.tsx
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

echo -e "\033[0;32m[+] Clearing backend cache...\033[0m"
php artisan optimize:clear

echo -e "\033[0;32m[+] Building production frontend assets (this may take a minute)...\033[0m"
export NODE_OPTIONS="--max-old-space-size=4096"
yarn build:production

echo -e "\033[0;32m[+] Setting correct permissions...\033[0m"
chown -R www-data:www-data "$PTERO_DIR"/* 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR"/* 2>/dev/null || true

echo -e "\033[0;32m================================================================\033[0m"
echo -e "\033[0;32m[✓] All installers successfully updated with CurseForge, SpigotMC & Hangar!\033[0m"
echo -e "\033[0;32m================================================================\033[0m"
