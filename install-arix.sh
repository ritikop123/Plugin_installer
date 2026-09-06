#!/usr/bin/env bash

# ==============================================================================
# Arix Theme Native Plugin Installer for Pterodactyl Panel
# GitHub: https://github.com/ritikop123/Plugin_installer
# ==============================================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "================================================================"
echo "    Arix Theme Native Plugin Installer (No Blueprint Needed)    "
echo "           https://github.com/ritikop123/Plugin_installer       "
echo "================================================================"
echo -e "${NC}"

PTERO_DIR="/var/www/pterodactyl"

if [ ! -d "$PTERO_DIR" ]; then
  echo -e "${RED}[✗] Error: Pterodactyl directory not found at $PTERO_DIR!${NC}"
  echo -e "Please run this script directly on your Pterodactyl VPS."
  exit 1
fi

cd "$PTERO_DIR"

echo -e "${CYAN}[1/5] Backing up ServerRouter.tsx...${NC}"
cp resources/scripts/routers/ServerRouter.tsx resources/scripts/routers/ServerRouter.tsx.bak 2>/dev/null || true

echo -e "${CYAN}[2/5] Creating plugin installer component directory...${NC}"
COMPONENT_DIR="resources/scripts/components/server/plugin-installer"
mkdir -p "$COMPONENT_DIR"

echo -e "${CYAN}[3/5] Downloading native PluginInstallerContainer component...${NC}"
curl -sSL "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/pterodactyl-addon/PluginInstallerContainer.tsx" \
  -o "${COMPONENT_DIR}/PluginInstallerContainer.tsx"

echo -e "${CYAN}[4/5] Patching ServerRouter.tsx with /plugins route...${NC}"

ROUTER_FILE="resources/scripts/routers/ServerRouter.tsx"

# Inject Import if not present
if ! grep -q "PluginInstallerContainer" "$ROUTER_FILE"; then
  sed -i '/import ServerContext/a import PluginInstallerContainer from '\''@/components/server/plugin-installer/PluginInstallerContainer'\'';' "$ROUTER_FILE"
fi

# Inject Route if not present
if ! grep -q "path={'/plugins'}" "$ROUTER_FILE"; then
  # Insert right before the first </Switch>
  sed -i "0,/<\/Switch>/s//    <Route path={'\/plugins'} component={PluginInstallerContainer} exact \/>\n&/" "$ROUTER_FILE"
fi

echo -e "${GREEN}[✓] Route /plugins successfully registered in Pterodactyl router!${NC}"

echo -e "${CYAN}[5/5] Recompiling panel frontend assets... (this may take 1-2 minutes)${NC}"
if command -v yarn &> /dev/null; then
  yarn build:production
elif command -v npm &> /dev/null; then
  npm run build:production
else
  echo -e "${RED}[!] Neither yarn nor npm was found. Please install node/yarn and run yarn build:production.${NC}"
  exit 1
fi

# Clear panel cache
php artisan view:clear 2>/dev/null || true
php artisan config:clear 2>/dev/null || true

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  ✓ ARIX THEME PLUGIN INSTALLER INSTALLED SUCCESSFULLY!          ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo -e "Now in your Arix Theme settings on the panel:"
echo -e "Go to ${YELLOW}'Create link in Server Tools'${NC} and enter:"
echo ""
echo -e "  [Field]          [What to Enter]"
echo -e "  --------------------------------------------------------"
echo -e "  Name:            ${CYAN}Plugin Installer${NC}  (or Plugins)"
echo -e "  URL:             ${CYAN}/plugins${NC}  <-- exactly this!"
echo -e "  Icon:            ${CYAN}HiOutlinePuzzle${NC}"
echo -e "  Enable link:     ${CYAN}ON (Checked)${NC}"
echo -e "  --------------------------------------------------------"
echo ""
echo -e "When you click it on ANY server, it will open natively at:"
echo -e "${CYAN}https://your-domain.com/server/<server-id>/plugins${NC}"
echo -e "${GREEN}================================================================${NC}"
