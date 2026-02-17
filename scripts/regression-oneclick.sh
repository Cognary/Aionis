#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need npm
need curl
need jq
need psql

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

APP_ENV_RAW="${APP_ENV:-${NODE_ENV:-dev}}"
case "${APP_ENV_RAW}" in
  production) APP_ENV="prod" ;;
  dev|ci|prod) APP_ENV="${APP_ENV_RAW}" ;;
  *)
    echo "invalid APP_ENV/NODE_ENV value: ${APP_ENV_RAW} (expected dev|ci|prod|production)" >&2
    exit 1
    ;;
esac

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/regression/${RUN_ID}}"
PERF_SCALES="${PERF_SCALES:-100000}"
PERF_PROFILE="${PERF_PROFILE:-balanced}"
SKIP_PERF="${SKIP_PERF:-false}"
START_SERVICES_IF_NEEDED="${START_SERVICES_IF_NEEDED:-}"
AUTO_REPAIR_ALIAS_EDGES="${AUTO_REPAIR_ALIAS_EDGES:-true}"
PERF_LOG_STREAM="${PERF_LOG_STREAM:-true}"
PERF_SCOPE_STRATEGY="${PERF_SCOPE_STRATEGY:-isolated}"
PERF_RESET_MODE="${PERF_RESET_MODE:-auto}"
PERF_OFFLINE_WINDOW="${PERF_OFFLINE_WINDOW:-false}"
PERF_REQUIRE_IDLE_WORKER="${PERF_REQUIRE_IDLE_WORKER:-false}"
AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
E2E_API_KEY="${API_KEY:-${PERF_API_KEY:-}}"
E2E_AUTH_BEARER="${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}"
E2E_BOUND_TENANT=""
SKIP_MIGRATE="${SKIP_MIGRATE:-false}"
GTM_PHASE1_GATE="${GTM_PHASE1_GATE:-false}"
GTM_PHASE1_GATE_ENFORCE="${GTM_PHASE1_GATE_ENFORCE:-false}"
GTM_PHASE1_GATE_ITERATIONS="${GTM_PHASE1_GATE_ITERATIONS:-3}"
GTM_PHASE1_GATE_MIN_PASS_RATE="${GTM_PHASE1_GATE_MIN_PASS_RATE:-0.8}"
GTM_PHASE1_GATE_MIN_EXECUTED="${GTM_PHASE1_GATE_MIN_EXECUTED:-3}"
GTM_PHASE1_GATE_LOOKBACK_DAYS="${GTM_PHASE1_GATE_LOOKBACK_DAYS:-7}"
GTM_PHASE1_GATE_OWNER="${GTM_PHASE1_GATE_OWNER:-regression}"
GTM_PHASE2_GATE="${GTM_PHASE2_GATE:-false}"
GTM_PHASE2_GATE_ENFORCE="${GTM_PHASE2_GATE_ENFORCE:-false}"
GTM_PHASE2_GATE_REQUIRE_API_SMOKE="${GTM_PHASE2_GATE_REQUIRE_API_SMOKE:-false}"
GTM_PHASE3_GATE="${GTM_PHASE3_GATE:-false}"
GTM_PHASE3_GATE_ENFORCE="${GTM_PHASE3_GATE_ENFORCE:-false}"
GTM_PHASE3_GATE_RUN_PERF="${GTM_PHASE3_GATE_RUN_PERF:-false}"
GTM_PHASE3_GATE_REQUIRE_SCALE="${GTM_PHASE3_GATE_REQUIRE_SCALE:-}"
GTM_PHASE3_GATE_REQUIRE_WRITE_CASE="${GTM_PHASE3_GATE_REQUIRE_WRITE_CASE:-false}"

if [[ -z "${START_SERVICES_IF_NEEDED}" ]]; then
  if [[ "${APP_ENV}" == "prod" ]]; then
    START_SERVICES_IF_NEEDED="false"
  else
    START_SERVICES_IF_NEEDED="true"
  fi
fi
case "${START_SERVICES_IF_NEEDED}" in
  true|false) ;;
  *)
    echo "START_SERVICES_IF_NEEDED must be true|false, got: ${START_SERVICES_IF_NEEDED}" >&2
    exit 1
    ;;
esac
if [[ "${APP_ENV}" == "prod" && "${START_SERVICES_IF_NEEDED}" == "true" ]]; then
  echo "START_SERVICES_IF_NEEDED=true is not allowed when APP_ENV=prod" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"

