#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need npm
need jq
need curl
need node

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
RUN_PACK_GATE="${RUN_PACK_GATE:-true}"
PACK_GATE_SCOPE="${PACK_GATE_SCOPE:-core_gate_pack_${RUN_ID}}"
PACK_GATE_MAX_ROWS="${PACK_GATE_MAX_ROWS:-2000}"
CORE_GATE_DB_RUNNER="${CORE_GATE_DB_RUNNER:-local}"
CORE_GATE_REQUIRE_PARTITION_READY="${CORE_GATE_REQUIRE_PARTITION_READY:-false}"
CORE_GATE_PARTITION_SCOPE="${CORE_GATE_PARTITION_SCOPE:-}"
CORE_GATE_PARTITION_TENANT_ID="${CORE_GATE_PARTITION_TENANT_ID:-}"
CORE_GATE_PARTITION_DUAL_WRITE_ENABLED="${CORE_GATE_PARTITION_DUAL_WRITE_ENABLED:-${MEMORY_SHADOW_DUAL_WRITE_ENABLED:-false}}"
CORE_GATE_PARTITION_READ_SHADOW_CHECK="${CORE_GATE_PARTITION_READ_SHADOW_CHECK:-false}"
CORE_GATE_PARTITION_READ_SHADOW_LIMIT="${CORE_GATE_PARTITION_READ_SHADOW_LIMIT:-20}"
CORE_GATE_PARTITION_READ_SHADOW_MIN_OVERLAP="${CORE_GATE_PARTITION_READ_SHADOW_MIN_OVERLAP:-0.95}"

RECALL_P95_MAX_MS="${RECALL_P95_MAX_MS:-1200}"
WRITE_P95_MAX_MS="${WRITE_P95_MAX_MS:-800}"
ERROR_RATE_MAX="${ERROR_RATE_MAX:-0.02}"
COMPRESSION_GATE_MODE="${COMPRESSION_GATE_MODE:-non_blocking}"
COMPRESSION_RATIO_MIN="${COMPRESSION_RATIO_MIN:-0.40}"
COMPRESSION_ITEMS_RETAIN_MIN="${COMPRESSION_ITEMS_RETAIN_MIN:-0.95}"
COMPRESSION_CITATIONS_RETAIN_MIN="${COMPRESSION_CITATIONS_RETAIN_MIN:-0.95}"

