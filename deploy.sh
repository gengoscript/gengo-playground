#!/usr/bin/env bash
# Update the committed gengo-engine.wasm and regenerate the runtime asset manifest.
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

cat > asset-manifest.json <<EOF
{
  "worker": "./worker.js?v=$WORKER_V",
  "wasm": "./gengo-engine.wasm?v=$WASM_V"
}
EOF

echo "updated gengo-engine.wasm  (wasm: $WASM_V, worker: $WORKER_V)"
echo "commit and push to deploy"
