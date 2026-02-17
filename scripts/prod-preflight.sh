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
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/preflight/${RUN_ID}}"
SKIP_MIGRATE="${SKIP_MIGRATE:-false}"
PREFLIGHT_ENFORCE_ORCHESTRATION="${PREFLIGHT_ENFORCE_ORCHESTRATION:-true}"
PREFLIGHT_START_SERVICES_IF_NEEDED="${PREFLIGHT_START_SERVICES_IF_NEEDED:-}"
PREFLIGHT_GTM_PHASE1_GATE="${PREFLIGHT_GTM_PHASE1_GATE:-false}"
PREFLIGHT_GTM_PHASE1_GATE_ENFORCE="${PREFLIGHT_GTM_PHASE1_GATE_ENFORCE:-true}"
PREFLIGHT_GTM_PHASE1_GATE_ITERATIONS="${PREFLIGHT_GTM_PHASE1_GATE_ITERATIONS:-3}"
PREFLIGHT_GTM_PHASE1_GATE_MIN_PASS_RATE="${PREFLIGHT_GTM_PHASE1_GATE_MIN_PASS_RATE:-0.8}"
PREFLIGHT_GTM_PHASE1_GATE_MIN_EXECUTED="${PREFLIGHT_GTM_PHASE1_GATE_MIN_EXECUTED:-3}"
PREFLIGHT_GTM_PHASE1_GATE_LOOKBACK_DAYS="${PREFLIGHT_GTM_PHASE1_GATE_LOOKBACK_DAYS:-7}"
PREFLIGHT_GTM_PHASE2_GATE="${PREFLIGHT_GTM_PHASE2_GATE:-false}"
PREFLIGHT_GTM_PHASE2_GATE_ENFORCE="${PREFLIGHT_GTM_PHASE2_GATE_ENFORCE:-true}"
PREFLIGHT_GTM_PHASE2_GATE_REQUIRE_API_SMOKE="${PREFLIGHT_GTM_PHASE2_GATE_REQUIRE_API_SMOKE:-false}"
PREFLIGHT_GTM_PHASE3_GATE="${PREFLIGHT_GTM_PHASE3_GATE:-false}"
PREFLIGHT_GTM_PHASE3_GATE_ENFORCE="${PREFLIGHT_GTM_PHASE3_GATE_ENFORCE:-true}"
PREFLIGHT_GTM_PHASE3_GATE_RUN_PERF="${PREFLIGHT_GTM_PHASE3_GATE_RUN_PERF:-false}"
PREFLIGHT_GTM_PHASE3_GATE_REQUIRE_SCALE="${PREFLIGHT_GTM_PHASE3_GATE_REQUIRE_SCALE:-}"
PREFLIGHT_GTM_PHASE3_GATE_REQUIRE_WRITE_CASE="${PREFLIGHT_GTM_PHASE3_GATE_REQUIRE_WRITE_CASE:-false}"

if [[ -z "${PREFLIGHT_START_SERVICES_IF_NEEDED}" ]]; then
  if [[ "${APP_ENV}" == "prod" ]]; then
    PREFLIGHT_START_SERVICES_IF_NEEDED="false"
  else
    PREFLIGHT_START_SERVICES_IF_NEEDED="true"
  fi
fi
case "${PREFLIGHT_START_SERVICES_IF_NEEDED}" in
  true|false) ;;
  *)
    echo "PREFLIGHT_START_SERVICES_IF_NEEDED must be true|false, got: ${PREFLIGHT_START_SERVICES_IF_NEEDED}" >&2
    exit 1
    ;;
esac

mkdir -p "${OUT_DIR}"

AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
API_KEY="${API_KEY:-${PERF_API_KEY:-}}"
AUTH_BEARER="${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}"

if [[ -z "${AUTH_BEARER}" && -z "${API_KEY}" && -n "${MEMORY_API_KEYS_JSON:-}" ]]; then
  API_KEY="$(echo "${MEMORY_API_KEYS_JSON}" | jq -r 'keys[0] // empty' 2>/dev/null || true)"
fi

hdrs=(-H "content-type: application/json")
if [[ -n "${API_KEY}" ]]; then
  hdrs+=(-H "X-Api-Key: ${API_KEY}")
fi
if [[ -n "${AUTH_BEARER}" ]]; then
  hdrs+=(-H "Authorization: Bearer ${AUTH_BEARER}")
fi

