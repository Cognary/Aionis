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
SCOPE="${SCOPE:-automation_playbook_repair_smoke_$(date +%s)}"
SMOKE_THROTTLE_SEC="${SMOKE_THROTTLE_SEC:-0.25}"
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
  local command_text="$3"
  local run_id="$4"

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
      --arg command_text "$command_text" \
      --arg safety_level "$safety_level" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        run_id:$run_id,
        step_index:1,
        tool_name:"command",
        tool_input:{command:"uname",args:["-s"]},
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
      --arg command_text "$command_text" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        run_id:$run_id,
        step_index:1,
        status:"success",
        output_signature:{stdout:$command_text}
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
  echo "automation playbook repair smoke requires sandbox.enabled=true and sandbox.mode=local_process" >&2
  echo "$health_json" | jq '{sandbox}'
  exit 1
fi

echo "== health =="
echo "$health_json" | jq '{ok, backend:.memory_store_backend, sandbox}'

SUCCESS_RUN_ID="$(lower_uuid)"
REPAIR_RUN_ID="$(lower_uuid)"
AUTOMATION_ID="automation_playbook_repair_$(date +%s)"

echo
echo "== compile success playbook =="
success_compile_json="$(record_and_compile_playbook "Install Env Playbook" "auto_ok" "install-env-ok" "$SUCCESS_RUN_ID")"
echo "$success_compile_json" | jq '{playbook_id, version, status, steps_total:.compile_summary.steps_total}'
SUCCESS_PLAYBOOK_ID="$(echo "$success_compile_json" | jq -r '.playbook_id')"

echo
echo "== compile repair playbook =="
repair_compile_json="$(record_and_compile_playbook "Setup CI Playbook" "needs_confirm" "setup-ci-needs-review" "$REPAIR_RUN_ID")"
echo "$repair_compile_json" | jq '{playbook_id, version, status, steps_total:.compile_summary.steps_total}'
REPAIR_PLAYBOOK_ID="$(echo "$repair_compile_json" | jq -r '.playbook_id')"

echo
echo "== run success playbook strict =="
success_run_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg playbook_id "$SUCCESS_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      playbook_id:$playbook_id,
      mode:"strict",
      params:{
        allow_local_exec:true,
        execution_backend:"local_process",
        allowed_commands:["uname"],
        auto_confirm:true
      }
    }'
)"
success_run_json="$(post_json "/v1/memory/replay/playbooks/run" "$success_run_payload")"
echo "$success_run_json" | jq '{status:.run.status, executed_steps:.summary.executed_steps, succeeded_steps:.summary.succeeded_steps}'
success_status="$(echo "$success_run_json" | jq -r '.run.status')"
if [[ "$success_status" != "success" ]]; then
  echo "expected success playbook strict run to succeed, got status=${success_status}" >&2
  exit 1
fi

echo
echo "== create automation DAG =="
automation_create_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --arg success_playbook_id "$SUCCESS_PLAYBOOK_ID" \
    --arg repair_playbook_id "$REPAIR_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_playbook_repair_smoke",
      automation_id:$automation_id,
      name:"Automation Playbook Repair Smoke",
      status:"active",
      graph:{
        nodes:[
          {
            node_id:"install_env",
            kind:"playbook",
            name:"Install Env",
            playbook_id:$success_playbook_id,
            mode:"strict"
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
        source:"automation_playbook_repair_smoke"
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
      actor:"automation_playbook_repair_smoke",
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
echo "== get paused automation DAG =="
automation_get_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$automation_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      run_id:$run_id,
      include_nodes:true
    }'
)"
automation_get_json="$(post_json "/v1/automations/runs/get" "$automation_get_payload")"
echo "$automation_get_json" | jq '{
  lifecycle_state:.run.lifecycle_state,
  pause_reason:.run.pause_reason,
  nodes:(.nodes | map({node_id, lifecycle_state, pause_reason, terminal_outcome, status_summary, playbook_version, playbook_run_id}))
}'

install_env_state="$(echo "$automation_get_json" | jq -r '.nodes[] | select(.node_id=="install_env") | .terminal_outcome')"
setup_ci_state="$(echo "$automation_get_json" | jq -r '.nodes[] | select(.node_id=="setup_ci") | .pause_reason')"
setup_ci_version_before_repair="$(echo "$automation_get_json" | jq -r '.nodes[] | select(.node_id=="setup_ci") | .playbook_version')"
if [[ "$install_env_state" != "succeeded" ]]; then
  echo "expected install_env to succeed before repair pause, got terminal_outcome=${install_env_state}" >&2
  exit 1
