#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need jq
need npm
need node
need curl

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
GATEB_FAIL_ON_FAIL="${GATEB_FAIL_ON_FAIL:-false}"
GATEB_REQUIRE_API_SMOKE="${GATEB_REQUIRE_API_SMOKE:-false}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/gtm/gate_b/${RUN_ID}}"

mkdir -p "${OUT_DIR}"

GATEB_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
GATEB_STARTED_MS="$(now_ms)"

check_ts_package=false
check_python_package=false
check_matrix_has_python=false
check_examples_present=false
check_phase2_integrations_ok=false
api_healthy=false

ts_build_ok=false
ts_release_ok=false
py_compile_ok=false
py_release_ok=false
ts_smoke_ok=false
py_smoke_ok=false
phase2_integrations_ok=false

ts_build_exit=-1
ts_release_exit=-1
py_compile_exit=-1
py_release_exit=-1
ts_smoke_exit=-1
py_smoke_exit=-1
phase2_integrations_exit=-1

[[ -f "${ROOT_DIR}/packages/sdk/package.json" ]] && check_ts_package=true
[[ -f "${ROOT_DIR}/packages/python-sdk/pyproject.toml" ]] && check_python_package=true

if rg -n "aionis-sdk|Python|python" "${ROOT_DIR}/docs/SDK_COMPATIBILITY_MATRIX.md" >/dev/null 2>&1; then
  check_matrix_has_python=true
fi

if [[ -f "${ROOT_DIR}/docs/OPENWORK_INTEGRATION.md" \
   && -f "${ROOT_DIR}/docs/LANGGRAPH_INTEGRATION.md" \
   && -x "${ROOT_DIR}/examples/mcp_stdio_smoke.sh" \
   && -x "${ROOT_DIR}/examples/langgraph_adapter_smoke.sh" ]]; then
  check_examples_present=true
fi

if curl -fsS "${BASE_URL}/health" >"${OUT_DIR}/00_health.json" 2>"${OUT_DIR}/00_health.err"; then
  api_healthy=true
fi

set +e
npm run -s sdk:build >"${OUT_DIR}/01_ts_build.log" 2>"${OUT_DIR}/01_ts_build.err"
ts_build_exit=$?
set -e
[[ "${ts_build_exit}" -eq 0 ]] && ts_build_ok=true

set +e
npm run -s sdk:release-check >"${OUT_DIR}/02_ts_release_check.log" 2>"${OUT_DIR}/02_ts_release_check.err"
ts_release_exit=$?
set -e
[[ "${ts_release_exit}" -eq 0 ]] && ts_release_ok=true

set +e
npm run -s sdk:py:compile >"${OUT_DIR}/03_py_compile.log" 2>"${OUT_DIR}/03_py_compile.err"
py_compile_exit=$?
set -e
[[ "${py_compile_exit}" -eq 0 ]] && py_compile_ok=true

set +e
npm run -s sdk:py:release-check >"${OUT_DIR}/04_py_release_check.log" 2>"${OUT_DIR}/04_py_release_check.err"
py_release_exit=$?
set -e
[[ "${py_release_exit}" -eq 0 ]] && py_release_ok=true

if [[ "${GATEB_REQUIRE_API_SMOKE}" == "true" || "${api_healthy}" == "true" ]]; then
  set +e
  npm run -s sdk:smoke >"${OUT_DIR}/05_ts_smoke.log" 2>"${OUT_DIR}/05_ts_smoke.err"
  ts_smoke_exit=$?
  set -e
  [[ "${ts_smoke_exit}" -eq 0 ]] && ts_smoke_ok=true

  set +e
  npm run -s sdk:py:smoke >"${OUT_DIR}/06_py_smoke.log" 2>"${OUT_DIR}/06_py_smoke.err"
  py_smoke_exit=$?
  set -e
  [[ "${py_smoke_exit}" -eq 0 ]] && py_smoke_ok=true
else
  ts_smoke_exit=0
  py_smoke_exit=0
fi

set +e
PHASE2_INTEGRATIONS_REQUIRE_API="${GATEB_REQUIRE_API_SMOKE}" \
RUN_ID="${RUN_ID}" \
OUT_DIR="${OUT_DIR}/phase2_integrations" \
npm run -s e2e:phase2-integrations >"${OUT_DIR}/07_phase2_integrations.log" 2>"${OUT_DIR}/07_phase2_integrations.err"
phase2_integrations_exit=$?
set -e
if [[ "${phase2_integrations_exit}" -eq 0 ]]; then
  phase2_integrations_ok=true
fi
if [[ -f "${OUT_DIR}/phase2_integrations/summary.json" ]]; then
  check_phase2_integrations_ok=true
  if jq -e '.gate.pass == true' "${OUT_DIR}/phase2_integrations/summary.json" >/dev/null 2>&1; then
    phase2_integrations_ok=true
  fi
fi

