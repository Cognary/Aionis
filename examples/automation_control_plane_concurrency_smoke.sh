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
SCOPE="${SCOPE:-automation_control_plane_concurrency_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
API_KEY="${API_KEY:-${PERF_API_KEY:-}}"
AUTH_BEARER="${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
SMOKE_THROTTLE_SEC="${SMOKE_THROTTLE_SEC:-0.1}"

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
  curl -sS -w $'\n%{http_code}' "${BASE_URL}${path}" \
    -H "content-type: application/json" \
    "${AUTH_ARGS[@]}" \
    --data-binary "${payload}"
}

lower_uuid() {
  uuidgen | tr '[:upper:]' '[:lower:]'
}

status_of_file() {
  tail -n 1 "$1"
}

body_of_file() {
  sed '$d' "$1"
}

error_code_of_body() {
  jq -r '.error.code? // .code? // .error? // "unknown_error"' <<<"$1"
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
    jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$run_id" --arg command_text "$command_text" \
      '{
        tenant_id:$tenant,
        scope:$scope,
        run_id:$run_id,
        step_index:1,
        status:"success",
        output_signature:{stdout:$command_text}
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
  echo "automation control plane concurrency smoke requires sandbox.enabled=true and sandbox.mode=local_process" >&2
  echo "$health_json" | jq '{sandbox}'
  exit 1
fi

echo "== health =="
echo "$health_json" | jq '{ok, backend:.memory_store_backend, sandbox}'

APPROVAL_AUTOMATION_ID="automation_concurrent_approval_$(date +%s)"
REPAIR_AUTOMATION_ID="automation_concurrent_repair_$(date +%s)"

echo
echo "== create approval automation =="
approval_create_json="$(post_json "/v1/automations/create" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$APPROVAL_AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_concurrency_smoke",
      automation_id:$automation_id,
      name:"Automation Concurrency Approval Smoke",
      status:"active",
      graph:{nodes:[{node_id:"approval_gate",kind:"approval"}],edges:[]}
    }'
)")"
echo "$approval_create_json" | jq '{automation_id:.automation.automation_id, version:.automation.version}'

echo
echo "== run approval automation (expect paused) =="
approval_run_json="$(post_json "/v1/automations/run" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$APPROVAL_AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_concurrency_smoke",
      automation_id:$automation_id
    }'
)")"
approval_run_id="$(echo "$approval_run_json" | jq -r '.run.run_id')"
echo "$approval_run_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, pause_reason:.run.pause_reason}'

approval_cancel_payload="$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$approval_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_concurrency_smoke",
      run_id:$run_id,
      reason:"parallel cancel"
    }'
)"
approval_resume_payload="$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$approval_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_concurrency_smoke",
      run_id:$run_id,
      reason:"parallel resume"
    }'
)"

cancel_file="$(mktemp)"
resume_file="$(mktemp)"
post_json_with_status "/v1/automations/runs/cancel" "$approval_cancel_payload" >"$cancel_file" &
cancel_pid=$!
post_json_with_status "/v1/automations/runs/resume" "$approval_resume_payload" >"$resume_file" &
resume_pid=$!
wait "$cancel_pid"
wait "$resume_pid"

cancel_status="$(status_of_file "$cancel_file")"
resume_status="$(status_of_file "$resume_file")"
cancel_body="$(body_of_file "$cancel_file")"
resume_body="$(body_of_file "$resume_file")"
echo
echo "== concurrent cancel vs resume =="
echo "$cancel_body" | jq '{path:"cancel", status_code, code:(.error.code? // .code? // null), terminal_outcome:(.run.terminal_outcome? // null)}'
echo "$resume_body" | jq '{path:"resume", status_code, code:(.error.code? // .code? // null), terminal_outcome:(.run.terminal_outcome? // null)}'

success_count=0
conflict_count=0
winning_outcome=""
if [[ "$cancel_status" == "200" ]]; then
  success_count=$((success_count + 1))
  winning_outcome="$(echo "$cancel_body" | jq -r '.run.terminal_outcome')"
elif [[ "$cancel_status" == "409" ]]; then
  conflict_count=$((conflict_count + 1))
fi
if [[ "$resume_status" == "200" ]]; then
  success_count=$((success_count + 1))
  winning_outcome="$(echo "$resume_body" | jq -r '.run.terminal_outcome')"
elif [[ "$resume_status" == "409" ]]; then
  conflict_count=$((conflict_count + 1))
fi
if [[ "$success_count" != "1" || "$conflict_count" != "1" ]]; then
  echo "expected one success and one conflict for cancel/resume race, got success=${success_count} conflict=${conflict_count}" >&2
  exit 1
fi

approval_get_json="$(post_json "/v1/automations/runs/get" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$approval_run_id" \
    '{tenant_id:$tenant,scope:$scope,run_id:$run_id,include_nodes:true}'
)")"
approval_final_outcome="$(echo "$approval_get_json" | jq -r '.run.terminal_outcome')"
if [[ "$approval_final_outcome" != "$winning_outcome" ]]; then
  echo "expected final approval race outcome ${winning_outcome}, got ${approval_final_outcome}" >&2
  exit 1
