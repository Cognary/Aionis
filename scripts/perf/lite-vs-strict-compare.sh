#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need npm
need curl
need node

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

BASE_URL="${BASE_URL:-http://localhost:${PORT:-3001}}"
TENANT_ID="${TENANT_ID:-${MEMORY_TENANT_ID:-default}}"
SCOPE="${SCOPE:-perf_lite_vs_strict_$(date +%Y%m%d_%H%M%S)}"
SRC_SCOPE="${SRC_SCOPE:-${MEMORY_SCOPE:-default}}"
SRC_TENANT_ID="${SRC_TENANT_ID:-${MEMORY_TENANT_ID:-default}}"
EVENTS="${EVENTS:-20000}"
TOPICS="${TOPICS:-200}"
RESET="${RESET:-true}"
EMBEDDING_DIM="${EMBEDDING_DIM:-1536}"
PERF_API_KEY="${PERF_API_KEY:-}"
PERF_AUTH_BEARER="${PERF_AUTH_BEARER:-}"

WARMUP="${WARMUP:-20}"
RECALL_REQUESTS="${RECALL_REQUESTS:-220}"
RECALL_CONCURRENCY="${RECALL_CONCURRENCY:-8}"
PACE_MS="${PACE_MS:-0}"
TIMEOUT_MS="${TIMEOUT_MS:-15000}"
SAMPLE_RUNS="${SAMPLE_RUNS:-1}"

MAX_RECALL_P95_REGRESSION_PCT="${MAX_RECALL_P95_REGRESSION_PCT:-15}"
MAX_RECALL_P99_REGRESSION_PCT="${MAX_RECALL_P99_REGRESSION_PCT:-}"
MAX_RECALL_FAIL_RATE_REGRESSION_ABS="${MAX_RECALL_FAIL_RATE_REGRESSION_ABS:-0.01}"

RUN_TAG="${RUN_TAG:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/perf/lite_vs_strict_${RUN_TAG}}"
mkdir -p "${OUT_DIR}"

echo "[lite-vs-strict] output dir: ${OUT_DIR}"
echo "[lite-vs-strict] base url: ${BASE_URL}"
echo "[lite-vs-strict] scope: ${SCOPE} tenant: ${TENANT_ID}"
echo "[lite-vs-strict] seed events=${EVENTS} topics=${TOPICS} reset=${RESET}"
echo "[lite-vs-strict] benchmark recall_requests=${RECALL_REQUESTS} recall_concurrency=${RECALL_CONCURRENCY} warmup=${WARMUP}"
echo "[lite-vs-strict] sample runs=${SAMPLE_RUNS}"
echo "[lite-vs-strict] gates p95<=${MAX_RECALL_P95_REGRESSION_PCT}% fail_rate_abs<=${MAX_RECALL_FAIL_RATE_REGRESSION_ABS} p99<=${MAX_RECALL_P99_REGRESSION_PCT:-disabled}"

if ! [[ "${SAMPLE_RUNS}" =~ ^[0-9]+$ ]] || [[ "${SAMPLE_RUNS}" -lt 1 ]] || [[ "${SAMPLE_RUNS}" -gt 9 ]]; then
  echo "invalid SAMPLE_RUNS=${SAMPLE_RUNS}; expected integer in [1,9]" >&2
  exit 1
fi

curl_headers=(-H "content-type: application/json")
if [[ -n "${PERF_API_KEY}" ]]; then
  curl_headers+=(-H "x-api-key: ${PERF_API_KEY}")
fi
if [[ -n "${PERF_AUTH_BEARER}" ]]; then
  curl_headers+=(-H "authorization: Bearer ${PERF_AUTH_BEARER}")
fi

echo "[lite-vs-strict] bootstrap source embedding in src scope"
bootstrap_payload="$(SRC_SCOPE="${SRC_SCOPE}" SRC_TENANT_ID="${SRC_TENANT_ID}" EMBEDDING_DIM="${EMBEDDING_DIM}" node -e '
const dim = Number(process.env.EMBEDDING_DIM || "1536");
const scope = process.env.SRC_SCOPE || "default";
const tenantId = process.env.SRC_TENANT_ID || "default";
const now = Date.now();
const body = {
  tenant_id: tenantId,
  scope,
  input_text: `perf bootstrap embedding ${now}`,
  auto_embed: false,
  memory_lane: "shared",
  nodes: [
    {
      client_id: `perf_bootstrap_${now}`,
      type: "event",
      text_summary: "perf bootstrap embedding source node",
      embedding: Array.from({ length: dim }, (_, i) => ((i % 11) + 1) / 100),
      embedding_model: "perf_bootstrap",
    },
  ],
};
process.stdout.write(JSON.stringify(body));
')"
curl -fsS -X POST "${BASE_URL}/v1/memory/write" \
  "${curl_headers[@]}" \
  --data "${bootstrap_payload}" \
  >/dev/null

seed_cmd=(
  npm
  run
  -s
  job:perf-seed
  --
  --scope
  "${SCOPE}"
  --tenant-id
  "${TENANT_ID}"
  --src-scope
  "${SRC_SCOPE}"
  --src-tenant-id
  "${SRC_TENANT_ID}"
  --events
  "${EVENTS}"
  --topics
  "${TOPICS}"
)
if [[ "${RESET}" == "true" ]]; then
  seed_cmd+=(--reset)
fi
"${seed_cmd[@]}" | tee "${OUT_DIR}/seed.json"