gate_pass=false
if [[ "${check_ts_package}" == "true" \
   && "${check_python_package}" == "true" \
   && "${check_matrix_has_python}" == "true" \
   && "${check_examples_present}" == "true" \
   && "${check_phase2_integrations_ok}" == "true" \
   && "${ts_build_ok}" == "true" \
   && "${ts_release_ok}" == "true" \
   && "${py_compile_ok}" == "true" \
   && "${py_release_ok}" == "true" \
   && "${phase2_integrations_ok}" == "true" ]]; then
  if [[ "${GATEB_REQUIRE_API_SMOKE}" == "true" ]]; then
    if [[ "${api_healthy}" == "true" && "${ts_smoke_ok}" == "true" && "${py_smoke_ok}" == "true" ]]; then
      gate_pass=true
    fi
  else
    gate_pass=true
  fi
fi

GATEB_ENDED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
GATEB_ENDED_MS="$(now_ms)"
GATEB_DURATION_MS="$((GATEB_ENDED_MS - GATEB_STARTED_MS))"

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg base_url "${BASE_URL}" \
  --arg started_at "${GATEB_STARTED_AT}" \
  --arg ended_at "${GATEB_ENDED_AT}" \
  --argjson check_ts_package "${check_ts_package}" \
  --argjson check_python_package "${check_python_package}" \
  --argjson check_matrix_has_python "${check_matrix_has_python}" \
  --argjson check_examples_present "${check_examples_present}" \
  --argjson check_phase2_integrations_ok "${check_phase2_integrations_ok}" \
  --argjson api_healthy "${api_healthy}" \
  --argjson ts_build_ok "${ts_build_ok}" \
  --argjson ts_release_ok "${ts_release_ok}" \
  --argjson py_compile_ok "${py_compile_ok}" \
  --argjson py_release_ok "${py_release_ok}" \
  --argjson ts_smoke_ok "${ts_smoke_ok}" \
  --argjson py_smoke_ok "${py_smoke_ok}" \
  --argjson phase2_integrations_ok "${phase2_integrations_ok}" \
  --argjson ts_build_exit "${ts_build_exit}" \
  --argjson ts_release_exit "${ts_release_exit}" \
  --argjson py_compile_exit "${py_compile_exit}" \
  --argjson py_release_exit "${py_release_exit}" \
  --argjson ts_smoke_exit "${ts_smoke_exit}" \
  --argjson py_smoke_exit "${py_smoke_exit}" \
  --argjson phase2_integrations_exit "${phase2_integrations_exit}" \
  --argjson require_api_smoke "$([[ "${GATEB_REQUIRE_API_SMOKE}" == "true" ]] && echo true || echo false)" \
  --argjson duration_ms "${GATEB_DURATION_MS}" \
  --argjson gate_pass "${gate_pass}" \
  '{
    ok: true,
    run_id: $run_id,
    out_dir: $out_dir,
    base_url: $base_url,
    started_at: $started_at,
    ended_at: $ended_at,
    checks: {
      ts_package_exists: $check_ts_package,
      python_package_exists: $check_python_package,
      compatibility_matrix_has_python: $check_matrix_has_python,
      adapters_examples_present: $check_examples_present,
      phase2_integrations_summary_present: $check_phase2_integrations_ok,
      api_healthy: $api_healthy,
      ts_build_ok: $ts_build_ok,
      ts_release_check_ok: $ts_release_ok,
      py_compile_ok: $py_compile_ok,
      py_release_check_ok: $py_release_ok,
      ts_smoke_ok: $ts_smoke_ok,
      py_smoke_ok: $py_smoke_ok,
      phase2_integrations_ok: $phase2_integrations_ok
    },
    exits: {
      ts_build: $ts_build_exit,
      ts_release_check: $ts_release_exit,
      py_compile: $py_compile_exit,
      py_release_check: $py_release_exit,
      ts_smoke: $ts_smoke_exit,
      py_smoke: $py_smoke_exit,
      phase2_integrations: $phase2_integrations_exit
    },
    gate: {
      name: "Gate B (Day 60) Phase 2",
      require_api_smoke: $require_api_smoke,
      pass: $gate_pass,
      criteria: [
        "TS SDK package/build/release-check",
        "Python SDK package/compile/release-check",
        "compatibility matrix includes TS+Python",
        "adapter examples present",
        "phase2 integrations evidence present and pass",
        "optional API smoke for both SDKs"
      ]
    },
    timings: {
      gate_duration_ms: $duration_ms
    }
  }' | tee "${OUT_DIR}/summary.json"

echo "done: ${OUT_DIR}/summary.json"

if [[ "${gate_pass}" != "true" && "${GATEB_FAIL_ON_FAIL}" == "true" ]]; then
  echo "Gate B failed. Set GATEB_FAIL_ON_FAIL=false to keep non-blocking mode." >&2
  exit 2
fi
