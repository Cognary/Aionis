#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need npm
need jq

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BASE_URL="${BASE_URL:-http://localhost:${PORT:-3001}}"
SCOPE="${SCOPE:-${MEMORY_SCOPE:-default}}"
TENANT_ID="${TENANT_ID:-${MEMORY_TENANT_ID:-default}}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/core_gate/${RUN_ID}}"
RUN_PERF="${RUN_PERF:-true}"

RECALL_P95_MAX_MS="${RECALL_P95_MAX_MS:-1200}"
WRITE_P95_MAX_MS="${WRITE_P95_MAX_MS:-800}"
ERROR_RATE_MAX="${ERROR_RATE_MAX:-0.02}"

PERF_WARMUP="${PERF_WARMUP:-10}"
PERF_RECALL_REQUESTS="${PERF_RECALL_REQUESTS:-80}"
PERF_RECALL_CONCURRENCY="${PERF_RECALL_CONCURRENCY:-6}"
PERF_WRITE_REQUESTS="${PERF_WRITE_REQUESTS:-40}"
PERF_WRITE_CONCURRENCY="${PERF_WRITE_CONCURRENCY:-3}"
PERF_TIMEOUT_MS="${PERF_TIMEOUT_MS:-20000}"
PERF_PACE_MS="${PERF_PACE_MS:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --tenant-id) TENANT_ID="${2:-}"; shift 2 ;;
    --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
    --run-perf) RUN_PERF="${2:-}"; shift 2 ;;
    --recall-p95-max-ms) RECALL_P95_MAX_MS="${2:-}"; shift 2 ;;
    --write-p95-max-ms) WRITE_P95_MAX_MS="${2:-}"; shift 2 ;;
    --error-rate-max) ERROR_RATE_MAX="${2:-}"; shift 2 ;;
    --perf-warmup) PERF_WARMUP="${2:-}"; shift 2 ;;
    --perf-recall-requests) PERF_RECALL_REQUESTS="${2:-}"; shift 2 ;;
    --perf-recall-concurrency) PERF_RECALL_CONCURRENCY="${2:-}"; shift 2 ;;
    --perf-write-requests) PERF_WRITE_REQUESTS="${2:-}"; shift 2 ;;
    --perf-write-concurrency) PERF_WRITE_CONCURRENCY="${2:-}"; shift 2 ;;
    --perf-timeout-ms) PERF_TIMEOUT_MS="${2:-}"; shift 2 ;;
    --perf-pace-ms) PERF_PACE_MS="${2:-}"; shift 2 ;;
    -h|--help)
      cat <<'USAGE'
Usage: scripts/core-production-gate.sh [options]

Core gate steps:
1) Build + contract + docs + sdk release checks
2) health-gate(scope strict warnings)
3) consistency-check(cross-tenant strict warnings)
4) perf-benchmark SLO checks (optional, enabled by default)

