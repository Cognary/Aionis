#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need npm
need jq
need curl

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BASE_URL="${BASE_URL:-http://localhost:${PORT:-3001}}"
SCOPE="${SCOPE:-${MEMORY_SCOPE:-default}}"
TENANT_ID="${TENANT_ID:-${MEMORY_TENANT_ID:-default}}"
WINDOW_HOURS="${WINDOW_HOURS:-168}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/hosted_incident_bundle/${RUN_ID}}"

RUN_CORE_GATE=true
RUN_GOVERNANCE=true
RUN_KEY_SLA=true
RUN_TIMESERIES=true
RUN_AUDIT_SNAPSHOT=true
STRICT=true

usage() {
  cat <<'USAGE'
Usage: scripts/hosted/export-incident-bundle.sh [options]

Options:
  --base-url <url>               API base URL (default: http://localhost:$PORT)
  --scope <scope>                Scope for governance/core gate (default: MEMORY_SCOPE)
  --tenant-id <id>               Tenant for dashboard/timeseries/audit snapshot
  --window-hours <n>             Window used for governance/timeseries (default: 168)
  --out-dir <dir>                Output directory
  --skip-core-gate               Do not run gate:core:prod
  --skip-governance              Do not run governance weekly report
  --skip-key-sla                 Do not run hosted key rotation SLA check
  --skip-timeseries              Do not run tenant timeseries export job
  --skip-audit-snapshot          Do not fetch audit/dashboard snapshots via admin API
  --no-strict                    Always exit 0 even if steps fail
  -h, --help                     Show help

Environment:
  ADMIN_TOKEN                    Required for --run-audit-snapshot (X-Admin-Token)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --tenant-id) TENANT_ID="${2:-}"; shift 2 ;;
    --window-hours) WINDOW_HOURS="${2:-}"; shift 2 ;;
    --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
    --skip-core-gate) RUN_CORE_GATE=false; shift ;;
    --skip-governance) RUN_GOVERNANCE=false; shift ;;
    --skip-key-sla) RUN_KEY_SLA=false; shift ;;
    --skip-timeseries) RUN_TIMESERIES=false; shift ;;
    --skip-audit-snapshot) RUN_AUDIT_SNAPSHOT=false; shift ;;
    --no-strict) STRICT=false; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done

mkdir -p "${OUT_DIR}"

steps='[]'
fail_reasons='[]'

append_step() {
  local name="$1"
  local ok="$2"
  local log_file="$3"
  local note="${4:-}"
  steps="$(echo "${steps}" | jq \
    --arg name "${name}" \
    --argjson ok "$([[ "${ok}" == "true" ]] && echo true || echo false)" \
    --arg log_file "${log_file}" \
    --arg note "${note}" \
    '. + [{name:$name, ok:$ok, log_file:$log_file, note:$note}]')"
  if [[ "${ok}" != "true" ]]; then
    fail_reasons="$(echo "${fail_reasons}" | jq --arg r "${name}" '. + [$r]')"
  fi
}

run_step_cmd() {
  local name="$1"
  local log_file="$2"
  shift 2
  local ok=true
  set +e
  "$@" >"${log_file}" 2>&1
  local ec=$?
  set -e
  if [[ "${ec}" -ne 0 ]]; then ok=false; fi
  append_step "${name}" "${ok}" "${log_file}" "exit_code=${ec}"
}

if [[ "${RUN_CORE_GATE}" == "true" ]]; then
  run_step_cmd "core_gate_prod" "${OUT_DIR}/01_core_gate.log" \
    npm run -s gate:core:prod -- --base-url "${BASE_URL}" --scope "${SCOPE}" --tenant-id "${TENANT_ID}" --run-perf false
else
  append_step "core_gate_prod" "true" "${OUT_DIR}/01_core_gate.log" "skipped"
fi

if [[ "${RUN_GOVERNANCE}" == "true" ]]; then
  run_step_cmd "governance_weekly_report" "${OUT_DIR}/02_governance.log" \
    npm run -s job:governance-weekly-report -- --scope "${SCOPE}" --window-hours "${WINDOW_HOURS}" --strict-warnings --out-dir "${OUT_DIR}/governance"