PERF_WARMUP="${PERF_WARMUP:-10}"
PERF_RECALL_REQUESTS="${PERF_RECALL_REQUESTS:-80}"
PERF_RECALL_CONCURRENCY="${PERF_RECALL_CONCURRENCY:-6}"
PERF_WRITE_REQUESTS="${PERF_WRITE_REQUESTS:-40}"
PERF_WRITE_CONCURRENCY="${PERF_WRITE_CONCURRENCY:-3}"
PERF_TIMEOUT_MS="${PERF_TIMEOUT_MS:-20000}"
PERF_PACE_MS="${PERF_PACE_MS:-0}"
PERF_COMPRESSION_CHECK="${PERF_COMPRESSION_CHECK:-true}"
PERF_COMPRESSION_SAMPLES="${PERF_COMPRESSION_SAMPLES:-20}"
PERF_COMPRESSION_TOKEN_BUDGET="${PERF_COMPRESSION_TOKEN_BUDGET:-600}"
PERF_COMPRESSION_PROFILE="${PERF_COMPRESSION_PROFILE:-aggressive}"
PERF_COMPRESSION_QUERY_TEXT="${PERF_COMPRESSION_QUERY_TEXT:-memory graph perf compression}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --tenant-id) TENANT_ID="${2:-}"; shift 2 ;;
    --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
    --run-perf) RUN_PERF="${2:-}"; shift 2 ;;
    --run-pack-gate) RUN_PACK_GATE="${2:-}"; shift 2 ;;
    --pack-gate-scope) PACK_GATE_SCOPE="${2:-}"; shift 2 ;;
    --pack-gate-max-rows) PACK_GATE_MAX_ROWS="${2:-}"; shift 2 ;;
    --db-runner) CORE_GATE_DB_RUNNER="${2:-}"; shift 2 ;;
    --recall-p95-max-ms) RECALL_P95_MAX_MS="${2:-}"; shift 2 ;;
    --write-p95-max-ms) WRITE_P95_MAX_MS="${2:-}"; shift 2 ;;
    --error-rate-max) ERROR_RATE_MAX="${2:-}"; shift 2 ;;
    --compression-gate-mode) COMPRESSION_GATE_MODE="${2:-}"; shift 2 ;;
    --compression-ratio-min) COMPRESSION_RATIO_MIN="${2:-}"; shift 2 ;;
    --compression-items-retain-min) COMPRESSION_ITEMS_RETAIN_MIN="${2:-}"; shift 2 ;;
    --compression-citations-retain-min) COMPRESSION_CITATIONS_RETAIN_MIN="${2:-}"; shift 2 ;;
    --perf-warmup) PERF_WARMUP="${2:-}"; shift 2 ;;
    --perf-recall-requests) PERF_RECALL_REQUESTS="${2:-}"; shift 2 ;;
    --perf-recall-concurrency) PERF_RECALL_CONCURRENCY="${2:-}"; shift 2 ;;
    --perf-write-requests) PERF_WRITE_REQUESTS="${2:-}"; shift 2 ;;
    --perf-write-concurrency) PERF_WRITE_CONCURRENCY="${2:-}"; shift 2 ;;
    --perf-timeout-ms) PERF_TIMEOUT_MS="${2:-}"; shift 2 ;;
    --perf-pace-ms) PERF_PACE_MS="${2:-}"; shift 2 ;;
    --perf-compression-check) PERF_COMPRESSION_CHECK="${2:-}"; shift 2 ;;
    --perf-compression-samples) PERF_COMPRESSION_SAMPLES="${2:-}"; shift 2 ;;
    --perf-compression-token-budget) PERF_COMPRESSION_TOKEN_BUDGET="${2:-}"; shift 2 ;;
    --perf-compression-profile) PERF_COMPRESSION_PROFILE="${2:-}"; shift 2 ;;
    --perf-compression-query-text) PERF_COMPRESSION_QUERY_TEXT="${2:-}"; shift 2 ;;
    --require-partition-ready) CORE_GATE_REQUIRE_PARTITION_READY="${2:-}"; shift 2 ;;
    --partition-scope) CORE_GATE_PARTITION_SCOPE="${2:-}"; shift 2 ;;
    --partition-tenant-id) CORE_GATE_PARTITION_TENANT_ID="${2:-}"; shift 2 ;;
    --partition-dual-write-enabled) CORE_GATE_PARTITION_DUAL_WRITE_ENABLED="${2:-}"; shift 2 ;;
    --partition-read-shadow-check) CORE_GATE_PARTITION_READ_SHADOW_CHECK="${2:-}"; shift 2 ;;
    --partition-read-shadow-limit) CORE_GATE_PARTITION_READ_SHADOW_LIMIT="${2:-}"; shift 2 ;;
    --partition-read-shadow-min-overlap) CORE_GATE_PARTITION_READ_SHADOW_MIN_OVERLAP="${2:-}"; shift 2 ;;
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
  --run-pack-gate <true|false>       Run pack export/import roundtrip gate (default: true)
  --pack-gate-scope <scope>          Scope used for pack roundtrip gate (default: core_gate_pack_<run_id>)
  --pack-gate-max-rows <n>           Max rows per section during pack export (default: 2000)
  --db-runner <local|auto>            Runner for DB-backed gate jobs (default: local; auto aliases to local)
  --recall-p95-max-ms <n>            Recall p95 SLO threshold (default: 1200)
  --write-p95-max-ms <n>             Write p95 SLO threshold (default: 800)
  --error-rate-max <0..1>            Max per-case error rate (default: 0.02)
  --compression-gate-mode <mode>     Compression KPI mode: non_blocking|blocking (default: non_blocking)
  --compression-ratio-min <0..1>     Min compression ratio mean (default: 0.40)
  --compression-items-retain-min <0..1>      Min items retain ratio mean (default: 0.95)
  --compression-citations-retain-min <0..1>  Min citations retain ratio mean (default: 0.95)
  --perf-warmup <n>                  Warmup requests (default: 10)
  --perf-recall-requests <n>         Recall requests (default: 80)
  --perf-recall-concurrency <n>      Recall concurrency (default: 6)
  --perf-write-requests <n>          Write requests (default: 40)
  --perf-write-concurrency <n>       Write concurrency (default: 3)
  --perf-timeout-ms <n>              Request timeout (default: 20000)
  --perf-pace-ms <n>                 Pace ms between requests (default: 0)
  --perf-compression-check <bool>    Run compression KPI benchmark block (default: true)
  --perf-compression-samples <n>     Compression benchmark sample pairs (default: 20)
  --perf-compression-token-budget <n> Compression context token budget (default: 600)
  --perf-compression-profile <name>  Compression profile: balanced|aggressive (default: aggressive)
  --perf-compression-query-text <t>  Compression benchmark query text
  --require-partition-ready <bool>   Run partition cutover readiness as blocking step (default: false)
  --partition-scope <scope>          Scope for partition readiness (default: --scope)
  --partition-tenant-id <tenant>     Tenant for partition readiness (default: --tenant-id)
  --partition-dual-write-enabled <bool>   Expect MEMORY_SHADOW_DUAL_WRITE_ENABLED in readiness
  --partition-read-shadow-check <bool>     Enable read shadow parity check in readiness
  --partition-read-shadow-limit <n>        Read shadow sample limit (default: 20)
  --partition-read-shadow-min-overlap <f>  Read shadow overlap threshold (default: 0.95)
