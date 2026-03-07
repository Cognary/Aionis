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
SCOPE="${SCOPE:-automation_control_plane_smoke_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
API_KEY="${API_KEY:-${PERF_API_KEY:-}}"
AUTH_BEARER="${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
SMOKE_THROTTLE_SEC="${SMOKE_THROTTLE_SEC:-0.2}"

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

error_code_of() {
  jq -r '.error.code? // .code? // .error? // "unknown_error"' <<<"$1"
}

expect_status_and_code() {
  local raw="$1"
  local expected_status="$2"
  local expected_code="$3"
  local actual_status="${raw##*$'\n'}"
  local body="${raw%$'\n'*}"
  local actual_code
  actual_code="$(error_code_of "$body")"
  echo "$body" | jq 'if type == "object" then {status_code, code:(.error.code? // .code? // .error? // null), message:(.error.message? // .message? // null)} else {raw:.} end'
  if [[ "$actual_status" != "$expected_status" ]]; then
    echo "expected HTTP ${expected_status}, got ${actual_status}" >&2
    exit 1
  fi
  if [[ "$actual_code" != "$expected_code" ]]; then
    echo "expected error code ${expected_code}, got ${actual_code}" >&2
    exit 1
  fi
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
  echo "automation control plane smoke requires sandbox.enabled=true and sandbox.mode=local_process" >&2
  echo "$health_json" | jq '{sandbox}'
  exit 1
fi

echo "== health =="
echo "$health_json" | jq '{ok, backend:.memory_store_backend, sandbox}'

APPROVAL_AUTOMATION_ID="automation_control_approval_$(date +%s)"
REPAIR_AUTOMATION_ID="automation_control_repair_$(date +%s)"
REPAIR_RUN_ID="$(lower_uuid)"

echo
echo "== create approval automation =="
approval_create_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$APPROVAL_AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_smoke",
      automation_id:$automation_id,
      name:"Automation Control Approval Smoke",
      status:"active",
      graph:{
        nodes:[
          {node_id:"approval_gate",kind:"approval",name:"Approval Gate"}
        ],
        edges:[]
      }
    }'
)"
approval_create_json="$(post_json "/v1/automations/create" "$approval_create_payload")"
echo "$approval_create_json" | jq '{automation_id:.automation.automation_id, version:.automation.version, status:.automation.status}'

echo
echo "== run approval automation (expect paused_for_approval) =="
approval_run_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$APPROVAL_AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_smoke",
      automation_id:$automation_id
    }'
)"
approval_run_json="$(post_json "/v1/automations/run" "$approval_run_payload")"
echo "$approval_run_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, pause_reason:.run.pause_reason}'
approval_run_id="$(echo "$approval_run_json" | jq -r '.run.run_id')"

echo
echo "== reject_repair on approval-paused run (expect 409) =="
approval_reject_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$approval_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_smoke",
      run_id:$run_id,
      reason:"reject should only work for repair"
    }'
)"
approval_reject_raw="$(post_json_with_status "/v1/automations/runs/reject_repair" "$approval_reject_payload")"
expect_status_and_code "$approval_reject_raw" "409" "automation_run_not_repair_paused"

echo
echo "== cancel approval-paused run =="
approval_cancel_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$approval_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_smoke",
      run_id:$run_id,
      reason:"cancel paused approval run"
    }'
)"
approval_cancel_json="$(post_json "/v1/automations/runs/cancel" "$approval_cancel_payload")"
echo "$approval_cancel_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, terminal_outcome:.run.terminal_outcome}'
approval_cancel_outcome="$(echo "$approval_cancel_json" | jq -r '.run.terminal_outcome')"
if [[ "$approval_cancel_outcome" != "cancelled" ]]; then
  echo "expected cancelled approval run to end as cancelled, got ${approval_cancel_outcome}" >&2
  exit 1
fi

echo
echo "== resume cancelled approval run (expect 409) =="
approval_resume_raw="$(post_json_with_status "/v1/automations/runs/resume" "$approval_cancel_payload")"
expect_status_and_code "$approval_resume_raw" "409" "automation_run_not_paused"

echo
echo "== compile repair playbook =="
repair_compile_json="$(record_and_compile_playbook "Repair Control Playbook" "needs_confirm" "repair-control-needs-review" "$REPAIR_RUN_ID")"
echo "$repair_compile_json" | jq '{playbook_id, version, status, steps_total:.compile_summary.steps_total}'
REPAIR_PLAYBOOK_ID="$(echo "$repair_compile_json" | jq -r '.playbook_id')"

