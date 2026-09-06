#!/usr/bin/env bash

# ==============================================================================
# Arix Theme Modrinth Plugin Installer - Automated Setup Script
# GitHub: https://github.com/ritikop123/Plugin_installer
# ==============================================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "=========================================================="
echo "    Arix Theme Modrinth Plugin Installer Installer        "
echo "        https://github.com/ritikop123/Plugin_installer    "
echo "=========================================================="
echo -e "${NC}"

# Check for root / sudo
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW}[!] Note: Running as root or with sudo is recommended.${NC}"
fi

# Detect / Install Git
if ! command -v git &> /dev/null; then
  echo -e "${CYAN}[*] Installing Git...${NC}"
  apt-get update -y && apt-get install -y git || yum install -y git
fi

# Detect / Install Node.js
if ! command -v node &> /dev/null; then
  echo -e "${CYAN}[*] Node.js not detected. Installing Node.js LTS (v20)...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs || yum install -y nodejs
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}[✓] Node.js version: ${NODE_VERSION}${NC}"

# Directory setup
PTERO_DIR="/var/www/pterodactyl"
INSTALL_DIR="/opt/Plugin_installer"
TARGET_PUBLIC_DIR="${PTERO_DIR}/public/plugins"

# If cloned locally or running from curl
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"

if [ -f "${SCRIPT_DIR}/package.json" ]; then
  WORK_DIR="$SCRIPT_DIR"
else
  echo -e "${CYAN}[*] Cloning repository to ${INSTALL_DIR}...${NC}"
  rm -rf "$INSTALL_DIR"
  git clone https://github.com/ritikop123/Plugin_installer.git "$INSTALL_DIR"
  WORK_DIR="$INSTALL_DIR"
fi

cd "$WORK_DIR"

echo -e "${CYAN}[*] Installing dependencies...${NC}"
npm install --production=false

echo -e "${CYAN}[*] Building production assets...${NC}"
npm run build

# Check if Pterodactyl Panel is installed
if [ -d "$PTERO_DIR" ]; then
  echo -e "${CYAN}[*] Found Pterodactyl Panel at ${PTERO_DIR}${NC}"
  echo -e "${CYAN}[*] Publishing to panel public folder: ${TARGET_PUBLIC_DIR}...${NC}"
  
  mkdir -p "$TARGET_PUBLIC_DIR"
  cp -r dist/* "$TARGET_PUBLIC_DIR/"
  chown -R www-data:www-data "$TARGET_PUBLIC_DIR" 2>/dev/null || chown -R nginx:nginx "$TARGET_PUBLIC_DIR" 2>/dev/null || true

  echo ""
  echo -e "${GREEN}================================================================${NC}"
  echo -e "${GREEN}  ✓ PLUGIN INSTALLER SUCCESSFULLY DEPLOYED TO PTERODACTYL PANEL ${NC}"
  echo -e "${GREEN}================================================================${NC}"
  echo -e "Now in your Arix Theme settings, enter the following values in:"
  echo -e "${YELLOW}'Create link in Server Tools'${NC}"
  echo ""
  echo -e "  [Field]           [Value to Enter]"
  echo -e "  --------------------------------------------------------"
  echo -e "  Name:             ${CYAN}Plugin Installer${NC}  (or Plugins)"
  echo -e "  URL:              ${CYAN}/plugins/index.html${NC}  (or /plugins)"
  echo -e "  Icon:             ${CYAN}HiOutlinePuzzle${NC}   (or HiOutlineCube)"
  echo -e "  Enable link:      ${CYAN}ON (Checked)${NC}"
  echo -e "  --------------------------------------------------------"
  echo -e "${GREEN}================================================================${NC}"

else
  echo -e "${YELLOW}[!] Pterodactyl Panel directory not found at /var/www/pterodactyl.${NC}"
  echo -e "${CYAN}[*] Starting standalone daemon on port 3001...${NC}"

  if command -v pm2 &> /dev/null; then
    pm2 delete arix-plugin-installer 2>/dev/null || true
    pm2 start container-server.js --name "arix-plugin-installer"
    pm2 save
    echo -e "${GREEN}[✓] Running with PM2 on port 3001!${NC}"
  else
    echo -e "${GREEN}[✓] Build complete! Run with: node container-server.js${NC}"
  fi

  echo ""
  echo -e "${GREEN}================================================================${NC}"
  echo -e "${GREEN}  ARIX THEME - 'CREATE LINK IN SERVER TOOLS' SETTINGS           ${NC}"
  echo -e "${GREEN}================================================================${NC}"
  echo -e "  Name:             ${CYAN}Plugin Installer${NC}"
  echo -e "  URL:              ${CYAN}http://<YOUR-SERVER-IP>:3001${NC}"
  echo -e "  Icon:             ${CYAN}HiOutlinePuzzle${NC}"
  echo -e "  Enable link:      ${CYAN}ON (Checked)${NC}"
  echo -e "${GREEN}================================================================${NC}"
fi