API_LOG="${OUT_DIR}/api.log"
WORKER_LOG="${OUT_DIR}/worker.log"
SUMMARY_JSON="${OUT_DIR}/summary.json"

started_api=false
started_worker=false
api_pid=""
worker_pid=""

cleanup() {
  if [[ "${started_api}" == "true" && -n "${api_pid}" ]]; then
    kill "${api_pid}" >/dev/null 2>&1 || true
  fi
  if [[ "${started_worker}" == "true" && -n "${worker_pid}" ]]; then
    kill "${worker_pid}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

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

infer_api_key() {
  if [[ -n "${E2E_API_KEY}" ]]; then
    echo "${E2E_API_KEY}"
    return 0
  fi
  if [[ -n "${MEMORY_API_KEYS_JSON:-}" ]]; then
    echo "${MEMORY_API_KEYS_JSON}" | jq -r 'keys[0] // empty' 2>/dev/null || true
    return 0
  fi
  echo ""
}

if [[ -z "${E2E_AUTH_BEARER}" ]]; then
  E2E_API_KEY="$(infer_api_key)"
fi

if [[ -n "${E2E_API_KEY}" && -n "${MEMORY_API_KEYS_JSON:-}" ]]; then
  E2E_BOUND_TENANT="$(echo "${MEMORY_API_KEYS_JSON}" | jq -r --arg k "${E2E_API_KEY}" '.[$k].tenant_id // empty' 2>/dev/null || true)"
fi

case "${AUTH_MODE}" in
  api_key)
    if [[ -z "${E2E_API_KEY}" ]]; then
      echo "MEMORY_AUTH_MODE=api_key but no API key found (set API_KEY or MEMORY_API_KEYS_JSON)." >&2
      exit 1
    fi
    ;;
  jwt)
    if [[ -z "${E2E_AUTH_BEARER}" ]]; then
      echo "MEMORY_AUTH_MODE=jwt but AUTH_BEARER is empty." >&2
      exit 1
    fi
    ;;
  api_key_or_jwt)
    if [[ -z "${E2E_AUTH_BEARER}" && -z "${E2E_API_KEY}" ]]; then
      echo "MEMORY_AUTH_MODE=api_key_or_jwt but neither key nor bearer found." >&2
      exit 1
    fi
    ;;
esac

echo "[regression] output dir: ${OUT_DIR}"
echo "[regression] base url: ${BASE_URL}"
echo "[regression] app env: ${APP_ENV}"
echo "[regression] perf scales: ${PERF_SCALES} (skip=${SKIP_PERF})"
echo "[regression] perf profile: ${PERF_PROFILE}"
echo "[regression] start services if needed: ${START_SERVICES_IF_NEEDED}"
if [[ -n "${E2E_BOUND_TENANT}" ]]; then
  echo "[regression] auth-bound tenant: ${E2E_BOUND_TENANT}"
fi
echo "[regression] gtm phase1 gate: ${GTM_PHASE1_GATE} (enforce=${GTM_PHASE1_GATE_ENFORCE})"
echo "[regression] gtm phase2 gate: ${GTM_PHASE2_GATE} (enforce=${GTM_PHASE2_GATE_ENFORCE})"
echo "[regression] gtm phase3 gate: ${GTM_PHASE3_GATE} (enforce=${GTM_PHASE3_GATE_ENFORCE}, run_perf=${GTM_PHASE3_GATE_RUN_PERF})"

echo "[1/7] migrate + build + docs + contract"
if [[ "${SKIP_MIGRATE}" != "true" ]]; then
  if ! make db-migrate > "${OUT_DIR}/01_db_migrate.log" 2>&1; then
    echo "[regression] db-migrate failed, log follows:" >&2
    sed -n '1,220p' "${OUT_DIR}/01_db_migrate.log" >&2 || true
    exit 1
  fi
else
  echo "[regression] skip db-migrate (SKIP_MIGRATE=true)"
fi
if ! npm run -s build > "${OUT_DIR}/01_build.log" 2>&1; then
  echo "[regression] build failed, log follows:" >&2
  sed -n '1,220p' "${OUT_DIR}/01_build.log" >&2 || true
  exit 1
fi
if ! npm run -s docs:check > "${OUT_DIR}/01_docs_check.log" 2>&1; then
  echo "[regression] docs-check failed, log follows:" >&2
  sed -n '1,220p' "${OUT_DIR}/01_docs_check.log" >&2 || true
  exit 1
