#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

need curl
need jq
need npm

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
SCOPE="${MEMORY_SCOPE:-default}"
RUN_ID="${RUN_ID:-$(date +%s)}"
TENANT_A="${TENANT_A:-tenant_e2e_a_${RUN_ID}}"
TENANT_B="${TENANT_B:-tenant_e2e_b_${RUN_ID}}"
API_KEY="${API_KEY:-}"
AUTH_BEARER="${AUTH_BEARER:-}"
AUTH_BOUND_TENANT="${AUTH_BOUND_TENANT:-}"

RULE_A_CLIENT="tenant_e2e_rule_a_${RUN_ID}"
RULE_B_CLIENT="tenant_e2e_rule_b_${RUN_ID}"

if [[ -n "${AUTH_BOUND_TENANT}" ]]; then
  TENANT_A="${AUTH_BOUND_TENANT}"
fi

tenant_b_blocked=false
if [[ -n "${AUTH_BOUND_TENANT}" && "${TENANT_B}" != "${AUTH_BOUND_TENANT}" ]]; then
  tenant_b_blocked=true
fi

AUTH_ARGS=()
if [[ -n "${API_KEY}" ]]; then
  AUTH_ARGS=(-H "X-Api-Key: ${API_KEY}")
fi
if [[ -n "${AUTH_BEARER}" ]]; then
  AUTH_ARGS+=(-H "Authorization: Bearer ${AUTH_BEARER}")
fi

post_json() {
  local path="$1"
  local payload="$2"
  if ((${#AUTH_ARGS[@]} > 0)); then
    curl -sS "${BASE_URL}${path}" \
      -H 'content-type: application/json' \
      "${AUTH_ARGS[@]}" \
      -d "${payload}"
  else
    curl -sS "${BASE_URL}${path}" \
      -H 'content-type: application/json' \
      -d "${payload}"
  fi
}

effective_auth_mode() {
  local mode="${MEMORY_AUTH_MODE:-off}"
  case "${mode}" in
    off|api_key|jwt|api_key_or_jwt)
      echo "${mode}"
      ;;
    *)
      echo "WARN: invalid MEMORY_AUTH_MODE='${mode}', fallback to 'off' for consistency-check in this e2e run" >&2
      echo "off"
      ;;
  esac
}

echo "[1/6] create + activate tenant A rule (${TENANT_A})"
write_a="$(
  post_json "/v1/memory/write" "{
    \"tenant_id\":\"${TENANT_A}\",
    \"scope\":\"${SCOPE}\",
    \"memory_lane\":\"shared\",
    \"input_text\":\"phasec tenant e2e rule a\",
    \"nodes\":[
      {
        \"client_id\":\"${RULE_A_CLIENT}\",
        \"type\":\"rule\",
        \"text_summary\":\"phasec tenant A strict json\",
        \"slots\":{
          \"if\":{\"intent\":\"json\"},
          \"then\":{\"output\":{\"format\":\"json\",\"strict\":true}}
        }
      }
    ]
  }"
)"
RULE_A_ID="$(echo "${write_a}" | jq -r '.nodes[0].id // empty')"
[[ -n "${RULE_A_ID}" ]] || fail "failed to create tenant A rule: ${write_a}"

post_json "/v1/memory/rules/state" "{
  \"tenant_id\":\"${TENANT_A}\",
  \"scope\":\"${SCOPE}\",
  \"rule_node_id\":\"${RULE_A_ID}\",
  \"state\":\"active\",
  \"input_text\":\"phasec tenant e2e activate a\"
}" >/dev/null

echo "[2/6] create + activate tenant B rule (${TENANT_B})"
write_b="$(
  post_json "/v1/memory/write" "{
    \"tenant_id\":\"${TENANT_B}\",
    \"scope\":\"${SCOPE}\",
    \"memory_lane\":\"shared\",
    \"input_text\":\"phasec tenant e2e rule b\",
    \"nodes\":[
      {
        \"client_id\":\"${RULE_B_CLIENT}\",
        \"type\":\"rule\",
        \"text_summary\":\"phasec tenant B text mode\",
        \"slots\":{
          \"if\":{\"intent\":\"json\"},
          \"then\":{\"output\":{\"format\":\"text\",\"strict\":false}}
        }
      }
    ]
  }"
)"
RULE_B_ID=""
if [[ "${tenant_b_blocked}" == "true" ]]; then
  echo "${write_b}" | jq -e '.error == "identity_mismatch" or .error == "unauthorized"' >/dev/null \
    || fail "tenant B write should be blocked by auth-bound tenant, got: ${write_b}"
