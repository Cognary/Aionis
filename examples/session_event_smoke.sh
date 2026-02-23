#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:${PORT:-3001}}"
SCOPE="${SCOPE:-session_smoke_$(date +%s)}"
TENANT_ID="${TENANT_ID:-default}"
SESSION_ID="${SESSION_ID:-sess_$(date +%s)}"

AUTH_ARGS=()
if [[ -n "${API_KEY:-}" ]]; then
  AUTH_ARGS+=( -H "X-Api-Key: ${API_KEY}" )
fi
if [[ -n "${ADMIN_TOKEN:-}" ]]; then
  AUTH_ARGS+=( -H "X-Admin-Token: ${ADMIN_TOKEN}" )
fi

post_json() {
  local path="$1"
  local payload="$2"
  curl -sS "${BASE_URL}${path}" \
    -H "content-type: application/json" \
    "${AUTH_ARGS[@]}" \
    --data-binary "${payload}"
}

echo "== health =="
curl -fsS "${BASE_URL}/health" | jq .

echo
echo "== create session =="
session_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg sid "$SESSION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      session_id:$sid,
      title:("Session "+$sid),
      text_summary:"session smoke",
      input_text:"session smoke create",
      auto_embed:false,
      memory_lane:"shared"
    }'
)"
session_json="$(post_json "/v1/memory/sessions" "$session_payload")"
echo "$session_json" | jq '{session_id, session_node_id, session_uri, commit_id}'

echo
echo "== append events =="
for i in 1 2 3; do
  event_payload="$(
    jq -cn \
      --arg tenant "$TENANT_ID" \
      --arg scope "$SCOPE" \
      --arg sid "$SESSION_ID" \
      --arg eid "evt_${i}" \
      --arg txt "session event ${i}" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        session_id:$sid,
        event_id:$eid,
        title:$txt,
        text_summary:$txt,
        input_text:$txt,
        auto_embed:false,
        memory_lane:"shared"
      }'
  )"
  post_json "/v1/memory/events" "$event_payload" | jq '{event_id, event_node_id, commit_id}'
done

echo
echo "== list session events =="
curl -sS "${BASE_URL}/v1/memory/sessions/${SESSION_ID}/events?tenant_id=${TENANT_ID}&scope=${SCOPE}&limit=20&include_meta=true" \
  -H "content-type: application/json" \
  "${AUTH_ARGS[@]}" \
  | jq '{session, count:(.events|length), event_ids:(.events|map(.event_id)), page}'

echo
echo "ok: session_event_smoke completed"

