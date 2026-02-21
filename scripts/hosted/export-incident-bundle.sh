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
RUN_KEY_USAGE=true
RUN_ALERT_DISPATCH=false
ALERT_DISPATCH_DRY_RUN=true
RUN_AUDIT_SNAPSHOT=true
STRICT=true
PUBLISH_TARGET="${PUBLISH_TARGET:-}"
PUBLISH_ASYNC=false
SIGNING_KEY="${SIGNING_KEY:-${INCIDENT_BUNDLE_SIGNING_KEY:-}}"
PUBLISHED_URI=""
PUBLISH_ADAPTER=""
PUBLISH_JOB_ID=""
PUBLISH_ATTESTATION_JSON=""

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
  --skip-key-usage               Do not run key-prefix usage anomaly check
  --dispatch-alerts              Run hosted alert dispatch step
  --alert-dispatch-live          Dispatch alerts in live mode (default dispatch mode is dry-run)
  --skip-audit-snapshot          Do not fetch audit/dashboard snapshots via admin API
  --publish-target <uri>         Publish bundle to s3://..., gs://..., az://... or local path/file://...
  --publish-async                Enqueue publish job instead of direct publish
  --signing-key <secret>         HMAC key for evidence index signing (or INCIDENT_BUNDLE_SIGNING_KEY)
  --no-strict                    Always exit 0 even if steps fail
  -h, --help                     Show help

Environment:
  ADMIN_TOKEN                    Required for audit snapshot endpoints (X-Admin-Token)
  INCIDENT_BUNDLE_SIGNING_KEY    Optional default signing key for evidence index
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
    --skip-key-usage) RUN_KEY_USAGE=false; shift ;;
    --dispatch-alerts) RUN_ALERT_DISPATCH=true; shift ;;
    --alert-dispatch-live) ALERT_DISPATCH_DRY_RUN=false; shift ;;
    --skip-audit-snapshot) RUN_AUDIT_SNAPSHOT=false; shift ;;
    --publish-target) PUBLISH_TARGET="${2:-}"; shift 2 ;;
    --publish-async) PUBLISH_ASYNC=true; shift ;;
    --signing-key) SIGNING_KEY="${2:-}"; shift 2 ;;
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

sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file}" | awk '{print $1}'
  else
    shasum -a 256 "${file}" | awk '{print $1}'
  fi
}

file_size_bytes() {
  local file="$1"
  if stat -f%z "${file}" >/dev/null 2>&1; then
    stat -f%z "${file}"
  else
    stat -c%s "${file}"
  fi
}

build_evidence_index() {
  local index_file="${OUT_DIR}/evidence_index.json"
  local sig_file="${OUT_DIR}/evidence_index.sig.json"
  local files_json='[]'

  while IFS= read -r file; do
    [[ -z "${file}" ]] && continue
    local rel="${file#"${OUT_DIR}/"}"
    local digest
    digest="$(sha256_file "${file}")"
    local bytes
    bytes="$(file_size_bytes "${file}")"
    files_json="$(echo "${files_json}" | jq \
      --arg path "${rel}" \
      --arg sha256 "${digest}" \
      --argjson size_bytes "${bytes}" \
      '. + [{path:$path, sha256:$sha256, size_bytes:$size_bytes}]')"
  done < <(find "${OUT_DIR}" -type f ! -name 'evidence_index.json' ! -name 'evidence_index.sig.json' | LC_ALL=C sort)

  jq -n \
    --arg run_id "${RUN_ID}" \
    --arg generated_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    --arg out_dir "${OUT_DIR}" \
    --argjson files "${files_json}" \
    '{
      run_id: $run_id,
      generated_at: $generated_at,
      out_dir: $out_dir,
      file_count: ($files | length),
      files: $files
    }' > "${index_file}"

  if [[ -n "${SIGNING_KEY}" ]]; then
    if ! command -v openssl >/dev/null 2>&1; then
      echo "openssl is required when signing is enabled" >&2
      return 21
    fi
    local sig
    sig="$(openssl dgst -sha256 -hmac "${SIGNING_KEY}" "${index_file}" | awk '{print $2}')"
    jq -n \
      --arg run_id "${RUN_ID}" \
      --arg generated_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      --arg signature_hex "${sig}" \
      --arg algorithm "HMAC-SHA256" \
      --arg index_file "evidence_index.json" \
      '{
        run_id: $run_id,
        generated_at: $generated_at,
        algorithm: $algorithm,
        index_file: $index_file,
        signature_hex: $signature_hex
      }' > "${sig_file}"
  fi
}

publish_bundle() {
  local target="$1"
  local out_json
  out_json="$(scripts/hosted/publish-incident-bundle.sh --source-dir "${OUT_DIR}" --target "${target}" --run-id "${RUN_ID}")"
  PUBLISHED_URI="$(echo "${out_json}" | jq -r '.published_uri // ""')"
  PUBLISH_ADAPTER="$(echo "${out_json}" | jq -r '.adapter // ""')"
  PUBLISH_ATTESTATION_JSON="${OUT_DIR}/publish_attestation.json"
  echo "${out_json}" | jq '.attestation // {}' > "${PUBLISH_ATTESTATION_JSON}"
  echo "${out_json}"
}

