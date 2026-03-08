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
TENANT_ID="${TENANT_ID:-addl_t_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
SCOPE="${SCOPE:-addl_s_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
AUTOMATION_ID="${AUTOMATION_ID:-addl_$(date +%s)}"
ROUTE_LABEL="${ROUTE_LABEL:-addl-smoke}"
FAILING_TARGET="${FAILING_TARGET:-https://httpbin.org/status/503}"
RECOVERY_TARGET="${RECOVERY_TARGET:-https://postman-echo.com/post}"
SMOKE_THROTTLE_SEC="${SMOKE_THROTTLE_SEC:-0.35}"
ADMIN_TOKEN="${ADMIN_TOKEN:-${AIONIS_ADMIN_TOKEN:-}}"

if [[ -z "${ADMIN_TOKEN}" ]]; then
  echo "automation alert delivery dead-letter worker smoke requires ADMIN_TOKEN or AIONIS_ADMIN_TOKEN" >&2
  exit 1
fi

post_json() {
  local path="$1"
  local payload="$2"
  local out
  out="$(
    curl -sS "${BASE_URL}${path}" \
      -H "content-type: application/json" \
      --data-binary "${payload}"
  )"
  if [[ "${SMOKE_THROTTLE_SEC}" != "0" ]]; then
    sleep "${SMOKE_THROTTLE_SEC}"
  fi
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
  if [[ "${SMOKE_THROTTLE_SEC}" != "0" ]]; then
    sleep "${SMOKE_THROTTLE_SEC}"
  fi
  printf '%s' "$out"
}

get_admin_json() {
  local path="$1"
  local out
  out="$(
    curl -sS "${BASE_URL}${path}" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}"
  )"
  if [[ "${SMOKE_THROTTLE_SEC}" != "0" ]]; then
    sleep "${SMOKE_THROTTLE_SEC}"
  fi
  printf '%s' "$out"
}

lower_uuid() {
  uuidgen | tr '[:upper:]' '[:lower:]'
}

record_and_compile_playbook() {
  local name="$1"
  local command_name="$2"
  local args_json="$3"
  local output_text="$4"
  local run_id="$5"

  post_json "/v1/memory/replay/run/start" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg goal "record ${name}" \
      '{tenant_id:$tenant,scope:$scope,run_id:$run_id,goal:$goal}'
  )" >/dev/null

  post_json "/v1/memory/replay/step/before" "$(
    jq -cn \
      --arg tenant "$TENANT_ID" \
      --arg scope "$SCOPE" \
      --arg run_id "$run_id" \
      --arg command_name "$command_name" \
      --argjson args "$args_json" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        run_id:$run_id,
        step_index:1,
        tool_name:"command",
        tool_input:{command:$command_name,args:$args},
        safety_level:"auto_ok"
      }'
  )" >/dev/null

  post_json "/v1/memory/replay/step/after" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg output_text "$output_text" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        run_id:$run_id,
        step_index:1,
        status:"success",
        output_signature:{stdout:$output_text}
      }'
  )" >/dev/null

  post_json "/v1/memory/replay/run/end" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg summary "${name} recorded" \
      '{tenant_id:$tenant,scope:$scope,run_id:$run_id,status:"success",summary:$summary}'
  )" >/dev/null

  post_json "/v1/memory/replay/playbooks/compile_from_run" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg name "$name" \
      '{tenant_id:$tenant,scope:$scope,run_id:$run_id,name:$name,version:1}'
  )"
}

if ! curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "API is not reachable at ${BASE_URL}" >&2
  exit 1
fi

health_json="$(curl -fsS "${BASE_URL}/health")"
sandbox_enabled="$(echo "$health_json" | jq -r '.sandbox.enabled // false')"
sandbox_mode="$(echo "$health_json" | jq -r '.sandbox.mode // "unknown"')"
if [[ "$sandbox_enabled" != "true" || "$sandbox_mode" != "local_process" ]]; then
  echo "automation alert delivery dead-letter worker smoke requires sandbox.enabled=true and sandbox.mode=local_process" >&2
  echo "$health_json" | jq '{sandbox}'
  exit 1
