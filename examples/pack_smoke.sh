#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:${PORT:-3001}}"
SCOPE="${SCOPE:-pack_smoke_$(date +%s)}"
TENANT_ID="${TENANT_ID:-default}"
CID="pack_evt_$(date +%s)"

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
echo "== seed one event =="
seed_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg cid "$CID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      input_text:"pack smoke seed",
      auto_embed:false,
      memory_lane:"shared",
      nodes:[{client_id:$cid,type:"event",text_summary:"pack smoke event"}],
      edges:[]
    }'
)"
post_json "/v1/memory/write" "$seed_payload" | jq '{commit_id, node:(.nodes[0] // null)}'

echo
echo "== export pack =="
export_payload="$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" '{tenant_id:$tenant, scope:$scope, max_rows:1000}'
)"
pack_json="$(post_json "/v1/memory/packs/export" "$export_payload")"
echo "$pack_json" | jq '{manifest, counts:{nodes:(.pack.nodes|length), edges:(.pack.edges|length), commits:(.pack.commits|length)}}'

pack_sha="$(echo "$pack_json" | jq -r '.manifest.sha256')"
pack_body="$(echo "$pack_json" | jq '.pack')"

echo
echo "== import verify only =="
verify_payload="$(jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg sha "$pack_sha" --argjson p "$pack_body" '{tenant_id:$tenant,scope:$scope,verify_only:true,manifest_sha256:$sha,pack:$p}')"
post_json "/v1/memory/packs/import" "$verify_payload" | jq .

echo
echo "== import execute =="
import_payload="$(jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg sha "$pack_sha" --argjson p "$pack_body" '{tenant_id:$tenant,scope:$scope,verify_only:false,manifest_sha256:$sha,pack:$p}')"
post_json "/v1/memory/packs/import" "$import_payload" | jq .

echo
echo "== find by client_id after import =="
find_payload="$(jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg cid "$CID" '{tenant_id:$tenant,scope:$scope,client_id:$cid,limit:10}')"
post_json "/v1/memory/find" "$find_payload" | jq '{returned:(.nodes|length), first:(.nodes[0] // null)}'

echo
echo "ok: pack_smoke completed"

