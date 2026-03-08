#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need curl
need jq
need uuidgen

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

mkdir -p .tmp/sandbox

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-${AIONIS_BASE_URL:-http://127.0.0.1:${PORT}}}"
OPS_BASE_URL="${OPS_BASE_URL:-http://127.0.0.1:3312}"
TENANT_ID="${TENANT_ID:-ops_alert_delivery_batch_replay_tenant_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
SCOPE="${SCOPE:-ops_alert_delivery_batch_replay_scope_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
AUTOMATION_ID="${AUTOMATION_ID:-ops_alert_delivery_batch_replay_$(date +%s)}"
FAILING_TARGET="${FAILING_TARGET:-https://httpbin.org/status/503}"
RECOVERY_TARGET="${RECOVERY_TARGET:-https://postman-echo.com/post}"
SMOKE_THROTTLE_SEC="${SMOKE_THROTTLE_SEC:-0.25}"
AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
API_KEY="${API_KEY:-${AIONIS_API_KEY:-${PERF_API_KEY:-}}}"
AUTH_BEARER="${AUTH_BEARER:-${AIONIS_AUTH_BEARER:-${PERF_AUTH_BEARER:-}}}"
ADMIN_TOKEN="${ADMIN_TOKEN:-${AIONIS_ADMIN_TOKEN:-}}"

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

if [[ -z "${ADMIN_TOKEN}" ]]; then
  echo "ops alert delivery batch replay smoke requires ADMIN_TOKEN or AIONIS_ADMIN_TOKEN" >&2
  exit 1
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
  local out
  if [[ ${#AUTH_ARGS[@]} -gt 0 ]]; then
    out="$(
      curl -sS "${BASE_URL}${path}" \
        -H "content-type: application/json" \
        "${AUTH_ARGS[@]}" \
        --data-binary "${payload}"
    )"
  else
    out="$(
      curl -sS "${BASE_URL}${path}" \
        -H "content-type: application/json" \
        --data-binary "${payload}"
    )"
  fi
  [[ "${SMOKE_THROTTLE_SEC}" == "0" ]] || sleep "${SMOKE_THROTTLE_SEC}"
  printf '%s' "$out"
}

post_admin_json() {
  local path="$1"
  local payload="$2"
  local out
  out="$(
    curl -sS "${BASE_URL}${path}" \
      -H "content-type: application/json" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}" \
      --data-binary "${payload}"
  )"
  [[ "${SMOKE_THROTTLE_SEC}" == "0" ]] || sleep "${SMOKE_THROTTLE_SEC}"
  printf '%s' "$out"
}

post_ops_json() {
  local path="$1"
  local payload="$2"
  local out
  out="$(
    curl -sS "${OPS_BASE_URL}${path}" \
      -H "content-type: application/json" \
      --data-binary "${payload}"
  )"
  [[ "${SMOKE_THROTTLE_SEC}" == "0" ]] || sleep "${SMOKE_THROTTLE_SEC}"
  printf '%s' "$out"
}

get_admin_json() {
  local path="$1"
  local out
  out="$(
    curl -sS "${BASE_URL}${path}" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}"
  )"
  [[ "${SMOKE_THROTTLE_SEC}" == "0" ]] || sleep "${SMOKE_THROTTLE_SEC}"
  printf '%s' "$out"
}

lower_uuid() {
  uuidgen | tr '[:upper:]' '[:lower:]'
}

record_and_compile_playbook() {
  local run_id="$1"
  post_json "/v1/memory/replay/run/start" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" \
      '{tenant_id:$tenant,scope:$scope,run_id:$run_id,goal:"record batch replay smoke"}'
  )" >/dev/null
  post_json "/v1/memory/replay/step/before" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" \
      '{tenant_id:$tenant,scope:$scope,run_id:$run_id,step_index:1,tool_name:"command",tool_input:{command:"whoami",args:[]},safety_level:"auto_ok"}'
  )" >/dev/null
  post_json "/v1/memory/replay/step/after" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" \
      '{tenant_id:$tenant,scope:$scope,run_id:$run_id,step_index:1,status:"success",output_signature:{stdout:"batch-ok"}}'
  )" >/dev/null
  post_json "/v1/memory/replay/run/end" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" \
      '{tenant_id:$tenant,scope:$scope,run_id:$run_id,status:"success",summary:"batch-ok"}'
  )" >/dev/null
  post_json "/v1/memory/replay/playbooks/compile_from_run" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" \
      '{tenant_id:$tenant,scope:$scope,run_id:$run_id,name:"Ops Alert Batch Replay Smoke",version:1}'
  )"
}

if ! curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "API is not reachable at ${BASE_URL}" >&2
  exit 1
fi

if ! curl -fsS "${OPS_BASE_URL}/automations" >/dev/null 2>&1; then
  echo "Ops app is not reachable at ${OPS_BASE_URL}" >&2
  exit 1
fi

echo "== ensure control tenant exists =="
post_admin_json "/v1/admin/control/tenants" "$(
  jq -cn --arg tenant "$TENANT_ID" '{tenant_id:$tenant,display_name:$tenant,status:"active"}'
)" | jq '{ok, tenant:{tenant_id:(.tenant.tenant_id // null)}}'