fi
if [[ "$setup_ci_state" != "repair_required" ]]; then
  echo "expected setup_ci to pause for repair, got pause_reason=${setup_ci_state}" >&2
  exit 1
fi
if [[ "$setup_ci_version_before_repair" != "1" ]]; then
  echo "expected paused repair node to record executed playbook version 1, got ${setup_ci_version_before_repair}" >&2
  exit 1
fi

echo
echo "== resume before repair (expect 409) =="
resume_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$automation_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_playbook_repair_smoke",
      run_id:$run_id,
      reason:"attempt resume before repair"
    }'
)"
resume_before_repair_raw="$(post_json_with_status "/v1/automations/runs/resume" "$resume_payload")"
resume_before_repair_status="${resume_before_repair_raw##*$'\n'}"
resume_before_repair_json="${resume_before_repair_raw%$'\n'*}"
echo "$resume_before_repair_json" | jq 'if type == "object"
  then {
    status_code,
    error: (.error.code? // .code? // .error? // null),
    message: (.error.message? // .message? // null)
  }
  else {raw: .}
end'
if [[ "$resume_before_repair_status" != "409" ]]; then
  echo "expected resume before repair to fail with 409, got status=${resume_before_repair_status}" >&2
  exit 1
fi

echo
echo "== repair paused playbook =="
repair_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg playbook_id "$REPAIR_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_playbook_repair_smoke",
      playbook_id:$playbook_id,
      from_version:1,
      review_required:false,
      target_status:"draft",
      note:"make guided step auto resumable",
      patch:{
        step_patches:[
          {
            step_index:1,
            set:{
              safety_level:"auto_ok"
            }
          }
        ]
      }
    }'
)"
repair_json="$(post_json "/v1/memory/replay/playbooks/repair" "$repair_payload")"
echo "$repair_json" | jq '{playbook_id, from_version, to_version, status, review_required, review_state}'
repair_to_version="$(echo "$repair_json" | jq -r '.to_version')"
if [[ "$repair_to_version" == "null" || "$repair_to_version" == "1" ]]; then
  echo "expected repair to create a newer playbook version, got to_version=${repair_to_version}" >&2
  exit 1
fi

echo
echo "== resume repaired automation DAG =="
resume_payload="$(jq '.reason = "repair playbook version is available"' <<<"$resume_payload")"
resume_json="$(post_json "/v1/automations/runs/resume" "$resume_payload")"
echo "$resume_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, terminal_outcome:.run.terminal_outcome, status_summary:.run.status_summary}'
resume_outcome="$(echo "$resume_json" | jq -r '.run.terminal_outcome')"
if [[ "$resume_outcome" != "succeeded" ]]; then
  echo "expected resumed automation run to succeed, got terminal_outcome=${resume_outcome}" >&2
  exit 1
fi

echo
echo "== get resumed automation DAG =="
resumed_get_json="$(post_json "/v1/automations/runs/get" "$automation_get_payload")"
echo "$resumed_get_json" | jq '{
  lifecycle_state:.run.lifecycle_state,
  terminal_outcome:.run.terminal_outcome,
  nodes:(.nodes | map({node_id, lifecycle_state, pause_reason, terminal_outcome, status_summary, playbook_version}))
}'
setup_ci_terminal="$(echo "$resumed_get_json" | jq -r '.nodes[] | select(.node_id=="setup_ci") | .terminal_outcome')"
setup_ci_version="$(echo "$resumed_get_json" | jq -r '.nodes[] | select(.node_id=="setup_ci") | .playbook_version')"
if [[ "$setup_ci_terminal" != "succeeded" ]]; then
  echo "expected repaired setup_ci node to succeed after resume, got terminal_outcome=${setup_ci_terminal}" >&2
  exit 1
fi
if [[ "$setup_ci_version" != "$repair_to_version" ]]; then
  echo "expected resumed node to adopt repaired playbook version ${repair_to_version}, got ${setup_ci_version}" >&2
  exit 1
fi

echo
echo "ok: automation_playbook_repair_smoke completed"