case "${AUTH_MODE}" in
  api_key)
    [[ -n "${API_KEY}" ]] || { echo "MEMORY_AUTH_MODE=api_key but API key not found" >&2; exit 1; }
    ;;
  jwt)
    [[ -n "${AUTH_BEARER}" ]] || { echo "MEMORY_AUTH_MODE=jwt but AUTH_BEARER is empty" >&2; exit 1; }
    ;;
  api_key_or_jwt)
    [[ -n "${API_KEY}" || -n "${AUTH_BEARER}" ]] || { echo "MEMORY_AUTH_MODE=api_key_or_jwt but no credentials found" >&2; exit 1; }
    ;;
esac

api_pid=""
started_api=false
cleanup() {
  if [[ "${started_api}" == "true" && -n "${api_pid}" ]]; then
    kill "${api_pid}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_health() {
  local ok=0
  for _ in {1..60}; do
    if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 1
  done
  [[ "${ok}" -eq 1 ]]
}

ensure_api() {
  if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
    return 0
  fi
  npm run -s start > "${OUT_DIR}/api.log" 2>&1 &
  api_pid="$!"
  started_api=true
  wait_health || {
    echo "api did not become healthy at ${BASE_URL}" >&2
    sed -n '1,200p' "${OUT_DIR}/api.log" >&2 || true
    return 1
  }
}

echo "[preflight] out dir: ${OUT_DIR}"
echo "[preflight] base url: ${BASE_URL}"
echo "[preflight] app env: ${APP_ENV}"
echo "[preflight] auth mode: ${AUTH_MODE}"
echo "[preflight] start services if needed: ${PREFLIGHT_START_SERVICES_IF_NEEDED}"
echo "[preflight] gtm phase1 gate: ${PREFLIGHT_GTM_PHASE1_GATE} (enforce=${PREFLIGHT_GTM_PHASE1_GATE_ENFORCE})"
echo "[preflight] gtm phase2 gate: ${PREFLIGHT_GTM_PHASE2_GATE} (enforce=${PREFLIGHT_GTM_PHASE2_GATE_ENFORCE})"
echo "[preflight] gtm phase3 gate: ${PREFLIGHT_GTM_PHASE3_GATE} (enforce=${PREFLIGHT_GTM_PHASE3_GATE_ENFORCE}, run_perf=${PREFLIGHT_GTM_PHASE3_GATE_RUN_PERF})"

echo "[0/5] orchestration compliance"
orch_app_env_prod=false
orch_auth_mode_secure=false
orch_rate_limit_enabled=false
orch_tenant_quota_enabled=false
orch_loopback_bypass_disabled=false
orch_start_services_disabled=false

[[ "${APP_ENV}" == "prod" ]] && orch_app_env_prod=true
[[ "${AUTH_MODE}" != "off" ]] && orch_auth_mode_secure=true
[[ "${RATE_LIMIT_ENABLED:-true}" == "true" ]] && orch_rate_limit_enabled=true
[[ "${TENANT_QUOTA_ENABLED:-true}" == "true" ]] && orch_tenant_quota_enabled=true
[[ "${RATE_LIMIT_BYPASS_LOOPBACK:-true}" == "false" ]] && orch_loopback_bypass_disabled=true
[[ "${PREFLIGHT_START_SERVICES_IF_NEEDED}" == "false" ]] && orch_start_services_disabled=true

orch_ok=true
for v in "${orch_app_env_prod}" "${orch_auth_mode_secure}" "${orch_rate_limit_enabled}" "${orch_tenant_quota_enabled}" "${orch_loopback_bypass_disabled}" "${orch_start_services_disabled}"; do
  if [[ "${v}" != "true" ]]; then
    orch_ok=false
    break
  fi
done

jq -n \
  --arg app_env "${APP_ENV}" \
  --arg auth_mode "${AUTH_MODE}" \
  --arg start_services_if_needed "${PREFLIGHT_START_SERVICES_IF_NEEDED}" \
  --argjson ok "${orch_ok}" \
  --argjson app_env_prod "${orch_app_env_prod}" \
  --argjson auth_mode_secure "${orch_auth_mode_secure}" \
  --argjson rate_limit_enabled "${orch_rate_limit_enabled}" \
  --argjson tenant_quota_enabled "${orch_tenant_quota_enabled}" \
  --argjson loopback_bypass_disabled "${orch_loopback_bypass_disabled}" \
  --argjson start_services_disabled "${orch_start_services_disabled}" \
  '{
    ok: $ok,
    app_env: $app_env,
    auth_mode: $auth_mode,
    start_services_if_needed: $start_services_if_needed,
    checks: {
      app_env_prod: $app_env_prod,
      auth_mode_secure: $auth_mode_secure,
      rate_limit_enabled: $rate_limit_enabled,
      tenant_quota_enabled: $tenant_quota_enabled,
      loopback_bypass_disabled: $loopback_bypass_disabled,
      start_services_disabled: $start_services_disabled
    }
  }' > "${OUT_DIR}/00_orchestration.json"