echo
echo "== create two failing control alert routes =="
route_a="$(post_admin_json "/v1/admin/control/alerts/routes" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg target "$FAILING_TARGET" \
    '{tenant_id:$tenant,channel:"webhook",target:$target,label:"ops-batch-replay-a",events:["automation.slo.success_rate"],metadata:{automation_dispatch_policy:{retry_max_attempts:1}}}'
)")"
route_b="$(post_admin_json "/v1/admin/control/alerts/routes" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg target "$FAILING_TARGET" \
    '{tenant_id:$tenant,channel:"webhook",target:$target,label:"ops-batch-replay-b",events:["automation.slo.success_rate"],metadata:{automation_dispatch_policy:{retry_max_attempts:1}}}'
)")"
echo "$route_a" | jq '{route:{id:(.route.id // null), label:(.route.label // null)}}'
echo "$route_b" | jq '{route:{id:(.route.id // null), label:(.route.label // null)}}'
route_a_id="$(echo "$route_a" | jq -r '.route.id')"
route_b_id="$(echo "$route_b" | jq -r '.route.id')"

echo
echo "== compile playbook =="
playbook_json="$(record_and_compile_playbook "$(lower_uuid)")"
echo "$playbook_json" | jq '{playbook_id, version, status}'
PLAYBOOK_ID="$(echo "$playbook_json" | jq -r '.playbook_id')"

echo
echo "== create automation and failing run =="
post_json "/v1/automations/create" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" --arg playbook_id "$PLAYBOOK_ID" \
    '{tenant_id:$tenant,scope:$scope,actor:"ops_alert_delivery_batch_replay_route_smoke",automation_id:$automation_id,name:"Ops Alert Batch Replay Smoke",status:"active",graph:{nodes:[{node_id:"deploy",kind:"playbook",playbook_id:$playbook_id,mode:"strict"}],edges:[]}}'
)" | jq '{automation_id:(.automation.automation_id // null), version:(.automation.version // null)}'
post_json "/v1/automations/run" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" \
    '{tenant_id:$tenant,scope:$scope,actor:"ops_alert_delivery_batch_replay_route_smoke",automation_id:$automation_id,params:{allow_local_exec:true,execution_backend:"local_process",allowed_commands:["uname"]}}'
)" | jq '{run:{terminal_outcome:.run.terminal_outcome, root_cause_code:.run.root_cause_code}}'

echo
echo "== create failed delivery rows =="
dispatch_json="$(post_admin_json "/v1/admin/control/automations/alerts/dispatch" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" \
    '{tenant_id:$tenant,scope:$scope,automation_id:$automation_id,window_hours:24,incident_limit:8,dry_run:false,dedupe_ttl_seconds:60}'
)")"
echo "$dispatch_json" | jq '{dispatched, failed, skipped, results:(.results | map({route_id, status, response_code, error}))}'
failed_count="$(echo "$dispatch_json" | jq -r '.failed')"
if [[ "$failed_count" != "2" ]]; then
  echo "expected two failed deliveries before batch replay" >&2
  exit 1
fi

echo
echo "== fetch failed delivery ids =="
deliveries_failed_json="$(get_admin_json "/v1/admin/control/alerts/deliveries?tenant_id=$(printf '%s' "$TENANT_ID" | jq -sRr @uri)&event_type=automation.slo.success_rate&status=failed&limit=10")"
echo "$deliveries_failed_json" | jq '{ok, deliveries:(.deliveries | map({delivery_id, route_id, status, has_payload:(.metadata.payload_snapshot != null)}))}'
failed_ids_json="$(echo "$deliveries_failed_json" | jq -c --arg a "$route_a_id" --arg b "$route_b_id" '[.deliveries[] | select(.route_id==$a or .route_id==$b) | .delivery_id] | unique')"
failed_len="$(echo "$failed_ids_json" | jq 'length')"
if [[ "$failed_len" != "2" ]]; then
  echo "expected two failed delivery ids for batch replay" >&2
  exit 1
fi

echo
echo "== batch replay through ops forwarding route =="
ops_replay_json="$(post_ops_json "/api/control/execute" "$(
  jq -cn --argjson ids "$failed_ids_json" --arg recovery_target "$RECOVERY_TARGET" \
    '{op:"alert_delivery_replay",payload:{ids:$ids,dry_run:false,override_target:$recovery_target}}'
)")"
echo "$ops_replay_json" | jq '{ok, replayed, failed, skipped, request_id:(.__ops.request_id // null), results:(.results | map({delivery_id, replay_of_delivery_id, status, response_code, error}))}'
replayed_count="$(echo "$ops_replay_json" | jq -r '.replayed')"
if [[ "$replayed_count" != "2" ]]; then
  echo "expected ops forwarding route to replay two failed deliveries" >&2
  exit 1
fi

echo
echo "== deliveries after batch replay =="
deliveries_all_json="$(get_admin_json "/v1/admin/control/alerts/deliveries?tenant_id=$(printf '%s' "$TENANT_ID" | jq -sRr @uri)&event_type=automation.slo.success_rate&limit=20")"
echo "$deliveries_all_json" | jq '{ok, deliveries:(.deliveries | map({delivery_id, status, response_code, replay_of_delivery_id:(.metadata.replay_of_delivery_id // null)}))}'
sent_replay_count="$(echo "$deliveries_all_json" | jq -r --argjson ids "$failed_ids_json" '[.deliveries[] | select(.status=="sent" and (.metadata.replay_of_delivery_id != null) and (.metadata.replay_of_delivery_id as $rid | ($ids | index($rid)) != null))] | length')"
if [[ "$sent_replay_count" != "2" ]]; then
  echo "expected two sent replay rows after batch replay" >&2
  exit 1
fi

echo
echo "ok: ops_alert_delivery_batch_replay_route_smoke completed"
