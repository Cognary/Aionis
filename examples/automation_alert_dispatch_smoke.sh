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
TENANT_ID="${TENANT_ID:-automation_alert_dispatch_tenant_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
SCOPE="${SCOPE:-automation_alert_dispatch_smoke_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
AUTOMATION_ID="${AUTOMATION_ID:-automation_alert_dispatch_smoke_$(date +%s)}"
ROUTE_LABEL="${ROUTE_LABEL:-automation-alert-smoke}"
ALERT_WEBHOOK_TARGET="${ALERT_WEBHOOK_TARGET:-https://postman-echo.com/post}"
SMOKE_THROTTLE_SEC="${SMOKE_THROTTLE_SEC:-0.35}"
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
    API_KEY="${inferred_key}"
  fi
fi

if [[ -z "${ADMIN_TOKEN}" ]]; then
  echo "automation alert dispatch smoke requires ADMIN_TOKEN or AIONIS_ADMIN_TOKEN" >&2
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
  echo "automation alert dispatch smoke requires sandbox.enabled=true and sandbox.mode=local_process" >&2
  echo "$health_json" | jq '{sandbox}'
  exit 1
fi

echo "== health =="
echo "$health_json" | jq '{ok, backend:.memory_store_backend, sandbox}'

PLAYBOOK_RUN_ID="$(lower_uuid)"

echo
echo "== ensure control tenant exists =="
tenant_json="$(post_admin_json "/v1/admin/control/tenants" "$(
  jq -cn --arg tenant "$TENANT_ID" \
    '{
      tenant_id:$tenant,
      display_name:("Automation Smoke " + $tenant),
      status:"active"
    }'
)")"
echo "$tenant_json" | jq '{ok, tenant:{tenant_id:(.tenant.tenant_id // null), status:(.tenant.status // null)}}'
tenant_id_out="$(echo "$tenant_json" | jq -r '.tenant.tenant_id')"
if [[ "$tenant_id_out" != "$TENANT_ID" ]]; then
  echo "expected control tenant upsert for ${TENANT_ID}, got ${tenant_id_out}" >&2
  exit 1
fi

echo
echo "== create control alert route =="
route_json="$(post_admin_json "/v1/admin/control/alerts/routes" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg target "$ALERT_WEBHOOK_TARGET" --arg label "$ROUTE_LABEL" \
    '{
      tenant_id:$tenant,
      channel:"webhook",
      target:$target,
      label:$label,
      events:["automation.slo.success_rate"],
      metadata:{
        automation_dispatch_policy:{
          cooldown_seconds:120
        }
      }
    }'
)")"
echo "$route_json" | jq '{ok, route:{id:(.route.id // null), label:(.route.label // null), channel:(.route.channel // null), target:(.route.target // null)}}'
ROUTE_ID="$(echo "$route_json" | jq -r '.route.id')"
if [[ -z "${ROUTE_ID}" || "${ROUTE_ID}" == "null" ]]; then
  echo "expected created alert route id" >&2
  exit 1
fi

echo
echo "== compile forward-failing playbook =="
compile_json="$(record_and_compile_playbook "Automation Alert Dispatch Playbook" "whoami" '[]' "alert-dispatch-recorded" "$PLAYBOOK_RUN_ID")"
echo "$compile_json" | jq '{playbook_id, version, status}'
PLAYBOOK_ID="$(echo "$compile_json" | jq -r '.playbook_id')"

echo
echo "== create automation =="
create_json="$(post_json "/v1/automations/create" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" --arg playbook_id "$PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_alert_dispatch_smoke",
      automation_id:$automation_id,
      name:"Automation Alert Dispatch Smoke",
      status:"active",
      graph:{
        nodes:[{node_id:"deploy",kind:"playbook",playbook_id:$playbook_id,mode:"strict"}],
        edges:[]
      }
    }'
)")"
echo "$create_json" | jq '{automation_id:.automation.automation_id, version:.automation.version, status:.automation.status}'

echo
echo "== run failing automation to create alert candidate =="
run_json="$(post_json "/v1/automations/run" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_alert_dispatch_smoke",
      automation_id:$automation_id,
      params:{
        allow_local_exec:true,
        execution_backend:"local_process",
        allowed_commands:["uname"]
      }
    }'
)")"
echo "$run_json" | jq '{run:{lifecycle_state:.run.lifecycle_state, terminal_outcome:.run.terminal_outcome, root_cause_code:.run.root_cause_code}}'
run_outcome="$(echo "$run_json" | jq -r '.run.terminal_outcome')"
if [[ "$run_outcome" != "failed" ]]; then
  echo "expected failed run to create success-rate alert candidate, got ${run_outcome}" >&2
  exit 1
