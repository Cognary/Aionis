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

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-${AIONIS_BASE_URL:-http://127.0.0.1:${PORT}}}"
TENANT_ID="${TENANT_ID:-default}"
SCOPE="${SCOPE:-automation_public_beta_rollback_drill_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
AUTOMATION_ID="${AUTOMATION_ID:-automation_public_beta_rollback_drill_$(date +%s)}"
SMOKE_THROTTLE_SEC="${SMOKE_THROTTLE_SEC:-0.2}"
AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
API_KEY="${API_KEY:-${AIONIS_API_KEY:-${PERF_API_KEY:-dummy-dev-key}}}"
AUTH_BEARER="${AUTH_BEARER:-${AIONIS_AUTH_BEARER:-${PERF_AUTH_BEARER:-}}}"
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
    API_KEY="${inferred_key}"
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

if ! curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "API is not reachable at ${BASE_URL}" >&2
  exit 1
fi

echo "== create known-good v1 =="
good_v1_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      name:"Automation Public Beta Rollback Drill",
      status:"draft",
      graph:{
        nodes:[{node_id:"approval_gate",kind:"approval",name:"Approval Gate"}],
        edges:[]
      },
      metadata:{source:"automation_public_beta_rollback_drill",variant:"good_v1"}
    }'
)"
good_v1_json="$(post_json "/v1/automations/create" "$good_v1_payload")"
good_v1_version="$(echo "$good_v1_json" | jq -r '.automation.version')"

promote_good_shadow_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson from_version "$good_v1_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      from_version:$from_version,
      target_status:"shadow",
      note:"promote known-good v1 to shadow"
    }'
)"
good_shadow_json="$(post_json "/v1/automations/promote" "$promote_good_shadow_payload")"
good_shadow_version="$(echo "$good_shadow_json" | jq -r '.to_version')"

review_good_shadow_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson shadow_version "$good_shadow_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      shadow_version:$shadow_version,
      verdict:"approved",
      note:"approve known-good v1 for activation"
    }'
)"
post_json "/v1/automations/shadow/review" "$review_good_shadow_payload" >/dev/null

promote_good_active_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson from_version "$good_shadow_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      from_version:$from_version,
      target_status:"active",
      note:"activate known-good v1"
    }'
)"
good_active_json="$(post_json "/v1/automations/promote" "$promote_good_active_payload")"
good_active_version="$(echo "$good_active_json" | jq -r '.to_version')"

echo "== create bad latest version =="
bad_v2_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      name:"Automation Public Beta Rollback Drill",
      status:"draft",
      graph:{
        nodes:[
          {node_id:"approval_gate",kind:"approval",name:"Approval Gate"},
          {node_id:"artifact_gate",kind:"artifact_gate",name:"Artifact Gate",required_artifacts:["$nodes.approval_gate.missing_output"]},
          {node_id:"final_condition",kind:"condition",name:"Final Condition",expression:"$nodes.artifact_gate.status_summary == \"succeeded\""}
        ],
        edges:[
          {from:"approval_gate",to:"artifact_gate",when:"on_success"},
          {from:"artifact_gate",to:"final_condition",when:"on_success"}
        ]
      },
      metadata:{source:"automation_public_beta_rollback_drill",variant:"bad_latest"}
    }'
)"
bad_v2_json="$(post_json "/v1/automations/create" "$bad_v2_payload")"
bad_v2_version="$(echo "$bad_v2_json" | jq -r '.automation.version')"

promote_bad_shadow_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson from_version "$bad_v2_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      from_version:$from_version,
      target_status:"shadow",
      note:"promote bad latest to shadow"
    }'
)"
bad_shadow_json="$(post_json "/v1/automations/promote" "$promote_bad_shadow_payload")"
bad_shadow_version="$(echo "$bad_shadow_json" | jq -r '.to_version')"

review_bad_shadow_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson shadow_version "$bad_shadow_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      shadow_version:$shadow_version,
      verdict:"approved",
      note:"approve bad latest to simulate rollback target"
    }'
)"
post_json "/v1/automations/shadow/review" "$review_bad_shadow_payload" >/dev/null

promote_bad_active_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson from_version "$bad_shadow_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      from_version:$from_version,
      target_status:"active",
      note:"activate bad latest to set up rollback drill"
    }'
)"
bad_active_json="$(post_json "/v1/automations/promote" "$promote_bad_active_payload")"
bad_active_version="$(echo "$bad_active_json" | jq -r '.to_version')"

echo "== disable bad latest head =="
disable_bad_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson from_version "$bad_active_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      from_version:$from_version,
      target_status:"disabled",
      note:"disable bad latest head before rollback recreation"
    }'
)"
disabled_json="$(post_json "/v1/automations/promote" "$disable_bad_payload")"
disabled_version="$(echo "$disabled_json" | jq -r '.to_version')"