USAGE
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

resolve_db_runner() {
  case "${CORE_GATE_DB_RUNNER}" in
    local|auto)
      echo "local"
      return 0
      ;;
    *)
      echo "invalid --db-runner: ${CORE_GATE_DB_RUNNER} (expected local|auto)" >&2
      exit 1
      ;;
  esac
}

DB_RUNNER="$(resolve_db_runner)"
case "${COMPRESSION_GATE_MODE}" in
  blocking|non_blocking)
    ;;
  *)
    echo "invalid --compression-gate-mode: ${COMPRESSION_GATE_MODE} (expected non_blocking|blocking)" >&2
    exit 1
    ;;
esac

if [[ -z "${CORE_GATE_PARTITION_SCOPE}" ]]; then
  CORE_GATE_PARTITION_SCOPE="${SCOPE}"
fi
if [[ -z "${CORE_GATE_PARTITION_TENANT_ID}" ]]; then
  CORE_GATE_PARTITION_TENANT_ID="${TENANT_ID}"
fi

mkdir -p "${OUT_DIR}"

steps_json='[]'
fail_reasons='[]'
warn_reasons='[]'
API_DATABASE_TARGET_HASH=""
DB_TARGET_HASH_MATCH="null"

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

is_lt() {
  awk -v a="$1" -v b="$2" 'BEGIN { exit !(a<b) }'
}

run_db_command() {
  "$@"
}

