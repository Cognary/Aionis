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
SCOPE="${SCOPE:-automation_db_failure_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
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

lower_uuid() {
  uuidgen | tr '[:upper:]' '[:lower:]'
}

record_and_compile_playbook() {
  local name="$1"
  local safety_level="$2"
  local command_text="$3"
  local run_id="$4"

  post_json "/v1/memory/replay/run/start" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg goal "record ${name}" \
      '{tenant_id:$tenant,scope:$scope,run_id:$run_id,goal:$goal}'
  )" >/dev/null

  post_json "/v1/memory/replay/step/before" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg safety_level "$safety_level" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        run_id:$run_id,
        step_index:1,
        tool_name:"command",
        tool_input:{command:"uname",args:["-s"]},
        safety_level:$safety_level
      }'
  )" >/dev/null

  post_json "/v1/memory/replay/step/after" "$(
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg output_text "$command_text" \
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
  echo "automation db failure smoke requires sandbox.enabled=true and sandbox.mode=local_process" >&2
  echo "$health_json" | jq '{sandbox}'
  exit 1
fi

echo "== health =="
echo "$health_json" | jq '{ok, backend:.memory_store_backend, sandbox}'

REPAIR_RUN_ID="$(lower_uuid)"
AUTOMATION_ID="automation_db_failure_$(date +%s)"

echo
echo "== compile repair-gated playbook =="
repair_compile_json="$(record_and_compile_playbook "Setup CI Playbook" "needs_confirm" "setup-ci-needs-review" "$REPAIR_RUN_ID")"
echo "$repair_compile_json" | jq '{playbook_id, version, status, steps_total:.compile_summary.steps_total}'
REPAIR_PLAYBOOK_ID="$(echo "$repair_compile_json" | jq -r '.playbook_id')"

echo
echo "== create automation =="
create_json="$(post_json "/v1/automations/create" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" --arg playbook_id "$REPAIR_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_db_failure_smoke",
      automation_id:$automation_id,
      name:"Automation DB Failure Smoke",
      status:"active",
      graph:{
        nodes:[{node_id:"setup_ci",kind:"playbook",playbook_id:$playbook_id,mode:"guided"}],
        edges:[]
      }
    }'
)")"
echo "$create_json" | jq '{automation_id:.automation.automation_id, version:.automation.version, status:.automation.status}'

echo
echo "== run automation (expect paused_for_repair) =="
run_json="$(post_json "/v1/automations/run" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_db_failure_smoke",
      automation_id:$automation_id,
      params:{
        allow_local_exec:true,
        execution_backend:"local_process",
        allowed_commands:["uname"]
      }
    }'
)")"
run_id="$(echo "$run_json" | jq -r '.run.run_id')"
echo "$run_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, pause_reason:.run.pause_reason}'

echo
echo "== repair playbook version =="
repair_json="$(post_json "/v1/memory/replay/playbooks/repair" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg playbook_id "$REPAIR_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_db_failure_smoke",
      playbook_id:$playbook_id,
      from_version:1,
      review_required:false,
      target_status:"draft",
      note:"make guided step auto resumable",
      patch:{step_patches:[{step_index:1,set:{safety_level:"auto_ok"}}]}
    }'
)")"
echo "$repair_json" | jq '{playbook_id, from_version, to_version, review_state}'

echo
echo "== resume automation (expect injected db failure to fail-closed) =="
resume_json="$(post_json "/v1/automations/runs/resume" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_db_failure_smoke",
      run_id:$run_id,
      reason:"trigger injected db failure after reset"
    }'
)")"
echo "$resume_json" | jq '{
  run:{
    lifecycle_state:.run.lifecycle_state,
    terminal_outcome:.run.terminal_outcome,
    root_cause_code:.run.root_cause_code
  },
  nodes:(.nodes | map({node_id, lifecycle_state, terminal_outcome, error_code}))
}'
resume_state="$(echo "$resume_json" | jq -r '.run.lifecycle_state')"
resume_outcome="$(echo "$resume_json" | jq -r '.run.terminal_outcome')"
resume_root_cause="$(echo "$resume_json" | jq -r '.run.root_cause_code')"
node_outcome="$(echo "$resume_json" | jq -r '.nodes[] | select(.node_id=="setup_ci") | .terminal_outcome')"
node_error="$(echo "$resume_json" | jq -r '.nodes[] | select(.node_id=="setup_ci") | .error_code')"
if [[ "$resume_state" != "terminal" || "$resume_outcome" != "failed" ]]; then
  echo "expected injected db failure resume to end terminal/failed, got state=${resume_state} outcome=${resume_outcome}" >&2
  exit 1
fi
if [[ "$resume_root_cause" != "automation_injected_db_failure" ]]; then
  echo "expected root_cause_code=automation_injected_db_failure, got ${resume_root_cause}" >&2
  exit 1
fi
if [[ "$node_outcome" != "failed" || "$node_error" != "automation_injected_db_failure" ]]; then
  echo "expected setup_ci node failed/automation_injected_db_failure, got outcome=${node_outcome} error=${node_error}" >&2
  exit 1
fi

echo
echo "== get failed run =="
get_json="$(post_json "/v1/automations/runs/get" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" \
    '{tenant_id:$tenant,scope:$scope,run_id:$run_id,include_nodes:true}'
  )")"
echo "$get_json" | jq '{run:{lifecycle_state:.run.lifecycle_state, terminal_outcome:.run.terminal_outcome, root_cause_code:.run.root_cause_code}, nodes:(.nodes | map({node_id, terminal_outcome, error_code}))}'
get_state="$(echo "$get_json" | jq -r '.run.lifecycle_state')"
if [[ "$get_state" != "terminal" ]]; then
  echo "expected persisted run state to remain terminal after injected db failure, got ${get_state}" >&2
  exit 1
fi

echo
echo "ok: automation_db_failure_smoke completed"
