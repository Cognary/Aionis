#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${AIONIS_STANDALONE_CONTAINER:-aionis-standalone}"
NODE_BIN="${AIONIS_DEV_MCP_NODE_BIN:-node}"
MCP_PATH="${AIONIS_DEV_MCP_PATH:-/app/dist/mcp/aionis-dev-mcp.js}"
BASE_URL="${AIONIS_BASE_URL:-http://127.0.0.1:3001}"
SCOPE="${AIONIS_SCOPE:-default}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing command: $1" >&2
    exit 1
  }
}

need docker

DOCKER_ARGS=(
  exec
  -i
  -e "AIONIS_BASE_URL=${BASE_URL}"
  -e "AIONIS_SCOPE=${SCOPE}"
)

if [[ -n "${AIONIS_TENANT_ID:-}" ]]; then
  DOCKER_ARGS+=(-e "AIONIS_TENANT_ID=${AIONIS_TENANT_ID}")
fi
if [[ -n "${AIONIS_ADMIN_TOKEN:-}" ]]; then
  DOCKER_ARGS+=(-e "AIONIS_ADMIN_TOKEN=${AIONIS_ADMIN_TOKEN}")
fi
if [[ -n "${AIONIS_API_KEY:-}" ]]; then
  DOCKER_ARGS+=(-e "AIONIS_API_KEY=${AIONIS_API_KEY}")
fi
if [[ -n "${AIONIS_AUTH_BEARER:-}" ]]; then
  DOCKER_ARGS+=(-e "AIONIS_AUTH_BEARER=${AIONIS_AUTH_BEARER}")
fi

DOCKER_ARGS+=("${CONTAINER_NAME}" "${NODE_BIN}" "${MCP_PATH}")

exec docker "${DOCKER_ARGS[@]}"
