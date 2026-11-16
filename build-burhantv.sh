#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
bash ./build-tizen.sh "${1:-}"
node scripts/configure-tizen.mjs
