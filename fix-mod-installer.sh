#!/bin/bash
set -eo pipefail

# ================================================================
#   Arix Theme – Mod Installer Hotfix
#   Fixes:
#     1. Missing closing brace in ModInstallerController.php
#        (installed() method if (is_array($items)) block)
#     2. Wrong type reference ModrinthModHit → ModSearchHit
#        in ModInstallerContainer.tsx
#   Repository: https://github.com/ritikop123/Plugin_installer
# ================================================================

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}   Arix Mod Installer Hotfix                                    ${NC}"
echo -e "${CYAN}   https://github.com/ritikop123/Plugin_installer               ${NC}"
echo -e "${CYAN}================================================================${NC}"

# ── Root Check ────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[✗] Please run as root:  sudo bash fix-mod-installer.sh${NC}"
  exit 1
fi

# ── Locate Pterodactyl ────────────────────────────────────────────
PTERO_DIR="/var/www/pterodactyl"
if [ ! -d "$PTERO_DIR" ]; then
  if [ -f "artisan" ] && [ -d "resources/scripts" ]; then
    PTERO_DIR="$(pwd)"
  else
    echo -e "${RED}[✗] Pterodactyl directory not found at /var/www/pterodactyl${NC}"
    echo -e "${YELLOW}    Run this script from inside your Pterodactyl folder.${NC}"
    exit 1
  fi
fi

cd "$PTERO_DIR"
echo -e "${GREEN}[✓] Pterodactyl directory: ${PTERO_DIR}${NC}"

# ── Target Files ──────────────────────────────────────────────────
PHP_FILE="app/Http/Controllers/Api/Client/Servers/ModInstallerController.php"
TSX_FILE="resources/scripts/components/server/mods/ModInstallerContainer.tsx"

# ── Check files exist ─────────────────────────────────────────────
if [ ! -f "$PHP_FILE" ]; then
  echo -e "${RED}[✗] PHP controller not found: ${PHP_FILE}${NC}"
  echo -e "${YELLOW}    Is the Mods Installer addon installed?${NC}"
  exit 1
fi

if [ ! -f "$TSX_FILE" ]; then
  echo -e "${YELLOW}[!] TSX container not found: ${TSX_FILE}${NC}"
  echo -e "${YELLOW}    Skipping TSX fix (file may be at a different path).${NC}"
  TSX_FILE=""
fi

# ── Backup ────────────────────────────────────────────────────────
BACKUP_DIR="/tmp/arix-mod-hotfix-backup-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp "$PHP_FILE" "$BACKUP_DIR/ModInstallerController.php.bak"
echo -e "${GREEN}[✓] Backed up PHP file → ${BACKUP_DIR}/ModInstallerController.php.bak${NC}"
if [ -n "$TSX_FILE" ]; then
  cp "$TSX_FILE" "$BACKUP_DIR/ModInstallerContainer.tsx.bak"
  echo -e "${GREEN}[✓] Backed up TSX file → ${BACKUP_DIR}/ModInstallerContainer.tsx.bak${NC}"
fi

# ════════════════════════════════════════════════════════════════
# FIX 1: PHP – Missing closing brace in installed() method
#   The if (is_array($items)) { block was never closed, so the
#   enrichModIcons call, return and catch were inside the if block.
# ════════════════════════════════════════════════════════════════
echo -e "\n${BOLD}[1/2] Patching ModInstallerController.php ...${NC}"

python3 - "$PHP_FILE" <<'PYEOF'
import sys

path = sys.argv[1]
with open(path, 'r') as f:
    src = f.read()

OLD = (
    "                }\n"
    "            if (!empty($files)) {"
)
NEW = (
    "                }\n"
    "            } // closes if (is_array($items))\n"
    "            if (!empty($files)) {"
)

if OLD in src:
    src = src.replace(OLD, NEW, 1)
    with open(path, 'w') as f:
        f.write(src)
    print("  [OK] Patch applied: missing closing brace added.")
else:
    print("  [--] Already patched or pattern not found – no change made.")
PYEOF

echo -e "${GREEN}[✓] PHP fix done.${NC}"

# ════════════════════════════════════════════════════════════════
# FIX 2: TSX – Wrong type ModrinthModHit → ModSearchHit
# ════════════════════════════════════════════════════════════════
if [ -n "$TSX_FILE" ]; then
  echo -e "\n${BOLD}[2/2] Patching ModInstallerContainer.tsx ...${NC}"
  if grep -q 'ModrinthModHit' "$TSX_FILE"; then
    sed -i 's/mod: ModrinthModHit/mod: ModSearchHit/g' "$TSX_FILE"
    echo -e "${GREEN}[✓] TSX fix applied (ModrinthModHit → ModSearchHit).${NC}"
  else
    echo -e "${YELLOW}[!] TSX type reference already correct – skipping.${NC}"
  fi
else
  echo -e "${YELLOW}[2/2] Skipped TSX fix (file not found).${NC}"
fi

# ── Clear Cache ───────────────────────────────────────────────────
echo -e "\n${BOLD}Clearing Pterodactyl caches ...${NC}"
php artisan cache:clear  && echo -e "${GREEN}[✓] Cache cleared${NC}"
php artisan config:clear && echo -e "${GREEN}[✓] Config cleared${NC}"
php artisan view:clear   && echo -e "${GREEN}[✓] Views cleared${NC}"
php artisan route:clear  && echo -e "${GREEN}[✓] Routes cleared${NC}"

# ── Optional Rebuild ──────────────────────────────────────────────
echo -e "\n${BOLD}Rebuild frontend assets now? (recommended) [y/N]${NC}"
read -r REBUILD
if [[ "$REBUILD" =~ ^[Yy]$ ]]; then
  echo -e "${CYAN}Building frontend (may take 1–3 minutes) ...${NC}"
  yarn build:production 2>&1 | tail -20
  echo -e "${GREEN}[✓] Frontend rebuilt.${NC}"
else
  echo -e "${YELLOW}[!] Skipped build. Run manually:  yarn build:production${NC}"
fi

# ── Done ──────────────────────────────────────────────────────────
echo -e "\n${CYAN}================================================================${NC}"
echo -e "${GREEN}${BOLD}  ✓  Mod Installer hotfix complete!${NC}"
echo -e "${CYAN}  Backups saved in: ${BACKUP_DIR}${NC}"
echo -e "${CYAN}  Reload your panel – Mods Installer should now work.${NC}"
echo -e "${CYAN}================================================================${NC}"
