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
TENANT_ID="${TENANT_ID:-default}"
SCOPE="${SCOPE:-automation_failure_injection_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
SMOKE_THROTTLE_SEC="${SMOKE_THROTTLE_SEC:-0.3}"
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
  local out
  out="$(
    curl -sS "${BASE_URL}${path}" \
      -H "content-type: application/json" \
      "${AUTH_ARGS[@]}" \
      --data-binary "${payload}"
  )"
  if [[ "${SMOKE_THROTTLE_SEC}" != "0" ]]; then
    sleep "${SMOKE_THROTTLE_SEC}"
  fi
  printf '%s' "$out"
}

post_json_with_status() {
  local path="$1"
  local payload="$2"
  local out
  out="$(
    curl -sS -w $'\n%{http_code}' "${BASE_URL}${path}" \
      -H "content-type: application/json" \
      "${AUTH_ARGS[@]}" \
      --data-binary "${payload}"
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
  local safety_level="$2"
  local command_name="$3"
  local args_json="$4"
  local output_text="$5"
  local run_id="$6"

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
      --arg safety_level "$safety_level" \
      --argjson args "$args_json" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        run_id:$run_id,
        step_index:1,
        tool_name:"command",
        tool_input:{command:$command_name,args:$args},
        safety_level:$safety_level
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
  echo "automation failure injection smoke requires sandbox.enabled=true and sandbox.mode=local_process" >&2
  echo "$health_json" | jq '{sandbox}'
  exit 1
fi

echo "== health =="
echo "$health_json" | jq '{ok, backend:.memory_store_backend, sandbox}'

FORWARD_FAIL_AUTOMATION_ID="automation_forward_fail_$(date +%s)"
COMP_AUTOMATION_ID="automation_comp_fail_$(date +%s)"

FORWARD_FAIL_RUN_ID="$(lower_uuid)"
SUCCESS_RUN_ID="$(lower_uuid)"
REPAIR_RUN_ID="$(lower_uuid)"
COMP_FAIL_RUN_ID="$(lower_uuid)"

echo
echo "== compile forward-failing playbook =="
forward_compile_json="$(record_and_compile_playbook "Deploy Playbook" "auto_ok" "whoami" '[]' "deploy-whoami" "$FORWARD_FAIL_RUN_ID")"
echo "$forward_compile_json" | jq '{playbook_id, version, status}'
FORWARD_FAIL_PLAYBOOK_ID="$(echo "$forward_compile_json" | jq -r '.playbook_id')"

echo
echo "== create forward-failure automation =="
forward_create_json="$(post_json "/v1/automations/create" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$FORWARD_FAIL_AUTOMATION_ID" --arg playbook_id "$FORWARD_FAIL_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_failure_injection_smoke",
      automation_id:$automation_id,
      name:"Automation Forward Failure Smoke",
      status:"active",
      graph:{
        nodes:[{node_id:"deploy",kind:"playbook",playbook_id:$playbook_id,mode:"strict"}],
        edges:[]
      }
    }'
)")"
echo "$forward_create_json" | jq '{automation_id:.automation.automation_id, version:.automation.version, status:.automation.status}'

echo
echo "== run forward-failure automation (expect terminal failed) =="
forward_run_json="$(post_json "/v1/automations/run" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$FORWARD_FAIL_AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_failure_injection_smoke",
      automation_id:$automation_id,
      params:{
        allow_local_exec:true,
        execution_backend:"local_process",
        allowed_commands:["uname"]
      }
    }'
)")"
echo "$forward_run_json" | jq '{
  run:{
    lifecycle_state:.run.lifecycle_state,
    terminal_outcome:.run.terminal_outcome,
    status_summary:.run.status_summary,
    root_cause_code:.run.root_cause_code
  },
  nodes:(.nodes | map({node_id, lifecycle_state, terminal_outcome, status_summary, error_code}))
}'
forward_outcome="$(echo "$forward_run_json" | jq -r '.run.terminal_outcome')"
forward_root_cause="$(echo "$forward_run_json" | jq -r '.run.root_cause_code')"
forward_node_outcome="$(echo "$forward_run_json" | jq -r '.nodes[] | select(.node_id=="deploy") | .terminal_outcome')"
forward_node_error="$(echo "$forward_run_json" | jq -r '.nodes[] | select(.node_id=="deploy") | .error_code')"
if [[ "$forward_outcome" != "failed" ]]; then
  echo "expected forward replay failure automation to end as failed, got ${forward_outcome}" >&2
  exit 1
fi
if [[ "$forward_root_cause" != "playbook_run_failed" ]]; then
  echo "expected run root_cause_code=playbook_run_failed, got ${forward_root_cause}" >&2
  exit 1
fi
if [[ "$forward_node_outcome" != "failed" || "$forward_node_error" != "playbook_run_failed" ]]; then
  echo "expected deploy node failed/playbook_run_failed, got outcome=${forward_node_outcome} error=${forward_node_error}" >&2
  exit 1
fi

