#!/bin/bash
set -eo pipefail

echo -e "\033[0;36m================================================================\033[0m"
echo -e "\033[0;36m  Fixing Support ID: Top Bar Placement & 6-Character Format     \033[0m"
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

echo -e "\033[0;32m[+] Downloading updated ServerSupportId component...\033[0m"
mkdir -p resources/scripts/components/server
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ServerSupportId.tsx?t=${CACHE_BUST}" -o resources/scripts/components/server/ServerSupportId.tsx

echo -e "\033[0;32m[+] Downloading and running layout & dashboard patches...\033[0m"
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/patch-support-id.php?t=${CACHE_BUST}" -o /tmp/ptero_patch_support_id.php
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/patch-dashboard-card.php?t=${CACHE_BUST}" -o /tmp/ptero_patch_dashboard_card.php

php /tmp/ptero_patch_support_id.php || true
php /tmp/ptero_patch_dashboard_card.php || true

echo -e "\033[0;32m[+] Updating existing database servers to 6-character Support ID (SUP-XXXXXX)...\033[0m"
php artisan tinker --execute="
try {
  \Illuminate\Support\Facades\DB::table('servers')->get()->each(function(\$s) {
      \$code = 'SUP-' . strtoupper(substr(str_replace('-', '', \$s->uuid), 0, 6));
      \Illuminate\Support\Facades\DB::table('servers')->where('id', \$s->id)->update(['support_id' => \$code]);
  });
  echo 'Database support IDs updated to 6 characters.\n';
} catch (\Throwable \$e) {
  echo 'Error updating servers: ' . \$e->getMessage() . '\n';
}
" || true

echo -e "\033[0;32m[+] Clearing backend cache...\033[0m"
php artisan optimize:clear

echo -e "\033[0;32m[+] Compiling production frontend assets...\033[0m"
export NODE_OPTIONS="--max-old-space-size=4096"
yarn build:production

echo -e "\033[0;32m[+] Setting correct permissions...\033[0m"
chown -R www-data:www-data "$PTERO_DIR"/* 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR"/* 2>/dev/null || true

echo -e "\033[0;32m================================================================\033[0m"
echo -e "\033[0;32m[✓] Support ID successfully fixed in Top Bar with 6 characters! \033[0m"
echo -e "\033[0;32m================================================================\033[0m"
