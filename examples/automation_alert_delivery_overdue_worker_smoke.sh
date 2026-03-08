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
TENANT_ID="${TENANT_ID:-adow_t_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
SCOPE="${SCOPE:-adow_s_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
AUTOMATION_ID_A="${AUTOMATION_ID_A:-adow_a_$(date +%s)}"
AUTOMATION_ID_B="${AUTOMATION_ID_B:-adow_b_$(date +%s)}"
ROUTE_LABEL="${ROUTE_LABEL:-adow-smoke}"
FAILING_TARGET="${FAILING_TARGET:-https://httpbin.org/status/503}"
RECOVERY_TARGET="${RECOVERY_TARGET:-https://postman-echo.com/post}"
SMOKE_THROTTLE_SEC="${SMOKE_THROTTLE_SEC:-0.35}"
ADMIN_TOKEN="${ADMIN_TOKEN:-${AIONIS_ADMIN_TOKEN:-}}"

if [[ -z "${ADMIN_TOKEN}" ]]; then
  echo "automation alert delivery overdue worker smoke requires ADMIN_TOKEN or AIONIS_ADMIN_TOKEN" >&2
  exit 1
fi

post_json() {
  local path="$1"
  local payload="$2"
  local out
  out="$(curl -sS "${BASE_URL}${path}" -H "content-type: application/json" --data-binary "${payload}")"
  if [[ "${SMOKE_THROTTLE_SEC}" != "0" ]]; then sleep "${SMOKE_THROTTLE_SEC}"; fi
  printf '%s' "$out"
}

post_admin_json() {
  local path="$1"
  local payload="$2"
  local out
  out="$(curl -sS "${BASE_URL}${path}" -H "content-type: application/json" -H "X-Admin-Token: ${ADMIN_TOKEN}" --data-binary "${payload}")"
  if [[ "${SMOKE_THROTTLE_SEC}" != "0" ]]; then sleep "${SMOKE_THROTTLE_SEC}"; fi
  printf '%s' "$out"
}

get_admin_json() {
  local path="$1"
  local out
  out="$(curl -sS "${BASE_URL}${path}" -H "X-Admin-Token: ${ADMIN_TOKEN}")"
  if [[ "${SMOKE_THROTTLE_SEC}" != "0" ]]; then sleep "${SMOKE_THROTTLE_SEC}"; fi
  printf '%s' "$out"
}

lower_uuid() { uuidgen | tr '[:upper:]' '[:lower:]'; }

record_and_compile_playbook() {
  local name="$1"
  local command_name="$2"
  local args_json="$3"
  local output_text="$4"
  local run_id="$5"

  post_json "/v1/memory/replay/run/start" "$(jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg goal "record ${name}" '{tenant_id:$tenant,scope:$scope,run_id:$run_id,goal:$goal}')" >/dev/null
  post_json "/v1/memory/replay/step/before" "$(jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg command_name "$command_name" --argjson args "$args_json" '{tenant_id:$tenant,scope:$scope,run_id:$run_id,step_index:1,tool_name:"command",tool_input:{command:$command_name,args:$args},safety_level:"auto_ok"}')" >/dev/null
  post_json "/v1/memory/replay/step/after" "$(jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg output_text "$output_text" '{tenant_id:$tenant,scope:$scope,run_id:$run_id,step_index:1,status:"success",output_signature:{stdout:$output_text}}')" >/dev/null
  post_json "/v1/memory/replay/run/end" "$(jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg summary "${name} recorded" '{tenant_id:$tenant,scope:$scope,run_id:$run_id,status:"success",summary:$summary}')" >/dev/null
  post_json "/v1/memory/replay/playbooks/compile_from_run" "$(jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg name "$name" '{tenant_id:$tenant,scope:$scope,run_id:$run_id,name:$name,version:1}')"
}

create_automation() {
  local automation_id="$1"
  local playbook_id="$2"
  post_json "/v1/automations/create" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$automation_id" --arg playbook_id "$playbook_id" \
      '{tenant_id:$tenant,scope:$scope,actor:"automation_alert_delivery_overdue_worker_smoke",automation_id:$automation_id,name:$automation_id,status:"active",graph:{nodes:[{node_id:"deploy",kind:"playbook",playbook_id:$playbook_id,mode:"strict"}],edges:[]}}'
  )" >/dev/null
}