else
  RULE_B_ID="$(echo "${write_b}" | jq -r '.nodes[0].id // empty')"
  [[ -n "${RULE_B_ID}" ]] || fail "failed to create tenant B rule: ${write_b}"

  post_json "/v1/memory/rules/state" "{
    \"tenant_id\":\"${TENANT_B}\",
    \"scope\":\"${SCOPE}\",
    \"rule_node_id\":\"${RULE_B_ID}\",
    \"state\":\"active\",
    \"input_text\":\"phasec tenant e2e activate b\"
  }" >/dev/null
fi

echo "[3/6] evaluate tenant A visibility"
eval_a="$(
  post_json "/v1/memory/rules/evaluate" "{
    \"tenant_id\":\"${TENANT_A}\",
    \"scope\":\"${SCOPE}\",
    \"context\":{\"intent\":\"json\"},
    \"include_shadow\":false,
    \"limit\":50
  }"
)"
if [[ "${tenant_b_blocked}" == "true" ]]; then
  echo "${eval_a}" | jq -e --arg ra "${RULE_A_ID}" '
    (((.applied.sources // []) | map(.rule_node_id) | index($ra)) != null)
  ' >/dev/null || fail "tenant A evaluate missing expected tenant-A rule source"
else
  echo "${eval_a}" | jq -e --arg ra "${RULE_A_ID}" --arg rb "${RULE_B_ID}" '
  (((.applied.sources // []) | map(.rule_node_id) | index($ra)) != null)
  and
  (((.applied.sources // []) | map(.rule_node_id) | index($rb)) == null)
' >/dev/null || fail "tenant A evaluate contains unexpected sources"
fi

echo "[4/6] evaluate tenant B visibility"
eval_b="$(
  post_json "/v1/memory/rules/evaluate" "{
    \"tenant_id\":\"${TENANT_B}\",
    \"scope\":\"${SCOPE}\",
    \"context\":{\"intent\":\"json\"},
    \"include_shadow\":false,
    \"limit\":50
  }"
)"
if [[ "${tenant_b_blocked}" == "true" ]]; then
  echo "${eval_b}" | jq -e '.error == "identity_mismatch" or .error == "unauthorized"' >/dev/null \
    || fail "tenant B evaluate should be blocked by auth-bound tenant, got: ${eval_b}"
else
  echo "${eval_b}" | jq -e --arg ra "${RULE_A_ID}" --arg rb "${RULE_B_ID}" '
  (((.applied.sources // []) | map(.rule_node_id) | index($rb)) != null)
  and
  (((.applied.sources // []) | map(.rule_node_id) | index($ra)) == null)
' >/dev/null || fail "tenant B evaluate contains unexpected sources"
fi

echo "[5/6] run consistency-check and assert cross-tenant violations == 0"
AUTH_MODE_FOR_CHECK="$(effective_auth_mode)"
check_json="$(MEMORY_AUTH_MODE="${AUTH_MODE_FOR_CHECK}" npm run -s job:consistency-check -- --sample 50)"
echo "${check_json}" | jq -e '
  ([
    .checks[]
    | select(
        .name == "tenant_scope_key_malformed"
        or (.name | startswith("cross_tenant_"))
      )
    | .count
  ] | length) > 0
' >/dev/null || fail "cross-tenant checks not found in consistency-check output"

echo "${check_json}" | jq -e '
  [
    .checks[]
    | select(
        .name == "tenant_scope_key_malformed"
        or (.name | startswith("cross_tenant_"))
      )
    | select(.count != 0)
  ] | length == 0
' >/dev/null || fail "cross-tenant consistency violations detected"

echo "[6/6] summary"
echo "${check_json}" | jq '{
  scope,
  cross_tenant_checks: [
    .checks[]
    | select(.name == "tenant_scope_key_malformed" or (.name | startswith("cross_tenant_")))
    | {name, severity, count}
  ]
}'

echo "ok: phase-c tenant e2e passed"
