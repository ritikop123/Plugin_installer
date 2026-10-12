#!/bin/bash
set -eo pipefail

echo "================================================================"
echo "  Applying Plugin & Mod Filename Validation Fix"
echo "================================================================"

if [ "$EUID" -ne 0 ]; then
  echo "[!] Please run this script as root (sudo bash ...)."
  exit 1
fi

PTERO_DIR="/var/www/pterodactyl"
if [ ! -d "$PTERO_DIR" ]; then
  if [ -f "artisan" ]; then
    PTERO_DIR="$(pwd)"
  else
    echo "[!] Cannot find Pterodactyl directory (/var/www/pterodactyl)."
    exit 1
  fi
fi

cd "$PTERO_DIR"
CACHE_BUST=$(date +%s)
BASE_URL="https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon"

echo "[+] Downloading updated PluginInstallerController.php..."
mkdir -p app/Http/Controllers/Api/Client/Servers
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PluginInstallerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php

echo "[+] Downloading updated ModInstallerController.php..."
curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/ModInstallerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/ModInstallerController.php

echo "[+] Clearing application cache..."
php artisan optimize:clear

echo "[+] Fixing permissions..."
chown -R www-data:www-data "$PTERO_DIR/app/Http/Controllers/Api/Client/Servers" 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR/app/Http/Controllers/Api/Client/Servers" 2>/dev/null || true

echo "================================================================"
echo "[+] Done! Plugin and mod filename validation fix is active."
echo "================================================================"