fi
if ! npm run -s test:contract > "${OUT_DIR}/01_contract.log" 2>&1; then
  echo "[regression] test:contract failed, log follows:" >&2
  sed -n '1,220p' "${OUT_DIR}/01_contract.log" >&2 || true
  exit 1
fi

echo "[2/7] ensure api + worker"
if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "[regression] api already healthy, reuse existing service"
else
  if [[ "${START_SERVICES_IF_NEEDED}" != "true" ]]; then
    echo "api is not healthy and START_SERVICES_IF_NEEDED=false" >&2
    exit 1
  fi
  npm run -s start > "${API_LOG}" 2>&1 &
  api_pid="$!"
  started_api=true
  wait_health || { echo "api did not become healthy: ${BASE_URL}" >&2; exit 1; }
fi

if pgrep -f "src/jobs/outbox-worker.ts|dist/jobs/outbox-worker.js" >/dev/null 2>&1; then
  echo "[regression] outbox-worker already running, reuse existing worker"
else
  if [[ "${START_SERVICES_IF_NEEDED}" != "true" ]]; then
    echo "outbox worker not running and START_SERVICES_IF_NEEDED=false" >&2
    exit 1
  fi
  npm run -s job:outbox-worker > "${WORKER_LOG}" 2>&1 &
  worker_pid="$!"
  started_worker=true
  sleep 2
fi

echo "[3/7] phase-c tenant isolation e2e"
if ! API_KEY="${E2E_API_KEY}" AUTH_BEARER="${E2E_AUTH_BEARER}" AUTH_BOUND_TENANT="${E2E_BOUND_TENANT}" npm run -s e2e:phasec-tenant > "${OUT_DIR}/03_phasec_e2e.log" 2>&1; then
  echo "[regression] phase-c e2e failed, log follows:" >&2
  sed -n '1,220p' "${OUT_DIR}/03_phasec_e2e.log" >&2 || true
  exit 1
fi

echo "[4/7] phase-4 lifecycle smoke"
if ! API_KEY="${E2E_API_KEY}" AUTH_BEARER="${E2E_AUTH_BEARER}" npm run -s e2e:phase4-smoke > "${OUT_DIR}/04_phase4_e2e.log" 2>&1; then
  echo "[regression] phase-4 e2e failed, log follows:" >&2
  sed -n '1,220p' "${OUT_DIR}/04_phase4_e2e.log" >&2 || true
  exit 1
fi

if [[ "${AUTO_REPAIR_ALIAS_EDGES}" == "true" ]]; then
  echo "[4.5/7] auto-repair alias incident edges"
  if ! npm run -s job:consolidation-redirect-edges -- --scope "${MEMORY_SCOPE:-default}" --apply > "${OUT_DIR}/04_alias_repair.log" 2>&1; then
    echo "[regression] alias edge auto-repair failed, log follows:" >&2
    sed -n '1,220p' "${OUT_DIR}/04_alias_repair.log" >&2 || true
    exit 1
  fi
fi

echo "[5/7] consistency + health gate"
if ! npm run -s job:consistency-check -- --strict-warnings > "${OUT_DIR}/05_consistency.json" 2>&1; then
  echo "[regression] consistency-check failed, log follows:" >&2
  sed -n '1,220p' "${OUT_DIR}/05_consistency.json" >&2 || true
  exit 1
fi
if ! npm run -s job:health-gate -- --strict-warnings > "${OUT_DIR}/05_health_gate.json" 2>&1; then
  echo "[regression] health-gate failed, log follows:" >&2
  sed -n '1,220p' "${OUT_DIR}/05_health_gate.json" >&2 || true
  exit 1
fi

