#!/usr/bin/env bash
# Stop the WSL dsh web backend recorded in the runtime pidfile.
set -Eeuo pipefail

RUNTIME_ROOT="${WHALE_WSL_RUNTIME:-$HOME/.local/share/whale-harness/runtime}"
STOP_SCRIPT="$RUNTIME_ROOT/bin/stop-web.js"

if [[ ! -f "$STOP_SCRIPT" ]]; then
  echo "whale-wsl: stop-web.js is missing under $RUNTIME_ROOT" >&2
  exit 1
fi

exec "$RUNTIME_ROOT/node/bin/node" "$STOP_SCRIPT"