probe_api_target() {
  local probe_file="${OUT_DIR}/00_api_probe.json"
  local health_body_file="${OUT_DIR}/00_health_probe_body.json"
  local health_code="000"
  local recall_code="000"
  local health_json_valid=false
  health_code="$(curl -sS -o "${health_body_file}" -w "%{http_code}" "${BASE_URL}/health" || true)"
  recall_code="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      "${BASE_URL}/v1/memory/recall" \
      -H "content-type: application/json" \
      -d '{}' || true
  )"
  health_code="${health_code: -3}"
  recall_code="${recall_code: -3}"
  if [[ -s "${health_body_file}" ]] && jq -e . >/dev/null 2>&1 < "${health_body_file}"; then
    health_json_valid=true
    API_DATABASE_TARGET_HASH="$(jq -r '.database_target_hash // empty' "${health_body_file}")"
  fi
  local ok=true
  if [[ "${health_code}" == "000" || "${recall_code}" == "000" || "${recall_code}" == "404" ]]; then
    ok=false
  fi
  jq -n \
    --arg base_url "${BASE_URL}" \
    --argjson ok "$([[ "${ok}" == "true" ]] && echo true || echo false)" \
    --arg health_code "${health_code}" \
    --arg recall_probe_code "${recall_code}" \
    --arg database_target_hash "${API_DATABASE_TARGET_HASH}" \
    --argjson health_json_valid "$([[ "${health_json_valid}" == "true" ]] && echo true || echo false)" \
    '{
      ok: $ok,
      base_url: $base_url,
      health_code: ($health_code | tonumber? // $health_code),
      recall_probe_code: ($recall_probe_code | tonumber? // $recall_probe_code),
      health_json_valid: $health_json_valid,
      database_target_hash: (if ($database_target_hash|length)>0 then $database_target_hash else null end)
    }' > "${probe_file}"
  if [[ "${ok}" != "true" ]]; then
    echo "[core-gate] api probe failed: BASE_URL does not look like Aionis memory API (see ${probe_file})" >&2
    cat "${probe_file}" >&2
    exit 2
  fi
}

probe_database_connectivity() {
  local probe_file="${OUT_DIR}/00_db_probe.log"
  if [[ "${DB_RUNNER}" == "local" && -z "${DATABASE_URL:-}" ]]; then
    echo "[core-gate] DATABASE_URL is empty; cannot run DB-backed gate checks" >&2
    exit 2
  fi
  set +e
  DATABASE_URL="${DATABASE_URL}" node -e '
    const { Client } = require("pg");
    (async () => {
      const c = new Client({ connectionString: process.env.DATABASE_URL });
      try {
        await c.connect();
        await c.query("select 1");
      } finally {
        await c.end().catch(() => {});
      }
    })().catch((err) => {
      console.error(String(err?.message || err));
      process.exit(1);
    });
  ' > "${probe_file}" 2>&1
  local ec=$?
  set -e
  if [[ "${ec}" -ne 0 ]]; then
    echo "[core-gate] database probe failed: DATABASE_URL is not reachable for gate checks (see ${probe_file})" >&2
    sed -n "1,80p" "${probe_file}" >&2 || true
    exit 2
  fi

  local hash_probe_json=""
  hash_probe_json="$(
    DATABASE_URL="${DATABASE_URL}" node -e '
      const { createHash } = require("node:crypto");
      const raw = process.env.DATABASE_URL || "";
      const h = (s) => createHash("sha256").update(s).digest("hex");
      try {
        const u = new URL(raw);
        const rawHost = (u.hostname || "").toLowerCase();
        const isLoopback = rawHost === "localhost" || rawHost === "127.0.0.1" || rawHost === "::1";
        const canonicalHost = isLoopback ? "loopback" : rawHost;
        const protocol = (u.protocol || "").toLowerCase();
        const port = u.port || ((protocol === "postgresql:" || protocol === "postgres:") ? "5432" : "");
        const db = (u.pathname || "/").replace(/^\/+/, "");
        if (!canonicalHost || !port || !db) process.exit(1);

        const candidates = new Set([`${canonicalHost}:${port}/${db}`]);
        // Docker compose often uses service alias "db" in container while host probes use loopback.
        if (isLoopback) candidates.add(`db:${port}/${db}`);
        if (rawHost === "db") candidates.add(`loopback:${port}/${db}`);

        const hashes = Array.from(candidates).map(h);
        process.stdout.write(JSON.stringify({ canonical: h(`${canonicalHost}:${port}/${db}`), hashes }));
      } catch {
        process.exit(1);
      }
    ' 2>/dev/null || true
  )"

  local local_db_target_hash=""
  local local_db_target_hashes=""
  if [[ -n "${hash_probe_json}" ]]; then
    local_db_target_hash="$(echo "${hash_probe_json}" | jq -r '.canonical // empty' 2>/dev/null || true)"
    local_db_target_hashes="$(echo "${hash_probe_json}" | jq -r '.hashes // [] | join(",")' 2>/dev/null || true)"
  fi

  {
    echo "db_runner=${DB_RUNNER}"
    echo "local_db_target_hash=${local_db_target_hash:-unknown}"
    echo "local_db_target_hashes=${local_db_target_hashes:-unknown}"
    echo "api_db_target_hash=${API_DATABASE_TARGET_HASH:-unknown}"
  } >> "${probe_file}"

  if [[ -n "${local_db_target_hashes}" && -n "${API_DATABASE_TARGET_HASH}" ]]; then
    if echo ",${local_db_target_hashes}," | grep -q ",${API_DATABASE_TARGET_HASH},"; then
      DB_TARGET_HASH_MATCH="true"
    else
      DB_TARGET_HASH_MATCH="false"
      echo "[core-gate] database target mismatch: BASE_URL points to a different DB target than local DATABASE_URL (see ${probe_file})" >&2
      echo "[core-gate] set DATABASE_URL to the same DB instance used by ${BASE_URL} and rerun." >&2
      exit 2
    fi
  fi
}