echo
echo "== compile success, repair-gated, and failing compensation playbooks =="
success_compile_json="$(record_and_compile_playbook "Install Env Playbook" "auto_ok" "uname" '["-s"]' "install-env-ok" "$SUCCESS_RUN_ID")"
repair_compile_json="$(record_and_compile_playbook "Setup CI Playbook" "needs_confirm" "uname" '["-s"]' "setup-ci-needs-review" "$REPAIR_RUN_ID")"
comp_fail_compile_json="$(record_and_compile_playbook "Destroy Env Playbook" "auto_ok" "whoami" '[]' "destroy-env-v1" "$COMP_FAIL_RUN_ID")"
SUCCESS_PLAYBOOK_ID="$(echo "$success_compile_json" | jq -r '.playbook_id')"
REPAIR_PLAYBOOK_ID="$(echo "$repair_compile_json" | jq -r '.playbook_id')"
COMP_PLAYBOOK_ID="$(echo "$comp_fail_compile_json" | jq -r '.playbook_id')"
echo "$success_compile_json" | jq '{success_playbook_id:.playbook_id, success_status:.status}'
echo "$repair_compile_json" | jq '{repair_playbook_id:.playbook_id, repair_status:.status}'
echo "$comp_fail_compile_json" | jq '{comp_playbook_id:.playbook_id, comp_status:.status}'

echo
echo "== create compensation-failure automation =="
comp_create_json="$(post_json "/v1/automations/create" "$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$COMP_AUTOMATION_ID" \
    --arg success_playbook_id "$SUCCESS_PLAYBOOK_ID" \
    --arg repair_playbook_id "$REPAIR_PLAYBOOK_ID" \
    --arg compensation_playbook_id "$COMP_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_failure_injection_smoke",
      automation_id:$automation_id,
      name:"Automation Compensation Failure Smoke",
      status:"active",
      graph:{
        nodes:[
          {
            node_id:"install_env",
            kind:"playbook",
            playbook_id:$success_playbook_id,
            mode:"strict",
            policy:{
              compensation_policy:{
                mode:"best_effort",
                trigger:["on_reject"],
                compensation_playbook_id:$compensation_playbook_id
              }
            }
          },
          {
            node_id:"setup_ci",
            kind:"playbook",
            playbook_id:$repair_playbook_id,
            mode:"guided"
          }
        ],
        edges:[{from:"install_env",to:"setup_ci",type:"depends_on"}]
      }
    }'
)")"
echo "$comp_create_json" | jq '{automation_id:.automation.automation_id, version:.automation.version, status:.automation.status}'

echo
echo "== run compensation-failure automation (expect paused_for_repair) =="
comp_run_json="$(post_json "/v1/automations/run" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$COMP_AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_failure_injection_smoke",
      automation_id:$automation_id,
      params:{
        allow_local_exec:true,
        execution_backend:"local_process",
        allowed_commands:["uname"]
      }
    }'
)")"
comp_run_id="$(echo "$comp_run_json" | jq -r '.run.run_id')"
echo "$comp_run_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, pause_reason:.run.pause_reason}'

echo
echo "== reject repair (expect compensation failure and terminal failed) =="
reject_json="$(post_json "/v1/automations/runs/reject_repair" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$comp_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_failure_injection_smoke",
      run_id:$run_id,
      reason:"trigger failing compensation"
    }'
)")"
echo "$reject_json" | jq '{
  run:{
    lifecycle_state:.run.lifecycle_state,
    terminal_outcome:.run.terminal_outcome,
    compensation_status:.run.compensation_status,
    root_cause_code:.run.root_cause_code
  },
  nodes:(.nodes | map({node_id, terminal_outcome, compensation_status}))
}'
reject_outcome="$(echo "$reject_json" | jq -r '.run.terminal_outcome')"
reject_comp_status="$(echo "$reject_json" | jq -r '.run.compensation_status')"
if [[ "$reject_outcome" != "failed" || "$reject_comp_status" != "failed" ]]; then
  echo "expected reject_repair to end with failed + failed compensation, got outcome=${reject_outcome} comp=${reject_comp_status}" >&2
  exit 1
fi

echo
echo "== repair failing compensation playbook =="
comp_repair_json="$(post_json "/v1/memory/replay/playbooks/repair" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg playbook_id "$COMP_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_failure_injection_smoke",
      playbook_id:$playbook_id,
      from_version:1,
      review_required:false,
      target_status:"draft",
      note:"repair compensation command to allowed command",
      patch:{
        step_patches:[
          {
            step_index:1,
            set:{
              tool_input_template:{argv:["uname","-m"]},
              safety_level:"auto_ok"
            }
          }
        ]
      }
    }'
)")"
echo "$comp_repair_json" | jq '{playbook_id, from_version, to_version, review_state}'

echo
echo "== retry compensation (expect failed_compensated) =="
retry_json="$(post_json "/v1/automations/runs/compensation/retry" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$comp_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_failure_injection_smoke",
      run_id:$run_id,
      reason:"compensation playbook repaired"
    }'
)")"
echo "$retry_json" | jq '{
  run:{
    lifecycle_state:.run.lifecycle_state,
    terminal_outcome:.run.terminal_outcome,
    compensation_status:.run.compensation_status
  },
  nodes:(.nodes | map({node_id, terminal_outcome, compensation_status, compensation_run_id}))
}'
retry_outcome="$(echo "$retry_json" | jq -r '.run.terminal_outcome')"
retry_comp_status="$(echo "$retry_json" | jq -r '.run.compensation_status')"
if [[ "$retry_outcome" != "failed_compensated" || "$retry_comp_status" != "succeeded" ]]; then
  echo "expected compensation retry to end as failed_compensated + succeeded compensation, got outcome=${retry_outcome} comp=${retry_comp_status}" >&2
  exit 1
fi

echo
echo "ok: automation_failure_injection_smoke completed"
