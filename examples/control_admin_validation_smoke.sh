#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need curl
need jq
need npm

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

PORT="${PORT:-3018}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
ADMIN_TOKEN="${ADMIN_TOKEN:-admin-smoke-secret}"
DATABASE_URL="${DATABASE_URL:-postgres://aionis:aionis@127.0.0.1:1/aionis_memory}"
DB_POOL_CONNECTION_TIMEOUT_MS="${DB_POOL_CONNECTION_TIMEOUT_MS:-100}"

TMP_DIR="$(mktemp -d /tmp/aionis_control_admin_validation_XXXXXX)"
SERVER_LOG="${TMP_DIR}/server.log"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_DIR}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_health() {
  local i
  for i in $(seq 1 120); do
    if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  echo "server failed to become healthy; log:" >&2
  tail -n 120 "${SERVER_LOG}" >&2 || true
  return 1
}

call_admin_post() {
  local path="$1"
  local payload="$2"
  local body_file="${TMP_DIR}/body_$(date +%s%N).json"
  local status
  status="$(
    curl -sS -o "${body_file}" -w "%{http_code}" \
      -H "content-type: application/json" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}" \
      --data-binary "${payload}" \
      "${BASE_URL}${path}"
  )"
  echo "${status}|${body_file}"
}

assert_http_error() {
  local name="$1"
  local status="$2"
  local body_file="$3"
  local expect_status="$4"
  local expect_error="$5"
  if [[ "${status}" != "${expect_status}" ]]; then
    echo "[${name}] expected status=${expect_status}, got ${status}" >&2
    cat "${body_file}" >&2 || true
    exit 1
  fi
  local got_error
  got_error="$(jq -r '.error // empty' "${body_file}")"
  if [[ "${got_error}" != "${expect_error}" ]]; then
    echo "[${name}] expected error=${expect_error}, got ${got_error}" >&2
    cat "${body_file}" >&2 || true
    exit 1
  fi
}

echo "[1/4] build"
npm run -s build >/dev/null

echo "[2/4] start API"
(
  PORT="${PORT}" \
  ADMIN_TOKEN="${ADMIN_TOKEN}" \
  DATABASE_URL="${DATABASE_URL}" \
  DB_POOL_CONNECTION_TIMEOUT_MS="${DB_POOL_CONNECTION_TIMEOUT_MS}" \
  APP_ENV="dev" \
  MEMORY_AUTH_MODE="off" \
  node dist/index.js
) >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

wait_for_health

echo "[3/4] validate alert route target guards"
ALERT_HTTP_PAYLOAD='{"tenant_id":"default","channel":"webhook","target":"http://alerts.example.com/hooks/aionis"}'
ALERT_PRIVATE_HOST_PAYLOAD='{"tenant_id":"default","channel":"webhook","target":"https://127.0.0.1:8443/hooks/aionis"}'
ALERT_SLACK_HOST_PAYLOAD='{"tenant_id":"default","channel":"slack_webhook","target":"https://api.slack.com/services/T000/B000/XXXX"}'

out="$(call_admin_post "/v1/admin/control/alerts/routes" "${ALERT_HTTP_PAYLOAD}")"
status="${out%%|*}"
body_file="${out#*|}"
assert_http_error "alert-http-scheme" "${status}" "${body_file}" "400" "invalid_alert_target"

out="$(call_admin_post "/v1/admin/control/alerts/routes" "${ALERT_PRIVATE_HOST_PAYLOAD}")"
status="${out%%|*}"
body_file="${out#*|}"
assert_http_error "alert-private-host" "${status}" "${body_file}" "400" "invalid_alert_target"

out="$(call_admin_post "/v1/admin/control/alerts/routes" "${ALERT_SLACK_HOST_PAYLOAD}")"
status="${out%%|*}"
body_file="${out#*|}"
assert_http_error "alert-slack-host" "${status}" "${body_file}" "400" "invalid_alert_target"

echo "[4/4] validate incident publish input guards"
JOB_BAD_SOURCE_PAYLOAD='{"tenant_id":"default","run_id":"run-1","source_dir":"var/lib/aionis/incidents/run-1","target":"s3://aionis-artifacts/incidents/run-1"}'
JOB_BAD_TARGET_SCHEME_PAYLOAD='{"tenant_id":"default","run_id":"run-2","source_dir":"/var/lib/aionis/incidents/run-2","target":"ftp://uploads.example.com/aionis/run-2"}'
JOB_BAD_TARGET_HOST_PAYLOAD='{"tenant_id":"default","run_id":"run-3","source_dir":"/var/lib/aionis/incidents/run-3","target":"https://127.0.0.1/aionis/run-3"}'

out="$(call_admin_post "/v1/admin/control/incident-publish/jobs" "${JOB_BAD_SOURCE_PAYLOAD}")"
status="${out%%|*}"
body_file="${out#*|}"
assert_http_error "incident-bad-source-dir" "${status}" "${body_file}" "400" "invalid_incident_publish_source_dir"

out="$(call_admin_post "/v1/admin/control/incident-publish/jobs" "${JOB_BAD_TARGET_SCHEME_PAYLOAD}")"
status="${out%%|*}"
body_file="${out#*|}"
assert_http_error "incident-bad-target-scheme" "${status}" "${body_file}" "400" "invalid_incident_publish_target"

out="$(call_admin_post "/v1/admin/control/incident-publish/jobs" "${JOB_BAD_TARGET_HOST_PAYLOAD}")"
status="${out%%|*}"
body_file="${out#*|}"
assert_http_error "incident-bad-target-host" "${status}" "${body_file}" "400" "invalid_incident_publish_target"

echo "ok: control admin validation smoke passed"
