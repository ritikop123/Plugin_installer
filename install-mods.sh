#!/bin/bash
set -eo pipefail

# ================================================================
#   Arix Theme Minecraft Mods Manager Setup (Redirector)
#   Repository: https://github.com/ritikop123/Plugin_installer
# ================================================================

exec bash <(curl -sH "Cache-Control: no-cache" "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/install-arix.sh?$(date +%s)") mods "$@"

