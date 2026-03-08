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
TENANT_ID="${TENANT_ID:-automation_alert_dispatch_rate_limit_tenant_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
SCOPE="${SCOPE:-automation_alert_dispatch_rate_limit_smoke_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
AUTOMATION_ID_A="${AUTOMATION_ID_A:-automation_alert_dispatch_rate_limit_a_$(date +%s)}"
AUTOMATION_ID_B="${AUTOMATION_ID_B:-automation_alert_dispatch_rate_limit_b_$(date +%s)}"
ROUTE_LABEL="${ROUTE_LABEL:-automation-alert-rate-limit-smoke}"
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
  echo "automation alert dispatch rate-limit smoke requires ADMIN_TOKEN or AIONIS_ADMIN_TOKEN" >&2
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

create_automation() {
  local automation_id="$1"
  local playbook_id="$2"
  post_json "/v1/automations/create" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$automation_id" --arg playbook_id "$playbook_id" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        actor:"automation_alert_dispatch_rate_limit_smoke",
        automation_id:$automation_id,
        name:$automation_id,
        status:"active",
        graph:{
          nodes:[{node_id:"deploy",kind:"playbook",playbook_id:$playbook_id,mode:"strict"}],
          edges:[]
        }
      }'
  )"
}

run_failing_automation() {
  local automation_id="$1"
  post_json "/v1/automations/run" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$automation_id" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        actor:"automation_alert_dispatch_rate_limit_smoke",
        automation_id:$automation_id,
        params:{
          allow_local_exec:true,
          execution_backend:"local_process",
          allowed_commands:["uname"]
        }
      }'
  )"
}

dispatch_alerts() {
  local automation_id="$1"
  post_admin_json "/v1/admin/control/automations/alerts/dispatch" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$automation_id" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        automation_id:$automation_id,
        window_hours:24,
        incident_limit:8,
        dry_run:false,
        dedupe_ttl_seconds:60
      }'
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
  echo "automation alert dispatch rate-limit smoke requires sandbox.enabled=true and sandbox.mode=local_process" >&2
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
    '{tenant_id:$tenant,display_name:("Automation Rate Limit Smoke " + $tenant),status:"active"}'
)" | jq '{ok, tenant:{tenant_id:(.tenant.tenant_id // null), status:(.tenant.status // null)}}'

echo
echo "== create rate-limited control alert route =="
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
          cooldown_seconds:120,
          max_dispatches_per_window:1,
          window_seconds:300
        }
      }
    }'
)")"
echo "$route_json" | jq '{ok, route:{id:(.route.id // null), label:(.route.label // null), target:(.route.target // null)}}'
ROUTE_ID="$(echo "$route_json" | jq -r '.route.id')"

echo
echo "== compile playbook =="
compile_json="$(record_and_compile_playbook "Automation Alert Dispatch Rate Limit Playbook" "whoami" '[]' "alert-dispatch-rate-limit-recorded" "$PLAYBOOK_RUN_ID")"
echo "$compile_json" | jq '{playbook_id, version, status}'
PLAYBOOK_ID="$(echo "$compile_json" | jq -r '.playbook_id')"

echo
echo "== create automations =="
create_automation "$AUTOMATION_ID_A" "$PLAYBOOK_ID" | jq '{automation_id:.automation.automation_id, status:.automation.status}'
create_automation "$AUTOMATION_ID_B" "$PLAYBOOK_ID" | jq '{automation_id:.automation.automation_id, status:.automation.status}'

echo
echo "== run failing automations =="
run_a_json="$(run_failing_automation "$AUTOMATION_ID_A")"
run_b_json="$(run_failing_automation "$AUTOMATION_ID_B")"
echo "$run_a_json" | jq '{run:{terminal_outcome:.run.terminal_outcome, root_cause_code:.run.root_cause_code}}'
echo "$run_b_json" | jq '{run:{terminal_outcome:.run.terminal_outcome, root_cause_code:.run.root_cause_code}}'
[[ "$(echo "$run_a_json" | jq -r '.run.terminal_outcome')" == "failed" ]] || { echo "automation A did not fail as expected" >&2; exit 1; }
[[ "$(echo "$run_b_json" | jq -r '.run.terminal_outcome')" == "failed" ]] || { echo "automation B did not fail as expected" >&2; exit 1; }

echo
echo "== first dispatch should send =="
dispatch_a_json="$(dispatch_alerts "$AUTOMATION_ID_A")"
echo "$dispatch_a_json" | jq '{dispatched, failed, skipped, results:(.results | map({route_id, status, skipped_reason, response_code}))}'
[[ "$(echo "$dispatch_a_json" | jq -r '.dispatched')" == "1" ]] || { echo "expected first dispatch to send one delivery" >&2; exit 1; }

echo
echo "== second dispatch should hit route rate limit =="
dispatch_b_json="$(dispatch_alerts "$AUTOMATION_ID_B")"
echo "$dispatch_b_json" | jq '{dispatched, failed, skipped, results:(.results | map({route_id, status, skipped_reason, recent_sent_count}))}'
rate_limit_hits="$(echo "$dispatch_b_json" | jq -r '[.results[] | select(.skipped_reason=="rate_limit_budget_exhausted")] | length')"
[[ "$rate_limit_hits" == "1" ]] || { echo "expected second dispatch to skip with rate_limit_budget_exhausted" >&2; exit 1; }

echo
echo "== deliveries show one sent and one rate-limit skip =="
deliveries_json="$(get_admin_json "/v1/admin/control/alerts/deliveries?tenant_id=$(printf '%s' "$TENANT_ID" | jq -sRr @uri)&event_type=automation.slo.success_rate&limit=10")"
echo "$deliveries_json" | jq '{ok, deliveries:(.deliveries | map({route_id, status, response_code, metadata}))}'
sent_count="$(echo "$deliveries_json" | jq -r --arg route_id "$ROUTE_ID" '[.deliveries[] | select(.route_id==$route_id and .status=="sent")] | length')"
skip_count="$(echo "$deliveries_json" | jq -r --arg route_id "$ROUTE_ID" '[.deliveries[] | select(.route_id==$route_id and .status=="skipped" and .metadata.reason=="dispatch_rate_limit_budget_exhausted")] | length')"
[[ "$sent_count" == "1" ]] || { echo "expected one sent delivery row" >&2; exit 1; }
[[ "$skip_count" == "1" ]] || { echo "expected one skipped delivery row with rate-limit reason" >&2; exit 1; }

echo
echo "ok: automation_alert_dispatch_rate_limit_smoke completed"