fi

echo "== health =="
echo "$health_json" | jq '{ok, backend:.memory_store_backend, sandbox}'

PLAYBOOK_RUN_ID="$(lower_uuid)"

echo
echo "== ensure control tenant exists =="
post_admin_json "/v1/admin/control/tenants" "$(
  jq -cn --arg tenant "$TENANT_ID" \
    '{tenant_id:$tenant,display_name:("Automation Alert Dead Letter Worker Smoke " + $tenant),status:"active"}'
)" | jq '{ok, tenant:{tenant_id:(.tenant.tenant_id // null), status:(.tenant.status // null)}}'

echo
echo "== create failing control alert route =="
route_json="$(post_admin_json "/v1/admin/control/alerts/routes" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg target "$FAILING_TARGET" --arg label "$ROUTE_LABEL" \
    '{
      tenant_id:$tenant,
      channel:"webhook",
      target:$target,
      label:$label,
      events:["automation.slo.success_rate"],
      metadata:{automation_dispatch_policy:{retry_max_attempts:1}}
    }'
)" )"
echo "$route_json" | jq '{ok, route:{id:(.route.id // null), label:(.route.label // null), target:(.route.target // null)}}'

echo
echo "== compile playbook =="
compile_json="$(record_and_compile_playbook "Automation Alert Dead Letter Worker Playbook" "whoami" '[]' "alert-delivery-dead-letter-worker-recorded" "$PLAYBOOK_RUN_ID")"
echo "$compile_json" | jq '{playbook_id, version, status}'
PLAYBOOK_ID="$(echo "$compile_json" | jq -r '.playbook_id')"

echo
echo "== create automation =="
create_json="$(post_json "/v1/automations/create" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" --arg playbook_id "$PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_alert_delivery_dead_letter_worker_smoke",
      automation_id:$automation_id,
      name:"Automation Alert Dead Letter Worker Smoke",
      status:"active",
      graph:{nodes:[{node_id:"deploy",kind:"playbook",playbook_id:$playbook_id,mode:"strict"}],edges:[]}
    }'
)")"
echo "$create_json" | jq '{automation_id:.automation.automation_id, version:.automation.version, status:.automation.status}'

echo
echo "== run failing automation to create candidate =="
run_json="$(post_json "/v1/automations/run" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_alert_delivery_dead_letter_worker_smoke",
      automation_id:$automation_id,
      params:{allow_local_exec:true,execution_backend:"local_process",allowed_commands:["uname"]}
    }'
)")"
echo "$run_json" | jq '{run:{terminal_outcome:.run.terminal_outcome, root_cause_code:.run.root_cause_code}}'

echo
echo "== create failed delivery row =="
dispatch_fail_json="$(post_admin_json "/v1/admin/control/automations/alerts/dispatch" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" \
    '{tenant_id:$tenant,scope:$scope,automation_id:$automation_id,window_hours:24,incident_limit:8,dry_run:false,dedupe_ttl_seconds:60}'
)")"
echo "$dispatch_fail_json" | jq '{dispatched, failed, skipped, results:(.results | map({route_id, status, response_code, error}))}'

deliveries_failed_json="$(get_admin_json "/v1/admin/control/alerts/deliveries?tenant_id=$(printf '%s' "$TENANT_ID" | jq -sRr @uri)&event_type=automation.slo.success_rate&status=failed&limit=5")"
FAILED_DELIVERY_ID="$(echo "$deliveries_failed_json" | jq -r '.deliveries[0].delivery_id')"

echo
echo "== mark failed delivery as dead_letter =="
dead_letter_json="$(post_admin_json "/v1/admin/control/alerts/deliveries/assign" "$(
  jq -cn --arg id "$FAILED_DELIVERY_ID" \
    '{ids:[$id],owner:"ops-oncall",escalation_owner:"eng-oncall",sla_target_at:"2026-03-08T09:00:00.000Z",workflow_state:"dead_letter",note:"parked in dead letter"}'
)")"
echo "$dead_letter_json" | jq '{ok, updated}'

