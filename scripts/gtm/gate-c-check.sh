#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need npm
need curl
need jq
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

float_gt() {
  awk -v a="$1" -v b="$2" 'BEGIN{exit !(a>b)}'
}

float_max() {
  local a="$1"
  local b="$2"
  if float_gt "$a" "$b"; then
    echo "$a"
  else
    echo "$b"
  fi
}

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
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/gtm/gate_c/${RUN_ID}}"

GATEC_FAIL_ON_FAIL="${GATEC_FAIL_ON_FAIL:-false}"
START_SERVICES_IF_NEEDED="${START_SERVICES_IF_NEEDED:-}"
GATEC_RUN_HEALTH="${GATEC_RUN_HEALTH:-true}"
GATEC_RUN_PERF="${GATEC_RUN_PERF:-true}"

GATEC_PERF_PROFILE="${GATEC_PERF_PROFILE:-balanced}"
GATEC_SCALES="${GATEC_SCALES:-100000}"
GATEC_SCOPE_STRATEGY="${GATEC_SCOPE_STRATEGY:-isolated}"
GATEC_RESET_MODE="${GATEC_RESET_MODE:-auto}"
GATEC_PERF_OFFLINE_WINDOW="${GATEC_PERF_OFFLINE_WINDOW:-false}"
GATEC_RESET_IMPL="${GATEC_RESET_IMPL:-scope_purge}" # scope_purge|perf_seed
GATEC_RESET_PURGE_MODE="${GATEC_RESET_PURGE_MODE:-partition}" # auto|partition|delete
GATEC_RESET_PURGE_ALLOW_FALLBACK_DELETE="${GATEC_RESET_PURGE_ALLOW_FALLBACK_DELETE:-false}"
GATEC_RESET_PURGE_FAIL_ON_DELETE="${GATEC_RESET_PURGE_FAIL_ON_DELETE:-true}"
GATEC_ENFORCE_PARTITION_FIRST_RESET="${GATEC_ENFORCE_PARTITION_FIRST_RESET:-true}"
GATEC_PERF_DIR="${GATEC_PERF_DIR:-${OUT_DIR}/perf}"
GATEC_REQUIRE_SCALE="${GATEC_REQUIRE_SCALE:-}"
GATEC_REQUIRE_PARTITION_SHADOW_READY="${GATEC_REQUIRE_PARTITION_SHADOW_READY:-false}"
GATEC_PARTITION_SCOPE="${GATEC_PARTITION_SCOPE:-${MEMORY_SCOPE:-default}}"
GATEC_PARTITION_TENANT_ID="${GATEC_PARTITION_TENANT_ID:-${MEMORY_TENANT_ID:-default}}"
GATEC_PARTITION_DUAL_WRITE_ENABLED="${GATEC_PARTITION_DUAL_WRITE_ENABLED:-${MEMORY_SHADOW_DUAL_WRITE_ENABLED:-false}}"
GATEC_PARTITION_READ_SHADOW_CHECK="${GATEC_PARTITION_READ_SHADOW_CHECK:-false}"
GATEC_PARTITION_READ_SHADOW_LIMIT="${GATEC_PARTITION_READ_SHADOW_LIMIT:-20}"
GATEC_PARTITION_READ_SHADOW_MIN_OVERLAP="${GATEC_PARTITION_READ_SHADOW_MIN_OVERLAP:-0.95}"

GATEC_REQUIRE_RECALL_CASE="${GATEC_REQUIRE_RECALL_CASE:-true}"
GATEC_REQUIRE_WRITE_CASE="${GATEC_REQUIRE_WRITE_CASE:-false}"
GATEC_SLO_RECALL_P95_MS="${GATEC_SLO_RECALL_P95_MS:-800}"
GATEC_SLO_WRITE_P95_MS="${GATEC_SLO_WRITE_P95_MS:-300}"
GATEC_SLO_MAX_ERROR_RATE="${GATEC_SLO_MAX_ERROR_RATE:-0.03}"
GATEC_AUTO_ADAPT_RATE_LIMIT="${GATEC_AUTO_ADAPT_RATE_LIMIT:-true}"
GATEC_MAX_RATE_LIMIT_RETRIES="${GATEC_MAX_RATE_LIMIT_RETRIES:-}"
GATEC_BENCH_PACE_MS="${GATEC_BENCH_PACE_MS:-}"
GATEC_PACE_STEP_MS="${GATEC_PACE_STEP_MS:-25}"
GATEC_PACE_MAX_MS="${GATEC_PACE_MAX_MS:-2000}"

AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
PERF_API_KEY="${PERF_API_KEY:-${API_KEY:-}}"
PERF_AUTH_BEARER="${PERF_AUTH_BEARER:-${AUTH_BEARER:-}}"

if [[ -z "${GATEC_MAX_RATE_LIMIT_RETRIES}" ]]; then
  case "${GATEC_PERF_PROFILE}" in
    recall_slo|write_slo)
      GATEC_MAX_RATE_LIMIT_RETRIES=10
      ;;
    *)
      GATEC_MAX_RATE_LIMIT_RETRIES=4
      ;;
  esac