if [[ "${PREFLIGHT_ENFORCE_ORCHESTRATION}" == "true" && "${orch_ok}" != "true" ]]; then
  echo "orchestration compliance failed (see ${OUT_DIR}/00_orchestration.json)" >&2
  cat "${OUT_DIR}/00_orchestration.json" >&2
  exit 1
fi

echo "[1/5] run regression gate (no perf)"
REG_RUN_ID="${RUN_ID}_regression"
REG_OUT_DIR="${OUT_DIR}/regression"
SKIP_PERF=true \
SKIP_MIGRATE="${SKIP_MIGRATE}" \
START_SERVICES_IF_NEEDED="${PREFLIGHT_START_SERVICES_IF_NEEDED}" \
RUN_ID="${REG_RUN_ID}" \
OUT_DIR="${REG_OUT_DIR}" \
GTM_PHASE1_GATE="${PREFLIGHT_GTM_PHASE1_GATE}" \
GTM_PHASE1_GATE_ENFORCE="${PREFLIGHT_GTM_PHASE1_GATE_ENFORCE}" \
GTM_PHASE1_GATE_ITERATIONS="${PREFLIGHT_GTM_PHASE1_GATE_ITERATIONS}" \
GTM_PHASE1_GATE_MIN_PASS_RATE="${PREFLIGHT_GTM_PHASE1_GATE_MIN_PASS_RATE}" \
GTM_PHASE1_GATE_MIN_EXECUTED="${PREFLIGHT_GTM_PHASE1_GATE_MIN_EXECUTED}" \
GTM_PHASE1_GATE_LOOKBACK_DAYS="${PREFLIGHT_GTM_PHASE1_GATE_LOOKBACK_DAYS}" \
GTM_PHASE1_GATE_OWNER="preflight" \
GTM_PHASE2_GATE="${PREFLIGHT_GTM_PHASE2_GATE}" \
GTM_PHASE2_GATE_ENFORCE="${PREFLIGHT_GTM_PHASE2_GATE_ENFORCE}" \
GTM_PHASE2_GATE_REQUIRE_API_SMOKE="${PREFLIGHT_GTM_PHASE2_GATE_REQUIRE_API_SMOKE}" \
GTM_PHASE3_GATE="${PREFLIGHT_GTM_PHASE3_GATE}" \
GTM_PHASE3_GATE_ENFORCE="${PREFLIGHT_GTM_PHASE3_GATE_ENFORCE}" \
GTM_PHASE3_GATE_RUN_PERF="${PREFLIGHT_GTM_PHASE3_GATE_RUN_PERF}" \
GTM_PHASE3_GATE_REQUIRE_SCALE="${PREFLIGHT_GTM_PHASE3_GATE_REQUIRE_SCALE}" \
GTM_PHASE3_GATE_REQUIRE_WRITE_CASE="${PREFLIGHT_GTM_PHASE3_GATE_REQUIRE_WRITE_CASE}" \
npm run -s regression:oneclick > "${OUT_DIR}/01_regression.log" 2>&1

REG_SUMMARY_FILE="${REG_OUT_DIR}/summary.json"
REG_GTM_JSON='null'
REG_GTM2_JSON='null'
REG_GTM3_JSON='null'
if [[ -f "${REG_SUMMARY_FILE}" ]]; then
  REG_GTM_JSON="$(jq -c '.gtm_phase1 // null' "${REG_SUMMARY_FILE}" 2>/dev/null || echo 'null')"
  REG_GTM2_JSON="$(jq -c '.gtm_phase2 // null' "${REG_SUMMARY_FILE}" 2>/dev/null || echo 'null')"
  REG_GTM3_JSON="$(jq -c '.gtm_phase3 // null' "${REG_SUMMARY_FILE}" 2>/dev/null || echo 'null')"
fi

echo "[2/5] smoke write"
ensure_api
write_body="${OUT_DIR}/02_write_body.json"
write_code="$(
  curl -sS -o "${write_body}" -w "%{http_code}" \
    "${BASE_URL}/v1/memory/write" \
    "${hdrs[@]}" \
    -d '{
      "input_text":"prod preflight write",
      "auto_embed":true,
      "nodes":[{"client_id":"preflight_write_'${RUN_ID}'","type":"event","text_summary":"prod preflight write event"}]
    }'
)"
if [[ "${write_code}" != "200" ]]; then
  echo "write smoke failed: http=${write_code}" >&2
  cat "${write_body}" >&2 || true
  exit 1
