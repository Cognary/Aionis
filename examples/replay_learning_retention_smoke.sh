#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need curl
need jq
need psql
need npm
need node

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
DB_URL="${DATABASE_URL:-}"
SCOPE="${SCOPE:-retention_smoke_$(date +%s)}"
AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
API_KEY="${API_KEY:-${PERF_API_KEY:-}}"
AUTH_BEARER="${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}"

if [[ -z "$DB_URL" ]]; then
  echo "DATABASE_URL is empty; load .env first." >&2
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
      echo "MEMORY_AUTH_MODE=api_key but no API key found." >&2
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

if ! curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "API is not reachable at ${BASE_URL}" >&2
  exit 1
fi

call_memory_post() {
  local endpoint="$1"
  local payload="$2"
  local curl_args=(
    -sS
    "${BASE_URL}${endpoint}"
    -H 'content-type: application/json'
  )
  if [[ ${#AUTH_ARGS[@]} -gt 0 ]]; then
    curl_args+=("${AUTH_ARGS[@]}")
  fi
  curl_args+=(--data-binary "$payload")
  curl "${curl_args[@]}"
}

TTL_CLIENT_ID="retention-ttl-event"
STABLE_CLIENT_ID="retention-rule-stable-event"
RULE_CLIENT_ID="retention-active-rule"
TTL_EXPIRED_AT="2000-01-01T00:00:00.000Z"

seed_payload="$(
  jq -cn \
    --arg scope "$SCOPE" \
    --arg ttl_client "$TTL_CLIENT_ID" \
    --arg stable_client "$STABLE_CLIENT_ID" \
    --arg rule_client "$RULE_CLIENT_ID" \
    --arg ttl_expires_at "$TTL_EXPIRED_AT" \
    '{
      scope: $scope,
      input_text: "replay learning retention smoke seed",
      auto_embed: false,
      nodes: [
        {
          client_id: $rule_client,
          type: "rule",
          memory_lane: "shared",
          text_summary: "retention smoke active rule",
          slots: {
            if: { tags_any: ["retention-smoke"] },
            then: { tool: { prefer: ["send_email"] } },
            exceptions: [],
            rule_scope: "global"
          }
        },
        {
          client_id: $ttl_client,
          type: "event",
          memory_lane: "shared",
          text_summary: "retention smoke ttl-expired learning episode",
          slots: {
            replay_learning_episode: true,
            lifecycle_state: "active",
            archive_candidate: true,
            ttl_expires_at: $ttl_expires_at
          }
        },
        {
          client_id: $stable_client,
          type: "event",
          memory_lane: "shared",
          text_summary: "retention smoke rule-stabilized learning episode",
          slots: {
            replay_learning_episode: true,
            lifecycle_state: "active",
            archive_candidate: true
          }
        }
      ]
    }'
)"

seed_json="$(call_memory_post "/v1/memory/write" "$seed_payload")"
rule_node_id="$(echo "$seed_json" | jq -r --arg cid "$RULE_CLIENT_ID" '(.nodes // []) | map(select(.client_id==$cid))[0].id // empty')"
ttl_node_id="$(echo "$seed_json" | jq -r --arg cid "$TTL_CLIENT_ID" '(.nodes // []) | map(select(.client_id==$cid))[0].id // empty')"
stable_node_id="$(echo "$seed_json" | jq -r --arg cid "$STABLE_CLIENT_ID" '(.nodes // []) | map(select(.client_id==$cid))[0].id // empty')"

if [[ -z "$rule_node_id" || -z "$ttl_node_id" || -z "$stable_node_id" ]]; then
  echo "seed write missing required node ids:" >&2
  echo "$seed_json" | jq . >&2
  exit 1
fi

rule_state_payload="$(
  jq -cn \
    --arg scope "$SCOPE" \
    --arg rule_node_id "$rule_node_id" \
    '{
      scope: $scope,
      rule_node_id: $rule_node_id,
      state: "active",
      input_text: "retention smoke promote rule active",
      actor: "retention_smoke"
    }'
)"
call_memory_post "/v1/memory/rules/state" "$rule_state_payload" >/dev/null

psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null
UPDATE memory_rule_defs
SET
  state = 'active',
  positive_count = GREATEST(positive_count, 10),
  updated_at = now()
WHERE scope='${SCOPE}'
  AND rule_node_id='${rule_node_id}'::uuid;

UPDATE memory_nodes
SET slots =
  jsonb_set(
    jsonb_set(
      coalesce(slots, '{}'::jsonb),
      '{source_rule_node_id}',
      to_jsonb('${rule_node_id}'::text),
      true
    ),
    '{replay_learning,source_rule_node_id}',
    to_jsonb('${rule_node_id}'::text),
    true
  )
WHERE scope='${SCOPE}'
  AND id='${stable_node_id}'::uuid;
SQL

retention_json="$(npm run -s job:replay-learning-retention -- --apply --scope "${SCOPE}" --batch-size 100 --ttl-days 30 --stable-positive-min 10 --negative-window-days 7)"
echo "$retention_json" | jq '{ok, scope, candidates, archived, totals}'

snapshot_json="$(
  psql "$DB_URL" -At -v ON_ERROR_STOP=1 -c "
    SELECT coalesce(
      json_agg(
        json_build_object(
          'client_id', n.client_id,
          'tier', n.tier::text,
          'lifecycle_state', coalesce(n.slots->>'lifecycle_state', ''),
          'archived_reason', coalesce(n.slots->>'archived_reason', '')
        )
        ORDER BY n.client_id
      ),
      '[]'::json
    )::text
    FROM memory_nodes n
    WHERE n.scope='${SCOPE}'
      AND n.client_id IN ('${TTL_CLIENT_ID}', '${STABLE_CLIENT_ID}');
  "
)"

node - "$snapshot_json" "$TTL_CLIENT_ID" "$STABLE_CLIENT_ID" <<'JS'
const rows = JSON.parse(process.argv[2] || "[]");
const ttlCid = process.argv[3];
const stableCid = process.argv[4];
const byClient = new Map(rows.map((r) => [String(r.client_id), r]));
const ttl = byClient.get(ttlCid);
const stable = byClient.get(stableCid);
if (!ttl || !stable) {
  console.error("missing retention smoke rows", rows);
  process.exit(1);
}
if (ttl.tier !== "archive" || ttl.lifecycle_state !== "archived" || ttl.archived_reason !== "ttl_expired") {
  console.error("ttl archive assertion failed", ttl);
  process.exit(1);
}
if (
  stable.tier !== "archive"
  || stable.lifecycle_state !== "archived"
  || stable.archived_reason !== "rule_stabilized"
) {
  console.error("rule-stabilized archive assertion failed", stable);
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      ok: true,
      ttl,
      stable,
    },
    null,
    2,
  ),
);
JS

echo "ok: replay learning retention smoke passed"