fi
if [[ -z "${GATEC_BENCH_PACE_MS}" ]]; then
  case "${GATEC_PERF_PROFILE}" in
    recall_slo)
      GATEC_BENCH_PACE_MS=50
      ;;
    write_slo)
      GATEC_BENCH_PACE_MS=150
      ;;
    *)
      GATEC_BENCH_PACE_MS=0
      ;;
  esac
fi

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

if [[ -z "${GATEC_REQUIRE_SCALE}" ]]; then
  req=0
  for s in $(echo "${GATEC_SCALES}" | tr ',' ' '); do
    if [[ "${s}" =~ ^[0-9]+$ ]] && [[ "${s}" -gt "${req}" ]]; then
      req="${s}"
    fi
  done
  if [[ "${req}" -gt 0 ]]; then
    GATEC_REQUIRE_SCALE="${req}"
  fi
fi

mkdir -p "${OUT_DIR}"

API_LOG="${OUT_DIR}/00_api.log"
HEALTH_JSON="${OUT_DIR}/01_health_gate.json"
PERF_LOG="${OUT_DIR}/02_perf_matrix.log"
SUMMARY_JSON="${OUT_DIR}/summary.json"

started_api=false
api_pid=""
api_healthy=false
api_bootstrapped=false

cleanup() {
  if [[ "${started_api}" == "true" && -n "${api_pid}" ]]; then
    kill "${api_pid}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

GATEC_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
GATEC_STARTED_MS="$(now_ms)"

health_gate_script_exists=false
perf_matrix_script_exists=false
perf_report_script_exists=false
[[ -x "${ROOT_DIR}/scripts/health-gate.sh" ]] && health_gate_script_exists=true
[[ -x "${ROOT_DIR}/scripts/perf/phase-d-matrix.sh" ]] && perf_matrix_script_exists=true
[[ -f "${ROOT_DIR}/src/jobs/perf-report.ts" ]] && perf_report_script_exists=true

if curl -fsS "${BASE_URL}/health" > "${OUT_DIR}/00_health.json" 2> "${OUT_DIR}/00_health.err"; then
  api_healthy=true
elif [[ "${START_SERVICES_IF_NEEDED}" == "true" ]]; then
  npm run -s start > "${API_LOG}" 2>&1 &
  api_pid="$!"
  started_api=true
  if wait_health; then
    if curl -fsS "${BASE_URL}/health" > "${OUT_DIR}/00_health.json" 2> "${OUT_DIR}/00_health.err"; then
      api_healthy=true
      api_bootstrapped=true
    fi
  fi
fi

health_gate_ok=false
health_gate_exit=-1
if [[ "${GATEC_RUN_HEALTH}" == "true" ]]; then
  set +e
  npm run -s job:health-gate -- --strict-warnings > "${HEALTH_JSON}" 2> "${OUT_DIR}/01_health_gate.err"
  health_gate_exit=$?
  set -e
  [[ "${health_gate_exit}" -eq 0 ]] && health_gate_ok=true
else
  health_gate_exit=0
  health_gate_ok=true
fi

perf_run_ok=false
perf_run_exit=-1
purge_files_found=0
purge_delete_strategy_tables_total=0
reset_policy_inputs_ok=true
reset_policy_runtime_ok=true
reset_policy_ok=true
partition_shadow_ready_ok=true
partition_shadow_summary_path=""
partition_shadow_gate_enforced=false
if [[ "${GATEC_REQUIRE_PARTITION_SHADOW_READY}" == "true" ]]; then
  partition_shadow_gate_enforced=true
  partition_shadow_dir="${OUT_DIR}/partition_shadow"
  mkdir -p "${partition_shadow_dir}"
  set +e
  OUT_DIR="${partition_shadow_dir}" \
  RUN_ID="${RUN_ID}" \
  SCOPE="${GATEC_PARTITION_SCOPE}" \
  TENANT_ID="${GATEC_PARTITION_TENANT_ID}" \
  MEMORY_SHADOW_DUAL_WRITE_ENABLED="${GATEC_PARTITION_DUAL_WRITE_ENABLED}" \
  READ_SHADOW_CHECK="${GATEC_PARTITION_READ_SHADOW_CHECK}" \
  READ_SHADOW_LIMIT="${GATEC_PARTITION_READ_SHADOW_LIMIT}" \
  READ_SHADOW_MIN_OVERLAP="${GATEC_PARTITION_READ_SHADOW_MIN_OVERLAP}" \
  FAIL_ON_FAIL=true \
  bash "${ROOT_DIR}/scripts/admin/partition-cutover-readiness.sh" > "${partition_shadow_dir}/01_partition_shadow.log" 2>&1
  partition_rc=$?
  set -e
  partition_shadow_summary_path="${partition_shadow_dir}/summary.json"
  if [[ "${partition_rc}" -ne 0 ]]; then
    partition_shadow_ready_ok=false
  fi
fi

if [[ "${GATEC_RUN_PERF}" == "true" ]]; then
  mkdir -p "${GATEC_PERF_DIR}"
  set +e
  SCALES="${GATEC_SCALES}" \
  PERF_PROFILE="${GATEC_PERF_PROFILE}" \
  SCOPE_STRATEGY="${GATEC_SCOPE_STRATEGY}" \
  RESET_MODE="${GATEC_RESET_MODE}" \
  PERF_OFFLINE_WINDOW="${GATEC_PERF_OFFLINE_WINDOW}" \
  RESET_IMPL="${GATEC_RESET_IMPL}" \
  RESET_PURGE_MODE="${GATEC_RESET_PURGE_MODE}" \
  RESET_PURGE_ALLOW_FALLBACK_DELETE="${GATEC_RESET_PURGE_ALLOW_FALLBACK_DELETE}" \
  RESET_PURGE_FAIL_ON_DELETE="${GATEC_RESET_PURGE_FAIL_ON_DELETE}" \
  MATRIX_TAG="${RUN_ID}" \
  BASE_URL="${BASE_URL}" \
  OUT_DIR="${GATEC_PERF_DIR}" \
  PERF_API_KEY="${PERF_API_KEY}" \
  PERF_AUTH_BEARER="${PERF_AUTH_BEARER}" \
  SLO_RECALL_P95_MS="${GATEC_SLO_RECALL_P95_MS}" \
  SLO_WRITE_P95_MS="${GATEC_SLO_WRITE_P95_MS}" \
  SLO_MAX_ERROR_RATE="${GATEC_SLO_MAX_ERROR_RATE}" \
  AUTO_ADAPT_RATE_LIMIT="${GATEC_AUTO_ADAPT_RATE_LIMIT}" \
  MAX_RATE_LIMIT_RETRIES="${GATEC_MAX_RATE_LIMIT_RETRIES}" \
  BENCH_PACE_MS="${GATEC_BENCH_PACE_MS}" \
  PACE_STEP_MS="${GATEC_PACE_STEP_MS}" \
  PACE_MAX_MS="${GATEC_PACE_MAX_MS}" \
  npm run -s perf:phase-d-matrix > "${PERF_LOG}" 2>&1
  perf_run_exit=$?
  set -e
  [[ "${perf_run_exit}" -eq 0 ]] && perf_run_ok=true
else
  perf_run_exit=0
  [[ -d "${GATEC_PERF_DIR}" ]] && perf_run_ok=true
fi

if [[ "${GATEC_RUN_PERF}" == "true" ]]; then
  while IFS= read -r pf; do
    [[ -z "${pf}" ]] && continue
    purge_files_found=$((purge_files_found + 1))
    d="$(jq -r '.totals.delete_strategy_tables // .totals.delete_tables // 0' "${pf}" 2>/dev/null || echo 0)"
    purge_delete_strategy_tables_total=$((purge_delete_strategy_tables_total + d))
  done < <(find "${GATEC_PERF_DIR}" -maxdepth 1 -type f -name 'purge_*.json' | sort)
fi

if [[ "${GATEC_ENFORCE_PARTITION_FIRST_RESET}" == "true" ]]; then
  if [[ "${GATEC_RESET_IMPL}" != "scope_purge" || "${GATEC_RESET_PURGE_FAIL_ON_DELETE}" != "true" ]]; then
    reset_policy_inputs_ok=false
  fi
  if [[ "${purge_delete_strategy_tables_total}" -gt 0 ]]; then
    reset_policy_runtime_ok=false
  fi
fi
if [[ "${reset_policy_inputs_ok}" != "true" || "${reset_policy_runtime_ok}" != "true" ]]; then
  reset_policy_ok=false
fi

benchmark_files_found=0
process_benchmark_files_found=0
perf_report_exists=false
if [[ -f "${GATEC_PERF_DIR}/PERFORMANCE_REPORT_V1.md" ]]; then
  perf_report_exists=true
fi

if [[ -n "${GATEC_REQUIRE_SCALE}" ]]; then
  required_scale_present=false
else
  required_scale_present=true
fi

recall_case_count=0
write_case_count=0
max_recall_p95=0
max_write_p95=0
max_case_error_rate=0
max_case_429_rate=0
max_case_non429_error_rate=0
status_429_total=0
status_5xx_total=0
status_non429_errors_total=0
process_max_case_error_rate=0
process_max_case_429_rate=0
process_max_case_non429_error_rate=0
process_status_429_total=0
process_status_5xx_total=0
process_status_non429_errors_total=0
adapt_files_found=0
adaptive_metrics_complete=true
adaptive_rate_limit_json='{"count":0,"scales_with_retries":0,"retries_total":0,"exhausted_count":0,"max_final_pace_ms":0,"min_final_recall_concurrency":0,"min_final_write_concurrency":0,"final_429_total":0,"final_429_rate_max":0,"per_scale":[]}'

recall_slo_pass=true
write_slo_pass=true
error_rate_pass=true
steady_state_error_rate_pass=true
process_error_rate_over_budget=false

final_benchmark_files=()
process_benchmark_files=()
while IFS= read -r bf; do
  [[ -z "${bf}" ]] && continue
  bn="$(basename "${bf}")"
  if [[ "${bn}" =~ ^benchmark_[0-9]+\.json$ ]]; then
    final_benchmark_files+=("${bf}")
    process_benchmark_files+=("${bf}")
  elif [[ "${bn}" =~ ^benchmark_[0-9]+_attempt[0-9]+\.json$ ]]; then
    process_benchmark_files+=("${bf}")
  fi
done < <(
  if [[ -d "${GATEC_PERF_DIR}" ]]; then
    find "${GATEC_PERF_DIR}" -maxdepth 1 -type f -name 'benchmark_*.json' | sort
  fi
)
benchmark_files_found="${#final_benchmark_files[@]}"
process_benchmark_files_found="${#process_benchmark_files[@]}"

for f in "${final_benchmark_files[@]}"; do
  [[ -z "${f}" ]] && continue

  if [[ -n "${GATEC_REQUIRE_SCALE}" ]]; then
    scale="$(basename "${f}" | sed -E 's/^benchmark_([0-9]+)\.json$/\1/')"
    if [[ "${scale}" == "${GATEC_REQUIRE_SCALE}" ]]; then
      required_scale_present=true
    fi
  fi

  while IFS=$'\t' read -r p95 failed total; do
    [[ -z "${p95}" ]] && continue
    recall_case_count=$((recall_case_count + 1))
    max_recall_p95="$(float_max "${max_recall_p95}" "${p95}")"
    if float_gt "${p95}" "${GATEC_SLO_RECALL_P95_MS}"; then
      recall_slo_pass=false
    fi
    rate="$(awk -v failed="${failed}" -v total="${total}" 'BEGIN{if (total>0) printf "%.9f", (failed/total); else printf "0"}')"
    max_case_error_rate="$(float_max "${max_case_error_rate}" "${rate}")"
  done < <(jq -r '.cases[]? | select(.name=="recall_text") | "\(.latency_ms.p95 // 0)\t\(.failed // 0)\t\(.total // 0)"' "${f}")

  while IFS=$'\t' read -r p95 failed total; do
    [[ -z "${p95}" ]] && continue
    write_case_count=$((write_case_count + 1))
    max_write_p95="$(float_max "${max_write_p95}" "${p95}")"
    if float_gt "${p95}" "${GATEC_SLO_WRITE_P95_MS}"; then
      write_slo_pass=false
    fi
    rate="$(awk -v failed="${failed}" -v total="${total}" 'BEGIN{if (total>0) printf "%.9f", (failed/total); else printf "0"}')"
    max_case_error_rate="$(float_max "${max_case_error_rate}" "${rate}")"
  done < <(jq -r '.cases[]? | select(.name=="write") | "\(.latency_ms.p95 // 0)\t\(.failed // 0)\t\(.total // 0)"' "${f}")

  c429="$(jq -r '([.cases[]? | (.by_status["429"] // 0)] | add) // 0' "${f}")"
  c5xx="$(jq -r '([.cases[]? | ((.by_status // {}) | to_entries[]? | select((.key|tonumber?) >= 500 and (.key|tonumber?) <= 599) | (.value // 0))] | add) // 0' "${f}")"
  cfailed="$(jq -r '([.cases[]? | (.failed // 0)] | add) // 0' "${f}")"
  c429_rate_max="$(jq -r '([.cases[]? | (((.by_status["429"] // 0) / (if (.total // 0) > 0 then (.total // 0) else 1 end)))] | max) // 0' "${f}")"
  c_non429_rate_max="$(jq -r '([.cases[]? | ((((.failed // 0) - (.by_status["429"] // 0)) / (if (.total // 0) > 0 then (.total // 0) else 1 end)))] | max) // 0' "${f}")"
  c_non429="$((cfailed - c429))"
  if [[ "${c_non429}" -lt 0 ]]; then c_non429=0; fi
  status_429_total=$((status_429_total + c429))
  status_5xx_total=$((status_5xx_total + c5xx))
  status_non429_errors_total=$((status_non429_errors_total + c_non429))
  max_case_429_rate="$(float_max "${max_case_429_rate}" "${c429_rate_max}")"
  max_case_non429_error_rate="$(float_max "${max_case_non429_error_rate}" "${c_non429_rate_max}")"
done

for f in "${process_benchmark_files[@]}"; do
  [[ -z "${f}" ]] && continue
  while IFS=$'\t' read -r failed total; do
    [[ -z "${failed}" ]] && continue
    rate="$(awk -v failed="${failed}" -v total="${total}" 'BEGIN{if (total>0) printf "%.9f", (failed/total); else printf "0"}')"
    process_max_case_error_rate="$(float_max "${process_max_case_error_rate}" "${rate}")"
  done < <(jq -r '.cases[]? | "\(.failed // 0)\t\(.total // 0)"' "${f}")

  c429="$(jq -r '([.cases[]? | (.by_status["429"] // 0)] | add) // 0' "${f}")"
  c5xx="$(jq -r '([.cases[]? | ((.by_status // {}) | to_entries[]? | select((.key|tonumber?) >= 500 and (.key|tonumber?) <= 599) | (.value // 0))] | add) // 0' "${f}")"
  cfailed="$(jq -r '([.cases[]? | (.failed // 0)] | add) // 0' "${f}")"
  c429_rate_max="$(jq -r '([.cases[]? | (((.by_status["429"] // 0) / (if (.total // 0) > 0 then (.total // 0) else 1 end)))] | max) // 0' "${f}")"
  c_non429_rate_max="$(jq -r '([.cases[]? | ((((.failed // 0) - (.by_status["429"] // 0)) / (if (.total // 0) > 0 then (.total // 0) else 1 end)))] | max) // 0' "${f}")"
  c_non429="$((cfailed - c429))"
  if [[ "${c_non429}" -lt 0 ]]; then c_non429=0; fi
  process_status_429_total=$((process_status_429_total + c429))
  process_status_5xx_total=$((process_status_5xx_total + c5xx))
  process_status_non429_errors_total=$((process_status_non429_errors_total + c_non429))
  process_max_case_429_rate="$(float_max "${process_max_case_429_rate}" "${c429_rate_max}")"
  process_max_case_non429_error_rate="$(float_max "${process_max_case_non429_error_rate}" "${c_non429_rate_max}")"
done

adapt_files=()
while IFS= read -r af; do
  [[ -z "${af}" ]] && continue
  adapt_files+=("${af}")
done < <(
  if [[ -d "${GATEC_PERF_DIR}" ]]; then
    find "${GATEC_PERF_DIR}" -maxdepth 1 -type f -name 'benchmark_adapt_*.json' | sort
  fi
)
adapt_files_found="${#adapt_files[@]}"
if [[ "${adapt_files_found}" -gt 0 ]]; then
  adaptive_rate_limit_json="$(jq -s '
    {
      count: length,
      scales_with_retries: ([.[] | select((.retries_used // 0) > 0)] | length),
      retries_total: ([.[].retries_used // 0] | add // 0),
      exhausted_count: ([.[] | select(.exhausted == true)] | length),
      max_final_pace_ms: ([.[].final.pace_ms // 0] | max // 0),
      min_final_recall_concurrency: ([.[].final.recall_concurrency // 0] | min // 0),
      min_final_write_concurrency: ([.[].final.write_concurrency // 0] | min // 0),
      final_429_total: ([.[].final.last_429 // 0] | add // 0),
      final_429_rate_max: ([.[].final.last_429_rate // 0] | max // 0),
      per_scale: [
        .[] | {
          scale,
          retries_used: (.retries_used // 0),
          exhausted: (.exhausted // false),
          initial: (.initial // {}),
          final: (.final // {})
        }
      ]
    }' "${adapt_files[@]}")"
fi
if [[ "${benchmark_files_found}" -gt 0 && "${adapt_files_found}" -lt "${benchmark_files_found}" ]]; then
  adaptive_metrics_complete=false
fi

steady_429_rate_from_adapt=0
if [[ "${adapt_files_found}" -gt 0 ]]; then
  steady_429_rate_from_adapt="$(jq -r '.final_429_rate_max // 0' <<< "${adaptive_rate_limit_json}")"
fi
effective_steady_429_rate="${max_case_429_rate}"
if [[ "${adapt_files_found}" -gt 0 && "${adapt_files_found}" -eq "${benchmark_files_found}" ]]; then
  effective_steady_429_rate="${steady_429_rate_from_adapt}"
fi
effective_steady_error_rate="${effective_steady_429_rate}"
effective_steady_error_rate="$(float_max "${effective_steady_error_rate}" "${max_case_non429_error_rate}")"
if float_gt "${effective_steady_error_rate}" "${GATEC_SLO_MAX_ERROR_RATE}"; then
  steady_state_error_rate_pass=false
fi
error_rate_pass="${steady_state_error_rate_pass}"
if float_gt "${process_max_case_error_rate}" "${GATEC_SLO_MAX_ERROR_RATE}"; then
  process_error_rate_over_budget=true
fi

acceptable_429_within_budget=false
steady_case_429_over_budget=false
steady_case_non429_over_budget=false
if float_gt "${effective_steady_429_rate}" "${GATEC_SLO_MAX_ERROR_RATE}"; then
  steady_case_429_over_budget=true
fi
if float_gt "${max_case_non429_error_rate}" "${GATEC_SLO_MAX_ERROR_RATE}"; then
  steady_case_non429_over_budget=true
fi
if [[ "${status_429_total}" -gt 0 \
   && "${status_5xx_total}" -eq 0 \
   && "${steady_case_429_over_budget}" == "false" \
   && "${steady_case_non429_over_budget}" == "false" ]]; then
  acceptable_429_within_budget=true
fi

process_case_429_over_budget=false
process_case_non429_over_budget=false
if float_gt "${process_max_case_429_rate}" "${GATEC_SLO_MAX_ERROR_RATE}"; then
  process_case_429_over_budget=true
fi
if float_gt "${process_max_case_non429_error_rate}" "${GATEC_SLO_MAX_ERROR_RATE}"; then
  process_case_non429_over_budget=true
fi

recall_requirement_met=true
write_requirement_met=true
if [[ "${GATEC_REQUIRE_RECALL_CASE}" == "true" && "${recall_case_count}" -eq 0 ]]; then
  recall_requirement_met=false
fi
if [[ "${GATEC_REQUIRE_WRITE_CASE}" == "true" && "${write_case_count}" -eq 0 ]]; then
  write_requirement_met=false
fi

gate_pass=false
if [[ "${health_gate_script_exists}" == "true" \
   && "${perf_matrix_script_exists}" == "true" \
   && "${perf_report_script_exists}" == "true" \
   && "${api_healthy}" == "true" \
   && "${health_gate_ok}" == "true" \
   && "${partition_shadow_ready_ok}" == "true" \
   && "${perf_run_ok}" == "true" \
   && "${reset_policy_ok}" == "true" \
   && "${benchmark_files_found}" -gt 0 \
   && "${perf_report_exists}" == "true" \
   && "${required_scale_present}" == "true" \
   && "${recall_requirement_met}" == "true" \
   && "${write_requirement_met}" == "true" \
   && "${recall_slo_pass}" == "true" \
   && "${write_slo_pass}" == "true" \
   && "${error_rate_pass}" == "true" ]]; then
  gate_pass=true
fi

GATEC_ENDED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
GATEC_ENDED_MS="$(now_ms)"
gate_duration_ms="$((GATEC_ENDED_MS - GATEC_STARTED_MS))"

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg base_url "${BASE_URL}" \
  --arg app_env "${APP_ENV}" \
  --arg auth_mode "${AUTH_MODE}" \
  --arg started_at "${GATEC_STARTED_AT}" \
  --arg ended_at "${GATEC_ENDED_AT}" \
  --arg perf_dir "${GATEC_PERF_DIR}" \
  --arg perf_profile "${GATEC_PERF_PROFILE}" \
  --arg perf_scales "${GATEC_SCALES}" \
  --arg require_scale "${GATEC_REQUIRE_SCALE}" \
  --arg reset_impl "${GATEC_RESET_IMPL}" \
  --arg reset_purge_mode "${GATEC_RESET_PURGE_MODE}" \
  --arg reset_purge_allow_fallback_delete "${GATEC_RESET_PURGE_ALLOW_FALLBACK_DELETE}" \
  --arg reset_purge_fail_on_delete "${GATEC_RESET_PURGE_FAIL_ON_DELETE}" \
  --arg partition_dual_write_enabled "${GATEC_PARTITION_DUAL_WRITE_ENABLED}" \
  --arg partition_read_shadow_check "${GATEC_PARTITION_READ_SHADOW_CHECK}" \
  --argjson partition_read_shadow_limit "${GATEC_PARTITION_READ_SHADOW_LIMIT}" \
  --argjson partition_read_shadow_min_overlap "${GATEC_PARTITION_READ_SHADOW_MIN_OVERLAP}" \
  --argjson run_health "$([[ "${GATEC_RUN_HEALTH}" == "true" ]] && echo true || echo false)" \
  --argjson run_perf "$([[ "${GATEC_RUN_PERF}" == "true" ]] && echo true || echo false)" \
  --argjson started_api "$([[ "${started_api}" == "true" ]] && echo true || echo false)" \
  --argjson api_bootstrapped "$([[ "${api_bootstrapped}" == "true" ]] && echo true || echo false)" \
  --argjson health_gate_script_exists "${health_gate_script_exists}" \
  --argjson perf_matrix_script_exists "${perf_matrix_script_exists}" \
  --argjson perf_report_script_exists "${perf_report_script_exists}" \
  --argjson api_healthy "${api_healthy}" \
  --argjson health_gate_ok "${health_gate_ok}" \
  --argjson perf_run_ok "${perf_run_ok}" \
  --argjson perf_report_exists "${perf_report_exists}" \
  --argjson partition_shadow_gate_enforced "${partition_shadow_gate_enforced}" \
  --argjson partition_shadow_ready_ok "${partition_shadow_ready_ok}" \
  --argjson enforce_partition_first_reset "$([[ "${GATEC_ENFORCE_PARTITION_FIRST_RESET}" == "true" ]] && echo true || echo false)" \
  --argjson reset_policy_ok "${reset_policy_ok}" \
  --argjson reset_policy_inputs_ok "${reset_policy_inputs_ok}" \
  --argjson reset_policy_runtime_ok "${reset_policy_runtime_ok}" \
  --arg partition_shadow_summary_path "${partition_shadow_summary_path}" \
  --argjson required_scale_present "${required_scale_present}" \
  --argjson recall_requirement_met "${recall_requirement_met}" \
  --argjson write_requirement_met "${write_requirement_met}" \
  --argjson recall_slo_pass "${recall_slo_pass}" \
  --argjson write_slo_pass "${write_slo_pass}" \
  --argjson error_rate_pass "${error_rate_pass}" \
  --argjson steady_state_error_rate_pass "${steady_state_error_rate_pass}" \
  --argjson effective_steady_error_rate "${effective_steady_error_rate}" \
  --argjson effective_steady_429_rate "${effective_steady_429_rate}" \
  --argjson steady_case_429_over_budget "${steady_case_429_over_budget}" \
  --argjson steady_case_non429_over_budget "${steady_case_non429_over_budget}" \
  --argjson benchmark_files_found "${benchmark_files_found}" \
  --argjson process_benchmark_files_found "${process_benchmark_files_found}" \
  --argjson recall_case_count "${recall_case_count}" \
  --argjson write_case_count "${write_case_count}" \
  --argjson max_recall_p95 "${max_recall_p95}" \
  --argjson max_write_p95 "${max_write_p95}" \
  --argjson max_case_error_rate "${max_case_error_rate}" \
  --argjson max_case_429_rate "${max_case_429_rate}" \
  --argjson max_case_non429_error_rate "${max_case_non429_error_rate}" \
  --argjson status_429_total "${status_429_total}" \
  --argjson status_5xx_total "${status_5xx_total}" \
  --argjson status_non429_errors_total "${status_non429_errors_total}" \
  --argjson process_max_case_error_rate "${process_max_case_error_rate}" \
  --argjson process_max_case_429_rate "${process_max_case_429_rate}" \
  --argjson process_max_case_non429_error_rate "${process_max_case_non429_error_rate}" \
  --argjson process_status_429_total "${process_status_429_total}" \
  --argjson process_status_5xx_total "${process_status_5xx_total}" \
  --argjson process_status_non429_errors_total "${process_status_non429_errors_total}" \
  --argjson acceptable_429_within_budget "${acceptable_429_within_budget}" \
  --argjson process_error_rate_over_budget "${process_error_rate_over_budget}" \
  --argjson process_case_429_over_budget "${process_case_429_over_budget}" \
  --argjson process_case_non429_over_budget "${process_case_non429_over_budget}" \
  --argjson adapt_files_found "${adapt_files_found}" \
  --argjson adaptive_metrics_complete "${adaptive_metrics_complete}" \
  --argjson adaptive_rate_limit "${adaptive_rate_limit_json}" \
  --argjson purge_files_found "${purge_files_found}" \
  --argjson purge_delete_strategy_tables_total "${purge_delete_strategy_tables_total}" \
  --argjson health_gate_exit "${health_gate_exit}" \
  --argjson perf_run_exit "${perf_run_exit}" \
  --argjson slo_recall_p95_ms "${GATEC_SLO_RECALL_P95_MS}" \
  --argjson slo_write_p95_ms "${GATEC_SLO_WRITE_P95_MS}" \
  --argjson slo_max_error_rate "${GATEC_SLO_MAX_ERROR_RATE}" \
  --argjson auto_adapt_rate_limit "$([[ "${GATEC_AUTO_ADAPT_RATE_LIMIT}" == "true" ]] && echo true || echo false)" \
  --argjson max_rate_limit_retries "${GATEC_MAX_RATE_LIMIT_RETRIES}" \
  --argjson bench_pace_ms "${GATEC_BENCH_PACE_MS}" \
  --argjson pace_step_ms "${GATEC_PACE_STEP_MS}" \
  --argjson pace_max_ms "${GATEC_PACE_MAX_MS}" \
  --argjson require_recall_case "$([[ "${GATEC_REQUIRE_RECALL_CASE}" == "true" ]] && echo true || echo false)" \
  --argjson require_write_case "$([[ "${GATEC_REQUIRE_WRITE_CASE}" == "true" ]] && echo true || echo false)" \
  --argjson gate_duration_ms "${gate_duration_ms}" \
  --argjson gate_pass "${gate_pass}" \
  '{
    ok: true,
    run_id: $run_id,
    out_dir: $out_dir,
    base_url: $base_url,
    app_env: $app_env,
    auth_mode: $auth_mode,
    started_at: $started_at,
    ended_at: $ended_at,
    mode: {
      run_health: $run_health,
      run_perf: $run_perf
    },
    services: {
      started_api: $started_api,
      api_bootstrapped: $api_bootstrapped
    },
    inputs: {
      perf_dir: $perf_dir,
      perf_profile: $perf_profile,
      perf_scales: $perf_scales,
      require_scale: (if ($require_scale|length)>0 then $require_scale else null end),
      reset_impl: $reset_impl,
      reset_purge_mode: $reset_purge_mode,
      reset_purge_allow_fallback_delete: ($reset_purge_allow_fallback_delete == "true"),
      reset_purge_fail_on_delete: ($reset_purge_fail_on_delete == "true"),
      partition_dual_write_enabled: ($partition_dual_write_enabled == "true"),
      partition_read_shadow_check: ($partition_read_shadow_check == "true"),
      partition_read_shadow_limit: $partition_read_shadow_limit,
      partition_read_shadow_min_overlap: $partition_read_shadow_min_overlap,
      slo_recall_p95_ms: $slo_recall_p95_ms,
      slo_write_p95_ms: $slo_write_p95_ms,
      slo_max_error_rate: $slo_max_error_rate,
      auto_adapt_rate_limit: $auto_adapt_rate_limit,
      max_rate_limit_retries: $max_rate_limit_retries,
      bench_pace_ms: $bench_pace_ms,
      pace_step_ms: $pace_step_ms,
      pace_max_ms: $pace_max_ms,
      require_recall_case: $require_recall_case,
      require_write_case: $require_write_case
    },
    checks: {
      health_gate_script_exists: $health_gate_script_exists,
      perf_matrix_script_exists: $perf_matrix_script_exists,
      perf_report_script_exists: $perf_report_script_exists,
      api_healthy: $api_healthy,
      health_gate_ok: $health_gate_ok,
      partition_shadow_ready_ok: $partition_shadow_ready_ok,
      perf_run_ok: $perf_run_ok,
      enforce_partition_first_reset: $enforce_partition_first_reset,
      reset_policy_ok: $reset_policy_ok,
      reset_policy_inputs_ok: $reset_policy_inputs_ok,
      reset_policy_runtime_ok: $reset_policy_runtime_ok,
      benchmark_files_found: $benchmark_files_found,
      process_benchmark_files_found: $process_benchmark_files_found,
      perf_report_exists: $perf_report_exists,
      required_scale_present: $required_scale_present,
      recall_requirement_met: $recall_requirement_met,
      write_requirement_met: $write_requirement_met,
      recall_slo_pass: $recall_slo_pass,
      write_slo_pass: $write_slo_pass,
      error_rate_pass: $error_rate_pass,
      steady_state_error_rate_pass: $steady_state_error_rate_pass,
      acceptable_429_within_budget: $acceptable_429_within_budget,
      process_error_rate_over_budget: $process_error_rate_over_budget,
      adaptive_metrics_complete: $adaptive_metrics_complete
    },
    partition_shadow_gate: {
      enforced: $partition_shadow_gate_enforced,
      ready_ok: $partition_shadow_ready_ok,
      summary_file: (if ($partition_shadow_summary_path|length)>0 then $partition_shadow_summary_path else null end)
    },
    metrics: {
      recall_case_count: $recall_case_count,
      write_case_count: $write_case_count,
      max_recall_p95_ms: $max_recall_p95,
      max_write_p95_ms: $max_write_p95,
      max_case_error_rate: $max_case_error_rate,
      max_case_429_rate: $max_case_429_rate,
      max_case_non429_error_rate: $max_case_non429_error_rate,
      effective_steady_error_rate: $effective_steady_error_rate,
      effective_steady_429_rate: $effective_steady_429_rate,
      status_429_total: $status_429_total,
      status_5xx_total: $status_5xx_total,
      status_non429_errors_total: $status_non429_errors_total,
      process_max_case_error_rate: $process_max_case_error_rate,
      process_max_case_429_rate: $process_max_case_429_rate,
      process_max_case_non429_error_rate: $process_max_case_non429_error_rate,
      process_status_429_total: $process_status_429_total,
      process_status_5xx_total: $process_status_5xx_total,
      process_status_non429_errors_total: $process_status_non429_errors_total,
      adapt_files_found: $adapt_files_found,
      adaptive_rate_limit: $adaptive_rate_limit,
      purge_files_found: $purge_files_found,
      purge_delete_strategy_tables_total: $purge_delete_strategy_tables_total
    },
    exits: {
      health_gate: $health_gate_exit,
      perf_run: $perf_run_exit
    },
    timings: {
      gate_duration_ms: $gate_duration_ms
    },
    gate: {
      name: "Gate C (Day 90) Phase 3",
      pass: $gate_pass,
      fail_reasons: [
        (if ($health_gate_script_exists|not) then "missing_health_gate_script" else empty end),
        (if ($perf_matrix_script_exists|not) then "missing_perf_matrix_script" else empty end),
        (if ($perf_report_script_exists|not) then "missing_perf_report_script" else empty end),
        (if ($api_healthy|not) then "api_unhealthy" else empty end),
        (if ($health_gate_ok|not) then "health_gate_failed" else empty end),
        (if ($partition_shadow_ready_ok|not) then "partition_shadow_not_ready" else empty end),
        (if ($perf_run_ok|not) then "perf_run_failed_or_missing" else empty end),
        (if ($reset_policy_ok|not) then "partition_first_reset_policy_failed" else empty end),
        (if ($benchmark_files_found <= 0) then "benchmark_files_missing" else empty end),
        (if ($perf_report_exists|not) then "performance_report_missing" else empty end),
        (if ($required_scale_present|not) then "required_scale_missing" else empty end),
        (if ($recall_requirement_met|not) then "recall_case_requirement_not_met" else empty end),
        (if ($write_requirement_met|not) then "write_case_requirement_not_met" else empty end),
        (if ($recall_slo_pass|not) then "recall_slo_failed" else empty end),
        (if ($write_slo_pass|not) then "write_slo_failed" else empty end),
        (if (($error_rate_pass|not) and ($steady_case_429_over_budget)) then "error_rate_failed_due_to_429_over_budget" else empty end),
        (if (($error_rate_pass|not) and ($steady_case_non429_over_budget)) then "error_rate_failed_due_to_non429_errors" else empty end),
        (if (($error_rate_pass|not) and (($steady_case_429_over_budget|not)) and (($steady_case_non429_over_budget|not))) then "error_rate_slo_failed" else empty end)
      ],
      notes: [
        (if ($acceptable_429_within_budget) then "429_present_within_budget" else empty end),
        (if ($process_status_429_total > 0) then "process_429_observed_non_blocking" else empty end),
        (if ($process_case_429_over_budget and $steady_state_error_rate_pass) then "process_429_over_budget_non_blocking" else empty end),
        (if ($process_case_non429_over_budget and $steady_state_error_rate_pass) then "process_non429_errors_over_budget_non_blocking" else empty end)
      ],
      criteria: [
        "health-gate strict-warnings pass",
        "perf matrix run pass (or reusable perf dir available)",
        "partition-first reset policy active (scope_purge + fail_on_delete + no delete strategy seen)",
        "benchmark files exist + PERFORMANCE_REPORT_V1.md exists",
        "required scale evidence present",
        "recall/write case coverage meets requirements",
        "recall/write p95 within configured SLO thresholds",
        "max per-case steady-state error rate within configured threshold"
      ]
    }
  }' | tee "${SUMMARY_JSON}"

echo "done: ${SUMMARY_JSON}"

if [[ "${gate_pass}" != "true" && "${GATEC_FAIL_ON_FAIL}" == "true" ]]; then
  echo "Gate C failed. Set GATEC_FAIL_ON_FAIL=false to keep non-blocking mode." >&2
  exit 2
fi
