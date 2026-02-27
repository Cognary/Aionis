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

MAX_RECALL_P95_REGRESSION_PCT="${MAX_RECALL_P95_REGRESSION_PCT:-15}"
MAX_RECALL_FAIL_RATE_REGRESSION_ABS="${MAX_RECALL_FAIL_RATE_REGRESSION_ABS:-0.01}"

RUN_TAG="${RUN_TAG:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/perf/lite_vs_strict_${RUN_TAG}}"
mkdir -p "${OUT_DIR}"

echo "[lite-vs-strict] output dir: ${OUT_DIR}"
echo "[lite-vs-strict] base url: ${BASE_URL}"
echo "[lite-vs-strict] scope: ${SCOPE} tenant: ${TENANT_ID}"
echo "[lite-vs-strict] seed events=${EVENTS} topics=${TOPICS} reset=${RESET}"
echo "[lite-vs-strict] benchmark recall_requests=${RECALL_REQUESTS} recall_concurrency=${RECALL_CONCURRENCY} warmup=${WARMUP}"

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

strict_file="${OUT_DIR}/benchmark_strict_edges.json"
lite_file="${OUT_DIR}/benchmark_lite.json"
compare_md="${OUT_DIR}/LITE_VS_STRICT_COMPARE.md"
compare_json="${OUT_DIR}/LITE_VS_STRICT_COMPARE.json"

echo "[lite-vs-strict] run strict_edges benchmark"
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
  --recall-profile strict_edges > "${strict_file}"

echo "[lite-vs-strict] run lite benchmark"
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
  --recall-profile lite > "${lite_file}"

echo "[lite-vs-strict] generate comparison report"
npm run -s job:perf-profile-compare -- \
  --baseline "${strict_file}" \
  --candidate "${lite_file}" \
  --baseline-label strict_edges \
  --candidate-label lite \
  --max-recall-p95-regression-pct "${MAX_RECALL_P95_REGRESSION_PCT}" \
  --max-recall-fail-rate-regression-abs "${MAX_RECALL_FAIL_RATE_REGRESSION_ABS}" \
  --output "${compare_md}" \
  --output-json "${compare_json}" | tee "${OUT_DIR}/compare_stdout.json"

echo "[lite-vs-strict] done"
echo "[lite-vs-strict] strict: ${strict_file}"
echo "[lite-vs-strict] lite: ${lite_file}"
echo "[lite-vs-strict] report: ${compare_md}"
echo "[lite-vs-strict] report json: ${compare_json}"