Options:
  --base-url <url>                   API base URL (default: http://localhost:$PORT)
  --scope <scope>                    Scope (default: MEMORY_SCOPE or default)
  --tenant-id <tenant>               Tenant id (default: MEMORY_TENANT_ID or default)
  --out-dir <dir>                    Artifact output directory
  --run-perf <true|false>            Run perf benchmark checks (default: true)
  --recall-p95-max-ms <n>            Recall p95 SLO threshold (default: 1200)
  --write-p95-max-ms <n>             Write p95 SLO threshold (default: 800)
  --error-rate-max <0..1>            Max per-case error rate (default: 0.02)
  --perf-warmup <n>                  Warmup requests (default: 10)
  --perf-recall-requests <n>         Recall requests (default: 80)
  --perf-recall-concurrency <n>      Recall concurrency (default: 6)
  --perf-write-requests <n>          Write requests (default: 40)
  --perf-write-concurrency <n>       Write concurrency (default: 3)
  --perf-timeout-ms <n>              Request timeout (default: 20000)
  --perf-pace-ms <n>                 Pace ms between requests (default: 0)
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

steps_json='[]'
fail_reasons='[]'

run_step() {
  local name="$1"
  local log_file="$2"
  shift 2
  local ok=true
  set +e
  "$@" >"${log_file}" 2>&1
  local ec=$?
  set -e
  if [[ $ec -ne 0 ]]; then ok=false; fi
  steps_json="$(echo "${steps_json}" | jq \
    --arg name "${name}" \
    --argjson ok "${ok}" \
    --argjson exit_code "${ec}" \
    --arg log_file "${log_file}" \
    '. + [{name:$name, ok:$ok, exit_code:$exit_code, log_file:$log_file}]')"
  if [[ "${ok}" != "true" ]]; then
    fail_reasons="$(echo "${fail_reasons}" | jq --arg reason "${name}" '. + [$reason]')"
  fi
}

to_number_or_zero() {
  local v="${1:-0}"
  if [[ -z "${v}" || "${v}" == "null" ]]; then
    echo "0"
  else
    echo "${v}"
  fi
}

is_gt() {
  awk -v a="$1" -v b="$2" 'BEGIN { exit !(a>b) }'
}

echo "[core-gate] out_dir=${OUT_DIR}"
echo "[core-gate] base_url=${BASE_URL} scope=${SCOPE} tenant_id=${TENANT_ID} run_perf=${RUN_PERF}"

run_step "build" "${OUT_DIR}/01_build.log" npm run -s build
run_step "contract" "${OUT_DIR}/02_contract.log" npm run -s test:contract
run_step "docs_check" "${OUT_DIR}/03_docs_check.log" npm run -s docs:check
run_step "sdk_release_check" "${OUT_DIR}/04_sdk_release_check.log" npm run -s sdk:release-check
run_step "sdk_python_release_check" "${OUT_DIR}/05_sdk_python_release_check.log" npm run -s sdk:py:release-check

run_step "health_gate_scope" "${OUT_DIR}/06_health_gate_scope.json" \
  npm run -s job:health-gate -- --scope "${SCOPE}" --strict-warnings --consistency-check-set scope

run_step "consistency_cross_tenant" "${OUT_DIR}/07_consistency_cross_tenant.json" \
  npm run -s job:consistency-check:cross-tenant -- --strict-warnings

perf_json_path=""
recall_p95="0"
write_p95="0"
max_error_rate="0"
perf_slo_ok=true

if [[ "${RUN_PERF}" == "true" ]]; then
  perf_json_path="${OUT_DIR}/08_perf_benchmark.json"
  run_step "perf_benchmark" "${perf_json_path}" \
    npm run -s job:perf-benchmark -- \
      --base-url "${BASE_URL}" \
      --scope "${SCOPE}" \
      --tenant-id "${TENANT_ID}" \
      --mode all \
      --warmup "${PERF_WARMUP}" \
      --recall-requests "${PERF_RECALL_REQUESTS}" \
      --recall-concurrency "${PERF_RECALL_CONCURRENCY}" \
      --write-requests "${PERF_WRITE_REQUESTS}" \
      --write-concurrency "${PERF_WRITE_CONCURRENCY}" \
      --timeout-ms "${PERF_TIMEOUT_MS}" \
      --pace-ms "${PERF_PACE_MS}"

  if [[ -f "${perf_json_path}" ]] && jq -e . >/dev/null 2>&1 < "${perf_json_path}"; then
    recall_p95="$(to_number_or_zero "$(jq -r '.cases[]? | select(.name=="recall_text") | .latency_ms.p95 // 0' "${perf_json_path}")")"
    write_p95="$(to_number_or_zero "$(jq -r '.cases[]? | select(.name=="write") | .latency_ms.p95 // 0' "${perf_json_path}")")"
    max_error_rate="$(to_number_or_zero "$(jq -r '[.cases[]? | if (.total // 0) > 0 then ((.failed // 0) / (.total // 1)) else 0 end] | max // 0' "${perf_json_path}")")"

    if is_gt "${recall_p95}" "${RECALL_P95_MAX_MS}"; then
      perf_slo_ok=false
      fail_reasons="$(echo "${fail_reasons}" | jq '. + ["perf_recall_p95_slo"]')"
    fi
    if is_gt "${write_p95}" "${WRITE_P95_MAX_MS}"; then
      perf_slo_ok=false
      fail_reasons="$(echo "${fail_reasons}" | jq '. + ["perf_write_p95_slo"]')"
    fi
    if is_gt "${max_error_rate}" "${ERROR_RATE_MAX}"; then
      perf_slo_ok=false
      fail_reasons="$(echo "${fail_reasons}" | jq '. + ["perf_error_rate_slo"]')"
    fi
  else
    perf_slo_ok=false
    fail_reasons="$(echo "${fail_reasons}" | jq '. + ["perf_output_invalid"]')"
  fi
fi

ok=true
if [[ "$(echo "${fail_reasons}" | jq 'length')" != "0" ]]; then
  ok=false
fi

summary_json="${OUT_DIR}/summary.json"
jq -n \
  --arg run_id "${RUN_ID}" \
  --arg timestamp_utc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg base_url "${BASE_URL}" \
  --arg scope "${SCOPE}" \
  --arg tenant_id "${TENANT_ID}" \
  --argjson run_perf "$([[ "${RUN_PERF}" == "true" ]] && echo true || echo false)" \
  --argjson recall_p95_max_ms "${RECALL_P95_MAX_MS}" \
  --argjson write_p95_max_ms "${WRITE_P95_MAX_MS}" \
  --argjson error_rate_max "${ERROR_RATE_MAX}" \
  --argjson recall_p95 "${recall_p95}" \
  --argjson write_p95 "${write_p95}" \
  --argjson max_error_rate "${max_error_rate}" \
  --argjson perf_slo_ok "$([[ "${perf_slo_ok}" == "true" ]] && echo true || echo false)" \
  --argjson steps "${steps_json}" \
  --argjson fail_reasons "${fail_reasons}" \
  --argjson ok "$([[ "${ok}" == "true" ]] && echo true || echo false)" \
  --arg out_dir "${OUT_DIR}" \
  '{
    ok: $ok,
    run_id: $run_id,
    timestamp_utc: $timestamp_utc,
    gate_class: "production_core",
    target: { base_url: $base_url, scope: $scope, tenant_id: $tenant_id },
    blocking_metrics: {
      integrity: [
        "health_gate_scope(strict_warnings)",
        "consistency_cross_tenant(strict_warnings)"
      ],
      availability_and_slo: {
        run_perf: $run_perf,
        thresholds: {
          recall_p95_max_ms: $recall_p95_max_ms,
          write_p95_max_ms: $write_p95_max_ms,
          error_rate_max: $error_rate_max
        },
        observed: {
          recall_p95_ms: $recall_p95,
          write_p95_ms: $write_p95,
          max_error_rate: $max_error_rate
        },
        pass: $perf_slo_ok
      }
    },
    aux_regression_only: [
      "LongMemEval",
      "LoCoMo"
    ],
    steps: $steps,
    fail_reasons: $fail_reasons,
    artifacts: {
      out_dir: $out_dir,
      summary_json: ($out_dir + "/summary.json")
    }
  }' > "${summary_json}"

cat "${summary_json}"

if [[ "${ok}" != "true" ]]; then
  exit 2
fi
