#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

PORT="${PORT:-3005}"
SCOPE="${MEMORY_SCOPE:-default}"
DB_URL="${DATABASE_URL:-}"
AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
API_KEY="${API_KEY:-${PERF_API_KEY:-}}"
AUTH_BEARER="${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "DATABASE_URL is empty; load .env first." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required." >&2
  exit 1
fi

infer_api_key() {
  if [[ -n "${API_KEY}" ]]; then
    echo "${API_KEY}"
    return 0
  fi
  if [[ -n "${MEMORY_API_KEYS_JSON:-}" ]]; then
    echo "${MEMORY_API_KEYS_JSON}" | jq -r 'keys[0] // empty' 2>/dev/null || true
    return 0
  fi
  echo ""
}

AUTH_ARGS=()
if [[ -n "${AUTH_BEARER}" ]]; then
  AUTH_ARGS+=(-H "Authorization: Bearer ${AUTH_BEARER}")
fi
if [[ -z "${AUTH_BEARER}" ]]; then
  inferred_key="$(infer_api_key)"
  if [[ -n "${inferred_key}" ]]; then
    AUTH_ARGS+=(-H "X-Api-Key: ${inferred_key}")
  fi
fi

case "${AUTH_MODE}" in
  api_key)
    if [[ ${#AUTH_ARGS[@]} -eq 0 ]]; then
      echo "MEMORY_AUTH_MODE=api_key but no API key found (set API_KEY or MEMORY_API_KEYS_JSON)." >&2
      exit 1
    fi
    ;;
  jwt)
    if [[ -z "${AUTH_BEARER}" ]]; then
      echo "MEMORY_AUTH_MODE=jwt but AUTH_BEARER is empty." >&2
      exit 1
    fi
    ;;
  api_key_or_jwt)
    if [[ ${#AUTH_ARGS[@]} -eq 0 ]]; then
      echo "MEMORY_AUTH_MODE=api_key_or_jwt but neither key nor bearer provided." >&2
      exit 1
    fi
    ;;
esac

call_memory_post() {
  local endpoint="$1"
  local payload="$2"
  local curl_args=(
    -sS
    "localhost:${PORT}${endpoint}"
    -H 'content-type: application/json'
  )
  if [[ ${#AUTH_ARGS[@]} -gt 0 ]]; then
    curl_args+=("${AUTH_ARGS[@]}")
  fi
  curl_args+=(--data-binary "$payload")
  curl "${curl_args[@]}"
}

if ! curl -fsS "localhost:${PORT}/health" >/dev/null; then
  echo "API is not reachable at localhost:${PORT}. Start server first (npm run dev)." >&2
  exit 1
fi

stamp="$(date +%s)"
CID="${CID:-ltm_phase4_${stamp}}"
RUN_ID="${RUN_ID:-ltm_phase4_run_${stamp}}"

write_payload="$(
  jq -cn \
    --arg scope "$SCOPE" \
    --arg cid "$CID" \
    --arg summary "phase4 smoke event ${CID}" \
    '{
      scope: $scope,
      input_text: "phase4 smoke write",
      auto_embed: true,
      nodes: [
        {
          client_id: $cid,
          type: "event",
          text_summary: $summary
        }
      ]
    }'
)"

write_json="$(call_memory_post "/v1/memory/write" "$write_payload")"
node_id="$(echo "$write_json" | jq -r '.nodes[0].id // empty')"
if [[ -z "$node_id" ]]; then
  echo "write failed:" >&2
  echo "$write_json" | jq . >&2
  exit 1
fi

echo "== write summary =="
echo "$write_json" | jq '{commit_id, node_id:(.nodes[0].id), client_id:(.nodes[0].client_id), embedding_backfill:(.embedding_backfill // null)}'

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
update memory_nodes
set tier='archive'::memory_tier
where scope='${SCOPE}' and id='${node_id}'::uuid;
" >/dev/null

rehydrate_payload="$(
  jq -cn \
    --arg scope "$SCOPE" \
    --arg cid "$CID" \
    '{
      scope: $scope,
      client_ids: [$cid],
      target_tier: "warm",
      reason: "phase4 smoke",
      input_text: "phase4 smoke rehydrate"
    }'
)"

rehydrate_json="$(call_memory_post "/v1/memory/archive/rehydrate" "$rehydrate_payload")"

echo
echo "== rehydrate summary =="
echo "$rehydrate_json" | jq '{commit_id, target_tier, rehydrated}'

activate_payload="$(
  jq -cn \
    --arg scope "$SCOPE" \
    --arg cid "$CID" \
    --arg run_id "$RUN_ID" \
    '{
      scope: $scope,
      client_ids: [$cid],
      outcome: "positive",
      activate: true,
      run_id: $run_id,
      reason: "phase4 smoke positive feedback",
      input_text: "phase4 smoke activate"
    }'
)"

activate_json="$(call_memory_post "/v1/memory/nodes/activate" "$activate_payload")"

echo
echo "== activate summary =="
echo "$activate_json" | jq '{commit_id, activated}'

echo
echo "== salience decay =="
npm run -s job:salience-decay | jq '{ok, updated_salience, transitions_total, adaptive_feedback_positive_nodes, moved_hot_to_warm, moved_warm_to_cold, moved_cold_to_archive}'

echo
echo "== quality eval (strict) =="
npm run -s job:quality-eval -- --strict | jq '{ok, summary, failed_checks}'

echo
echo "== node snapshot =="
psql "$DB_URL" -P pager=off -c "
select
  id,
  client_id,
  tier,
  embedding_status,
  coalesce(slots->>'feedback_positive','0') as feedback_positive,
  coalesce(slots->>'feedback_negative','0') as feedback_negative,
  coalesce(slots->>'feedback_quality','0') as feedback_quality,
  slots->>'last_rehydrated_to_tier' as last_rehydrated_to_tier,
  slots->>'last_feedback_outcome' as last_feedback_outcome
from memory_nodes
where scope='${SCOPE}' and client_id='${CID}'
limit 1;
"
