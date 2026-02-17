#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need npm
need jq
need psql

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

BASE_URL="${BASE_URL:-http://localhost:${PORT:-3001}}"
TENANT_ID="${TENANT_ID:-${MEMORY_TENANT_ID:-default}}"
SRC_SCOPE="${SRC_SCOPE:-${MEMORY_SCOPE:-default}}"
SRC_TENANT_ID="${SRC_TENANT_ID:-${MEMORY_TENANT_ID:-default}}"
SCOPE_PREFIX="${SCOPE_PREFIX:-perf_d}"
PERF_PROFILE="${PERF_PROFILE:-balanced}"
SCALES="${SCALES:-100000,300000,1000000}"
TOPIC_RATIO="${TOPIC_RATIO:-100}"
SCOPE_STRATEGY="${SCOPE_STRATEGY:-isolated}" # isolated|fixed
RESET_MODE="${RESET_MODE:-auto}" # auto|always|never
PERF_OFFLINE_WINDOW="${PERF_OFFLINE_WINDOW:-false}"
RESET_IMPL="${RESET_IMPL:-scope_purge}" # scope_purge|perf_seed
RESET_PURGE_MODE="${RESET_PURGE_MODE:-partition}" # auto|partition|delete
RESET_PURGE_ALLOW_FALLBACK_DELETE="${RESET_PURGE_ALLOW_FALLBACK_DELETE:-false}"
RESET_PURGE_FAIL_ON_DELETE="${RESET_PURGE_FAIL_ON_DELETE:-true}"
BENCH_MODE="${BENCH_MODE:-}"
BENCH_WARMUP="${BENCH_WARMUP:-}"
EMBED_ON_WRITE="${EMBED_ON_WRITE:-}"
RECALL_REQUESTS="${RECALL_REQUESTS:-}"
RECALL_CONCURRENCY="${RECALL_CONCURRENCY:-}"
WRITE_REQUESTS="${WRITE_REQUESTS:-}"
WRITE_CONCURRENCY="${WRITE_CONCURRENCY:-}"
RUN_EXPLAIN="${RUN_EXPLAIN:-}"
RUN_WORKER_BENCHMARK="${RUN_WORKER_BENCHMARK:-}"
WORKER_ITERATIONS="${WORKER_ITERATIONS:-}"
WORKER_SCOPE="${WORKER_SCOPE:-}"
WORKER_BACKLOG_WRITES="${WORKER_BACKLOG_WRITES:-}"
WORKER_BACKLOG_CONCURRENCY="${WORKER_BACKLOG_CONCURRENCY:-}"
BENCH_PACE_MS="${BENCH_PACE_MS:-0}"
BENCH_FAIL_ON_TRANSPORT_ERROR_RATE="${BENCH_FAIL_ON_TRANSPORT_ERROR_RATE:-}"
AUTO_ADAPT_RATE_LIMIT="${AUTO_ADAPT_RATE_LIMIT:-}"
MAX_RATE_LIMIT_RETRIES="${MAX_RATE_LIMIT_RETRIES:-4}"
PACE_STEP_MS="${PACE_STEP_MS:-25}"
PACE_MAX_MS="${PACE_MAX_MS:-2000}"
SLO_RECALL_P95_MS="${SLO_RECALL_P95_MS:-300}"
SLO_WRITE_P95_MS="${SLO_WRITE_P95_MS:-500}"
SLO_MAX_ERROR_RATE="${SLO_MAX_ERROR_RATE:-0}"
MATRIX_TAG="${MATRIX_TAG:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/perf/${MATRIX_TAG}}"

mkdir -p "${OUT_DIR}"

