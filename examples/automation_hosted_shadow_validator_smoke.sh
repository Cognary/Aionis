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
SCOPE="${SCOPE:-automation_hosted_shadow_validator_smoke_$(date +%s)_$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d- -f1)}"
AUTOMATION_ID="${AUTOMATION_ID:-automation_hosted_shadow_validator_smoke_$(date +%s)}"
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

echo "== health =="
curl -fsS "${BASE_URL}/health" | jq '{ok, backend:.memory_store_backend, sandbox}'

echo
echo "== create automation =="
create_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_hosted_shadow_validator_smoke",
      automation_id:$automation_id,
      name:"Automation Hosted Shadow Validator Smoke",
      status:"draft",
      graph:{nodes:[{node_id:"approval_gate",kind:"approval",name:"Approval Gate"}],edges:[]},
      metadata:{source:"automation_hosted_shadow_validator_smoke"}
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
      actor:"automation_hosted_shadow_validator_smoke",
      automation_id:$automation_id,
      from_version:$from_version,
      target_status:"shadow",
      note:"hosted shadow validator smoke promote"
    }'
)"
promote_json="$(post_json "/v1/automations/promote" "$promote_payload")"
echo "$promote_json" | jq '{from_version, to_version, status, automation_status:.automation.status}'
shadow_version="$(echo "$promote_json" | jq -r '.to_version')"

echo
echo "== enqueue shadow validation =="
enqueue_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson shadow_version "$shadow_version" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      actor:"automation_hosted_shadow_validator_smoke",
      automation_id:$automation_id,
      shadow_version:$shadow_version,
      mode:"enqueue",
      note:"queued validation from hosted smoke"
    }'
)"
enqueue_json="$(post_json "/v1/automations/shadow/validate" "$enqueue_payload")"
echo "$enqueue_json" | jq '{queued, validation_request}'
queued_flag="$(echo "$enqueue_json" | jq -r '.queued')"
queued_status="$(echo "$enqueue_json" | jq -r '.validation_request.status')"
if [[ "$queued_flag" != "true" || "$queued_status" != "queued" ]]; then
  echo "expected queued shadow validation request, got queued=${queued_flag} status=${queued_status}" >&2
  exit 1
fi

echo
echo "== run hosted shadow validator loop once =="
hosted_output_file="$(mktemp)"
AIONIS_BASE_URL="$BASE_URL" \
AIONIS_API_KEY="$API_KEY" \
AIONIS_AUTH_BEARER="$AUTH_BEARER" \
npm run -s job:hosted-automation-shadow-validator -- \
  --tenant-id "$TENANT_ID" \
  --scope "$SCOPE" \
  --automation-id "$AUTOMATION_ID" \
  --limit 1 \
  --interval-ms 250 \
  --max-runs 1 >"$hosted_output_file"
cat "$hosted_output_file"
if ! grep -q '"watch": true' "$hosted_output_file"; then
  echo "expected hosted shadow validator to run in watch mode" >&2
  exit 1
fi
if ! grep -q '"completed": 1' "$hosted_output_file"; then
  echo "expected hosted shadow validator loop to complete one queued validation" >&2
  exit 1
fi
rm -f "$hosted_output_file"

echo
echo "== shadow report after hosted loop =="
report_payload="$(
  jq -cn \
    --arg tenant "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg automation_id "$AUTOMATION_ID" \
    --argjson shadow_version "$shadow_version" \
    '{tenant_id:$tenant,scope:$scope,automation_id:$automation_id,shadow_version:$shadow_version}'
)"
report_done_json="$(post_json "/v1/automations/shadow/report" "$report_payload")"
echo "$report_done_json" | jq '{readiness:.comparison.readiness, validation_status:.notes.shadow_validation_status, validation_history_count:(.history.shadow_validations|length)}'
report_done_status="$(echo "$report_done_json" | jq -r '.notes.shadow_validation_status')"
validation_history_count="$(echo "$report_done_json" | jq -r '.history.shadow_validations | length')"
if [[ "$report_done_status" != "completed" ]]; then
  echo "expected report validation_status=completed, got ${report_done_status}" >&2
  exit 1
fi
if [[ "$validation_history_count" -lt "2" ]]; then
  echo "expected at least two validation history entries (queued + completed), got ${validation_history_count}" >&2
  exit 1
fi

echo
echo "ok: automation_hosted_shadow_validator_smoke completed"
