#!/usr/bin/env bash
# Update the committed gengo-engine.wasm and refresh cache-busting hashes.
# Run from the root of this repo after a gengo release build.
#
# Usage:
#   ./deploy.sh /path/to/gengo/build/gengo-engine.wasm
set -euo pipefail
cd "$(dirname "$0")"

WASM_SRC="${1:-}"

if [ -z "$WASM_SRC" ]; then
  echo "usage: $0 /path/to/gengo/build/gengo-engine.wasm" >&2
  exit 1
fi

cp "$WASM_SRC" gengo-engine.wasm

V=$(sha256sum gengo-engine.wasm | cut -c1-8)
perl -i -pe "s/\?v=[0-9a-f]{8}/?v=$V/g" index.html playground.js

echo "updated gengo-engine.wasm  (cache version: $V)"
echo "commit and push to deploy"
