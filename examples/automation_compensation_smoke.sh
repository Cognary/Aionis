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
SCOPE="${SCOPE:-automation_compensation_smoke_$(date +%s)}"
SMOKE_THROTTLE_SEC="${SMOKE_THROTTLE_SEC:-0.35}"
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

  local run_start
  run_start="$(
    jq -cn \
      --arg tenant "$TENANT_ID" \
      --arg scope "$SCOPE" \
      --arg run_id "$run_id" \
      --arg goal "record ${name}" \
      '{tenant_id:$tenant,scope:$scope,run_id:$run_id,goal:$goal}'
  )"
  post_json "/v1/memory/replay/run/start" "$run_start" >/dev/null

  local step_before
  step_before="$(
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
  )"
  post_json "/v1/memory/replay/step/before" "$step_before" >/dev/null

  local step_after
  step_after="$(
    jq -cn \
      --arg tenant "$TENANT_ID" \
      --arg scope "$SCOPE" \
      --arg run_id "$run_id" \
      --arg output_text "$output_text" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        run_id:$run_id,
        step_index:1,
        status:"success",
        output_signature:{stdout:$output_text}
      }'
  )"
  post_json "/v1/memory/replay/step/after" "$step_after" >/dev/null

  local run_end
  run_end="$(
    jq -cn \
      --arg tenant "$TENANT_ID" \
      --arg scope "$SCOPE" \
      --arg run_id "$run_id" \
      --arg summary "${name} recorded" \
      '{tenant_id:$tenant,scope:$scope,run_id:$run_id,status:"success",summary:$summary}'
  )"
  post_json "/v1/memory/replay/run/end" "$run_end" >/dev/null

  local compile
  compile="$(
    jq -cn \
      --arg tenant "$TENANT_ID" \
      --arg scope "$SCOPE" \
      --arg run_id "$run_id" \
      --arg name "$name" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        run_id:$run_id,
        name:$name,
        version:1
      }'
  )"
  post_json "/v1/memory/replay/playbooks/compile_from_run" "$compile"
}

if ! curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "API is not reachable at ${BASE_URL}" >&2
  exit 1
fi

health_json="$(curl -fsS "${BASE_URL}/health")"
sandbox_enabled="$(echo "$health_json" | jq -r '.sandbox.enabled // false')"
sandbox_mode="$(echo "$health_json" | jq -r '.sandbox.mode // "unknown"')"
if [[ "$sandbox_enabled" != "true" || "$sandbox_mode" != "local_process" ]]; then
  echo "automation compensation smoke requires sandbox.enabled=true and sandbox.mode=local_process" >&2
  echo "$health_json" | jq '{sandbox}'
  exit 1
fi

echo "== health =="
echo "$health_json" | jq '{ok, backend:.memory_store_backend, sandbox}'

SUCCESS_RUN_ID="$(lower_uuid)"
REPAIR_RUN_ID="$(lower_uuid)"
COMP_FAIL_RUN_ID="$(lower_uuid)"
AUTOMATION_ID="automation_compensation_$(date +%s)"

echo
echo "== compile success playbook =="
success_compile_json="$(record_and_compile_playbook "Install Env Playbook" "auto_ok" "uname" '["-s"]' "install-env-ok" "$SUCCESS_RUN_ID")"
echo "$success_compile_json" | jq '{playbook_id, version, status, steps_total:.compile_summary.steps_total}'
SUCCESS_PLAYBOOK_ID="$(echo "$success_compile_json" | jq -r '.playbook_id')"

echo
echo "== compile repair-gated playbook =="
repair_compile_json="$(record_and_compile_playbook "Setup CI Playbook" "needs_confirm" "uname" '["-s"]' "setup-ci-needs-review" "$REPAIR_RUN_ID")"
echo "$repair_compile_json" | jq '{playbook_id, version, status, steps_total:.compile_summary.steps_total}'
REPAIR_PLAYBOOK_ID="$(echo "$repair_compile_json" | jq -r '.playbook_id')"

echo
echo "== compile failing compensation playbook =="
comp_fail_compile_json="$(record_and_compile_playbook "Destroy Env Playbook" "auto_ok" "whoami" '[]' "destroy-env-v1" "$COMP_FAIL_RUN_ID")"
echo "$comp_fail_compile_json" | jq '{playbook_id, version, status, steps_total:.compile_summary.steps_total}'
COMP_PLAYBOOK_ID="$(echo "$comp_fail_compile_json" | jq -r '.playbook_id')"

echo
echo "== create automation DAG with compensation policy =="
automation_create_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --arg success_playbook_id "$SUCCESS_PLAYBOOK_ID" \
    --arg repair_playbook_id "$REPAIR_PLAYBOOK_ID" \
    --arg compensation_playbook_id "$COMP_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_compensation_smoke",
      automation_id:$automation_id,
      name:"Automation Compensation Smoke",
      status:"active",
      graph:{
        nodes:[
          {
            node_id:"install_env",
            kind:"playbook",
            name:"Install Env",
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
            name:"Setup CI",
            playbook_id:$repair_playbook_id,
            mode:"guided"
          }
        ],
        edges:[
          {
            from:"install_env",
            to:"setup_ci",
            type:"depends_on"
          }
        ]
      },
      metadata:{
        source:"automation_compensation_smoke"
      }
    }'
)"
automation_create_json="$(post_json "/v1/automations/create" "$automation_create_payload")"
echo "$automation_create_json" | jq '{automation_id:.automation.automation_id, version:.automation.version, status:.automation.status}'