echo
echo "== create repair automation =="
repair_create_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$REPAIR_AUTOMATION_ID" \
    --arg playbook_id "$REPAIR_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_smoke",
      automation_id:$automation_id,
      name:"Automation Control Repair Smoke",
      status:"active",
      graph:{
        nodes:[
          {
            node_id:"setup_ci",
            kind:"playbook",
            name:"Setup CI",
            playbook_id:$playbook_id,
            mode:"guided"
          }
        ],
        edges:[]
      }
    }'
)"
repair_create_json="$(post_json "/v1/automations/create" "$repair_create_payload")"
echo "$repair_create_json" | jq '{automation_id:.automation.automation_id, version:.automation.version, status:.automation.status}'

echo
echo "== run repair automation (expect paused_for_repair) =="
repair_run_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$REPAIR_AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_smoke",
      automation_id:$automation_id,
      params:{
        allow_local_exec:true,
        execution_backend:"local_process",
        allowed_commands:["uname"]
      }
    }'
)"
repair_run_json="$(post_json "/v1/automations/run" "$repair_run_payload")"
echo "$repair_run_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, pause_reason:.run.pause_reason}'
repair_run_id="$(echo "$repair_run_json" | jq -r '.run.run_id')"

echo
echo "== compensation retry while paused (expect 409) =="
repair_comp_retry_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$repair_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_smoke",
      run_id:$run_id,
      reason:"retry should require terminal run"
    }'
)"
repair_comp_retry_raw="$(post_json_with_status "/v1/automations/runs/compensation/retry" "$repair_comp_retry_payload")"
expect_status_and_code "$repair_comp_retry_raw" "409" "automation_run_not_terminal"

echo
echo "== approve_repair before repair exists (expect 409 and no approval_id) =="
repair_approve_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$repair_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_smoke",
      run_id:$run_id,
      reason:"approval before repair should fail cleanly"
    }'
)"
repair_approve_before_raw="$(post_json_with_status "/v1/automations/runs/approve_repair" "$repair_approve_payload")"
expect_status_and_code "$repair_approve_before_raw" "409" "automation_run_not_resumable"

repair_get_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$repair_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      run_id:$run_id,
      include_nodes:true
    }'
)"
repair_get_before_json="$(post_json "/v1/automations/runs/get" "$repair_get_payload")"
approval_id_before_repair="$(echo "$repair_get_before_json" | jq -r '.nodes[] | select(.node_id=="setup_ci") | .approval_id // empty')"
repair_pause_reason="$(echo "$repair_get_before_json" | jq -r '.run.pause_reason')"
if [[ -n "$approval_id_before_repair" ]]; then
  echo "expected approve_repair preflight failure to leave approval_id empty, got ${approval_id_before_repair}" >&2
  exit 1
fi
if [[ "$repair_pause_reason" != "repair_required" ]]; then
  echo "expected run to remain paused_for_repair after failed approve_repair, got ${repair_pause_reason}" >&2
  exit 1
fi

echo
echo "== repair playbook version =="
repair_patch_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg playbook_id "$REPAIR_PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_smoke",
      playbook_id:$playbook_id,
      from_version:1,
      review_required:false,
      target_status:"draft",
      note:"make guided step auto resumable",
      patch:{
        step_patches:[
          {
            step_index:1,
            set:{safety_level:"auto_ok"}
          }
        ]
      }
    }'
)"
repair_patch_json="$(post_json "/v1/memory/replay/playbooks/repair" "$repair_patch_payload")"
echo "$repair_patch_json" | jq '{playbook_id, from_version, to_version, status, review_state}'
repair_to_version="$(echo "$repair_patch_json" | jq -r '.to_version')"
if [[ "$repair_to_version" == "null" || "$repair_to_version" == "1" ]]; then
  echo "expected repaired playbook to create a newer version, got ${repair_to_version}" >&2
  exit 1
fi

echo
echo "== approve repaired run =="
repair_approve_json="$(post_json "/v1/automations/runs/approve_repair" "$repair_approve_payload")"
echo "$repair_approve_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, terminal_outcome:.run.terminal_outcome}'
repair_approve_outcome="$(echo "$repair_approve_json" | jq -r '.run.terminal_outcome')"
if [[ "$repair_approve_outcome" != "succeeded" ]]; then
  echo "expected approve_repair to complete successfully after repair, got ${repair_approve_outcome}" >&2
  exit 1
fi

echo
echo "== reject_repair after approve_repair (expect 409) =="
repair_reject_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$repair_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_control_plane_smoke",
      run_id:$run_id,
      reason:"repair already approved"
    }'
)"
repair_reject_after_raw="$(post_json_with_status "/v1/automations/runs/reject_repair" "$repair_reject_payload")"
expect_status_and_code "$repair_reject_after_raw" "409" "automation_run_not_paused"

echo
echo "ok: automation_control_plane_smoke completed"