else
  append_step "governance_weekly_report" "true" "${OUT_DIR}/02_governance.log" "skipped"
fi

if [[ "${RUN_KEY_SLA}" == "true" ]]; then
  run_step_cmd "key_rotation_sla" "${OUT_DIR}/03_key_rotation_sla.log" \
    npm run -s job:hosted-key-rotation-sla -- --strict --out "${OUT_DIR}/key_rotation_sla.json"
else
  append_step "key_rotation_sla" "true" "${OUT_DIR}/03_key_rotation_sla.log" "skipped"
fi

if [[ "${RUN_TIMESERIES}" == "true" ]]; then
  run_step_cmd "tenant_timeseries_export" "${OUT_DIR}/04_timeseries.log" \
    npm run -s job:hosted-tenant-timeseries-export -- --tenant-id "${TENANT_ID}" --window-hours "${WINDOW_HOURS}" --out-dir "${OUT_DIR}/timeseries"
else
  append_step "tenant_timeseries_export" "true" "${OUT_DIR}/04_timeseries.log" "skipped"
fi

if [[ "${RUN_AUDIT_SNAPSHOT}" == "true" ]]; then
  audit_log="${OUT_DIR}/05_audit_snapshot.log"
  set +e
  {
    if [[ -z "${ADMIN_TOKEN:-}" ]]; then
      echo "ADMIN_TOKEN missing; skip audit snapshot"
      exit 11
    fi
    curl -fsS "${BASE_URL}/v1/admin/control/audit-events?tenant_id=${TENANT_ID}&limit=200" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}" > "${OUT_DIR}/audit_events.json"
    curl -fsS "${BASE_URL}/v1/admin/control/dashboard/tenant/${TENANT_ID}" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}" > "${OUT_DIR}/dashboard_summary.json"
    curl -fsS "${BASE_URL}/v1/admin/control/dashboard/tenant/${TENANT_ID}/timeseries?window_hours=${WINDOW_HOURS}" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}" > "${OUT_DIR}/dashboard_timeseries.json"
  } > "${audit_log}" 2>&1
  ec=$?
  set -e
  if [[ "${ec}" -eq 0 ]]; then
    append_step "audit_snapshot" "true" "${audit_log}" "ok"
  elif [[ "${ec}" -eq 11 ]]; then
    append_step "audit_snapshot" "true" "${audit_log}" "skipped_missing_admin_token"
  else
    append_step "audit_snapshot" "false" "${audit_log}" "exit_code=${ec}"
  fi
else
  append_step "audit_snapshot" "true" "${OUT_DIR}/05_audit_snapshot.log" "skipped"
fi

summary="${OUT_DIR}/summary.json"
ok=true
if [[ "$(echo "${fail_reasons}" | jq 'length')" != "0" ]]; then
  ok=false
fi

jq -n \
  --argjson ok "$([[ "${ok}" == "true" ]] && echo true || echo false)" \
  --arg run_id "${RUN_ID}" \
  --arg base_url "${BASE_URL}" \
  --arg scope "${SCOPE}" \
  --arg tenant_id "${TENANT_ID}" \
  --argjson window_hours "${WINDOW_HOURS}" \
  --argjson strict "$([[ "${STRICT}" == "true" ]] && echo true || echo false)" \
  --argjson steps "${steps}" \
  --argjson fail_reasons "${fail_reasons}" \
  --arg out_dir "${OUT_DIR}" \
  '{
    ok: $ok,
    run_id: $run_id,
    target: {
      base_url: $base_url,
      scope: $scope,
      tenant_id: $tenant_id,
      window_hours: $window_hours
    },
    strict: $strict,
    steps: $steps,
    fail_reasons: $fail_reasons,
    artifacts: {
      out_dir: $out_dir,
      summary_json: ($out_dir + "/summary.json")
    }
  }' > "${summary}"

cat "${summary}"

if [[ "${ok}" != "true" && "${STRICT}" == "true" ]]; then
  exit 2
fi
