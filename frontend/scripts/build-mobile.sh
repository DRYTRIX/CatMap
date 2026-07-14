#!/usr/bin/env bash
# Build the mobile bundle using a clean dependency tree, then sync to Capacitor.
# Use when local node_modules has permission issues (root-owned files).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="/tmp/catmap-mobile-build-$$"
CAP_CLI="$ROOT/node_modules/@capacitor/cli/bin/capacitor"
if [ ! -f "$CAP_CLI" ] || ! node "$CAP_CLI" --version >/dev/null 2>&1; then
  CAP_CLI="/tmp/catmap-full-deps/node_modules/@capacitor/cli/bin/capacitor"
fi
if [ ! -f "$CAP_CLI" ]; then
  CAP_CLI="/tmp/catmap-cap-deps/node_modules/@capacitor/cli/bin/capacitor"
fi

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

echo "==> Preparing clean build workspace"
mkdir -p "$WORK"
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$WORK/" 2>/dev/null || cp "$ROOT/package.json" "$WORK/"
cp "$ROOT/vite.config.js" "$ROOT/index.html" "$ROOT/.env.mobile" "$WORK/"
cp -r "$ROOT/src" "$ROOT/public" "$ROOT/scripts" "$WORK/"
if [ -f "$ROOT/capacitor.config.json" ]; then
  cp "$ROOT/capacitor.config.json" "$WORK/"
fi

echo "==> Installing dependencies"
(cd "$WORK" && npm install --silent)

echo "==> Building mobile bundle"
(cd "$WORK" && npm run fetch-model && npx vite build --mode mobile)

echo "==> Copying dist to frontend"
rm -rf "$ROOT/dist"
cp -r "$WORK/dist" "$ROOT/"

if [ -f "$CAP_CLI" ]; then
  echo "==> Syncing Capacitor Android project"
  (cd "$ROOT" && node "$CAP_CLI" sync android)
fi

echo "==> Mobile build complete: $ROOT/dist"