echo
echo "== run automation DAG (expect paused_for_repair) =="
automation_run_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_compensation_smoke",
      automation_id:$automation_id,
      params:{
        allow_local_exec:true,
        execution_backend:"local_process",
        allowed_commands:["uname"]
      }
    }'
)"
automation_run_json="$(post_json "/v1/automations/run" "$automation_run_payload")"
echo "$automation_run_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, pause_reason:.run.pause_reason, status_summary:.run.status_summary}'

automation_run_id="$(echo "$automation_run_json" | jq -r '.run.run_id')"
automation_state="$(echo "$automation_run_json" | jq -r '.run.lifecycle_state')"
automation_pause_reason="$(echo "$automation_run_json" | jq -r '.run.pause_reason')"
if [[ "$automation_state" != "paused" || "$automation_pause_reason" != "repair_required" ]]; then
  echo "expected automation run to pause for repair, got state=${automation_state} reason=${automation_pause_reason}" >&2
  exit 1
fi

echo
echo "== reject repair (expect compensation attempt and terminal failure) =="
reject_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$automation_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_compensation_smoke",
      run_id:$run_id,
      reason:"reject repair to trigger compensation"
    }'
)"
reject_json="$(post_json "/v1/automations/runs/reject_repair" "$reject_payload")"
echo "$reject_json" | jq '{
  run:{
    lifecycle_state:.run.lifecycle_state,
    terminal_outcome:.run.terminal_outcome,
    compensation_status:.run.compensation_status,
    root_cause_code:.run.root_cause_code
  },
  nodes:(.nodes | map({node_id, terminal_outcome, status_summary, compensation_status}))
}'
reject_outcome="$(echo "$reject_json" | jq -r '.run.terminal_outcome')"
reject_comp_status="$(echo "$reject_json" | jq -r '.run.compensation_status')"
install_env_comp_status="$(echo "$reject_json" | jq -r '.nodes[] | select(.node_id=="install_env") | .compensation_status')"
install_env_outcome_before_retry="$(echo "$reject_json" | jq -r '.nodes[] | select(.node_id=="install_env") | .terminal_outcome')"
if [[ "$reject_outcome" != "failed" ]]; then
  echo "expected reject_repair with failed compensation to end as failed, got terminal_outcome=${reject_outcome}" >&2
  exit 1
fi
if [[ "$reject_comp_status" != "failed" || "$install_env_comp_status" != "failed" ]]; then
  echo "expected failed compensation status after reject_repair, got run=${reject_comp_status} node=${install_env_comp_status}" >&2
  exit 1
fi
if [[ "$install_env_outcome_before_retry" != "succeeded" ]]; then
  echo "expected install_env to remain succeeded before compensation retry, got ${install_env_outcome_before_retry}" >&2
  exit 1
fi

echo
echo "== repair compensation playbook =="
comp_repair_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg playbook_id "$COMP_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_compensation_smoke",
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
              tool_input_template:{
                argv:["uname","-m"]
              },
              safety_level:"auto_ok"
            }
          }
        ]
      }
    }'
)"
comp_repair_json="$(post_json "/v1/memory/replay/playbooks/repair" "$comp_repair_payload")"
echo "$comp_repair_json" | jq '{playbook_id, from_version, to_version, status, review_required, review_state}'
comp_repair_to_version="$(echo "$comp_repair_json" | jq -r '.to_version')"
if [[ "$comp_repair_to_version" == "null" || "$comp_repair_to_version" == "1" ]]; then
  echo "expected compensation repair to create a newer playbook version, got to_version=${comp_repair_to_version}" >&2
  exit 1
fi

echo
echo "== retry compensation =="
retry_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$automation_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_compensation_smoke",
      run_id:$run_id,
      reason:"compensation playbook repaired"
    }'
)"
retry_json="$(post_json "/v1/automations/runs/compensation/retry" "$retry_payload")"
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
install_env_outcome_after_retry="$(echo "$retry_json" | jq -r '.nodes[] | select(.node_id=="install_env") | .terminal_outcome')"
install_env_comp_run_id="$(echo "$retry_json" | jq -r '.nodes[] | select(.node_id=="install_env") | .compensation_run_id')"
if [[ "$retry_outcome" != "failed_compensated" ]]; then
  echo "expected compensation retry to yield failed_compensated, got terminal_outcome=${retry_outcome}" >&2
  exit 1
fi
if [[ "$retry_comp_status" != "succeeded" ]]; then
  echo "expected compensation retry to succeed, got compensation_status=${retry_comp_status}" >&2
  exit 1
fi
if [[ "$install_env_outcome_after_retry" != "compensated" ]]; then
  echo "expected install_env to become compensated after retry, got ${install_env_outcome_after_retry}" >&2
  exit 1
fi
if [[ -z "$install_env_comp_run_id" || "$install_env_comp_run_id" == "null" ]]; then
  echo "expected compensation retry to record compensation_run_id" >&2
  exit 1
fi

echo
echo "== retry compensation again (expect 409 already compensated) =="
retry_again_raw="$(post_json_with_status "/v1/automations/runs/compensation/retry" "$retry_payload")"
retry_again_status="${retry_again_raw##*$'\n'}"
retry_again_json="${retry_again_raw%$'\n'*}"
echo "$retry_again_json" | jq 'if type == "object"
  then {
    status_code,
    error: (.error.code? // .code? // .error? // null),
    message: (.error.message? // .message? // null)
  }
  else {raw: .}
end'
if [[ "$retry_again_status" != "409" ]]; then
  echo "expected second compensation retry to fail with 409, got status=${retry_again_status}" >&2
  exit 1
fi

echo
echo "ok: automation_compensation_smoke completed"