echo "[core-gate] out_dir=${OUT_DIR}"
echo "[core-gate] base_url=${BASE_URL} scope=${SCOPE} tenant_id=${TENANT_ID} run_perf=${RUN_PERF}"
echo "[core-gate] run_pack_gate=${RUN_PACK_GATE} pack_gate_scope=${PACK_GATE_SCOPE}"
echo "[core-gate] require_partition_ready=${CORE_GATE_REQUIRE_PARTITION_READY}"
echo "[core-gate] db_runner=${DB_RUNNER}"
echo "[core-gate] compression_gate_mode=${COMPRESSION_GATE_MODE} perf_compression_check=${PERF_COMPRESSION_CHECK}"
probe_api_target
probe_database_connectivity

run_step "build" "${OUT_DIR}/01_build.log" npm run -s build
run_step "contract" "${OUT_DIR}/02_contract.log" npm run -s test:contract
run_step "docs_check" "${OUT_DIR}/03_docs_check.log" npm run -s docs:check
run_step "sdk_release_check" "${OUT_DIR}/04_sdk_release_check.log" npm run -s sdk:release-check
run_step "sdk_python_release_check" "${OUT_DIR}/05_sdk_python_release_check.log" npm run -s sdk:py:release-check

run_step "health_gate_scope" "${OUT_DIR}/06_health_gate_scope.json" \
  run_db_command npm run -s job:health-gate -- --scope "${SCOPE}" --strict-warnings --consistency-check-set scope

run_step "consistency_cross_tenant" "${OUT_DIR}/07_consistency_cross_tenant.json" \
  run_db_command npm run -s job:consistency-check:cross-tenant -- --strict-warnings

pack_gate_summary_path=""
pack_gate_ok=true
if [[ "${RUN_PACK_GATE}" == "true" ]]; then
  pack_gate_summary_path="${OUT_DIR}/07b_pack_roundtrip_gate.json"
  run_step "pack_roundtrip_gate" "${pack_gate_summary_path}" \
    env \
      BASE_URL="${BASE_URL}" \
      TENANT_ID="${TENANT_ID}" \
      SCOPE="${PACK_GATE_SCOPE}" \
      PACK_MAX_ROWS="${PACK_GATE_MAX_ROWS}" \
      API_KEY="${API_KEY:-${PERF_API_KEY:-}}" \
      AUTH_BEARER="${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}" \
      npm run -s job:pack-roundtrip-gate

  if [[ -f "${pack_gate_summary_path}" ]] && jq -e . >/dev/null 2>&1 < "${pack_gate_summary_path}"; then
    pack_gate_ok="$(jq -r '.ok // false' "${pack_gate_summary_path}")"
    if [[ "${pack_gate_ok}" != "true" ]]; then
      fail_reasons="$(echo "${fail_reasons}" | jq '. + ["pack_roundtrip_failed"]')"
    fi
  else
    pack_gate_ok=false
    fail_reasons="$(echo "${fail_reasons}" | jq '. + ["pack_roundtrip_output_invalid"]')"
  fi