case "${PERF_PROFILE}" in
  balanced)
    ;;
  recall_slo)
    BENCH_MODE="${BENCH_MODE:-recall}"
    RECALL_REQUESTS="${RECALL_REQUESTS:-300}"
    RECALL_CONCURRENCY="${RECALL_CONCURRENCY:-6}"
    WRITE_REQUESTS="${WRITE_REQUESTS:-40}"
    WRITE_CONCURRENCY="${WRITE_CONCURRENCY:-1}"
    BENCH_PACE_MS="${BENCH_PACE_MS:-50}"
    MAX_RATE_LIMIT_RETRIES="${MAX_RATE_LIMIT_RETRIES:-10}"
    RUN_EXPLAIN="${RUN_EXPLAIN:-false}"
    RUN_WORKER_BENCHMARK="${RUN_WORKER_BENCHMARK:-false}"
    ;;
  write_slo)
    BENCH_MODE="${BENCH_MODE:-write}"
    BENCH_WARMUP="${BENCH_WARMUP:-10}"
    WRITE_REQUESTS="${WRITE_REQUESTS:-200}"
    WRITE_CONCURRENCY="${WRITE_CONCURRENCY:-2}"
    EMBED_ON_WRITE="${EMBED_ON_WRITE:-false}"
    BENCH_PACE_MS="${BENCH_PACE_MS:-150}"
    MAX_RATE_LIMIT_RETRIES="${MAX_RATE_LIMIT_RETRIES:-10}"
    RUN_EXPLAIN="${RUN_EXPLAIN:-false}"
    RUN_WORKER_BENCHMARK="${RUN_WORKER_BENCHMARK:-false}"
    ;;
  worker_slo)
    BENCH_MODE="${BENCH_MODE:-recall}"
    RECALL_REQUESTS="${RECALL_REQUESTS:-60}"
    RECALL_CONCURRENCY="${RECALL_CONCURRENCY:-4}"
    WRITE_REQUESTS="${WRITE_REQUESTS:-20}"
    WRITE_CONCURRENCY="${WRITE_CONCURRENCY:-1}"
    RUN_EXPLAIN="${RUN_EXPLAIN:-false}"
    RUN_WORKER_BENCHMARK="${RUN_WORKER_BENCHMARK:-true}"
    WORKER_BACKLOG_WRITES="${WORKER_BACKLOG_WRITES:-200}"
    WORKER_BACKLOG_CONCURRENCY="${WORKER_BACKLOG_CONCURRENCY:-1}"
    EMBED_ON_WRITE="${EMBED_ON_WRITE:-false}"
    ;;
  *)
    echo "invalid PERF_PROFILE: ${PERF_PROFILE}. expected: balanced|recall_slo|write_slo|worker_slo" >&2
    exit 1
    ;;
esac

BENCH_MODE="${BENCH_MODE:-all}"
BENCH_WARMUP="${BENCH_WARMUP:-20}"
EMBED_ON_WRITE="${EMBED_ON_WRITE:-false}"
RECALL_REQUESTS="${RECALL_REQUESTS:-200}"
RECALL_CONCURRENCY="${RECALL_CONCURRENCY:-12}"
WRITE_REQUESTS="${WRITE_REQUESTS:-100}"
WRITE_CONCURRENCY="${WRITE_CONCURRENCY:-4}"
RUN_EXPLAIN="${RUN_EXPLAIN:-true}"
RUN_WORKER_BENCHMARK="${RUN_WORKER_BENCHMARK:-true}"
WORKER_ITERATIONS="${WORKER_ITERATIONS:-8}"
WORKER_BACKLOG_WRITES="${WORKER_BACKLOG_WRITES:-120}"
WORKER_BACKLOG_CONCURRENCY="${WORKER_BACKLOG_CONCURRENCY:-1}"

if [[ -z "${AUTO_ADAPT_RATE_LIMIT}" ]]; then
  if [[ "${PERF_PROFILE}" == "recall_slo" || "${PERF_PROFILE}" == "write_slo" ]]; then
    AUTO_ADAPT_RATE_LIMIT=true
  else
    AUTO_ADAPT_RATE_LIMIT=false
  fi
fi

if [[ -z "${BENCH_FAIL_ON_TRANSPORT_ERROR_RATE}" ]]; then
  if [[ "${PERF_PROFILE}" == "recall_slo" || "${PERF_PROFILE}" == "write_slo" ]]; then
    BENCH_FAIL_ON_TRANSPORT_ERROR_RATE=0
  fi
fi

echo "[phase-d] output dir: ${OUT_DIR}"
echo "[phase-d] base url: ${BASE_URL}"
echo "[phase-d] profile: ${PERF_PROFILE}"
echo "[phase-d] scales: ${SCALES}"
echo "[phase-d] benchmark mode: ${BENCH_MODE}"
echo "[phase-d] scope strategy: ${SCOPE_STRATEGY} (reset mode: ${RESET_MODE})"
echo "[phase-d] reset impl: ${RESET_IMPL} (purge mode: ${RESET_PURGE_MODE}, allow fallback delete: ${RESET_PURGE_ALLOW_FALLBACK_DELETE}, fail on delete: ${RESET_PURGE_FAIL_ON_DELETE})"
echo "[phase-d] rate-limit adapt: ${AUTO_ADAPT_RATE_LIMIT} (max retries: ${MAX_RATE_LIMIT_RETRIES}, pace ms: ${BENCH_PACE_MS})"
if [[ -n "${BENCH_FAIL_ON_TRANSPORT_ERROR_RATE}" ]]; then
  echo "[phase-d] transport error gate threshold: ${BENCH_FAIL_ON_TRANSPORT_ERROR_RATE}"