enqueue_publish_job() {
  local target="$1"
  local out_json
  out_json="$(npm run -s job:hosted-incident-publish-enqueue -- --tenant-id "${TENANT_ID}" --run-id "${RUN_ID}" --source-dir "${OUT_DIR}" --target "${target}" --out "${OUT_DIR}/publish_enqueue.json")"
  PUBLISH_JOB_ID="$(echo "${out_json}" | jq -r '.job.id // ""')"
  echo "${out_json}"
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

if [[ "${RUN_KEY_USAGE}" == "true" ]]; then
  run_step_cmd "key_usage_anomaly" "${OUT_DIR}/05_key_usage_anomaly.log" \
    npm run -s job:hosted-key-usage-anomaly -- --tenant-id "${TENANT_ID}" --window-hours "${WINDOW_HOURS}" --strict --out "${OUT_DIR}/key_usage_anomaly.json"
else
  append_step "key_usage_anomaly" "true" "${OUT_DIR}/05_key_usage_anomaly.log" "skipped"
fi

if [[ "${RUN_ALERT_DISPATCH}" == "true" ]]; then
  alert_log="${OUT_DIR}/06_alert_dispatch.log"
  if [[ "${ALERT_DISPATCH_DRY_RUN}" == "true" ]]; then
    run_step_cmd "alert_dispatch" "${alert_log}" \
      npm run -s job:hosted-alert-dispatch -- --tenant-id "${TENANT_ID}" --dry-run --out "${OUT_DIR}/alert_dispatch.json"
  else
    run_step_cmd "alert_dispatch" "${alert_log}" \
      npm run -s job:hosted-alert-dispatch -- --tenant-id "${TENANT_ID}" --strict --out "${OUT_DIR}/alert_dispatch.json"
  fi
else
  append_step "alert_dispatch" "true" "${OUT_DIR}/06_alert_dispatch.log" "skipped"
fi

if [[ "${RUN_AUDIT_SNAPSHOT}" == "true" ]]; then
  audit_log="${OUT_DIR}/07_audit_snapshot.log"
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
    curl -fsS "${BASE_URL}/v1/admin/control/dashboard/tenant/${TENANT_ID}/key-usage?window_hours=${WINDOW_HOURS}" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}" > "${OUT_DIR}/dashboard_key_usage.json"
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
  append_step "audit_snapshot" "true" "${OUT_DIR}/07_audit_snapshot.log" "skipped"
fi

evidence_log="${OUT_DIR}/08_evidence_index.log"
set +e
{
  build_evidence_index
} > "${evidence_log}" 2>&1
ec=$?
set -e
if [[ "${ec}" -eq 0 ]]; then
  append_step "evidence_index" "true" "${evidence_log}" "ok"
else
  append_step "evidence_index" "false" "${evidence_log}" "exit_code=${ec}"
fi

verify_log="${OUT_DIR}/09_evidence_verify.log"
if [[ -n "${SIGNING_KEY}" ]]; then
  run_step_cmd "evidence_verify" "${verify_log}" \
    npm run -s job:hosted-incident-verify -- --bundle-dir "${OUT_DIR}" --strict --signing-key "${SIGNING_KEY}"
else
  run_step_cmd "evidence_verify" "${verify_log}" \
    npm run -s job:hosted-incident-verify -- --bundle-dir "${OUT_DIR}" --strict
fi

publish_log="${OUT_DIR}/10_publish_bundle.log"
if [[ -n "${PUBLISH_TARGET}" ]]; then
  set +e
  {
    if [[ "${PUBLISH_ASYNC}" == "true" ]]; then
      enqueue_publish_job "${PUBLISH_TARGET}"
    else
      publish_bundle "${PUBLISH_TARGET}"
    fi
  } > "${publish_log}" 2>&1
  ec=$?
  set -e
  if [[ "${ec}" -eq 0 ]]; then
    if [[ "${PUBLISH_ASYNC}" == "true" ]]; then
      append_step "publish_bundle" "true" "${publish_log}" "queued,target=${PUBLISH_TARGET},job_id=${PUBLISH_JOB_ID}"
    else
      append_step "publish_bundle" "true" "${publish_log}" "target=${PUBLISH_TARGET},adapter=${PUBLISH_ADAPTER}"
    fi
  else
    append_step "publish_bundle" "false" "${publish_log}" "exit_code=${ec}"
  fi
else
  append_step "publish_bundle" "true" "${publish_log}" "skipped_no_publish_target"
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
  --arg publish_target "${PUBLISH_TARGET}" \
  --arg publish_async "$([[ "${PUBLISH_ASYNC}" == "true" ]] && echo true || echo false)" \
  --arg publish_job_id "${PUBLISH_JOB_ID}" \
  --arg published_uri "${PUBLISHED_URI}" \
  --arg publish_adapter "${PUBLISH_ADAPTER}" \
  --arg publish_attestation_json "${PUBLISH_ATTESTATION_JSON}" \
  --arg evidence_index "${OUT_DIR}/evidence_index.json" \
  --arg evidence_signature "${OUT_DIR}/evidence_index.sig.json" \
  --arg signed "$([[ -n "${SIGNING_KEY}" ]] && echo true || echo false)" \
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
      summary_json: ($out_dir + "/summary.json"),
      evidence_index_json: $evidence_index,
      evidence_signature_json: $evidence_signature,
      publish_target: $publish_target,
      publish_async: ($publish_async == "true"),
      publish_job_id: $publish_job_id,
      publish_adapter: $publish_adapter,
      publish_attestation_json: $publish_attestation_json,
      published_uri: $published_uri
    },
    evidence: {
      signed: ($signed == "true")
    }
  }' > "${summary}"

cat "${summary}"

if [[ "${ok}" != "true" && "${STRICT}" == "true" ]]; then
  exit 2
fi
