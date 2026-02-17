#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
SCOPE="${MEMORY_SCOPE:-default}"
TENANT_A="${TENANT_A:-tenant_a}"
TENANT_B="${TENANT_B:-tenant_b}"
API_KEY="${API_KEY:-}"
AUTH_BEARER="${AUTH_BEARER:-}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need curl
need jq

AUTH_ARGS=()
if [[ -n "${API_KEY}" ]]; then
  AUTH_ARGS=(-H "X-Api-Key: ${API_KEY}")
fi
if [[ -n "${AUTH_BEARER}" ]]; then
  AUTH_ARGS+=(-H "Authorization: Bearer ${AUTH_BEARER}")
fi

echo "[1/4] write + activate rule in ${TENANT_A}"
RULE_A_ID="$(
  curl -sS "${BASE_URL}/v1/memory/write" \
    -H 'content-type: application/json' \
    "${AUTH_ARGS[@]}" \
    -d "{
      \"tenant_id\":\"${TENANT_A}\",
      \"scope\":\"${SCOPE}\",
      \"memory_lane\":\"shared\",
      \"input_text\":\"tenant smoke rule a\",
      \"nodes\":[
        {
          \"client_id\":\"tenant_smoke_rule_a\",
          \"type\":\"rule\",
          \"text_summary\":\"tenant A rule\",
          \"slots\":{
            \"if\":{\"intent\":\"json\"},
            \"then\":{\"output\":{\"format\":\"json\",\"strict\":true}}
          }
        }
      ]
    }" | jq -r '.nodes[0].id'
)"

curl -sS "${BASE_URL}/v1/memory/rules/state" \
  -H 'content-type: application/json' \
  "${AUTH_ARGS[@]}" \
  -d "{
    \"tenant_id\":\"${TENANT_A}\",
    \"scope\":\"${SCOPE}\",
    \"rule_node_id\":\"${RULE_A_ID}\",
    \"state\":\"active\",
    \"input_text\":\"activate tenant a rule\"
  }" >/dev/null

echo "[2/4] write + activate rule in ${TENANT_B}"
RULE_B_ID="$(
  curl -sS "${BASE_URL}/v1/memory/write" \
  -H 'content-type: application/json' \
  "${AUTH_ARGS[@]}" \
    -d "{
      \"tenant_id\":\"${TENANT_B}\",
      \"scope\":\"${SCOPE}\",
      \"memory_lane\":\"shared\",
      \"input_text\":\"tenant smoke rule b\",
      \"nodes\":[
        {
          \"client_id\":\"tenant_smoke_rule_b\",
          \"type\":\"rule\",
          \"text_summary\":\"tenant B rule\",
          \"slots\":{
            \"if\":{\"intent\":\"json\"},
            \"then\":{\"output\":{\"format\":\"text\",\"strict\":false}}
          }
        }
      ]
    }" | jq -r '.nodes[0].id'
)"

curl -sS "${BASE_URL}/v1/memory/rules/state" \
  -H 'content-type: application/json' \
  "${AUTH_ARGS[@]}" \
  -d "{
    \"tenant_id\":\"${TENANT_B}\",
    \"scope\":\"${SCOPE}\",
    \"rule_node_id\":\"${RULE_B_ID}\",
    \"state\":\"active\",
    \"input_text\":\"activate tenant b rule\"
  }" >/dev/null

echo "[3/4] evaluate tenant A"
curl -sS "${BASE_URL}/v1/memory/rules/evaluate" \
  -H 'content-type: application/json' \
  "${AUTH_ARGS[@]}" \
  -d "{
    \"tenant_id\":\"${TENANT_A}\",
    \"scope\":\"${SCOPE}\",
    \"context\":{\"intent\":\"json\"},
    \"include_shadow\":false,
    \"limit\":50
  }" | jq '{tenant_id, scope, matched, applied:.applied.policy.output, source_ids:(.applied.sources|map(.rule_node_id))}'

echo "[4/4] evaluate tenant B"
curl -sS "${BASE_URL}/v1/memory/rules/evaluate" \
  -H 'content-type: application/json' \
  "${AUTH_ARGS[@]}" \
  -d "{
    \"tenant_id\":\"${TENANT_B}\",
    \"scope\":\"${SCOPE}\",
    \"context\":{\"intent\":\"json\"},
    \"include_shadow\":false,
    \"limit\":50
  }" | jq '{tenant_id, scope, matched, applied:.applied.policy.output, source_ids:(.applied.sources|map(.rule_node_id))}'

echo "ok: tenant isolation smoke completed"
