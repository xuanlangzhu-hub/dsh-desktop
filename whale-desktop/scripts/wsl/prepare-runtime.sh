#!/usr/bin/env bash
# Prepare the independent WSL2 backend runtime for Whale Harness Desktop.
#
# Everything lives under the Linux user's home directory:
#   runtime:  ~/.local/share/whale-harness/runtime
#   profile:  ~/.dsh/profiles/whale-desktop-wsl
#   presets:  ~/.dsh/.agent-presets/anchored-standard
#
# The script is idempotent and never touches Windows profiles, Windows
# node_modules, WSL global config, or anything outside $HOME. It performs the
# network downloads/installs exactly here, at preparation time — the desktop
# app itself never runs npx or downloads dependencies at startup.
#
# Expected environment (provided by prepare-wsl-runtime.ps1):
#   WHALE_WSL_SOURCE_DSH_HOME   Windows DSH home translated to a WSL path
#                               (e.g. /mnt/c/Users/HP/.dsh)
#   WHALE_WSL_RUNTIME           optional runtime root override
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"          # whale-desktop
WORKSPACE_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"        # Windows workspace mounted under /mnt/<drive>/...
RUNTIME_ROOT="${WHALE_WSL_RUNTIME:-$HOME/.local/share/whale-harness/runtime}"
SOURCE_DSH_HOME="${WHALE_WSL_SOURCE_DSH_HOME:-}"
SOURCE_PROFILE="${WHALE_WSL_SOURCE_PROFILE:-$SOURCE_DSH_HOME/profiles/whale-desktop}"
SOURCE_PRESET="${WHALE_WSL_SOURCE_PRESET:-$SOURCE_DSH_HOME/.agent-presets/anchored-standard}"
PNPM_VERSION="11.21.0"

fail() {
  echo "whale-wsl prepare: $*" >&2
  exit 1
}

if [[ -z "$SOURCE_DSH_HOME" ]]; then
  fail "WHALE_WSL_SOURCE_DSH_HOME is not set; run prepare-wsl-runtime.ps1 from Windows"
fi
if [[ ! -d "$SOURCE_PROFILE" ]]; then
  fail "source Windows profile not found at $SOURCE_PROFILE"
fi
if [[ "$(uname -m)" != "x86_64" ]]; then
  fail "the WSL backend currently requires x86_64 (found $(uname -m))"
fi