fi

FIRST_SCOPE=""

for scale in $(echo "${SCALES}" | tr ',' ' '); do
  if [[ "${SCOPE_STRATEGY}" == "isolated" ]]; then
    scope="${SCOPE_PREFIX}_${scale}_${MATRIX_TAG}"
  else
    scope="${SCOPE_PREFIX}_${scale}"
  fi
  if [[ -z "${FIRST_SCOPE}" ]]; then FIRST_SCOPE="${scope}"; fi
  topics=$((scale / TOPIC_RATIO))
  if [[ "${topics}" -lt 1 ]]; then topics=1; fi

  do_reset=false
  case "${RESET_MODE}" in
    always)
      do_reset=true
      ;;
    never)
      do_reset=false
      ;;
    auto)
      if [[ "${SCOPE_STRATEGY}" == "isolated" ]]; then
        do_reset=false
      else
        do_reset=true
      fi
      ;;
    *)
      echo "invalid RESET_MODE=${RESET_MODE}; expected auto|always|never" >&2
      exit 1
      ;;
  esac

  echo ""
  echo "[scale=${scale}] seed scope=${scope} topics=${topics} reset=${do_reset}"
  if [[ "${do_reset}" == "true" && "${PERF_OFFLINE_WINDOW}" != "true" ]]; then
    echo "refusing reset without offline window: set PERF_OFFLINE_WINDOW=true (or use RESET_MODE=never / SCOPE_STRATEGY=isolated)" >&2
    exit 1
  fi
  if [[ "${do_reset}" == "true" && "${RESET_IMPL}" == "scope_purge" ]]; then
    echo "[scale=${scale}] purge scope via job:scope-purge"
    purge_cmd=(
      npm
      run
      -s
      job:scope-purge
      --
      --scope
      "${scope}"
      --tenant-id
      "${TENANT_ID}"
      --mode
      "${RESET_PURGE_MODE}"
      --batch-size
      "5000"
      --apply
    )
    if [[ "${RESET_PURGE_ALLOW_FALLBACK_DELETE}" == "true" ]]; then
      purge_cmd+=(--allow-fallback-delete)
    fi
    if [[ "${RESET_PURGE_FAIL_ON_DELETE}" == "true" ]]; then
      purge_cmd+=(--fail-on-delete)
    fi
    "${purge_cmd[@]}" | tee "${OUT_DIR}/purge_${scale}.json"
  fi
  seed_cmd=(
    npm
    run
    -s
    job:perf-seed
    --
    --scope
    "${scope}"
    --tenant-id
    "${TENANT_ID}"
    --src-scope
    "${SRC_SCOPE}"
    --src-tenant-id
    "${SRC_TENANT_ID}"
    --events
    "${scale}"
    --reset-batch
    "5000"
    --topics
    "${topics}"
  )
  if [[ "${do_reset}" == "true" && "${RESET_IMPL}" == "perf_seed" ]]; then
    seed_cmd+=(--reset)
  fi
  "${seed_cmd[@]}" | tee "${OUT_DIR}/seed_${scale}.json"

  bench_file="${OUT_DIR}/benchmark_${scale}.json"
  bench_recall_concurrency="${RECALL_CONCURRENCY}"
  bench_write_concurrency="${WRITE_CONCURRENCY}"
  bench_pace_ms="${BENCH_PACE_MS}"
  initial_recall_concurrency="${bench_recall_concurrency}"
  initial_write_concurrency="${bench_write_concurrency}"
  initial_pace_ms="${bench_pace_ms}"
  bench_attempt=0
  c429=0
  total_requests=0
  allowed_429=0
  rate_limit_exhausted=false
  while true; do
    echo "[scale=${scale}] benchmark attempt=$((bench_attempt + 1)) recall_concurrency=${bench_recall_concurrency} write_concurrency=${bench_write_concurrency} pace_ms=${bench_pace_ms}"
    bench_cmd=(
      npm run -s job:perf-benchmark --
      --base-url "${BASE_URL}"
      --scope "${scope}"
      --tenant-id "${TENANT_ID}"
      --mode "${BENCH_MODE}"
      --warmup "${BENCH_WARMUP}"
      --recall-requests "${RECALL_REQUESTS}"
      --recall-concurrency "${bench_recall_concurrency}"
      --write-requests "${WRITE_REQUESTS}"
      --write-concurrency "${bench_write_concurrency}"
      --pace-ms "${bench_pace_ms}"
      --embed-on-write "${EMBED_ON_WRITE}"
    )
    if [[ -n "${BENCH_FAIL_ON_TRANSPORT_ERROR_RATE}" ]]; then
      bench_cmd+=(--fail-on-transport-error-rate "${BENCH_FAIL_ON_TRANSPORT_ERROR_RATE}")
    fi
    "${bench_cmd[@]}" | tee "${bench_file}"

    cp "${bench_file}" "${OUT_DIR}/benchmark_${scale}_attempt$((bench_attempt + 1)).json"

    if [[ "${AUTO_ADAPT_RATE_LIMIT}" != "true" ]]; then
      break
    fi

    c429="$(jq -r '([.cases[]? | (.by_status["429"] // 0)] | add) // 0' "${bench_file}" 2>/dev/null || echo 0)"
    total_requests="$(jq -r '([.cases[]? | .total] | add) // 0' "${bench_file}" 2>/dev/null || echo 0)"
    allowed_429="$(awk -v t="${total_requests}" -v r="${SLO_MAX_ERROR_RATE}" 'BEGIN{v=t*r; if (v < 0) v = 0; if (v == int(v)) printf "%d", v; else printf "%d", int(v)+1;}')"
    if [[ "${c429}" -le "${allowed_429}" ]]; then
      break
    fi

    if [[ "${bench_attempt}" -ge "${MAX_RATE_LIMIT_RETRIES}" ]]; then
      echo "[scale=${scale}] rate-limit adapt exhausted (429=${c429}, allowed=${allowed_429}, retries=${MAX_RATE_LIMIT_RETRIES})"
      rate_limit_exhausted=true
      break
    fi

    changed=false
    if [[ "${BENCH_MODE}" != "write" && "${bench_recall_concurrency}" -gt 1 ]]; then
      bench_recall_concurrency=$((bench_recall_concurrency / 2))
      if [[ "${bench_recall_concurrency}" -lt 1 ]]; then bench_recall_concurrency=1; fi
      changed=true
    fi
    if [[ "${BENCH_MODE}" != "recall" && "${bench_write_concurrency}" -gt 1 ]]; then
      bench_write_concurrency=$((bench_write_concurrency / 2))
      if [[ "${bench_write_concurrency}" -lt 1 ]]; then bench_write_concurrency=1; fi
      changed=true
    fi

    # Always increase pace on 429; use larger steps when overload ratio is high.
    if [[ "${bench_pace_ms}" -lt "${PACE_MAX_MS}" ]]; then
      pace_step_mult=1
      if [[ "${total_requests}" -gt 0 ]]; then
        pace_step_mult="$(awk -v c="${c429}" -v t="${total_requests}" 'BEGIN{r=c/t; if (r >= 0.50) print 4; else if (r >= 0.20) print 3; else if (r >= 0.05) print 2; else print 1;}')"
      fi
      pace_inc=$((PACE_STEP_MS * pace_step_mult))
      if [[ "${pace_inc}" -lt 1 ]]; then pace_inc=1; fi
      next_pace=$((bench_pace_ms + pace_inc))
      if [[ "${next_pace}" -gt "${PACE_MAX_MS}" ]]; then next_pace="${PACE_MAX_MS}"; fi
      if [[ "${next_pace}" -gt "${bench_pace_ms}" ]]; then
        bench_pace_ms="${next_pace}"
        changed=true
      fi
    fi

    if [[ "${changed}" != "true" ]]; then
      echo "[scale=${scale}] cannot reduce rate further (429=${c429}, allowed=${allowed_429})"
      break
    fi
    bench_attempt=$((bench_attempt + 1))
    echo "[scale=${scale}] retry benchmark due to 429=${c429} (allowed=${allowed_429})"
  done

  last_429_rate="$(awk -v c="${c429}" -v t="${total_requests}" 'BEGIN{if (t>0) printf "%.6f", (c/t); else printf "0"}')"
  jq -n \
    --argjson scale "${scale}" \
    --argjson auto_adapt "$([[ "${AUTO_ADAPT_RATE_LIMIT}" == "true" ]] && echo true || echo false)" \
    --argjson max_rate_limit_retries "${MAX_RATE_LIMIT_RETRIES}" \
    --argjson retries_used "${bench_attempt}" \
    --argjson attempts_total "$((bench_attempt + 1))" \
    --argjson exhausted "$([[ "${rate_limit_exhausted}" == "true" ]] && echo true || echo false)" \
    --argjson initial_recall_concurrency "${initial_recall_concurrency}" \
    --argjson initial_write_concurrency "${initial_write_concurrency}" \
    --argjson initial_pace_ms "${initial_pace_ms}" \
    --argjson final_recall_concurrency "${bench_recall_concurrency}" \
    --argjson final_write_concurrency "${bench_write_concurrency}" \
    --argjson final_pace_ms "${bench_pace_ms}" \
    --argjson last_429 "${c429}" \
    --argjson last_total_requests "${total_requests}" \
    --argjson last_allowed_429 "${allowed_429}" \
    --argjson last_429_rate "${last_429_rate}" \
    '{
      scale: $scale,
      auto_adapt: $auto_adapt,
      max_rate_limit_retries: $max_rate_limit_retries,
      retries_used: $retries_used,
      attempts_total: $attempts_total,
      exhausted: $exhausted,
      initial: {
        recall_concurrency: $initial_recall_concurrency,
        write_concurrency: $initial_write_concurrency,
        pace_ms: $initial_pace_ms
      },
      final: {
        recall_concurrency: $final_recall_concurrency,
        write_concurrency: $final_write_concurrency,
        pace_ms: $final_pace_ms,
        last_429: $last_429,
        last_total_requests: $last_total_requests,
        last_allowed_429: $last_allowed_429,
        last_429_rate: $last_429_rate
      }
    }' > "${OUT_DIR}/benchmark_adapt_${scale}.json"

  if [[ "${RUN_EXPLAIN}" == "true" ]]; then
    echo "[scale=${scale}] explain baseline"
    psql "${DATABASE_URL}" \
      -v scope="${scope}" \
      -v lim='30' \
      -f "${ROOT_DIR}/sql/explain_baseline.sql" \
      > "${OUT_DIR}/explain_${scale}.txt"
  fi
