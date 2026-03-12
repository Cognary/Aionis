#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: scripts/start-lite.sh [--print-env] [node args...]

Starts Aionis in Lite edition without requiring DATABASE_URL.

Flags:
  --print-env   Print the effective Lite startup env as JSON and exit.
  --help        Show this help.
EOF
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export AIONIS_EDITION="${AIONIS_EDITION:-lite}"
export AIONIS_MODE="${AIONIS_MODE:-local}"
export MEMORY_AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
export TENANT_QUOTA_ENABLED="${TENANT_QUOTA_ENABLED:-false}"
export RATE_LIMIT_BYPASS_LOOPBACK="${RATE_LIMIT_BYPASS_LOOPBACK:-true}"
export LITE_REPLAY_SQLITE_PATH="${LITE_REPLAY_SQLITE_PATH:-.tmp/aionis-lite-replay.sqlite}"
export LITE_WRITE_SQLITE_PATH="${LITE_WRITE_SQLITE_PATH:-.tmp/aionis-lite-write.sqlite}"

if [[ "${1:-}" == "--print-env" ]]; then
  python3 - <<'PY'
import json, os
keys = [
  "AIONIS_EDITION",
  "AIONIS_MODE",
  "MEMORY_AUTH_MODE",
  "TENANT_QUOTA_ENABLED",
  "RATE_LIMIT_BYPASS_LOOPBACK",
  "LITE_REPLAY_SQLITE_PATH",
  "LITE_WRITE_SQLITE_PATH",
]
print(json.dumps({key: os.environ.get(key) for key in keys}))
PY
  exit 0
fi

exec node dist/index.js "$@"
