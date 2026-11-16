#!/bin/bash
set -eo pipefail

# ================================================================
#   Arix Theme Demo Account & Dummy Server Preview Setup
#   Repository: https://github.com/ritikop123/Plugin_installer
# ================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
if [ -n "$SCRIPT_DIR" ] && [ -f "${SCRIPT_DIR}/install-arix.sh" ]; then
  exec bash "${SCRIPT_DIR}/install-arix.sh" demo "$@"
fi

TMP_INSTALLER="$(mktemp /tmp/arix_install_demo.XXXXXX.sh)"
trap 'rm -f "$TMP_INSTALLER"' EXIT
curl -fsSL -H "Cache-Control: no-cache" "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/install-arix.sh?$(date +%s)" -o "$TMP_INSTALLER"
bash "$TMP_INSTALLER" demo "$@"
