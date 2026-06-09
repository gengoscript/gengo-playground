#!/usr/bin/env bash
# Fetch the latest gengo-engine.wasm from the gengoscript/gengo release
# and refresh cache-busting hashes in index.html and playground.js.
#
# Usage:
#   ./deploy.sh              # fetch latest release from GitHub
#   ./deploy.sh path/to.wasm # use a local build instead
set -euo pipefail
cd "$(dirname "$0")"

WASM_DST="gengo-engine.wasm"

if [ "${1:-}" != "" ]; then
  cp "$1" "$WASM_DST"
else
  echo "fetching latest gengo-engine.wasm from gengoscript/gengo..."
  gh release download --repo gengoscript/gengo --pattern "gengo-engine.wasm" --output "$WASM_DST" --clobber
fi

V=$(sha256sum "$WASM_DST" | cut -c1-8)
perl -i -pe "s/\?v=[0-9a-f]{8}/?v=$V/g" index.html playground.js

echo "updated $WASM_DST  (cache version: $V)"
