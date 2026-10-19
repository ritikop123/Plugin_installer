#!/bin/bash
# Convenient alias for update-installers.sh
exec bash <(curl -sH "Cache-Control: no-cache" "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/update-installers.sh?$(date +%s)") "$@"
