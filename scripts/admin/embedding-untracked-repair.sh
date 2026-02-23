#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need npm
need jq

SCOPE="${MEMORY_SCOPE:-default}"
LIMIT=5000
BATCH_SIZE=200
SAMPLE=20
MODEL=""
APPLY=false
RUN_WORKER_ONCE=false
WORKER_RUNS=3
STRICT=false
MAX_UNTRACKED_AFTER=0

usage() {
  cat <<USAGE
Usage: scripts/admin/embedding-untracked-repair.sh [options]

Default behavior is safe dry-run (read-only for data rows).

Options:
  --scope <scope>               Scope to repair (default: MEMORY_SCOPE or default)
  --limit <n>                   Max nodes selected for this run (default: 5000)
  --batch-size <n>              Nodes per embed_nodes outbox payload (default: 200)
  --sample <n>                  Sample rows in planning output (default: 20)
  --model <provider:model>      Force embedding_model label during repair
  --apply                       Execute repair writes (default: dry-run)
  --run-worker-once             After apply, run outbox worker --once
  --worker-runs <n>             Worker --once loops when --run-worker-once is set (default: 3)
  --strict                      Exit 2 if final embedding_untracked_nodes > --max-untracked-after
  --max-untracked-after <n>     Strict threshold for final untracked metric (default: 0)
  -h, --help                    Show help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      SCOPE="${2:-}"
      shift 2
      ;;
    --limit)
      LIMIT="${2:-}"
      shift 2
      ;;
    --batch-size)
      BATCH_SIZE="${2:-}"
      shift 2
      ;;
    --sample)
      SAMPLE="${2:-}"
      shift 2
      ;;
    --model)
      MODEL="${2:-}"
      shift 2
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    --run-worker-once)
      RUN_WORKER_ONCE=true
      shift
      ;;
    --worker-runs)
      WORKER_RUNS="${2:-}"
      shift 2
      ;;
    --strict)
      STRICT=true
      shift
      ;;
    --max-untracked-after)
      MAX_UNTRACKED_AFTER="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then
  echo "--limit must be an integer" >&2
  exit 1
fi
if ! [[ "$BATCH_SIZE" =~ ^[0-9]+$ ]]; then
  echo "--batch-size must be an integer" >&2
  exit 1
fi
if ! [[ "$SAMPLE" =~ ^[0-9]+$ ]]; then
  echo "--sample must be an integer" >&2
  exit 1
fi
if ! [[ "$WORKER_RUNS" =~ ^[0-9]+$ ]]; then
  echo "--worker-runs must be an integer" >&2
  exit 1
fi
if ! [[ "$MAX_UNTRACKED_AFTER" =~ ^[0-9]+$ ]]; then
  echo "--max-untracked-after must be an integer" >&2
  exit 1
fi

before_quality="$(npm run -s job:quality-eval -- --scope "${SCOPE}")"

repair_cmd=(npm run -s job:embedding-untracked-repair -- --scope "${SCOPE}" --limit "${LIMIT}" --batch-size "${BATCH_SIZE}" --sample "${SAMPLE}")
if [[ -n "${MODEL}" ]]; then
  repair_cmd+=(--model "${MODEL}")
fi
if [[ "${APPLY}" != "true" ]]; then
  repair_cmd+=(--dry-run)
fi

repair_json="$("${repair_cmd[@]}")"

worker_runs_executed=0
if [[ "${APPLY}" == "true" && "${RUN_WORKER_ONCE}" == "true" && "${WORKER_RUNS}" -gt 0 ]]; then
  for _ in $(seq 1 "${WORKER_RUNS}"); do
    npm run -s job:outbox-worker -- --once >/dev/null
    worker_runs_executed=$((worker_runs_executed + 1))
  done
fi

after_quality="$(npm run -s job:quality-eval -- --scope "${SCOPE}")"

summary="$(
  jq -n \
    --arg scope "${SCOPE}" \
    --argjson apply "$([[ "${APPLY}" == "true" ]] && echo true || echo false)" \
    --argjson run_worker_once "$([[ "${RUN_WORKER_ONCE}" == "true" ]] && echo true || echo false)" \
    --argjson worker_runs "${worker_runs_executed}" \
    --argjson before "${before_quality}" \
    --argjson repair "${repair_json}" \
    --argjson after "${after_quality}" \
    '{
      ok: true,
      scope: $scope,
      mode: (if $apply then "apply" else "dry_run" end),
      worker: {
        run_worker_once: $run_worker_once,
        runs_executed: $worker_runs
      },
      before: {
        embedding_untracked_nodes: ($before.metrics.embedding_untracked_nodes // 0),
        embedding_ready_ratio: ($before.metrics.embedding_ready_ratio // 0)
      },
      repair: {
        model: ($repair.model // null),
        selected: ($repair.planning.selected // 0),
        updated_nodes: ($repair.apply.updated_nodes // 0),
        enqueued_jobs: ($repair.apply.enqueued_jobs // 0),
        enqueued_nodes: ($repair.apply.enqueued_nodes // 0),
        remaining_untracked_after_enqueue: ($repair.apply.remaining_untracked // 0),
        commit_id: ($repair.apply.commit_id // null),
        commit_hash: ($repair.apply.commit_hash // null)
      },
      after: {
        embedding_untracked_nodes: ($after.metrics.embedding_untracked_nodes // 0),
        embedding_ready_ratio: ($after.metrics.embedding_ready_ratio // 0)
      },
      delta: {
        embedding_untracked_nodes: (($after.metrics.embedding_untracked_nodes // 0) - ($before.metrics.embedding_untracked_nodes // 0)),
        embedding_ready_ratio: (($after.metrics.embedding_ready_ratio // 0) - ($before.metrics.embedding_ready_ratio // 0))
      }
    }'
)"

echo "${summary}"

if [[ "${STRICT}" == "true" ]]; then
  after_untracked="$(echo "${summary}" | jq -r '.after.embedding_untracked_nodes // 0')"
  if [[ "${after_untracked}" -gt "${MAX_UNTRACKED_AFTER}" ]]; then
    exit 2
  fi
fi