compare_md="${OUT_DIR}/LITE_VS_STRICT_COMPARE.md"
compare_json="${OUT_DIR}/LITE_VS_STRICT_COMPARE.json"
compare_statuses=()

run_profile_benchmark() {
  local profile="$1"
  local out_file="$2"
  npm run -s job:perf-benchmark -- \
    --base-url "${BASE_URL}" \
    --scope "${SCOPE}" \
    --tenant-id "${TENANT_ID}" \
    --mode recall \
    --warmup "${WARMUP}" \
    --recall-requests "${RECALL_REQUESTS}" \
    --recall-concurrency "${RECALL_CONCURRENCY}" \
    --pace-ms "${PACE_MS}" \
    --timeout-ms "${TIMEOUT_MS}" \
    --recall-profile "${profile}" > "${out_file}"
}

run_compare_once() {
  local strict_file="$1"
  local lite_file="$2"
  local out_md="$3"
  local out_json="$4"
  local out_stdout="$5"

  local compare_cmd=(
    npm
    run
    -s
    job:perf-profile-compare
    --
    --baseline
    "${strict_file}"
    --candidate
    "${lite_file}"
    --baseline-label
    strict_edges
    --candidate-label
    lite
    --max-recall-p95-regression-pct
    "${MAX_RECALL_P95_REGRESSION_PCT}"
    --max-recall-fail-rate-regression-abs
    "${MAX_RECALL_FAIL_RATE_REGRESSION_ABS}"
  )
  if [[ -n "${MAX_RECALL_P99_REGRESSION_PCT}" ]]; then
    compare_cmd+=(--max-recall-p99-regression-pct "${MAX_RECALL_P99_REGRESSION_PCT}")
  fi
  compare_cmd+=(
    --output
    "${out_md}"
    --output-json
    "${out_json}"
  )

  set +e
  "${compare_cmd[@]}" | tee "${out_stdout}"
  local st=$?
  set -e
  return "${st}"
}

if [[ "${SAMPLE_RUNS}" -eq 1 ]]; then
  strict_file="${OUT_DIR}/benchmark_strict_edges.json"
  lite_file="${OUT_DIR}/benchmark_lite.json"
  echo "[lite-vs-strict] run strict_edges benchmark"
  run_profile_benchmark strict_edges "${strict_file}"
  echo "[lite-vs-strict] run lite benchmark"
  run_profile_benchmark lite "${lite_file}"
  echo "[lite-vs-strict] generate comparison report"
  if run_compare_once "${strict_file}" "${lite_file}" "${compare_md}" "${compare_json}" "${OUT_DIR}/compare_stdout.json"; then
    compare_statuses+=(0)
  else
    compare_statuses+=($?)
  fi
else
  for run_idx in $(seq 1 "${SAMPLE_RUNS}"); do
    strict_file="${OUT_DIR}/benchmark_strict_edges_run${run_idx}.json"
    lite_file="${OUT_DIR}/benchmark_lite_run${run_idx}.json"
    run_md="${OUT_DIR}/LITE_VS_STRICT_COMPARE_run${run_idx}.md"
    run_json="${OUT_DIR}/LITE_VS_STRICT_COMPARE_run${run_idx}.json"
    run_stdout="${OUT_DIR}/compare_run${run_idx}_stdout.json"

    echo "[lite-vs-strict] run #${run_idx}/${SAMPLE_RUNS}: strict_edges benchmark"
    run_profile_benchmark strict_edges "${strict_file}"
    echo "[lite-vs-strict] run #${run_idx}/${SAMPLE_RUNS}: lite benchmark"
    run_profile_benchmark lite "${lite_file}"

    cp "${strict_file}" "${OUT_DIR}/benchmark_strict_edges.json"
    cp "${lite_file}" "${OUT_DIR}/benchmark_lite.json"

    echo "[lite-vs-strict] run #${run_idx}/${SAMPLE_RUNS}: comparison"
    if run_compare_once "${strict_file}" "${lite_file}" "${run_md}" "${run_json}" "${run_stdout}"; then
      compare_statuses+=(0)
    else
      compare_statuses+=($?)
    fi
  done

  echo "[lite-vs-strict] aggregate ${SAMPLE_RUNS} compare runs (median gate)"
  aggregate_cmd=(
    npm
    run
    -s
    job:perf-profile-aggregate
    --
    --dir
    "${OUT_DIR}"
    --baseline-label
    strict_edges
    --candidate-label
    lite
    --max-recall-p95-regression-pct
    "${MAX_RECALL_P95_REGRESSION_PCT}"
    --max-recall-fail-rate-regression-abs
    "${MAX_RECALL_FAIL_RATE_REGRESSION_ABS}"
    --output
    "${compare_md}"
    --output-json
    "${compare_json}"
  )
  if [[ -n "${MAX_RECALL_P99_REGRESSION_PCT}" ]]; then
    aggregate_cmd+=(--max-recall-p99-regression-pct "${MAX_RECALL_P99_REGRESSION_PCT}")
  fi
  "${aggregate_cmd[@]}" | tee "${OUT_DIR}/compare_stdout.json"
fi

if [[ "${SAMPLE_RUNS}" -eq 1 ]] && [[ "${compare_statuses[0]}" -ne 0 ]]; then
  exit "${compare_statuses[0]}"
fi

echo "[lite-vs-strict] done"
echo "[lite-vs-strict] sample_runs: ${SAMPLE_RUNS}"
echo "[lite-vs-strict] report: ${compare_md}"
echo "[lite-vs-strict] report json: ${compare_json}"