fi

echo
echo "== preview route coverage =="
preview_json="$(post_admin_json "/v1/admin/control/automations/alerts/preview" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      automation_id:$automation_id,
      window_hours:24,
      incident_limit:8
    }'
)")"
echo "$preview_json" | jq '{automation_id, alert_previews}'
preview_ready="$(echo "$preview_json" | jq -r '[.alert_previews[] | select(.recommended_event_type=="automation.slo.success_rate") | .dispatch_ready] | any')"
preview_cooldown="$(echo "$preview_json" | jq -r '[.alert_previews[] | .routes[]? | select(.id=="'"$ROUTE_ID"'") | .dispatch_policy.cooldown_seconds] | first')"
if [[ "$preview_ready" != "true" ]]; then
  echo "expected preview dispatch_ready=true for automation.slo.success_rate" >&2
  exit 1
fi
if [[ "$preview_cooldown" != "120" ]]; then
  echo "expected preview to expose route cooldown_seconds=120, got ${preview_cooldown}" >&2
  exit 1
fi

echo
echo "== dry-run alert dispatch =="
dispatch_preview_json="$(post_admin_json "/v1/admin/control/automations/alerts/dispatch" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      automation_id:$automation_id,
      window_hours:24,
      incident_limit:8,
      dry_run:true
    }'
)")"
echo "$dispatch_preview_json" | jq '{dry_run, candidates_considered, matched_routes, dry_run_rows, results:(.results | map({event_type, status, route_id}))}'
dry_run_rows="$(echo "$dispatch_preview_json" | jq -r '.dry_run_rows')"
if [[ "$dry_run_rows" == "0" ]]; then
  echo "expected dry-run alert dispatch to preview at least one route fan-out" >&2
  exit 1
fi

echo
echo "== live alert dispatch =="
dispatch_live_json="$(post_admin_json "/v1/admin/control/automations/alerts/dispatch" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      automation_id:$automation_id,
      window_hours:24,
      incident_limit:8,
      dry_run:false,
      dedupe_ttl_seconds:60
    }'
)")"
echo "$dispatch_live_json" | jq '{dry_run, candidates_considered, matched_routes, dispatched, failed, skipped, results:(.results | map({event_type, status, response_code, error}))}'
dispatched_count="$(echo "$dispatch_live_json" | jq -r '.dispatched')"
failed_count="$(echo "$dispatch_live_json" | jq -r '.failed')"
if [[ "$dispatched_count" == "0" ]]; then
  echo "expected at least one dispatched alert delivery, got dispatched=${dispatched_count} failed=${failed_count}" >&2
  exit 1
fi

echo
echo "== deliveries after dispatch =="
deliveries_json="$(get_admin_json "/v1/admin/control/alerts/deliveries?tenant_id=$(printf '%s' "$TENANT_ID" | jq -sRr @uri)&event_type=automation.slo.success_rate&limit=5")"
echo "$deliveries_json" | jq '{ok, deliveries:(.deliveries | map({route_id, event_type, status, response_code, error, metadata}))}'
matching_delivery_count="$(echo "$deliveries_json" | jq -r --arg route_id "$ROUTE_ID" '[.deliveries[] | select(.route_id==$route_id and .event_type=="automation.slo.success_rate" and .status=="sent")] | length')"
if [[ "$matching_delivery_count" == "0" ]]; then
  echo "expected sent delivery row for automation.slo.success_rate on created route" >&2
  exit 1
fi

echo
echo "== repeat live dispatch (expect dedupe skip) =="
dispatch_repeat_json="$(post_admin_json "/v1/admin/control/automations/alerts/dispatch" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      automation_id:$automation_id,
      window_hours:24,
      incident_limit:8,
      dry_run:false,
      dedupe_ttl_seconds:60
    }'
)")"
echo "$dispatch_repeat_json" | jq '{dry_run, dispatched, failed, skipped, results:(.results | map({event_type, status, skipped_reason, route_id}))}'
repeat_skipped_count="$(echo "$dispatch_repeat_json" | jq -r '.skipped')"
repeat_dedupe_hits="$(echo "$dispatch_repeat_json" | jq -r '[.results[] | select(.skipped_reason=="dedupe_recent_sent")] | length')"
if [[ "$repeat_skipped_count" == "0" || "$repeat_dedupe_hits" == "0" ]]; then
  echo "expected repeat dispatch to hit dedupe_recent_sent, got skipped=${repeat_skipped_count} dedupe_hits=${repeat_dedupe_hits}" >&2
  exit 1
fi

echo
echo "ok: automation_alert_dispatch_smoke completed"
