#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need jq
need npm

PORT="${PORT:-3001}"
AIONIS_BASE_URL="${AIONIS_BASE_URL:-http://localhost:${PORT}}"
AIONIS_SCOPE="${AIONIS_SCOPE:-${MEMORY_SCOPE:-default}}"
AIONIS_ADMIN_TOKEN="${AIONIS_ADMIN_TOKEN:-${ADMIN_TOKEN:-}}"
AIONIS_API_KEY="${AIONIS_API_KEY:-${API_KEY:-${PERF_API_KEY:-}}}"
AIONIS_AUTH_BEARER="${AIONIS_AUTH_BEARER:-${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}}"

if [[ -z "${AIONIS_API_KEY}" && -z "${AIONIS_AUTH_BEARER}" && -n "${MEMORY_API_KEYS_JSON:-}" ]]; then
  AIONIS_API_KEY="$(echo "${MEMORY_API_KEYS_JSON}" | jq -r 'keys[0] // empty' 2>/dev/null || true)"
fi

out="$(mktemp /tmp/aionis_mcp_smoke_out_XXXXXX.jsonl)"
err="$(mktemp /tmp/aionis_mcp_smoke_err_XXXXXX.log)"
trap 'rm -f "${out}" "${err}"' EXIT

cd "${ROOT_DIR}"
AIONIS_BASE_URL="${AIONIS_BASE_URL}" \
AIONIS_SCOPE="${AIONIS_SCOPE}" \
AIONIS_ADMIN_TOKEN="${AIONIS_ADMIN_TOKEN}" \
AIONIS_API_KEY="${AIONIS_API_KEY}" \
AIONIS_AUTH_BEARER="${AIONIS_AUTH_BEARER}" \
npm run -s mcp:aionis < "${ROOT_DIR}/examples/mcp_smoke.jsonl" > "${out}" 2> "${err}"

jq -s -e 'any(.[]; .id==1 and (.result.serverInfo.name=="aionis-memory-graph"))' "${out}" >/dev/null
jq -s -e 'any(.[]; .id==2 and ((.result.tools | length) >= 2))' "${out}" >/dev/null
jq -s -e 'any(.[]; .id==3 and (.result.content | type=="array"))' "${out}" >/dev/null
jq -s -e 'any(.[]; .id==4 and (.result==null))' "${out}" >/dev/null

jq -n \
  --arg base_url "${AIONIS_BASE_URL}" \
  --arg scope "${AIONIS_SCOPE}" \
  --argjson has_api_key "$([[ -n "${AIONIS_API_KEY}" ]] && echo true || echo false)" \
  --argjson has_bearer "$([[ -n "${AIONIS_AUTH_BEARER}" ]] && echo true || echo false)" \
  '{
    ok: true,
    integration: "mcp_openwork_stdio",
    base_url: $base_url,
    scope: $scope,
    auth: { has_api_key: $has_api_key, has_bearer: $has_bearer },
    checks: {
      initialize: true,
      tools_list: true,
      recall_tool_call: true,
      shutdown: true
    }
  }'
