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

WASM_V=$(sha256sum gengo-engine.wasm | cut -c1-8)
WORKER_V=$(sha256sum worker.js | cut -c1-8)

# Update WASM cache-bust hash in index.html and playground.js
perl -i -pe "s/gengo-engine\.wasm\?v=[0-9a-f]{8}/gengo-engine.wasm?v=$WASM_V/g" index.html playground.js

# Update worker.js cache-bust hash in playground.js
perl -i -pe "s/worker\.js\?v=[0-9a-f]{8}/worker.js?v=$WORKER_V/g" playground.js

echo "updated gengo-engine.wasm  (wasm: $WASM_V, worker: $WORKER_V)"
echo "commit and push to deploy"