run_automation() {
  local automation_id="$1"
  post_json "/v1/automations/run" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$automation_id" \
      '{tenant_id:$tenant,scope:$scope,actor:"automation_alert_delivery_overdue_worker_smoke",automation_id:$automation_id,params:{allow_local_exec:true,execution_backend:"local_process",allowed_commands:["uname"]}}'
  )" >/dev/null
}

dispatch_alert() {
  local automation_id="$1"
  post_admin_json "/v1/admin/control/automations/alerts/dispatch" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$automation_id" \
      '{tenant_id:$tenant,scope:$scope,automation_id:$automation_id,window_hours:24,incident_limit:8,dry_run:false,dedupe_ttl_seconds:60}'
  )" >/dev/null
}

if ! curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "API is not reachable at ${BASE_URL}" >&2
  exit 1
fi

health_json="$(curl -fsS "${BASE_URL}/health")"
sandbox_enabled="$(echo "$health_json" | jq -r '.sandbox.enabled // false')"
sandbox_mode="$(echo "$health_json" | jq -r '.sandbox.mode // "unknown"')"
if [[ "$sandbox_enabled" != "true" || "$sandbox_mode" != "local_process" ]]; then
  echo "automation alert delivery overdue worker smoke requires sandbox.enabled=true and sandbox.mode=local_process" >&2
  echo "$health_json" | jq '{sandbox}'
  exit 1
fi

echo "== ensure control tenant exists =="
post_admin_json "/v1/admin/control/tenants" "$(
  jq -cn --arg tenant "$TENANT_ID" '{tenant_id:$tenant,display_name:("Automation Alert Overdue Worker Smoke " + $tenant),status:"active"}'
)" | jq '{ok, tenant:{tenant_id:(.tenant.tenant_id // null), status:(.tenant.status // null)}}'

echo
echo "== create control alert route with replay_backoff policy =="
route_json="$(post_admin_json "/v1/admin/control/alerts/routes" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg target "$FAILING_TARGET" --arg label "$ROUTE_LABEL" \
    '{tenant_id:$tenant,channel:"webhook",target:$target,label:$label,events:["automation.slo.success_rate"],metadata:{automation_dispatch_policy:{retry_max_attempts:1,replay_backoff_seconds:300}}}'
)")"
echo "$route_json" | jq '{ok, route:{id:(.route.id // null), label:(.route.label // null)}}'

echo
echo "== compile playbook =="
PLAYBOOK_RUN_ID="$(lower_uuid)"
compile_json="$(record_and_compile_playbook "Automation Alert Overdue Worker Playbook" "whoami" '[]' "alert-delivery-overdue-worker-recorded" "$PLAYBOOK_RUN_ID")"
echo "$compile_json" | jq '{playbook_id, version, status}'
PLAYBOOK_ID="$(echo "$compile_json" | jq -r '.playbook_id')"

echo
echo "== create two failing automations =="
create_automation "$AUTOMATION_ID_A" "$PLAYBOOK_ID"
create_automation "$AUTOMATION_ID_B" "$PLAYBOOK_ID"
echo "$(jq -cn --arg a "$AUTOMATION_ID_A" --arg b "$AUTOMATION_ID_B" '{a:$a,b:$b}')"

echo
echo "== run both automations and dispatch alerts =="
run_automation "$AUTOMATION_ID_A"
run_automation "$AUTOMATION_ID_B"
dispatch_alert "$AUTOMATION_ID_A"
dispatch_alert "$AUTOMATION_ID_B"

deliveries_failed_json="$(get_admin_json "/v1/admin/control/alerts/deliveries?tenant_id=$(printf '%s' "$TENANT_ID" | jq -sRr @uri)&event_type=automation.slo.success_rate&status=failed&limit=20")"
FAILED_A_ID="$(echo "$deliveries_failed_json" | jq -r --arg id "$AUTOMATION_ID_A" '.deliveries[] | select(.metadata.automation_id==$id) | .delivery_id' | head -n1)"
FAILED_B_ID="$(echo "$deliveries_failed_json" | jq -r --arg id "$AUTOMATION_ID_B" '.deliveries[] | select(.metadata.automation_id==$id) | .delivery_id' | head -n1)"
if [[ -z "$FAILED_A_ID" || -z "$FAILED_B_ID" ]]; then
  echo "expected failed deliveries for both automations" >&2
  echo "$deliveries_failed_json" | jq .
  exit 1
