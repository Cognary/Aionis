#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: apps/lite/scripts/start-lite-app.sh [--print-env] [node args...]

Starts Aionis Lite through the dedicated Lite app wrapper.

Flags:
  --print-env   Print the effective Lite startup env as JSON and exit.
  --help        Show this help.
EOF
  exit 0
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "${APP_DIR}/../.." && pwd)"

if ! node -e 'try { require("node:sqlite"); } catch { process.exit(1); }' >/dev/null 2>&1; then
  cat >&2 <<'EOF'
start:lite requires Node.js with node:sqlite support.
Use Node 22+ for Lite alpha.
EOF
  exit 1
fi

export AIONIS_EDITION="${AIONIS_EDITION:-lite}"
export AIONIS_MODE="${AIONIS_MODE:-local}"
export MEMORY_AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
export TENANT_QUOTA_ENABLED="${TENANT_QUOTA_ENABLED:-false}"
export RATE_LIMIT_BYPASS_LOOPBACK="${RATE_LIMIT_BYPASS_LOOPBACK:-true}"
export LITE_REPLAY_SQLITE_PATH="${LITE_REPLAY_SQLITE_PATH:-${ROOT_DIR}/.tmp/aionis-lite-replay.sqlite}"
export LITE_WRITE_SQLITE_PATH="${LITE_WRITE_SQLITE_PATH:-${ROOT_DIR}/.tmp/aionis-lite-write.sqlite}"
export LITE_LOCAL_ACTOR_ID="${LITE_LOCAL_ACTOR_ID:-local-user}"
export SANDBOX_ENABLED="${SANDBOX_ENABLED:-true}"
export SANDBOX_ADMIN_ONLY="${SANDBOX_ADMIN_ONLY:-false}"
export LITE_SANDBOX_PROFILE="${LITE_SANDBOX_PROFILE:-}"

case "${LITE_SANDBOX_PROFILE}" in
  "")
    ;;
  local_process_echo)
    export SANDBOX_EXECUTOR_MODE="${SANDBOX_EXECUTOR_MODE:-local_process}"
    export SANDBOX_ALLOWED_COMMANDS_JSON="${SANDBOX_ALLOWED_COMMANDS_JSON:-[\"echo\"]}"
    ;;
  *)
    cat >&2 <<EOF
Unknown LITE_SANDBOX_PROFILE=${LITE_SANDBOX_PROFILE}
Supported profiles:
  local_process_echo
EOF
    exit 1
    ;;
esac

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
  "LITE_LOCAL_ACTOR_ID",
  "LITE_SANDBOX_PROFILE",
  "SANDBOX_ENABLED",
  "SANDBOX_ADMIN_ONLY",
  "SANDBOX_EXECUTOR_MODE",
  "SANDBOX_ALLOWED_COMMANDS_JSON",
]
print(json.dumps({key: os.environ.get(key) for key in keys}))
PY
  exit 0
fi

cd "${APP_DIR}"
exec node src/index.js "$@"
