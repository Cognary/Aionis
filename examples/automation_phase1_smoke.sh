#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need curl
need jq

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-${AIONIS_BASE_URL:-http://127.0.0.1:${PORT}}}"
TENANT_ID="${TENANT_ID:-default}"
SCOPE="${SCOPE:-automation_smoke_$(date +%s)}"
AUTOMATION_ID="${AUTOMATION_ID:-automation_smoke_$(date +%s)}"
AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
API_KEY="${API_KEY:-${PERF_API_KEY:-}}"
AUTH_BEARER="${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

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
else
  inferred_key="$(infer_api_key)"
  if [[ -n "${inferred_key}" ]]; then
    AUTH_ARGS+=(-H "X-Api-Key: ${inferred_key}")
  fi
fi
if [[ -n "${ADMIN_TOKEN}" ]]; then
  AUTH_ARGS+=(-H "X-Admin-Token: ${ADMIN_TOKEN}")
fi

case "${AUTH_MODE}" in
  api_key)
    [[ ${#AUTH_ARGS[@]} -gt 0 ]] || { echo "MEMORY_AUTH_MODE=api_key but no API key found." >&2; exit 1; }
    ;;
  jwt)
    [[ -n "${AUTH_BEARER}" ]] || { echo "MEMORY_AUTH_MODE=jwt but AUTH_BEARER is empty." >&2; exit 1; }
    ;;
  api_key_or_jwt)
    [[ ${#AUTH_ARGS[@]} -gt 0 ]] || { echo "MEMORY_AUTH_MODE=api_key_or_jwt but neither key nor bearer provided." >&2; exit 1; }
    ;;
esac

post_json() {
  local path="$1"
  local payload="$2"
  curl -sS "${BASE_URL}${path}" \
    -H "content-type: application/json" \
    "${AUTH_ARGS[@]}" \
    --data-binary "${payload}"
}

if ! curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "API is not reachable at ${BASE_URL}" >&2
  exit 1
fi

echo "== health =="
curl -fsS "${BASE_URL}/health" | jq '{ok, backend:.memory_store_backend, auth_mode:(.auth_mode // null)}'

echo
echo "== create automation =="
create_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_smoke",
      automation_id:$automation_id,
      name:"Automation Smoke",
      status:"active",
      graph:{
        nodes:[
          {
            node_id:"approval_gate",
            kind:"approval",
            name:"Approval Gate"
          }
        ],
        edges:[]
      },
      metadata:{
        source:"automation_phase1_smoke"
      }
    }'
)"
create_json="$(post_json "/v1/automations/create" "$create_payload")"
echo "$create_json" | jq '{automation_id:.automation.automation_id, version:.automation.version, status:.automation.status}'

echo
echo "== run automation (expect paused approval) =="
run_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_smoke",
      automation_id:$automation_id,
      params:{smoke:true}
    }'
)"
run_json="$(post_json "/v1/automations/run" "$run_payload")"
echo "$run_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, pause_reason:.run.pause_reason}'
paused_run_id="$(echo "$run_json" | jq -r '.run.run_id')"
paused_state="$(echo "$run_json" | jq -r '.run.lifecycle_state')"
paused_reason="$(echo "$run_json" | jq -r '.run.pause_reason')"
if [[ "$paused_state" != "paused" || "$paused_reason" != "approval_required" ]]; then
  echo "expected paused approval run, got state=${paused_state} reason=${paused_reason}" >&2
  exit 1
fi

echo
echo "== get paused run =="
get_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$paused_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      run_id:$run_id,
      include_nodes:true
    }'
)"
get_json="$(post_json "/v1/automations/runs/get" "$get_payload")"
echo "$get_json" | jq '{run_id:.run.run_id, node_count:(.nodes|length), lifecycle_state:.run.lifecycle_state}'

echo
echo "== resume paused run =="
resume_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$paused_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_smoke",
      run_id:$run_id,
      reason:"automation smoke approval"
    }'
)"
resume_json="$(post_json "/v1/automations/runs/resume" "$resume_payload")"
echo "$resume_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, terminal_outcome:.run.terminal_outcome}'
resume_outcome="$(echo "$resume_json" | jq -r '.run.terminal_outcome')"
if [[ "$resume_outcome" != "succeeded" ]]; then
  echo "expected resumed run to succeed, got terminal_outcome=${resume_outcome}" >&2
  exit 1
fi

echo
echo "== create second paused run =="
run2_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_smoke",
      automation_id:$automation_id,
      params:{smoke:true, second_run:true}
    }'
)"
run2_json="$(post_json "/v1/automations/run" "$run2_payload")"
echo "$run2_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, pause_reason:.run.pause_reason}'
cancel_run_id="$(echo "$run2_json" | jq -r '.run.run_id')"

echo
echo "== cancel second run =="
cancel_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$cancel_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_smoke",
      run_id:$run_id,
      reason:"automation smoke cancel"
    }'
)"
cancel_json="$(post_json "/v1/automations/runs/cancel" "$cancel_payload")"
echo "$cancel_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, terminal_outcome:.run.terminal_outcome}'
cancel_outcome="$(echo "$cancel_json" | jq -r '.run.terminal_outcome')"
if [[ "$cancel_outcome" != "cancelled" ]]; then
  echo "expected cancelled run to end as cancelled, got terminal_outcome=${cancel_outcome}" >&2
  exit 1
fi

echo
echo "ok: automation_phase1_smoke completed"