done

echo ""
if [[ "${RUN_WORKER_BENCHMARK}" == "true" ]]; then
  if [[ -z "${WORKER_SCOPE}" ]]; then
    if [[ "${PERF_PROFILE}" == "worker_slo" ]]; then
      WORKER_SCOPE="${FIRST_SCOPE:-${SRC_SCOPE}}"
    else
      WORKER_SCOPE="${SRC_SCOPE}"
    fi
  fi
  if [[ "${PERF_PROFILE}" == "worker_slo" && "${WORKER_BACKLOG_WRITES}" -gt 0 ]]; then
    echo "[worker] building outbox backlog in scope=${WORKER_SCOPE} writes=${WORKER_BACKLOG_WRITES}"
    npm run -s job:perf-benchmark -- \
      --base-url "${BASE_URL}" \
      --scope "${WORKER_SCOPE}" \
      --tenant-id "${TENANT_ID}" \
      --mode write \
      --warmup 0 \
      --write-requests "${WORKER_BACKLOG_WRITES}" \
      --write-concurrency "${WORKER_BACKLOG_CONCURRENCY}" \
      --embed-on-write true \
      > "${OUT_DIR}/worker_backlog_write.json"
  fi

  echo "[worker] throughput baseline scope=${WORKER_SCOPE}"
  npm run -s job:perf-worker-benchmark -- \
    --scope "${WORKER_SCOPE}" \
    --iterations "${WORKER_ITERATIONS}" \
    | tee "${OUT_DIR}/worker_baseline.json"
else
  echo "[worker] throughput baseline (skipped)"
fi

echo ""
echo "[report] generate PERFORMANCE_REPORT_V1.md"
npm run -s job:perf-report -- \
  --dir "${OUT_DIR}" \
  --output "${OUT_DIR}/PERFORMANCE_REPORT_V1.md" \
  --slo-recall-p95-ms "${SLO_RECALL_P95_MS}" \
  --slo-write-p95-ms "${SLO_WRITE_P95_MS}" \
  --slo-max-error-rate "${SLO_MAX_ERROR_RATE}"

echo "done: ${OUT_DIR}/PERFORMANCE_REPORT_V1.md"