echo
echo "== dedicated dead-letter worker entrypoint should match dead-letter queue =="
worker_dead_letter_json="$(AIONIS_BASE_URL="$BASE_URL" AIONIS_ADMIN_TOKEN="$ADMIN_TOKEN" npm run -s job:hosted-alert-delivery-dead-letter -- --once --tenant-id "$TENANT_ID" --owner ops-oncall --override-target "$RECOVERY_TARGET" --limit 5 --dry-run)"
echo "$worker_dead_letter_json" | jq '{ok, matched, replayed, failed, skipped, dry_run_rows, ids}'
worker_dead_letter_matched="$(echo "$worker_dead_letter_json" | jq -r '.matched')"
worker_dead_letter_dry="$(echo "$worker_dead_letter_json" | jq -r '.dry_run_rows')"
if [[ "$worker_dead_letter_matched" != "1" || "$worker_dead_letter_dry" != "1" ]]; then
  echo "expected dedicated dead-letter worker to preview one dead-letter delivery" >&2
  exit 1
fi

echo
echo "== replay worker should skip dead_letter when backlog=replay_backlog =="
worker_skip_json="$(AIONIS_BASE_URL="$BASE_URL" AIONIS_ADMIN_TOKEN="$ADMIN_TOKEN" npm run -s job:hosted-alert-delivery-replay -- --once --tenant-id "$TENANT_ID" --owner ops-oncall --backlog replay_backlog --override-target "$RECOVERY_TARGET" --limit 5)"
echo "$worker_skip_json" | jq '{ok, matched, replayed, failed, skipped, ids}'
worker_skip_matched="$(echo "$worker_skip_json" | jq -r '.matched')"
if [[ "$worker_skip_matched" != "0" ]]; then
  echo "expected dead-letter delivery to be skipped by replay_backlog worker" >&2
  exit 1
fi

echo
echo "== reopen dead_letter into replay_backlog =="
requeue_json="$(post_admin_json "/v1/admin/control/alerts/deliveries/assign" "$(
  jq -cn --arg id "$FAILED_DELIVERY_ID" \
    '{ids:[$id],workflow_state:"replay_backlog",note:"reopened for replay"}'
)")"
echo "$requeue_json" | jq '{ok, updated}'

echo
echo "== replay worker should now process reopened delivery =="
worker_replay_json="$(AIONIS_BASE_URL="$BASE_URL" AIONIS_ADMIN_TOKEN="$ADMIN_TOKEN" npm run -s job:hosted-alert-delivery-replay -- --once --tenant-id "$TENANT_ID" --owner ops-oncall --backlog replay_backlog --override-target "$RECOVERY_TARGET" --limit 5)"
echo "$worker_replay_json" | jq '{ok, matched, replayed, failed, skipped, ids}'
worker_replayed="$(echo "$worker_replay_json" | jq -r '.replayed')"
if [[ "$worker_replayed" != "1" ]]; then
  echo "expected reopened delivery to be replayed by worker" >&2
  exit 1
fi

echo
echo "== deliveries after dead-letter reopen replay =="
deliveries_all_json="$(get_admin_json "/v1/admin/control/alerts/deliveries?tenant_id=$(printf '%s' "$TENANT_ID" | jq -sRr @uri)&event_type=automation.slo.success_rate&limit=10")"
echo "$deliveries_all_json" | jq '{ok, deliveries:(.deliveries | map({delivery_id, status, response_code, replay_of_delivery_id:(.metadata.replay_of_delivery_id // null), workflow_state:(.metadata.alert_workflow.state // null)}))}'
replayed_sent_count="$(echo "$deliveries_all_json" | jq -r --arg failed_id "$FAILED_DELIVERY_ID" '[.deliveries[] | select(.status=="sent" and .metadata.replay_of_delivery_id==$failed_id)] | length')"
if [[ "$replayed_sent_count" != "1" ]]; then
  echo "expected one sent replay row after reopening dead-letter delivery" >&2
  exit 1
fi

echo
echo "ok: automation_alert_delivery_dead_letter_worker_smoke completed"