fi

echo "[3/5] smoke recall_text (must not be 500)"
recall_hdr="${OUT_DIR}/03_recall_hdr.txt"
recall_body="${OUT_DIR}/03_recall_body.json"
recall_code="$(
  curl -sS -D "${recall_hdr}" -o "${recall_body}" -w "%{http_code}" \
    "${BASE_URL}/v1/memory/recall_text" \
    "${hdrs[@]}" \
    -d '{"query_text":"memory graph production preflight","limit":20}'
)"

if [[ "${recall_code}" == "500" ]]; then
  echo "recall_text smoke failed: http=500 (should be mapped 429/503/502 on upstream issues)" >&2
  cat "${recall_body}" >&2 || true
  exit 1
fi

if [[ "${recall_code}" != "200" ]]; then
  recall_err="$(jq -r '.error // ""' "${recall_body}" 2>/dev/null || true)"
  case "${recall_err}" in
    upstream_embedding_rate_limited|upstream_embedding_unavailable|upstream_embedding_bad_response)
      ;;
    *)
      echo "recall_text smoke returned unexpected error: http=${recall_code} error=${recall_err}" >&2
      cat "${recall_body}" >&2 || true
      exit 1
      ;;
  esac
fi

echo "[4/5] summary"
jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg base_url "${BASE_URL}" \
  --arg app_env "${APP_ENV}" \
  --arg auth_mode "${AUTH_MODE}" \
  --arg write_code "${write_code}" \
  --arg recall_code "${recall_code}" \
  --arg recall_error "$(jq -r '.error // null' "${recall_body}" 2>/dev/null)" \
  --arg reg_summary_file "${REG_SUMMARY_FILE}" \
  --argjson reg_gtm "${REG_GTM_JSON}" \
  --argjson reg_gtm2 "${REG_GTM2_JSON}" \
  --argjson reg_gtm3 "${REG_GTM3_JSON}" \
  --argjson preflight_gtm_enabled "$([[ "${PREFLIGHT_GTM_PHASE1_GATE}" == "true" ]] && echo true || echo false)" \
  --argjson preflight_gtm_enforced "$([[ "${PREFLIGHT_GTM_PHASE1_GATE_ENFORCE}" == "true" ]] && echo true || echo false)" \
  --argjson preflight_gtm2_enabled "$([[ "${PREFLIGHT_GTM_PHASE2_GATE}" == "true" ]] && echo true || echo false)" \
  --argjson preflight_gtm2_enforced "$([[ "${PREFLIGHT_GTM_PHASE2_GATE_ENFORCE}" == "true" ]] && echo true || echo false)" \
  --argjson preflight_gtm3_enabled "$([[ "${PREFLIGHT_GTM_PHASE3_GATE}" == "true" ]] && echo true || echo false)" \
  --argjson preflight_gtm3_enforced "$([[ "${PREFLIGHT_GTM_PHASE3_GATE_ENFORCE}" == "true" ]] && echo true || echo false)" \
  --argjson preflight_enforce_orchestration "$([[ "${PREFLIGHT_ENFORCE_ORCHESTRATION}" == "true" ]] && echo true || echo false)" \
  --argjson orchestration "$(cat "${OUT_DIR}/00_orchestration.json")" \
  '{
    ok: true,
    run_id: $run_id,
    out_dir: $out_dir,
    base_url: $base_url,
    app_env: $app_env,
    auth_mode: $auth_mode,
    checks: {
      write_smoke_http: $write_code,
      recall_text_smoke_http: $recall_code,
      recall_text_error: $recall_error
    },
    orchestration: $orchestration,
    preflight_orchestration: {
      enforced: $preflight_enforce_orchestration
    },
    regression: {
      summary_file: $reg_summary_file,
      gtm_phase1: $reg_gtm,
      gtm_phase2: $reg_gtm2,
      gtm_phase3: $reg_gtm3
    },
    gtm_phase1_gate: {
      enabled: $preflight_gtm_enabled,
      enforced: $preflight_gtm_enforced
    },
    gtm_phase2_gate: {
      enabled: $preflight_gtm2_enabled,
      enforced: $preflight_gtm2_enforced
    },
    gtm_phase3_gate: {
      enabled: $preflight_gtm3_enabled,
      enforced: $preflight_gtm3_enforced
    }
  }' | tee "${OUT_DIR}/summary.json"

echo "done: ${OUT_DIR}"