fi

partition_cutover_summary_path=""
if [[ "${CORE_GATE_REQUIRE_PARTITION_READY}" == "true" ]]; then
  run_step "partition_backfill_sync" "${OUT_DIR}/07b_partition_backfill_sync.json" \
    run_db_command npm run -s job:partition-backfill -- \
      --scope "${CORE_GATE_PARTITION_SCOPE}" \
      --tenant-id "${CORE_GATE_PARTITION_TENANT_ID}" \
      --table all \
      --batch-size 5000 \
      --max-batches 0 \
      --ensure-scope-partition

  partition_cutover_dir="${OUT_DIR}/partition_cutover"
  partition_cutover_summary_path="${partition_cutover_dir}/summary.json"
  mkdir -p "${partition_cutover_dir}"
  run_step "partition_cutover_readiness" "${partition_cutover_dir}/run.log" \
    env \
      RUN_ID="${RUN_ID}_partition" \
      OUT_DIR="${partition_cutover_dir}" \
      SCOPE="${CORE_GATE_PARTITION_SCOPE}" \
      TENANT_ID="${CORE_GATE_PARTITION_TENANT_ID}" \
      MEMORY_SHADOW_DUAL_WRITE_ENABLED="${CORE_GATE_PARTITION_DUAL_WRITE_ENABLED}" \
      READ_SHADOW_CHECK="${CORE_GATE_PARTITION_READ_SHADOW_CHECK}" \
      READ_SHADOW_LIMIT="${CORE_GATE_PARTITION_READ_SHADOW_LIMIT}" \
      READ_SHADOW_MIN_OVERLAP="${CORE_GATE_PARTITION_READ_SHADOW_MIN_OVERLAP}" \
      FAIL_ON_FAIL=true \
      npm run -s job:partition-cutover-readiness
fi

