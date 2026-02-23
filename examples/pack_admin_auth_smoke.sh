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

PORT="${PORT:-3017}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
ADMIN_TOKEN="${ADMIN_TOKEN:-admin-smoke-secret}"
DATABASE_URL="${DATABASE_URL:-postgres://aionis:aionis@127.0.0.1:1/aionis_memory}"
DB_POOL_CONNECTION_TIMEOUT_MS="${DB_POOL_CONNECTION_TIMEOUT_MS:-100}"

TMP_DIR="$(mktemp -d /tmp/aionis_pack_admin_auth_XXXXXX)"
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

call_post() {
  local path="$1"
  local payload="$2"
  local token="${3:-}"
  local body_file="${TMP_DIR}/body_$(date +%s%N).json"
  local status
  if [[ -n "${token}" ]]; then
    status="$(
      curl -sS -o "${body_file}" -w "%{http_code}" \
        -H "content-type: application/json" \
        -H "X-Admin-Token: ${token}" \
        --data-binary "${payload}" \
        "${BASE_URL}${path}"
    )"
  else
    status="$(
      curl -sS -o "${body_file}" -w "%{http_code}" \
        -H "content-type: application/json" \
        --data-binary "${payload}" \
        "${BASE_URL}${path}"
    )"
  fi
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

EXPORT_PAYLOAD='{"tenant_id":"default","scope":"default","max_rows":1}'
IMPORT_PAYLOAD='{"tenant_id":"default","scope":"default","verify_only":true,"pack":{"version":"aionis_pack_v1","tenant_id":"default","scope":"default","nodes":[],"edges":[],"commits":[]}}'

echo "[3/4] verify unauthorized without admin token"
out="$(call_post "/v1/memory/packs/export" "${EXPORT_PAYLOAD}")"
status="${out%%|*}"
body_file="${out#*|}"
assert_http_error "export-no-admin" "${status}" "${body_file}" "401" "unauthorized_admin"

out="$(call_post "/v1/memory/packs/import" "${IMPORT_PAYLOAD}")"
status="${out%%|*}"
body_file="${out#*|}"
assert_http_error "import-no-admin" "${status}" "${body_file}" "401" "unauthorized_admin"

echo "[4/4] verify unauthorized with wrong admin token"
out="$(call_post "/v1/memory/packs/export" "${EXPORT_PAYLOAD}" "wrong-token")"
status="${out%%|*}"
body_file="${out#*|}"
assert_http_error "export-wrong-admin" "${status}" "${body_file}" "401" "unauthorized_admin"

out="$(call_post "/v1/memory/packs/import" "${IMPORT_PAYLOAD}" "wrong-token")"
status="${out%%|*}"
body_file="${out#*|}"
assert_http_error "import-wrong-admin" "${status}" "${body_file}" "401" "unauthorized_admin"

echo "ok: pack admin auth smoke passed"