NODE_VERSION="$(tr -d '\r\n' < "$PROJECT_ROOT/runtime/node/VERSION" | sed 's/^v//')"
if [[ ! "$NODE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  fail "invalid Node version file at $PROJECT_ROOT/runtime/node/VERSION"
fi

echo "== whale-wsl prepare =="
echo "runtime : $RUNTIME_ROOT"
echo "profile : $HOME/.dsh/profiles/whale-desktop-wsl"
echo "source  : $SOURCE_PROFILE"
echo "node    : v$NODE_VERSION (same major line as the Windows runtime)"

# ── Node.js (self-contained, no system install) ──────────────────────────────
NODE_DIR="$RUNTIME_ROOT/node"
NODE_BIN="$NODE_DIR/bin/node"
if [[ ! -x "$NODE_BIN" ]]; then
  echo "-- installing Node.js v$NODE_VERSION (user-local tarball)"
  mkdir -p "$RUNTIME_ROOT/tmp"
  ARCHIVE="node-v$NODE_VERSION-linux-x64.tar.xz"
  URL="https://nodejs.org/dist/v$NODE_VERSION/$ARCHIVE"
  rm -f "$RUNTIME_ROOT/tmp/$ARCHIVE" "$RUNTIME_ROOT/tmp/SHASUMS256.txt"
  curl -fsSL --http1.1 --retry 3 --retry-delay 2 -o "$RUNTIME_ROOT/tmp/$ARCHIVE" "$URL" || fail "cannot download $URL"
  curl -fsSL --http1.1 --retry 3 --retry-delay 2 -o "$RUNTIME_ROOT/tmp/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" || fail "cannot download SHASUMS256.txt"
  (cd "$RUNTIME_ROOT/tmp" && grep " $ARCHIVE\$" SHASUMS256.txt | sha256sum -c -) || fail "Node.js tarball checksum mismatch"
  tar -xJf "$RUNTIME_ROOT/tmp/$ARCHIVE" -C "$RUNTIME_ROOT/tmp" || fail "cannot extract Node.js tarball"
  rm -rf "$NODE_DIR"
  mkdir -p "$(dirname "$NODE_DIR")"
  mv "$RUNTIME_ROOT/tmp/node-v$NODE_VERSION-linux-x64" "$NODE_DIR"
  rm -f "$RUNTIME_ROOT/tmp/$ARCHIVE" "$RUNTIME_ROOT/tmp/SHASUMS256.txt"
fi
"$NODE_BIN" --version | grep -q "^v$NODE_VERSION\$" || fail "installed Node does not match v$NODE_VERSION"
# The runtime Node must win over any Windows PATH inherited through WSL interop,
# otherwise npm/pnpm shebangs resolve to /mnt/... node.exe and fail.
export PATH="$NODE_DIR/bin:$PATH"
echo "node    : $("$NODE_BIN" --version)"

# ── pnpm inside the runtime Node prefix (no system install) ──────────────────
NPM_BIN="$NODE_DIR/bin/npm"
PNPM_BIN="$NODE_DIR/bin/pnpm"
"$NPM_BIN" install --global --prefix "$NODE_DIR" "pnpm@$PNPM_VERSION" --no-audit --no-fund >/dev/null || fail "cannot install pnpm into the runtime prefix"
echo "pnpm    : $("$PNPM_BIN" --version)"

# ── dsh + Linux-native dependencies ──────────────────────────────────────────
DSH_DIR="$RUNTIME_ROOT/dsh"
mkdir -p "$DSH_DIR"
for manifest in package.json package-lock.json; do
  src="$PROJECT_ROOT/runtime/dsh-wsl/$manifest"
  dst="$DSH_DIR/$manifest"
  if [[ ! -f "$dst" ]] || ! cmp -s "$src" "$dst"; then
    cp -f "$src" "$dst"
  fi
done
echo "-- npm ci (Linux native install, no Windows node_modules copied)"
(cd "$DSH_DIR" && "$NPM_BIN" ci --omit=dev --legacy-peer-deps --no-audit --no-fund) || fail "npm ci failed in $DSH_DIR"

# ── image compatibility ─────────────────────────────────────────────────────
# vision-bridge v2 patches rc.6 internals and intentionally fails closed when
# upstream markers drift. rc.1/rc.2 provide the official Vision/Files API
# pipeline, so applying the legacy bridge there would be both redundant and
# unsafe. Keep the rc.6 path only for an explicit rollback.
DSH_VERSION="$("$NODE_BIN" -p "require('$DSH_DIR/node_modules/@deepseek-ai/dsh/package.json').version")"
case "$DSH_VERSION" in
  0.1.0-rc.6)
    echo "-- applying legacy vision-bridge v2 for dsh $DSH_VERSION"
    "$NODE_BIN" "$PROJECT_ROOT/scripts/apply-vision-bridge.mjs" --modules-root "$DSH_DIR/node_modules" || fail "vision-bridge v2 failed"
    ;;
  0.1.1-rc.1|0.1.1-rc.2)
    echo "-- using official Vision/Files API image pipeline in dsh $DSH_VERSION"
    ;;
  *)
    fail "unsupported dsh version $DSH_VERSION; review image compatibility before preparing the runtime"
    ;;
esac