perf_json_path=""
recall_p95="0"
write_p95="0"
max_error_rate="0"
perf_slo_ok=true
compression_kpi_enabled=false
compression_kpi_pass=true
compression_ratio_mean="0"
compression_items_retain_mean="0"
compression_citations_retain_mean="0"
compression_ok_pairs="0"
compression_total_pairs="0"

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
      --pace-ms "${PERF_PACE_MS}" \
      --compression-check "${PERF_COMPRESSION_CHECK}" \
      --compression-pair-gate-mode "${COMPRESSION_GATE_MODE}" \
      --compression-samples "${PERF_COMPRESSION_SAMPLES}" \
      --compression-token-budget "${PERF_COMPRESSION_TOKEN_BUDGET}" \
      --compression-profile "${PERF_COMPRESSION_PROFILE}" \
      --compression-query-text "${PERF_COMPRESSION_QUERY_TEXT}"

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

    if [[ "${PERF_COMPRESSION_CHECK}" == "true" ]]; then
      compression_kpi_enabled=true
      compression_ratio_mean="$(to_number_or_zero "$(jq -r '.compression.summary.compression_ratio.mean // 0' "${perf_json_path}")")"
      compression_items_retain_mean="$(to_number_or_zero "$(jq -r '.compression.summary.items_retain_ratio.mean // 0' "${perf_json_path}")")"
      compression_citations_retain_mean="$(to_number_or_zero "$(jq -r '.compression.summary.citations_retain_ratio.mean // 0' "${perf_json_path}")")"
      compression_ok_pairs="$(to_number_or_zero "$(jq -r '.compression.ok_pairs // 0' "${perf_json_path}")")"
      compression_total_pairs="$(to_number_or_zero "$(jq -r '.compression.total_pairs // 0' "${perf_json_path}")")"

      compression_fail_reasons='[]'
      if [[ "${compression_ok_pairs}" -lt 1 ]]; then
        compression_fail_reasons="$(echo "${compression_fail_reasons}" | jq '. + ["compression_kpi_pairs_insufficient"]')"
      fi
      if is_lt "${compression_ratio_mean}" "${COMPRESSION_RATIO_MIN}"; then
        compression_fail_reasons="$(echo "${compression_fail_reasons}" | jq '. + ["compression_kpi_ratio_below_threshold"]')"
      fi
      if is_lt "${compression_items_retain_mean}" "${COMPRESSION_ITEMS_RETAIN_MIN}"; then
        compression_fail_reasons="$(echo "${compression_fail_reasons}" | jq '. + ["compression_kpi_items_retain_below_threshold"]')"
      fi
      if is_lt "${compression_citations_retain_mean}" "${COMPRESSION_CITATIONS_RETAIN_MIN}"; then
        compression_fail_reasons="$(echo "${compression_fail_reasons}" | jq '. + ["compression_kpi_citations_retain_below_threshold"]')"
      fi

      if [[ "$(echo "${compression_fail_reasons}" | jq 'length')" != "0" ]]; then
        compression_kpi_pass=false
        if [[ "${COMPRESSION_GATE_MODE}" == "blocking" ]]; then
          fail_reasons="$(echo "${fail_reasons}" | jq --argjson reasons "${compression_fail_reasons}" '. + $reasons')"
        else
          warn_reasons="$(echo "${warn_reasons}" | jq --argjson reasons "${compression_fail_reasons}" '. + $reasons')"
        fi
      fi
    fi
  else
    perf_slo_ok=false
    fail_reasons="$(echo "${fail_reasons}" | jq '. + ["perf_output_invalid"]')"
    if [[ "${PERF_COMPRESSION_CHECK}" == "true" ]]; then
      compression_kpi_enabled=true
      compression_kpi_pass=false
      if [[ "${COMPRESSION_GATE_MODE}" == "blocking" ]]; then
        fail_reasons="$(echo "${fail_reasons}" | jq '. + ["compression_kpi_output_invalid"]')"
      else
        warn_reasons="$(echo "${warn_reasons}" | jq '. + ["compression_kpi_output_invalid"]')"
      fi
    fi
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
  --arg db_runner "${DB_RUNNER}" \
  --arg db_target_hash_match "${DB_TARGET_HASH_MATCH}" \
  --argjson run_perf "$([[ "${RUN_PERF}" == "true" ]] && echo true || echo false)" \
  --argjson recall_p95_max_ms "${RECALL_P95_MAX_MS}" \
  --argjson write_p95_max_ms "${WRITE_P95_MAX_MS}" \
  --argjson error_rate_max "${ERROR_RATE_MAX}" \
  --argjson recall_p95 "${recall_p95}" \
  --argjson write_p95 "${write_p95}" \
  --argjson max_error_rate "${max_error_rate}" \
  --argjson perf_slo_ok "$([[ "${perf_slo_ok}" == "true" ]] && echo true || echo false)" \
  --argjson run_pack_gate "$([[ "${RUN_PACK_GATE}" == "true" ]] && echo true || echo false)" \
  --arg pack_gate_scope "${PACK_GATE_SCOPE}" \
  --argjson pack_gate_max_rows "${PACK_GATE_MAX_ROWS}" \
  --arg pack_gate_summary_path "${pack_gate_summary_path}" \
  --argjson pack_gate_ok "$([[ "${pack_gate_ok}" == "true" ]] && echo true || echo false)" \
  --arg compression_gate_mode "${COMPRESSION_GATE_MODE}" \
  --argjson compression_ratio_min "${COMPRESSION_RATIO_MIN}" \
  --argjson compression_items_retain_min "${COMPRESSION_ITEMS_RETAIN_MIN}" \
  --argjson compression_citations_retain_min "${COMPRESSION_CITATIONS_RETAIN_MIN}" \
  --argjson compression_kpi_enabled "$([[ "${compression_kpi_enabled}" == "true" ]] && echo true || echo false)" \
  --argjson compression_kpi_pass "$([[ "${compression_kpi_pass}" == "true" ]] && echo true || echo false)" \
  --argjson compression_ratio_mean "${compression_ratio_mean}" \
  --argjson compression_items_retain_mean "${compression_items_retain_mean}" \
  --argjson compression_citations_retain_mean "${compression_citations_retain_mean}" \
  --argjson compression_ok_pairs "${compression_ok_pairs}" \
  --argjson compression_total_pairs "${compression_total_pairs}" \
  --argjson require_partition_ready "$([[ "${CORE_GATE_REQUIRE_PARTITION_READY}" == "true" ]] && echo true || echo false)" \
  --arg partition_scope "${CORE_GATE_PARTITION_SCOPE}" \
  --arg partition_tenant_id "${CORE_GATE_PARTITION_TENANT_ID}" \
  --arg partition_dual_write_enabled "${CORE_GATE_PARTITION_DUAL_WRITE_ENABLED}" \
  --arg partition_read_shadow_check "${CORE_GATE_PARTITION_READ_SHADOW_CHECK}" \
  --arg partition_read_shadow_limit "${CORE_GATE_PARTITION_READ_SHADOW_LIMIT}" \
  --arg partition_read_shadow_min_overlap "${CORE_GATE_PARTITION_READ_SHADOW_MIN_OVERLAP}" \
  --arg partition_cutover_summary_path "${partition_cutover_summary_path}" \
  --argjson steps "${steps_json}" \
  --argjson fail_reasons "${fail_reasons}" \
  --argjson warn_reasons "${warn_reasons}" \
  --argjson ok "$([[ "${ok}" == "true" ]] && echo true || echo false)" \
  --arg out_dir "${OUT_DIR}" \
  '{
    ok: $ok,
    run_id: $run_id,
    timestamp_utc: $timestamp_utc,
    gate_class: "production_core",
    target: {
      base_url: $base_url,
      scope: $scope,
      tenant_id: $tenant_id,
      db_runner: $db_runner,
      db_target_hash_match: (
        if $db_target_hash_match == "true" then true
        elif $db_target_hash_match == "false" then false
        else null
        end
      )
    },
    blocking_metrics: {
      integrity: [
        "health_gate_scope(strict_warnings)",
        "consistency_cross_tenant(strict_warnings)"
      ],
      partition_cutover_readiness: {
        required: $require_partition_ready,
        scope: $partition_scope,
        tenant_id: $partition_tenant_id,
        dual_write_enabled: ($partition_dual_write_enabled == "true"),
        read_shadow_check: ($partition_read_shadow_check == "true"),
        read_shadow_limit: ($partition_read_shadow_limit | tonumber),
        read_shadow_min_overlap: ($partition_read_shadow_min_overlap | tonumber),
        summary_json: (if ($partition_cutover_summary_path|length)>0 then $partition_cutover_summary_path else null end)
      },
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
      },
      pack_roundtrip: {
        enabled: $run_pack_gate,
        scope: $pack_gate_scope,
        max_rows: $pack_gate_max_rows,
        summary_json: (if ($pack_gate_summary_path|length)>0 then $pack_gate_summary_path else null end),
        pass: (if $run_pack_gate then $pack_gate_ok else true end)
      },
      compression_kpi: {
        mode: $compression_gate_mode,
        enabled: $compression_kpi_enabled,
        thresholds: {
          compression_ratio_min: $compression_ratio_min,
          items_retain_ratio_min: $compression_items_retain_min,
          citations_retain_ratio_min: $compression_citations_retain_min
        },
        observed: {
          compression_ratio_mean: $compression_ratio_mean,
          items_retain_ratio_mean: $compression_items_retain_mean,
          citations_retain_ratio_mean: $compression_citations_retain_mean,
          ok_pairs: $compression_ok_pairs,
          total_pairs: $compression_total_pairs
        },
        pass: $compression_kpi_pass
      }
    },
    aux_regression_only: [
      "LongMemEval",
      "LoCoMo"
    ],
    steps: $steps,
    fail_reasons: $fail_reasons,
    warn_reasons: $warn_reasons,
    artifacts: {
      out_dir: $out_dir,
      summary_json: ($out_dir + "/summary.json")
    }
  }' > "${summary_json}"

cat "${summary_json}"

if [[ "${ok}" != "true" ]]; then
  exit 2
fi
