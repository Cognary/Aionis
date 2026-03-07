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
SCOPE="${SCOPE:-automation_shadow_smoke_$(date +%s)}"
AUTOMATION_ID="${AUTOMATION_ID:-automation_shadow_smoke_$(date +%s)}"
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
  local command_text="$2"
  local run_id="$3"

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
      '{
        tenant_id:$tenant,
        scope:$scope,
        run_id:$run_id,
        step_index:1,
        tool_name:"command",
        tool_input:{command:"uname",args:["-s"]},
        safety_level:"auto_ok"
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
  echo "automation shadow smoke requires sandbox.enabled=true and sandbox.mode=local_process" >&2
  echo "$health_json" | jq '{sandbox}'
  exit 1
fi

echo "== health =="
echo "$health_json" | jq '{ok, backend:.memory_store_backend, sandbox}'

PLAYBOOK_RUN_ID="$(lower_uuid)"

echo
echo "== compile strict playbook =="
compile_json="$(record_and_compile_playbook "Shadow Smoke Playbook" "shadow-smoke-ok" "$PLAYBOOK_RUN_ID")"
echo "$compile_json" | jq '{playbook_id, version, status, steps_total:.compile_summary.steps_total}'
PLAYBOOK_ID="$(echo "$compile_json" | jq -r '.playbook_id')"

echo
echo "== create automation =="
create_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --arg playbook_id "$PLAYBOOK_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_shadow_smoke",
      automation_id:$automation_id,
      name:"Automation Shadow Smoke",
      status:"draft",
      graph:{
        nodes:[
          {
            node_id:"approval_gate",
            kind:"approval",
            name:"Approval Gate"
          },
          {
            node_id:"shadow_node",
            kind:"playbook",
            playbook_id:$playbook_id,
            mode:"strict"
          }
        ],
        edges:[
          {
            from:"approval_gate",
            to:"shadow_node",
            type:"on_success"
          }
        ]
      },
      metadata:{source:"automation_shadow_smoke"}
    }'
)"
create_json="$(post_json "/v1/automations/create" "$create_payload")"
echo "$create_json" | jq '{automation_id:.automation.automation_id, version:.automation.version, status:.automation.status}'
create_version="$(echo "$create_json" | jq -r '.automation.version')"

echo
echo "== promote to shadow =="
promote_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson from_version "$create_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_shadow_smoke",
      automation_id:$automation_id,
      from_version:$from_version,
      target_status:"shadow",
      note:"shadow smoke promotion"
    }'
)"
promote_json="$(post_json "/v1/automations/promote" "$promote_payload")"
echo "$promote_json" | jq '{from_version, to_version, promoted_status:.automation.status}'
shadow_version="$(echo "$promote_json" | jq -r '.to_version')"

echo
echo "== default run on shadow version (expect 409) =="
default_run_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson version "$shadow_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_shadow_smoke",
      automation_id:$automation_id,
      version:$version,
      params:{shadow_smoke:true}
    }'
)"
default_out="$(post_json_with_status "/v1/automations/run" "$default_run_payload")"
default_body="$(printf '%s' "$default_out" | sed '$d')"
default_status="$(printf '%s' "$default_out" | tail -n1)"
echo "$default_body" | jq '{status_code, error, message}'
if [[ "$default_status" != "409" ]]; then
  echo "expected default run on shadow version to return 409, got ${default_status}" >&2
  exit 1
fi
default_code="$(echo "$default_body" | jq -r 'if (.error | type) == "object" then (.error.code // .code // empty) else (.code // .error // empty) end')"
if [[ "$default_code" != "automation_version_shadow_not_runnable" ]]; then
  echo "expected automation_version_shadow_not_runnable, got ${default_code}" >&2
  exit 1
fi

echo
echo "== explicit shadow run =="
shadow_run_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson version "$shadow_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_shadow_smoke",
      automation_id:$automation_id,
      version:$version,
      params:{shadow_smoke:true},
      options:{execution_mode:"shadow"}
    }'
)"
shadow_run_json="$(post_json "/v1/automations/run" "$shadow_run_payload")"
echo "$shadow_run_json" | jq '{run_id:.run.run_id, lifecycle_state:.run.lifecycle_state, terminal_outcome:.run.terminal_outcome, execution_mode:.run.execution_mode}'
shadow_run_id="$(echo "$shadow_run_json" | jq -r '.run.run_id')"
shadow_outcome="$(echo "$shadow_run_json" | jq -r '.run.terminal_outcome')"
shadow_execution_mode="$(echo "$shadow_run_json" | jq -r '.run.execution_mode')"
shadow_node_mode="$(echo "$shadow_run_json" | jq -r '.nodes[] | select(.node_id=="shadow_node") | .output_snapshot_json.mode // empty')"
shadow_node_run_id="$(echo "$shadow_run_json" | jq -r '.nodes[] | select(.node_id=="shadow_node") | .playbook_run_id // empty')"
approval_outcome="$(echo "$shadow_run_json" | jq -r '.nodes[] | select(.node_id=="approval_gate") | .terminal_outcome // empty')"
approval_auto="$(echo "$shadow_run_json" | jq -r '.nodes[] | select(.node_id=="approval_gate") | .output_snapshot_json.shadow_auto_approved // false')"
if [[ "$shadow_outcome" != "succeeded" ]]; then
  echo "expected shadow run to succeed, got terminal_outcome=${shadow_outcome}" >&2
  exit 1
fi
if [[ "$shadow_execution_mode" != "shadow" ]]; then
  echo "expected shadow execution_mode=shadow, got ${shadow_execution_mode}" >&2
  exit 1
fi
if [[ "$shadow_node_mode" != "simulate" ]]; then
  echo "expected playbook node to run in simulate mode during shadow execution, got ${shadow_node_mode}" >&2
  exit 1
fi
if [[ -z "$shadow_node_run_id" || "$shadow_node_run_id" == "null" ]]; then
  echo "expected shadow playbook node to record a replay run id" >&2
  exit 1
fi
if [[ "$approval_outcome" != "succeeded" || "$approval_auto" != "true" ]]; then
  echo "expected approval gate to auto-succeed in shadow execution, got outcome=${approval_outcome} auto=${approval_auto}" >&2
  exit 1
fi

echo
echo "== get shadow run =="
get_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg run_id "$shadow_run_id" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      run_id:$run_id,
      include_nodes:true
    }'
)"
get_json="$(post_json "/v1/automations/runs/get" "$get_payload")"
echo "$get_json" | jq '{run_id:.run.run_id, execution_mode:.run.execution_mode, approval_outcome:(.nodes[] | select(.node_id=="approval_gate") | .terminal_outcome), node_mode:(.nodes[] | select(.node_id=="shadow_node") | .output_snapshot_json.mode), playbook_run_id:(.nodes[] | select(.node_id=="shadow_node") | .playbook_run_id), terminal_outcome:.run.terminal_outcome}'
get_execution_mode="$(echo "$get_json" | jq -r '.run.execution_mode')"
get_shadow_node_run_id="$(echo "$get_json" | jq -r '.nodes[] | select(.node_id=="shadow_node") | .playbook_run_id // empty')"
if [[ "$get_execution_mode" != "shadow" ]]; then
  echo "expected run/get to preserve execution_mode=shadow, got ${get_execution_mode}" >&2
  exit 1
fi
if [[ -z "$get_shadow_node_run_id" || "$get_shadow_node_run_id" == "null" ]]; then
  echo "expected run/get to preserve shadow playbook run evidence" >&2
  exit 1
fi

echo
echo "shadow smoke passed"