echo "-- native module smoke checks"
(cd "$DSH_DIR" && "$NODE_BIN" -e '
const names = ["node-pty", "sharp", "@deepseek-ai/node-addon-landlock-run"];
for (const name of names) {
  const mod = require(name);
  if (!mod) throw new Error(name + " loaded empty");
  console.log(name + " loaded ok");
}
') || fail "one of node-pty/sharp/landlock failed to load"
# rc.6 compiles node-pty to build/Release while rc.2 ships a Linux x64
# prebuild. Remove foreign architectures and accept either verified location.
for foreign in darwin-arm64 darwin-x64 win32-arm64 win32-x64 linux-arm64; do
  rm -rf "$DSH_DIR/node_modules/node-pty/prebuilds/$foreign"
done
NODE_PTY_NATIVE="$DSH_DIR/node_modules/node-pty/prebuilds/linux-x64/pty.node"
if [[ ! -f "$NODE_PTY_NATIVE" ]]; then
  NODE_PTY_NATIVE="$DSH_DIR/node_modules/node-pty/build/Release/pty.node"
fi
test -f "$NODE_PTY_NATIVE" || fail "node-pty Linux binary is missing"
file "$NODE_PTY_NATIVE" | grep -q 'ELF 64-bit.*x86-64' || fail "node-pty binary is not Linux x64: $NODE_PTY_NATIVE"
NATIVE_FILES="$(find "$DSH_DIR/node_modules" -name '*.node' -type f | head -n 200)"
if [[ -z "$NATIVE_FILES" ]]; then
  fail "no native .node binaries found after npm ci"
fi
for native in $NATIVE_FILES; do
  file "$native" | grep -q 'ELF 64-bit' || fail "non-ELF native binary found: $native"
done
echo "native  : $(echo "$NATIVE_FILES" | wc -l) ELF binaries verified"

# ── managed Whale Mist theme copy ────────────────────────────────────────────
THEME_DIR="$RUNTIME_ROOT/theme/dsh-whale-mist"
mkdir -p "$THEME_DIR"
rsync -a --delete \
  --exclude qa --exclude node_modules --exclude .git \
  "$WORKSPACE_ROOT/dsh-whale-mist/" "$THEME_DIR/"
test -f "$THEME_DIR/package.json" || fail "theme copy is incomplete"
THEME_VERSION="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$THEME_DIR/package.json" | head -n1)"
echo "theme   : Whale Mist $THEME_VERSION"

# ── Anchored Standard preset (files only, no sessions/attachments/credentials) ─
PRESET_DIR="$HOME/.dsh/.agent-presets/anchored-standard"
if [[ ! -d "$SOURCE_PRESET" ]]; then
  fail "Anchored Standard preset not found at $SOURCE_PRESET"
fi
mkdir -p "$PRESET_DIR"
for file in preset.yml agent.cordis.yml tool-bootstrap.mjs; do
  cp -f "$SOURCE_PRESET/$file" "$PRESET_DIR/$file"
done
echo "preset  : Anchored Standard -> $PRESET_DIR"

# ── independent WSL profile (reinstall, never copy node_modules/links) ───────
PROFILE_DIR="$HOME/.dsh/profiles/whale-desktop-wsl"
echo "-- preparing profile whale-desktop-wsl"
"$NODE_BIN" "$SCRIPT_DIR/ensure-profile.mjs" \
  --profile-dir "$PROFILE_DIR" \
  --source-profile-dir "$SOURCE_PROFILE" \
  --runtime-root "$RUNTIME_ROOT" || fail "profile preparation failed"
"$PNPM_BIN" install --dir "$PROFILE_DIR" --reporter append-only || fail "pnpm install failed in $PROFILE_DIR"

# ── boot-time verification (offline: resolves everything from disk) ──────────
LOGS_DIR="$RUNTIME_ROOT/logs"
mkdir -p "$LOGS_DIR"
DUMP_FILE="$LOGS_DIR/dump-config.txt"
DSH_HOME="$HOME/.dsh" "$NODE_BIN" "$DSH_DIR/node_modules/@deepseek-ai/dsh/lib/bin.js" \
  --profile whale-desktop-wsl --dump-config > "$DUMP_FILE" || fail "dsh --dump-config failed; see $DUMP_FILE"
grep -q 'dsh-whale-mist' "$DUMP_FILE" || fail "Whale Mist is missing from the composed config"
grep -q 'dsh-archived-sessions' "$DUMP_FILE" || fail "dsh-archived-sessions is missing from the composed config"
echo "profile : composed config verified ($DUMP_FILE)"

# ── launcher scripts for the desktop ─────────────────────────────────────────
BIN_DIR="$RUNTIME_ROOT/bin"
mkdir -p "$BIN_DIR"
cp -f "$SCRIPT_DIR/start-web.js" "$BIN_DIR/start-web.js"
cp -f "$SCRIPT_DIR/stop-web.js" "$BIN_DIR/stop-web.js"
cp -f "$SCRIPT_DIR/start-web.sh" "$BIN_DIR/start-web.sh"
cp -f "$SCRIPT_DIR/stop-web.sh" "$BIN_DIR/stop-web.sh"
chmod +x "$BIN_DIR/start-web.sh" "$BIN_DIR/stop-web.sh"
echo "launcher: $BIN_DIR"

echo "== whale-wsl prepare: OK =="
echo "summary: node=v$NODE_VERSION dsh=$("$NODE_BIN" -p "require('$DSH_DIR/node_modules/@deepseek-ai/dsh/package.json').version") theme=$THEME_VERSION profile=whale-desktop-wsl"
