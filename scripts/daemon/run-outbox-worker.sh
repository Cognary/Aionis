#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

# Ensure env vars are available to the process (launchd does not load shell rc files).
set -a
if [[ -f .env ]]; then
  source .env
fi
set +a

if [[ ! -f dist/jobs/outbox-worker.js ]]; then
  npm run -s build
fi

exec node dist/jobs/outbox-worker.js
