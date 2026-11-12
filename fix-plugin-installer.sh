#!/bin/bash
set -eo pipefail

# ================================================================
#  Pterodactyl Plugin Installer Hotfix Script
#  Fixes:
#    1. Detection of installed plugins on server
#    2. Spigot proper plugin filenames (LuckPerms, EssentialsX, etc.)
#    3. Failed plugin downloads (SSRF protection & universal CDN support)
#    4. Synchronous Wings pull & dual-strategy streaming fallback
#    5. Accurate version modal installed state & optimistic updates
# ================================================================

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}  Applying Pterodactyl Plugin Installer Fix                     ${NC}"
echo -e "${CYAN}================================================================${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[!] Please run this script as root (sudo bash fix-plugin-installer.sh).${NC}"
  exit 1
fi

# Detect Pterodactyl Directory
PTERO_DIR="/var/www/pterodactyl"
if [ ! -d "$PTERO_DIR" ]; then
  if [ -f "artisan" ] && [ -d "resources/scripts" ]; then
    PTERO_DIR="$(pwd)"
  else
    echo -e "${RED}[!] Cannot find Pterodactyl directory (/var/www/pterodactyl).${NC}"
    exit 1
  fi
fi

cd "$PTERO_DIR"
echo -e "${GREEN}[+] Pterodactyl root: ${PTERO_DIR}${NC}"

CACHE_BUST=$(date +%s)
BASE_URL="https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"

# 1. Update Backend Controller
echo -e "${CYAN}[+] 1/5 Updating PluginInstallerController.php...${NC}"
mkdir -p app/Http/Controllers/Api/Client/Servers

if [ -n "$CURRENT_DIR" ] && [ -f "$CURRENT_DIR/pterodactyl-addon/PluginInstallerController.php" ]; then
  cp "$CURRENT_DIR/pterodactyl-addon/PluginInstallerController.php" app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php
  echo -e "${GREEN}[✓] Copied local PluginInstallerController.php${NC}"
else
  curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PluginInstallerController.php?t=${CACHE_BUST}" -o app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php
  echo -e "${GREEN}[✓] Downloaded latest PluginInstallerController.php${NC}"
fi

# 2. Update Frontend Component
echo -e "${CYAN}[+] 2/5 Updating PluginInstallerContainer.tsx...${NC}"

TARGET_TSX_PATHS=(
  "resources/scripts/components/server/plugin-installer/PluginInstallerContainer.tsx"
  "resources/scripts/components/server/plugins/PluginInstallerContainer.tsx"
  "resources/scripts/components/server/PluginInstallerContainer.tsx"
)

UPDATED_TSX=false
for TSX_PATH in "${TARGET_TSX_PATHS[@]}"; do
  if [ -f "$TSX_PATH" ]; then
    if [ -n "$CURRENT_DIR" ] && [ -f "$CURRENT_DIR/pterodactyl-addon/PluginInstallerContainer.tsx" ]; then
      cp "$CURRENT_DIR/pterodactyl-addon/PluginInstallerContainer.tsx" "$TSX_PATH"
      echo -e "${GREEN}[✓] Updated local: ${TSX_PATH}${NC}"
    else
      curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PluginInstallerContainer.tsx?t=${CACHE_BUST}" -o "$TSX_PATH"
      echo -e "${GREEN}[✓] Downloaded into: ${TSX_PATH}${NC}"
    fi
    UPDATED_TSX=true
  fi
done

if [ "$UPDATED_TSX" = false ]; then
  DEFAULT_TSX="resources/scripts/components/server/plugin-installer/PluginInstallerContainer.tsx"
  mkdir -p "$(dirname "$DEFAULT_TSX")"
  if [ -n "$CURRENT_DIR" ] && [ -f "$CURRENT_DIR/pterodactyl-addon/PluginInstallerContainer.tsx" ]; then
    cp "$CURRENT_DIR/pterodactyl-addon/PluginInstallerContainer.tsx" "$DEFAULT_TSX"
  else
    curl -fsSL -H 'Cache-Control: no-cache' "${BASE_URL}/PluginInstallerContainer.tsx?t=${CACHE_BUST}" -o "$DEFAULT_TSX"
  fi
  echo -e "${GREEN}[✓] Installed at: ${DEFAULT_TSX}${NC}"
fi

# 3. Clear Laravel Application Cache
echo -e "${CYAN}[+] 3/5 Clearing application cache...${NC}"
php artisan optimize:clear 2>/dev/null || {
  php artisan config:clear 2>/dev/null || true
  php artisan route:clear 2>/dev/null || true
  php artisan view:clear 2>/dev/null || true
  php artisan cache:clear 2>/dev/null || true
}
echo -e "${GREEN}[✓] Caches cleared.${NC}"

# 4. Rebuild Frontend Assets
echo -e "${CYAN}[+] 4/5 Building production frontend assets...${NC}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

if command -v yarn &> /dev/null; then
  yarn build:production --progress || yarn build:production
elif command -v npm &> /dev/null; then
  npm run build:production
else
  echo -e "${YELLOW}[!] Neither yarn nor npm found in PATH. Skipping asset build.${NC}"
fi

# 5. Fix File Permissions & Reload Web Server
echo -e "${CYAN}[+] 5/5 Setting permissions & reloading services...${NC}"
chown -R www-data:www-data "$PTERO_DIR" 2>/dev/null || chown -R nginx:nginx "$PTERO_DIR" 2>/dev/null || true
chmod -R 755 "$PTERO_DIR/storage" "$PTERO_DIR/bootstrap/cache" 2>/dev/null || true

systemctl reload php8.3-fpm 2>/dev/null || \
systemctl reload php8.2-fpm 2>/dev/null || \
systemctl reload php8.1-fpm 2>/dev/null || \
systemctl reload php8.0-fpm 2>/dev/null || \
systemctl reload php-fpm 2>/dev/null || true

systemctl reload nginx 2>/dev/null || systemctl reload apache2 2>/dev/null || true

echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}[✓] Plugin Installer fix applied successfully!${NC}"
echo -e "${GREEN}================================================================${NC}"