echo "== fetch known-good graph =="
good_get_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson version "$good_v1_version" \
    '{tenant_id:$tenant,scope:$scope,automation_id:$automation_id,version:$version}'
)"
good_get_json="$(post_json "/v1/automations/get" "$good_get_payload")"
good_graph="$(echo "$good_get_json" | jq '.automation.graph')"

echo "== recreate known-good graph as new draft head =="
recreate_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson graph "$good_graph" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      name:"Automation Public Beta Rollback Drill",
      status:"draft",
      graph:$graph,
      metadata:{source:"automation_public_beta_rollback_drill",variant:"rollback_recreated_from_v1"}
    }'
)"
recreate_json="$(post_json "/v1/automations/create" "$recreate_payload")"
recreated_version="$(echo "$recreate_json" | jq -r '.automation.version')"

echo "== promote recreated draft to shadow =="
recreated_shadow_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson from_version "$recreated_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      from_version:$from_version,
      target_status:"shadow",
      note:"promote recreated rollback target to shadow"
    }'
)"
recreated_shadow_json="$(post_json "/v1/automations/promote" "$recreated_shadow_payload")"
recreated_shadow_version="$(echo "$recreated_shadow_json" | jq -r '.to_version')"

echo "== enqueue and dispatch shadow validation =="
enqueue_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson shadow_version "$recreated_shadow_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      shadow_version:$shadow_version,
      mode:"enqueue",
      note:"rollback drill queued shadow validation"
    }'
)"
enqueue_json="$(post_json "/v1/automations/shadow/validate" "$enqueue_payload")"
queued_status="$(echo "$enqueue_json" | jq -r '.validation_request.status')"
[[ "$queued_status" == "queued" ]] || { echo "expected queued validation request" >&2; exit 1; }

dispatch_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      limit:1,
      dry_run:false
    }'
)"
dispatch_json="$(post_json "/v1/automations/shadow/validate/dispatch" "$dispatch_payload")"
dispatch_completed="$(echo "$dispatch_json" | jq -r '[.results[] | select(.status=="completed")] | length')"
[[ "$dispatch_completed" == "1" ]] || { echo "expected one completed dispatched validation" >&2; exit 1; }

echo "== confirm shadow report completed =="
report_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson shadow_version "$recreated_shadow_version" \
    '{tenant_id:$tenant,scope:$scope,automation_id:$automation_id,shadow_version:$shadow_version}'
)"
report_json="$(post_json "/v1/automations/shadow/report" "$report_payload")"
report_validation_status="$(echo "$report_json" | jq -r '.notes.shadow_validation_status')"
[[ "$report_validation_status" == "completed" ]] || { echo "expected completed shadow validation in report" >&2; exit 1; }

echo "== approve recreated shadow and promote back to active =="
review_recreated_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson shadow_version "$recreated_shadow_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      shadow_version:$shadow_version,
      verdict:"approved",
      note:"rollback drill approve recreated version"
    }'
)"
post_json "/v1/automations/shadow/review" "$review_recreated_payload" >/dev/null

promote_recreated_active_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson from_version "$recreated_shadow_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_public_beta_rollback_drill",
      automation_id:$automation_id,
      from_version:$from_version,
      target_status:"active",
      note:"rollback drill reactivate recreated version"
    }'
)"
reactivated_json="$(post_json "/v1/automations/promote" "$promote_recreated_active_payload")"
reactivated_version="$(echo "$reactivated_json" | jq -r '.to_version')"

echo
jq -n \
  --arg tenant_id "$TENANT_ID" \
  --arg scope "$SCOPE" \
  --arg automation_id "$AUTOMATION_ID" \
  --argjson good_v1_version "$good_v1_version" \
  --argjson good_active_version "$good_active_version" \
  --argjson bad_v2_version "$bad_v2_version" \
  --argjson bad_active_version "$bad_active_version" \
  --argjson disabled_version "$disabled_version" \
  --argjson recreated_version "$recreated_version" \
  --argjson recreated_shadow_version "$recreated_shadow_version" \
  --argjson reactivated_version "$reactivated_version" \
  --arg report_validation_status "$report_validation_status" \
  '{
    ok:true,
    tenant_id:$tenant_id,
    scope:$scope,
    automation_id:$automation_id,
    versions:{
      good_v1:$good_v1_version,
      good_active:$good_active_version,
      bad_v2:$bad_v2_version,
      bad_active:$bad_active_version,
      disabled_bad_head:$disabled_version,
      recreated_draft:$recreated_version,
      recreated_shadow:$recreated_shadow_version,
      recreated_active:$reactivated_version
    },
    shadow_validation_status:$report_validation_status
  }'
