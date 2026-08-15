#!/usr/bin/env bash
# Start the WSL dsh web backend through the Node process-group launcher.
set -Eeuo pipefail

RUNTIME_ROOT="${WHALE_WSL_RUNTIME:-$HOME/.local/share/whale-harness/runtime}"
START_SCRIPT="$RUNTIME_ROOT/bin/start-web.js"

if [[ ! -f "$START_SCRIPT" ]]; then
  echo "whale-wsl: start-web.js is missing under $RUNTIME_ROOT" >&2
  echo "whale-wsl: run prepare-wsl-runtime.ps1 on Windows first." >&2
  exit 1
fi

exec "$RUNTIME_ROOT/node/bin/node" "$START_SCRIPT"
