#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need curl
need jq
need psql
need npm
need node

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

wait_health() {
  local ok=0
  for _ in {1..90}; do
    if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 1
  done
  [[ "${ok}" -eq 1 ]]
}

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
GATEA_WAIT_SECONDS="${GATEA_WAIT_SECONDS:-25}"
QUERY_TEXT="${QUERY_TEXT:-memory graph}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/gtm/gate_a/${RUN_ID}}"
GATEA_FAIL_ON_FAIL="${GATEA_FAIL_ON_FAIL:-false}"
START_SERVICES_IF_NEEDED="${START_SERVICES_IF_NEEDED:-true}"
AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
GATEA_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
GATEA_STARTED_EPOCH_MS="$(now_ms)"

mkdir -p "${OUT_DIR}"

API_LOG="${OUT_DIR}/00_api.log"
started_api=false
api_pid=""

cleanup() {
  if [[ "${started_api}" == "true" && -n "${api_pid}" ]]; then
    kill "${api_pid}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

QUICKSTART_SCRIPT="${ROOT_DIR}/scripts/quickstart.sh"
KILLER_DEMO_SCRIPT="${ROOT_DIR}/examples/killer_demo.sh"
VALUE_DASHBOARD_SCRIPT="${ROOT_DIR}/examples/value_dashboard.sh"

quickstart_script_exists=false
killer_demo_script_exists=false
value_dashboard_script_exists=false
api_healthy=false
docs_check_ok=false
value_dashboard_ok=false
killer_demo_ok=false
memory_recall_improved=false
cross_session_recall_stable=false
value_delta_parse_error=""
killer_demo_exit_code=-1
value_dashboard_exit_code=-1
docs_check_exit_code=-1
killer_demo_duration_ms=0
value_dashboard_duration_ms=0
docs_check_duration_ms=0
gate_duration_ms=0
api_bootstrapped=false

[[ -x "${QUICKSTART_SCRIPT}" ]] && quickstart_script_exists=true
[[ -x "${KILLER_DEMO_SCRIPT}" ]] && killer_demo_script_exists=true
[[ -x "${VALUE_DASHBOARD_SCRIPT}" ]] && value_dashboard_script_exists=true

if curl -fsS "${BASE_URL}/health" >"${OUT_DIR}/00_health.json" 2>"${OUT_DIR}/00_health.err"; then
  api_healthy=true
elif [[ "${START_SERVICES_IF_NEEDED}" == "true" ]]; then
  npm run -s start > "${API_LOG}" 2>&1 &
  api_pid="$!"
  started_api=true
  if wait_health; then
    if curl -fsS "${BASE_URL}/health" >"${OUT_DIR}/00_health.json" 2>"${OUT_DIR}/00_health.err"; then
      api_healthy=true
      api_bootstrapped=true
    fi
  else
    echo "[gate-a] failed to bootstrap API at ${BASE_URL}. log: ${API_LOG}" >&2
    sed -n '1,120p' "${API_LOG}" >&2 || true
  fi
fi

if [[ "${api_healthy}" == "true" && "${killer_demo_script_exists}" == "true" ]]; then
  step_started_ms="$(now_ms)"
  set +e
  bash "${KILLER_DEMO_SCRIPT}" --wait-seconds "${GATEA_WAIT_SECONDS}" --run-worker-once auto \
    >"${OUT_DIR}/01_killer_demo.log" 2>"${OUT_DIR}/01_killer_demo.err"
  killer_demo_exit_code=$?
  set -e
  step_ended_ms="$(now_ms)"
  killer_demo_duration_ms="$((step_ended_ms - step_started_ms))"
  if [[ "${killer_demo_exit_code}" -eq 0 ]]; then
    killer_demo_ok=true
  fi

  if [[ -s "${OUT_DIR}/01_killer_demo.log" ]]; then
    awk '/== Value delta ==/{flag=1;next} /^Demo-specific matched nodes:/{flag=0} flag{print}' \
      "${OUT_DIR}/01_killer_demo.log" >"${OUT_DIR}/01_value_delta.json.raw" || true
    sed '/^[[:space:]]*$/d' "${OUT_DIR}/01_value_delta.json.raw" >"${OUT_DIR}/01_value_delta.json.candidate" || true
    if jq . "${OUT_DIR}/01_value_delta.json.candidate" >"${OUT_DIR}/01_value_delta.json" 2>"${OUT_DIR}/01_value_delta.parse.err"; then
      memory_recall_improved="$(jq -r '.success.memory_recall_improved // false' "${OUT_DIR}/01_value_delta.json")"
      cross_session_recall_stable="$(jq -r '.success.cross_session_recall_stable // false' "${OUT_DIR}/01_value_delta.json")"
    else
      value_delta_parse_error="$(tr '\n' ' ' < "${OUT_DIR}/01_value_delta.parse.err" | sed 's/[[:space:]]\+/ /g')"
    fi
  fi
fi

if [[ "${api_healthy}" == "true" && "${value_dashboard_script_exists}" == "true" ]]; then
  step_started_ms="$(now_ms)"
  set +e
  bash "${VALUE_DASHBOARD_SCRIPT}" "${QUERY_TEXT}" \
    >"${OUT_DIR}/02_value_dashboard.json" 2>"${OUT_DIR}/02_value_dashboard.err"
  value_dashboard_exit_code=$?
  set -e
  step_ended_ms="$(now_ms)"
  value_dashboard_duration_ms="$((step_ended_ms - step_started_ms))"
  if [[ "${value_dashboard_exit_code}" -eq 0 ]]; then
    value_dashboard_ok=true
  fi
fi

step_started_ms="$(now_ms)"
set +e
npm run -s docs:check >"${OUT_DIR}/03_docs_check.log" 2>"${OUT_DIR}/03_docs_check.err"
docs_check_exit_code=$?
set -e
step_ended_ms="$(now_ms)"
docs_check_duration_ms="$((step_ended_ms - step_started_ms))"
if [[ "${docs_check_exit_code}" -eq 0 ]]; then
  docs_check_ok=true
fi

gate_pass=false
if [[ "${quickstart_script_exists}" == "true" \
   && "${killer_demo_script_exists}" == "true" \
   && "${value_dashboard_script_exists}" == "true" \
   && "${api_healthy}" == "true" \
   && "${killer_demo_ok}" == "true" \
   && "${memory_recall_improved}" == "true" \
   && "${cross_session_recall_stable}" == "true" \
   && "${value_dashboard_ok}" == "true" \
   && "${docs_check_ok}" == "true" ]]; then
  gate_pass=true
fi

GATEA_ENDED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
GATEA_ENDED_EPOCH_MS="$(now_ms)"
gate_duration_ms="$((GATEA_ENDED_EPOCH_MS - GATEA_STARTED_EPOCH_MS))"

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg base_url "${BASE_URL}" \
  --arg auth_mode "${AUTH_MODE}" \
  --arg started_at "${GATEA_STARTED_AT}" \
  --arg ended_at "${GATEA_ENDED_AT}" \
  --argjson started_api "${started_api}" \
  --argjson api_bootstrapped "${api_bootstrapped}" \
  --argjson quickstart_script_exists "${quickstart_script_exists}" \
  --argjson killer_demo_script_exists "${killer_demo_script_exists}" \
  --argjson value_dashboard_script_exists "${value_dashboard_script_exists}" \
  --argjson api_healthy "${api_healthy}" \
  --argjson killer_demo_ok "${killer_demo_ok}" \
  --argjson memory_recall_improved "${memory_recall_improved}" \
  --argjson cross_session_recall_stable "${cross_session_recall_stable}" \
  --argjson value_dashboard_ok "${value_dashboard_ok}" \
  --argjson docs_check_ok "${docs_check_ok}" \
  --arg value_delta_parse_error "${value_delta_parse_error}" \
  --argjson killer_demo_duration_ms "${killer_demo_duration_ms}" \
  --argjson value_dashboard_duration_ms "${value_dashboard_duration_ms}" \
  --argjson docs_check_duration_ms "${docs_check_duration_ms}" \
  --argjson gate_duration_ms "${gate_duration_ms}" \
  --argjson killer_demo_exit_code "${killer_demo_exit_code}" \
  --argjson value_dashboard_exit_code "${value_dashboard_exit_code}" \
  --argjson docs_check_exit_code "${docs_check_exit_code}" \
  --argjson gate_pass "${gate_pass}" \
  '{
    ok: true,
    run_id: $run_id,
    out_dir: $out_dir,
    base_url: $base_url,
    auth_mode: $auth_mode,
    started_at: $started_at,
    ended_at: $ended_at,
    services: {
      started_api: $started_api,
      api_bootstrapped: $api_bootstrapped
    },
    checks: {
      quickstart_script_exists: $quickstart_script_exists,
      killer_demo_script_exists: $killer_demo_script_exists,
      value_dashboard_script_exists: $value_dashboard_script_exists,
      api_healthy: $api_healthy,
      killer_demo_ok: $killer_demo_ok,
      memory_recall_improved: $memory_recall_improved,
      cross_session_recall_stable: $cross_session_recall_stable,
      value_dashboard_ok: $value_dashboard_ok,
      docs_check_ok: $docs_check_ok
    },
    exits: {
      killer_demo: $killer_demo_exit_code,
      value_dashboard: $value_dashboard_exit_code,
      docs_check: $docs_check_exit_code
    },
    timings: {
      gate_duration_ms: $gate_duration_ms,
      killer_demo_duration_ms: $killer_demo_duration_ms,
      value_dashboard_duration_ms: $value_dashboard_duration_ms,
      docs_check_duration_ms: $docs_check_duration_ms
    },
    parse: {
      value_delta_parse_error: (if ($value_delta_parse_error|length)>0 then $value_delta_parse_error else null end)
    },
    gate: {
      name: "Gate A (Day 30) Phase 1",
      pass: $gate_pass,
      criteria: [
        "quickstart script present",
        "killer demo script present",
        "value dashboard script present",
        "API healthy",
        "killer demo exits 0",
        "memory_recall_improved=true",
        "cross_session_recall_stable=true",
        "value_dashboard exits 0",
        "docs-check exits 0"
      ]
    }
  }' | tee "${OUT_DIR}/summary.json"

echo "done: ${OUT_DIR}/summary.json"

if [[ "${gate_pass}" != "true" && "${GATEA_FAIL_ON_FAIL}" == "true" ]]; then
  echo "Gate A failed. Set GATEA_FAIL_ON_FAIL=false to keep non-blocking mode." >&2
  exit 2
fi
