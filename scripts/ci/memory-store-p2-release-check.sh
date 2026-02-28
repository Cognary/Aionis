#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need npm
need jq

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/memory_store_p2_release/${RUN_ID}}"
REQUIRE_REMOTE="${P2_RELEASE_REQUIRE_REMOTE:-true}"
REMOTE_ARGS="${REMOTE_ARGS:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
    --require-remote) REQUIRE_REMOTE="${2:-}"; shift 2 ;;
    --remote-args) REMOTE_ARGS="${2:-}"; shift 2 ;;
    -h|--help)
      cat <<'USAGE'
Usage: scripts/ci/memory-store-p2-release-check.sh [options]

Runs local and remote MemoryStore P2 exit gates and writes a unified evidence summary.

Options:
  --out-dir <path>            Output directory for logs/summary
  --require-remote <bool>     Require remote gate pass (default: true)
  --remote-args "<args>"      Extra args forwarded to gate:memory-store-p2:remote
USAGE
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "${OUT_DIR}"
LOCAL_LOG="${OUT_DIR}/local_gate.log"
REMOTE_LOG="${OUT_DIR}/remote_gate.log"
REMOTE_JSON="${OUT_DIR}/remote_gate_summary.json"
SUMMARY_JSON="${OUT_DIR}/summary.json"

echo "[p2-release] out_dir=${OUT_DIR}"
echo "[p2-release] run local gate"
set -o pipefail
npm run -s gate:memory-store-p2:local | tee "${LOCAL_LOG}"
set +o pipefail

remote_ok=false
remote_required=false
if [[ "${REQUIRE_REMOTE}" == "true" ]]; then
  remote_required=true
fi

if [[ "${remote_required}" == "true" ]]; then
  echo "[p2-release] run remote gate"
  set -o pipefail
  if [[ -n "${REMOTE_ARGS}" ]]; then
    npm run -s gate:memory-store-p2:remote -- --out-file "${REMOTE_JSON}" ${REMOTE_ARGS} | tee "${REMOTE_LOG}"
  else
    npm run -s gate:memory-store-p2:remote -- --out-file "${REMOTE_JSON}" | tee "${REMOTE_LOG}"
  fi
  set +o pipefail
  remote_ok=true
else
  echo "[p2-release] remote gate skipped (require_remote=false)"
fi

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg checked_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg local_log "${LOCAL_LOG}" \
  --arg remote_log "${REMOTE_LOG}" \
  --arg remote_summary "${REMOTE_JSON}" \
  --argjson remote_required "${remote_required}" \
  --argjson remote_ok "${remote_ok}" \
  '{
    ok: (if $remote_required then $remote_ok else true end),
    run_id: $run_id,
    checked_at: $checked_at,
    out_dir: $out_dir,
    local_gate: {
      ok: true,
      log: $local_log
    },
    remote_gate: {
      required: $remote_required,
      ok: $remote_ok,
      log: $remote_log,
      summary: (if $remote_ok then $remote_summary else null end)
    }
  }' > "${SUMMARY_JSON}"

cat "${SUMMARY_JSON}"
echo "[p2-release] summary=${SUMMARY_JSON}"