fi

rm -f "$cancel_file" "$resume_file"

echo
echo "== compile repair playbook =="
repair_compile_json="$(record_and_compile_playbook "Concurrency Repair Playbook" "needs_confirm" "concurrency-repair-needs-review" "$(lower_uuid)")"
REPAIR_PLAYBOOK_ID="$(echo "$repair_compile_json" | jq -r '.playbook_id')"
echo "$repair_compile_json" | jq '{playbook_id, version, status}'

echo
echo "== create repair automation =="
repair_create_json="$(post_json "/v1/automations/create" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$REPAIR_AUTOMATION_ID" --arg playbook_id "$REPAIR_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_concurrency_smoke",
      automation_id:$automation_id,
      name:"Automation Concurrency Repair Smoke",
      status:"active",
      graph:{
        nodes:[{node_id:"setup_ci",kind:"playbook",playbook_id:$playbook_id,mode:"guided"}],
        edges:[]
      }
    }'
)")"
echo "$repair_create_json" | jq '{automation_id:.automation.automation_id, version:.automation.version}'

echo
echo "== run repair automation (expect paused_for_repair) =="
repair_run_json="$(post_json "/v1/automations/run" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg automation_id "$REPAIR_AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_concurrency_smoke",
      automation_id:$automation_id,
      params:{
        allow_local_exec:true,
        execution_backend:"local_process",
        allowed_commands:["uname"]
      }
    }'
)")"
repair_run_id="$(echo "$repair_run_json" | jq -r '.run.run_id')"
echo "$repair_run_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, pause_reason:.run.pause_reason}'

echo
echo "== repair playbook so approve path is valid =="
repair_patch_json="$(post_json "/v1/memory/replay/playbooks/repair" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg playbook_id "$REPAIR_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_concurrency_smoke",
      playbook_id:$playbook_id,
      from_version:1,
      review_required:false,
      target_status:"draft",
      note:"make guided step auto resumable",
      patch:{step_patches:[{step_index:1,set:{safety_level:"auto_ok"}}]}
    }'
)")"
echo "$repair_patch_json" | jq '{playbook_id, from_version, to_version, review_state}'

approve_file="$(mktemp)"
reject_file="$(mktemp)"
approve_payload="$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$repair_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_concurrency_smoke",
      run_id:$run_id,
      reason:"parallel approve"
    }'
)"
reject_payload="$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$repair_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_concurrency_smoke",
      run_id:$run_id,
      reason:"parallel reject"
    }'
)"
post_json_with_status "/v1/automations/runs/approve_repair" "$approve_payload" >"$approve_file" &
approve_pid=$!
post_json_with_status "/v1/automations/runs/reject_repair" "$reject_payload" >"$reject_file" &
reject_pid=$!
wait "$approve_pid"
wait "$reject_pid"

approve_status="$(status_of_file "$approve_file")"
reject_status="$(status_of_file "$reject_file")"
approve_body="$(body_of_file "$approve_file")"
reject_body="$(body_of_file "$reject_file")"
echo
echo "== concurrent approve_repair vs reject_repair =="
echo "$approve_body" | jq '{path:"approve_repair", status_code, code:(.error.code? // .code? // null), terminal_outcome:(.run.terminal_outcome? // null)}'
echo "$reject_body" | jq '{path:"reject_repair", status_code, code:(.error.code? // .code? // null), terminal_outcome:(.run.terminal_outcome? // null)}'

success_count=0
conflict_count=0
winning_outcome=""
if [[ "$approve_status" == "200" ]]; then
  success_count=$((success_count + 1))
  winning_outcome="$(echo "$approve_body" | jq -r '.run.terminal_outcome')"
elif [[ "$approve_status" == "409" ]]; then
  conflict_count=$((conflict_count + 1))
fi
if [[ "$reject_status" == "200" ]]; then
  success_count=$((success_count + 1))
  winning_outcome="$(echo "$reject_body" | jq -r '.run.terminal_outcome')"
elif [[ "$reject_status" == "409" ]]; then
  conflict_count=$((conflict_count + 1))
fi
if [[ "$success_count" != "1" || "$conflict_count" != "1" ]]; then
  echo "expected one success and one conflict for approve/reject race, got success=${success_count} conflict=${conflict_count}" >&2
  exit 1
fi

repair_get_json="$(post_json "/v1/automations/runs/get" "$(
  jq -cn --arg tenant "$TENANT_ID" --arg scope "$SCOPE" --arg run_id "$repair_run_id" \
    '{tenant_id:$tenant,scope:$scope,run_id:$run_id,include_nodes:true}'
)")"
repair_final_outcome="$(echo "$repair_get_json" | jq -r '.run.terminal_outcome')"
if [[ "$repair_final_outcome" != "$winning_outcome" ]]; then
  echo "expected final repair race outcome ${winning_outcome}, got ${repair_final_outcome}" >&2
  exit 1
fi

rm -f "$approve_file" "$reject_file"

echo
echo "ok: automation_control_plane_concurrency_smoke completed"