perf_report_path=""
if [[ "${SKIP_PERF}" != "true" ]]; then
  echo "[6/7] phase-d performance matrix"
  PERF_OUT_DIR="${OUT_DIR}/perf"
  mkdir -p "${PERF_OUT_DIR}"
  if [[ "${PERF_REQUIRE_IDLE_WORKER}" == "true" ]] && pgrep -f "src/jobs/outbox-worker.ts|dist/jobs/outbox-worker.js" >/dev/null 2>&1; then
    echo "[regression] refusing perf run while outbox worker is running (PERF_REQUIRE_IDLE_WORKER=true)." >&2
    echo "Stop worker first, or set PERF_REQUIRE_IDLE_WORKER=false." >&2
    exit 1
  fi
  if [[ "${PERF_LOG_STREAM}" == "true" ]]; then
    if ! SCALES="${PERF_SCALES}" \
      PERF_PROFILE="${PERF_PROFILE}" \
      SCOPE_STRATEGY="${PERF_SCOPE_STRATEGY}" \
      RESET_MODE="${PERF_RESET_MODE}" \
      PERF_OFFLINE_WINDOW="${PERF_OFFLINE_WINDOW}" \
      MATRIX_TAG="${RUN_ID}" \
      BASE_URL="${BASE_URL}" \
      OUT_DIR="${PERF_OUT_DIR}" \
      PERF_API_KEY="${E2E_API_KEY}" \
      PERF_AUTH_BEARER="${E2E_AUTH_BEARER}" \
      npm run -s perf:phase-d-matrix 2>&1 | tee "${OUT_DIR}/06_perf_matrix.log"; then
      echo "[regression] perf matrix failed, log follows:" >&2
      sed -n '1,220p' "${OUT_DIR}/06_perf_matrix.log" >&2 || true
      exit 1
    fi
  else
    if ! SCALES="${PERF_SCALES}" \
      PERF_PROFILE="${PERF_PROFILE}" \
      SCOPE_STRATEGY="${PERF_SCOPE_STRATEGY}" \
      RESET_MODE="${PERF_RESET_MODE}" \
      PERF_OFFLINE_WINDOW="${PERF_OFFLINE_WINDOW}" \
      MATRIX_TAG="${RUN_ID}" \
      BASE_URL="${BASE_URL}" \
      OUT_DIR="${PERF_OUT_DIR}" \
      PERF_API_KEY="${E2E_API_KEY}" \
      PERF_AUTH_BEARER="${E2E_AUTH_BEARER}" \
      npm run -s perf:phase-d-matrix > "${OUT_DIR}/06_perf_matrix.log" 2>&1; then
      echo "[regression] perf matrix failed, log follows:" >&2
      sed -n '1,220p' "${OUT_DIR}/06_perf_matrix.log" >&2 || true
      exit 1
    fi
  fi
  perf_report_path="${PERF_OUT_DIR}/PERFORMANCE_REPORT_V1.md"
else
  echo "[6/7] phase-d performance matrix (skipped)"
fi

gtm_phase1_enabled=false
gtm_phase1_enforced=false
gtm_phase1_ok=true
gtm_phase1_summary=""
gtm_phase2_enabled=false
gtm_phase2_enforced=false
gtm_phase2_ok=true
gtm_phase2_summary=""
gtm_phase3_enabled=false
gtm_phase3_enforced=false
gtm_phase3_ok=true
gtm_phase3_summary=""
if [[ "${GTM_PHASE1_GATE}" == "true" ]]; then
  gtm_phase1_enabled=true
  gtm_phase1_enforced="$([[ "${GTM_PHASE1_GATE_ENFORCE}" == "true" ]] && echo true || echo false)"
  echo "[7/8] gtm phase1 ci gate"
  GTM_OUT_DIR="${OUT_DIR}/gtm_phase1"
  mkdir -p "${GTM_OUT_DIR}"
  set +e
  ITERATIONS="${GTM_PHASE1_GATE_ITERATIONS}" \
  MIN_PASS_RATE="${GTM_PHASE1_GATE_MIN_PASS_RATE}" \
  MIN_EXECUTED="${GTM_PHASE1_GATE_MIN_EXECUTED}" \
  LOOKBACK_DAYS="${GTM_PHASE1_GATE_LOOKBACK_DAYS}" \
  OWNER="${GTM_PHASE1_GATE_OWNER}" \
  OUT_DIR="${GTM_OUT_DIR}" \
  RUN_ID="${RUN_ID}" \
  npm run -s gtm:phase1:ci-gate > "${OUT_DIR}/07_gtm_phase1.log" 2>&1
  gtm_rc=$?
  set -e
  gtm_phase1_summary="${GTM_OUT_DIR}/summary.json"
  if [[ "${gtm_rc}" -ne 0 ]]; then
    gtm_phase1_ok=false
    echo "[regression] gtm phase1 gate failed (rc=${gtm_rc})." >&2
    sed -n '1,220p' "${OUT_DIR}/07_gtm_phase1.log" >&2 || true
    if [[ "${GTM_PHASE1_GATE_ENFORCE}" == "true" ]]; then
      exit 1
    fi
  fi
  if [[ ! -f "${gtm_phase1_summary}" ]]; then
    gtm_phase1_ok=false
    echo "[regression] gtm phase1 summary missing: ${gtm_phase1_summary}" >&2
    if [[ "${GTM_PHASE1_GATE_ENFORCE}" == "true" ]]; then
      exit 1
    fi
  fi
