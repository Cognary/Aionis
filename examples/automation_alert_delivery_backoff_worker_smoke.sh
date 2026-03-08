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
TENANT_ID="${TENANT_ID:-adbw_t_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
SCOPE="${SCOPE:-adbw_s_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
AUTOMATION_ID="${AUTOMATION_ID:-adbw_$(date +%s)}"
ROUTE_LABEL="${ROUTE_LABEL:-adbw-smoke}"
FAILING_TARGET="${FAILING_TARGET:-https://httpbin.org/status/503}"
SMOKE_THROTTLE_SEC="${SMOKE_THROTTLE_SEC:-0.35}"
ADMIN_TOKEN="${ADMIN_TOKEN:-${AIONIS_ADMIN_TOKEN:-}}"

if [[ -z "${ADMIN_TOKEN}" ]]; then
  echo "automation alert delivery backoff worker smoke requires ADMIN_TOKEN or AIONIS_ADMIN_TOKEN" >&2
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

if ! curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "API is not reachable at ${BASE_URL}" >&2
  exit 1
fi

health_json="$(curl -fsS "${BASE_URL}/health")"
sandbox_enabled="$(echo "$health_json" | jq -r '.sandbox.enabled // false')"
sandbox_mode="$(echo "$health_json" | jq -r '.sandbox.mode // "unknown"')"
if [[ "$sandbox_enabled" != "true" || "$sandbox_mode" != "local_process" ]]; then
  echo "automation alert delivery backoff worker smoke requires sandbox.enabled=true and sandbox.mode=local_process" >&2
  echo "$health_json" | jq '{sandbox}'
  exit 1
fi

PLAYBOOK_RUN_ID="$(lower_uuid)"
post_admin_json "/v1/admin/control/tenants" "$(jq -cn --arg tenant "$TENANT_ID" '{tenant_id:$tenant,display_name:("Automation Alert Backoff Worker Smoke " + $tenant),status:"active"}')" >/dev/null
post_admin_json "/v1/admin/control/alerts/routes" "$(jq -cn --arg tenant "$TENANT_ID" --arg target "$FAILING_TARGET" --arg label "$ROUTE_LABEL" '{tenant_id:$tenant,channel:"webhook",target:$target,label:$label,events:["automation.slo.success_rate"],metadata:{automation_dispatch_policy:{retry_max_attempts:1,replay_backoff_seconds:300}}}')" >/dev/null
compile_json="$(record_and_compile_playbook "Automation Alert Backoff Worker Playbook" "whoami" '[]' "alert-delivery-backoff-worker-recorded" "$PLAYBOOK_RUN_ID")"
PLAYBOOK_ID="$(echo "$compile_json" | jq -r '.playbook_id')"
post_json "/v1/automations/create" "$(jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" --arg playbook_id "$PLAYBOOK_ID" '{tenant_id:$tenant,scope:$scope,actor:"automation_alert_delivery_backoff_worker_smoke",automation_id:$automation_id,name:"Automation Alert Backoff Worker Smoke",status:"active",graph:{nodes:[{node_id:"deploy",kind:"playbook",playbook_id:$playbook_id,mode:"strict"}],edges:[]}}')" >/dev/null
post_json "/v1/automations/run" "$(jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" '{tenant_id:$tenant,scope:$scope,actor:"automation_alert_delivery_backoff_worker_smoke",automation_id:$automation_id,params:{allow_local_exec:true,execution_backend:"local_process",allowed_commands:["uname"]}}')" >/dev/null
post_admin_json "/v1/admin/control/automations/alerts/dispatch" "$(jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" '{tenant_id:$tenant,scope:$scope,automation_id:$automation_id,window_hours:24,incident_limit:8,dry_run:false,dedupe_ttl_seconds:60}')" >/dev/null

deliveries_failed_json="$(get_admin_json "/v1/admin/control/alerts/deliveries?tenant_id=$(printf '%s' "$TENANT_ID" | jq -sRr @uri)&event_type=automation.slo.success_rate&status=failed&limit=5")"
FAILED_DELIVERY_ID="$(echo "$deliveries_failed_json" | jq -r '.deliveries[0].delivery_id')"
post_admin_json "/v1/admin/control/alerts/deliveries/assign" "$(jq -cn --arg id "$FAILED_DELIVERY_ID" '{ids:[$id],owner:"ops-oncall",workflow_state:"replay_backlog",note:"backoff worker replay backlog"}')" >/dev/null

echo "== first replay worker run should produce failed replay row =="
worker_first_json="$(AIONIS_BASE_URL="$BASE_URL" AIONIS_ADMIN_TOKEN="$ADMIN_TOKEN" npm run -s job:hosted-alert-delivery-replay -- --once --tenant-id "$TENANT_ID" --owner ops-oncall --backlog replay_backlog --override-target "$FAILING_TARGET" --limit 5)"
echo "$worker_first_json" | jq '{ok, replay_backoff_source, matched, replayed, failed, skipped, skipped_already_replayed, skipped_backoff, ids}'
first_failed="$(echo "$worker_first_json" | jq -r '.failed')"
first_source="$(echo "$worker_first_json" | jq -r '.replay_backoff_source')"
if [[ "$first_failed" != "1" || "$first_source" != "route_policy" ]]; then
  echo "expected first worker run to use route policy and produce one failed replay delivery" >&2
  exit 1
fi

echo
echo "== second replay worker run should be blocked by backoff =="
worker_second_json="$(AIONIS_BASE_URL="$BASE_URL" AIONIS_ADMIN_TOKEN="$ADMIN_TOKEN" npm run -s job:hosted-alert-delivery-replay -- --once --tenant-id "$TENANT_ID" --owner ops-oncall --backlog replay_backlog --override-target "$FAILING_TARGET" --limit 5)"
echo "$worker_second_json" | jq '{ok, replay_backoff_source, matched, replayed, failed, skipped, skipped_already_replayed, skipped_backoff, ids}'
second_matched="$(echo "$worker_second_json" | jq -r '.matched')"
second_backoff="$(echo "$worker_second_json" | jq -r '.skipped_backoff')"
second_source="$(echo "$worker_second_json" | jq -r '.replay_backoff_source')"
if [[ "$second_matched" != "0" || "$second_backoff" != "1" || "$second_source" != "route_policy" ]]; then
  echo "expected second worker run to skip the failed original because of route-policy replay backoff" >&2
  exit 1
fi

echo
echo "== third replay worker run with backoff disabled should retry =="
worker_third_json="$(AIONIS_BASE_URL="$BASE_URL" AIONIS_ADMIN_TOKEN="$ADMIN_TOKEN" npm run -s job:hosted-alert-delivery-replay -- --once --tenant-id "$TENANT_ID" --owner ops-oncall --backlog replay_backlog --override-target "$FAILING_TARGET" --replay-backoff-seconds 0 --limit 5)"
echo "$worker_third_json" | jq '{ok, matched, replayed, failed, skipped, skipped_already_replayed, skipped_backoff, ids}'
third_failed="$(echo "$worker_third_json" | jq -r '.failed')"
if [[ "$third_failed" != "1" ]]; then
  echo "expected third worker run to retry failed replay when backoff is disabled" >&2
  exit 1
fi

echo
echo "ok: automation_alert_delivery_backoff_worker_smoke completed"