fi

echo
echo "== assign overdue and future SLA =="
post_admin_json "/v1/admin/control/alerts/deliveries/assign" "$(
  jq -cn --arg id "$FAILED_A_ID" '{ids:[$id],owner:"ops-oncall",workflow_state:"replay_backlog",sla_target_at:"2026-03-06T09:00:00.000Z",note:"overdue item"}'
)" | jq '{ok, updated}'
post_admin_json "/v1/admin/control/alerts/deliveries/assign" "$(
  jq -cn --arg id "$FAILED_B_ID" '{ids:[$id],owner:"ops-oncall",workflow_state:"replay_backlog",sla_target_at:"2026-03-08T09:00:00.000Z",note:"future item"}'
)" | jq '{ok, updated}'

echo
echo "== overdue worker dry-run should only match breached item =="
dry_json="$(AIONIS_BASE_URL="$BASE_URL" AIONIS_ADMIN_TOKEN="$ADMIN_TOKEN" npm run -s job:hosted-alert-delivery-overdue -- --once --tenant-id "$TENANT_ID" --owner ops-oncall --override-target "$RECOVERY_TARGET" --dry-run --limit 10)"
echo "$dry_json" | jq '{ok, owner_mode, sla_status, matched, dry_run_rows, ids}'
dry_matched="$(echo "$dry_json" | jq -r '.matched')"
dry_first_id="$(echo "$dry_json" | jq -r '.ids[0] // ""')"
if [[ "$dry_matched" != "1" || "$dry_first_id" != "$FAILED_A_ID" ]]; then
  echo "expected overdue worker dry-run to match only overdue delivery" >&2
  exit 1
fi

echo
echo "== overdue worker live run should replay only overdue item =="
live_json="$(AIONIS_BASE_URL="$BASE_URL" AIONIS_ADMIN_TOKEN="$ADMIN_TOKEN" npm run -s job:hosted-alert-delivery-overdue -- --once --tenant-id "$TENANT_ID" --owner ops-oncall --override-target "$RECOVERY_TARGET" --limit 10)"
echo "$live_json" | jq '{ok, owner_mode, sla_status, matched, replayed, failed, skipped, ids}'
live_replayed="$(echo "$live_json" | jq -r '.replayed')"
if [[ "$live_replayed" != "1" ]]; then
  echo "expected overdue worker to replay one overdue delivery" >&2
  exit 1
fi

echo
echo "== verify only overdue item has replay row =="
deliveries_all_json="$(get_admin_json "/v1/admin/control/alerts/deliveries?tenant_id=$(printf '%s' "$TENANT_ID" | jq -sRr @uri)&event_type=automation.slo.success_rate&limit=40")"
echo "$deliveries_all_json" | jq '{ok, deliveries:(.deliveries | map({delivery_id, status, automation_id:.metadata.automation_id, replay_of_delivery_id:(.metadata.replay_of_delivery_id // null), sla_target_at:(.metadata.alert_workflow.sla_target_at // null)}))}'
replayed_a_count="$(echo "$deliveries_all_json" | jq -r --arg failed_id "$FAILED_A_ID" '[.deliveries[] | select(.status=="sent" and .metadata.replay_of_delivery_id==$failed_id)] | length')"
replayed_b_count="$(echo "$deliveries_all_json" | jq -r --arg failed_id "$FAILED_B_ID" '[.deliveries[] | select(.status=="sent" and .metadata.replay_of_delivery_id==$failed_id)] | length')"
if [[ "$replayed_a_count" != "1" || "$replayed_b_count" != "0" ]]; then
  echo "expected only overdue failed delivery to be replayed" >&2
  exit 1
fi

echo
echo "ok: automation_alert_delivery_overdue_worker_smoke completed"