fi

if [[ "${GTM_PHASE2_GATE}" == "true" ]]; then
  gtm_phase2_enabled=true
  gtm_phase2_enforced="$([[ "${GTM_PHASE2_GATE_ENFORCE}" == "true" ]] && echo true || echo false)"
  echo "[extra] gtm phase2 gate-b"
  GTM2_OUT_DIR="${OUT_DIR}/gtm_phase2"
  mkdir -p "${GTM2_OUT_DIR}"
  set +e
  GATEB_FAIL_ON_FAIL=true \
  GATEB_REQUIRE_API_SMOKE="${GTM_PHASE2_GATE_REQUIRE_API_SMOKE}" \
  OUT_DIR="${GTM2_OUT_DIR}" \
  RUN_ID="${RUN_ID}" \
  npm run -s gtm:phase2:gateb > "${OUT_DIR}/08_gtm_phase2.log" 2>&1
  gtm2_rc=$?
  set -e
  gtm_phase2_summary="${GTM2_OUT_DIR}/summary.json"
  if [[ "${gtm2_rc}" -ne 0 ]]; then
    gtm_phase2_ok=false
    echo "[regression] gtm phase2 gate failed (rc=${gtm2_rc})." >&2
    sed -n '1,220p' "${OUT_DIR}/08_gtm_phase2.log" >&2 || true
    if [[ "${GTM_PHASE2_GATE_ENFORCE}" == "true" ]]; then
      exit 1
    fi
  fi
  if [[ ! -f "${gtm_phase2_summary}" ]]; then
    gtm_phase2_ok=false
    echo "[regression] gtm phase2 summary missing: ${gtm_phase2_summary}" >&2
    if [[ "${GTM_PHASE2_GATE_ENFORCE}" == "true" ]]; then
      exit 1
    fi
  fi
fi

if [[ "${GTM_PHASE3_GATE}" == "true" ]]; then
  gtm_phase3_enabled=true
  gtm_phase3_enforced="$([[ "${GTM_PHASE3_GATE_ENFORCE}" == "true" ]] && echo true || echo false)"
  echo "[extra] gtm phase3 gate-c"
  GTM3_OUT_DIR="${OUT_DIR}/gtm_phase3"
  mkdir -p "${GTM3_OUT_DIR}"

  gatec_run_perf="${GTM_PHASE3_GATE_RUN_PERF}"
  gatec_perf_dir="${OUT_DIR}/perf"
  if [[ "${gatec_run_perf}" != "true" && "${SKIP_PERF}" == "true" ]]; then
    gatec_run_perf=true
    gatec_perf_dir="${GTM3_OUT_DIR}/perf"
  fi

  set +e
  GATEC_FAIL_ON_FAIL=true \
  START_SERVICES_IF_NEEDED=false \
  GATEC_RUN_HEALTH=false \
  GATEC_RUN_PERF="${gatec_run_perf}" \
  GATEC_PERF_PROFILE="${PERF_PROFILE}" \
  GATEC_SCALES="${PERF_SCALES}" \
  GATEC_PERF_DIR="${gatec_perf_dir}" \
  GATEC_REQUIRE_SCALE="${GTM_PHASE3_GATE_REQUIRE_SCALE}" \
  GATEC_REQUIRE_WRITE_CASE="${GTM_PHASE3_GATE_REQUIRE_WRITE_CASE}" \
  OUT_DIR="${GTM3_OUT_DIR}" \
  RUN_ID="${RUN_ID}" \
  npm run -s gtm:phase3:gatec > "${OUT_DIR}/09_gtm_phase3.log" 2>&1
  gtm3_rc=$?
  set -e
  gtm_phase3_summary="${GTM3_OUT_DIR}/summary.json"
  if [[ "${gtm3_rc}" -ne 0 ]]; then
    gtm_phase3_ok=false
    echo "[regression] gtm phase3 gate failed (rc=${gtm3_rc})." >&2
    sed -n '1,220p' "${OUT_DIR}/09_gtm_phase3.log" >&2 || true
    if [[ "${GTM_PHASE3_GATE_ENFORCE}" == "true" ]]; then
      exit 1
    fi
  fi
  if [[ ! -f "${gtm_phase3_summary}" ]]; then
    gtm_phase3_ok=false
    echo "[regression] gtm phase3 summary missing: ${gtm_phase3_summary}" >&2
    if [[ "${GTM_PHASE3_GATE_ENFORCE}" == "true" ]]; then
      exit 1
    fi
  fi
fi

if [[ "${GTM_PHASE1_GATE}" == "true" && "${GTM_PHASE2_GATE}" == "true" && "${GTM_PHASE3_GATE}" == "true" ]]; then
  echo "[10/10] summarize"
elif [[ "${GTM_PHASE1_GATE}" == "true" && "${GTM_PHASE2_GATE}" == "true" ]]; then
  echo "[9/9] summarize"
elif [[ "${GTM_PHASE1_GATE}" == "true" || "${GTM_PHASE2_GATE}" == "true" || "${GTM_PHASE3_GATE}" == "true" ]]; then
  echo "[8/8] summarize"
else
  echo "[7/7] summarize"
fi

consistency_summary="$(cat "${OUT_DIR}/05_consistency.json" | jq '{summary, cross_tenant:[.checks[]|select(.name=="tenant_scope_key_malformed" or (.name|startswith("cross_tenant_")))|{name,count}]}' 2>/dev/null || echo '{}')"
health_summary="$(cat "${OUT_DIR}/05_health_gate.json" | jq '{ok, gate, consistency:.consistency.summary, quality:.quality.summary}' 2>/dev/null || echo '{}')"

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg base_url "${BASE_URL}" \
  --arg auth_mode "${AUTH_MODE}" \
  --arg perf_scales "${PERF_SCALES}" \
  --arg perf_profile "${PERF_PROFILE}" \
  --arg perf_report "${perf_report_path}" \
  --arg gtm_phase1_summary "${gtm_phase1_summary}" \
  --arg gtm_phase2_summary "${gtm_phase2_summary}" \
  --arg gtm_phase3_summary "${gtm_phase3_summary}" \
  --argjson skip_perf "$([[ "${SKIP_PERF}" == "true" ]] && echo true || echo false)" \
  --argjson started_api "$([[ "${started_api}" == "true" ]] && echo true || echo false)" \
  --argjson started_worker "$([[ "${started_worker}" == "true" ]] && echo true || echo false)" \
  --argjson gtm_phase1_enabled "${gtm_phase1_enabled}" \
  --argjson gtm_phase1_enforced "${gtm_phase1_enforced}" \
  --argjson gtm_phase1_ok "${gtm_phase1_ok}" \
  --argjson gtm_phase2_enabled "${gtm_phase2_enabled}" \
  --argjson gtm_phase2_enforced "${gtm_phase2_enforced}" \
  --argjson gtm_phase2_ok "${gtm_phase2_ok}" \
  --argjson gtm_phase3_enabled "${gtm_phase3_enabled}" \
  --argjson gtm_phase3_enforced "${gtm_phase3_enforced}" \
  --argjson gtm_phase3_ok "${gtm_phase3_ok}" \
  --argjson consistency "${consistency_summary}" \
  --argjson health "${health_summary}" \
  '{
    ok: true,
    run_id: $run_id,
    out_dir: $out_dir,
    base_url: $base_url,
    auth_mode: $auth_mode,
    started_api: $started_api,
    started_worker: $started_worker,
    skip_perf: $skip_perf,
    perf_scales: $perf_scales,
    perf_profile: $perf_profile,
    perf_report: $perf_report,
    gtm_phase1: {
      enabled: $gtm_phase1_enabled,
      enforced: $gtm_phase1_enforced,
      ok: $gtm_phase1_ok,
      summary: (if ($gtm_phase1_summary|length)>0 then $gtm_phase1_summary else null end)
    },
    gtm_phase2: {
      enabled: $gtm_phase2_enabled,
      enforced: $gtm_phase2_enforced,
      ok: $gtm_phase2_ok,
      summary: (if ($gtm_phase2_summary|length)>0 then $gtm_phase2_summary else null end)
    },
    gtm_phase3: {
      enabled: $gtm_phase3_enabled,
      enforced: $gtm_phase3_enforced,
      ok: $gtm_phase3_ok,
      summary: (if ($gtm_phase3_summary|length)>0 then $gtm_phase3_summary else null end)
    },
    consistency: $consistency,
    health_gate: $health
  }' > "${SUMMARY_JSON}"

cat "${SUMMARY_JSON}"
echo "done: ${OUT_DIR}"
