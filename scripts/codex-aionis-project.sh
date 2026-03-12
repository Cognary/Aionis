#!/usr/bin/env bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]}"
while [[ -L "${SOURCE}" ]]; do
  DIR="$(cd -P "$(dirname "${SOURCE}")" && pwd)"
  TARGET="$(readlink "${SOURCE}")"
  if [[ "${TARGET}" != /* ]]; then
    SOURCE="${DIR}/${TARGET}"
  else
    SOURCE="${TARGET}"
  fi
done
ROOT_DIR="$(cd -P "$(dirname "${SOURCE}")/.." && pwd)"

BASE_URL="${AIONIS_BASE_URL:-http://127.0.0.1:3101}"
TENANT_ID="${AIONIS_TENANT_ID:-}"
EXPLICIT_SCOPE="${AIONIS_SCOPE:-}"
PRINT_ONLY="false"
PROJECT_ROOT=""

normalize_scope() {
  local raw="$1"
  local out
  out="$(printf '%s' "${raw}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//; s/-+/-/g')"
  if [[ -z "${out}" ]]; then
    out="default"
  fi
  printf '%s' "${out}"
}

ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -C|--cd)
      PROJECT_ROOT="$2"
      ARGS+=("$1" "$2")
      shift 2
      ;;
    --project-root)
      PROJECT_ROOT="$2"
      shift 2
      ;;
    --scope)
      EXPLICIT_SCOPE="$2"
      shift 2
      ;;
    --tenant-id)
      TENANT_ID="$2"
      shift 2
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --print)
      PRINT_ONLY="true"
      shift
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ -z "${PROJECT_ROOT}" ]]; then
  PROJECT_ROOT="$(pwd)"
fi
PROJECT_ROOT="$(cd "${PROJECT_ROOT}" 2>/dev/null && pwd)"

if [[ -n "${EXPLICIT_SCOPE}" ]]; then
  SCOPE="${EXPLICIT_SCOPE}"
else
  SCOPE="$(normalize_scope "$(basename "${PROJECT_ROOT}")")"
fi

CONFIG_ARGS=(
  -c 'mcp_servers.aionis-dev.enabled=true'
  -c 'mcp_servers.aionis-dev.command="node"'
  -c "mcp_servers.aionis-dev.args=[\"${ROOT_DIR}/dist/mcp/aionis-dev-mcp.js\"]"
  -c "mcp_servers.aionis-dev.cwd=\"${ROOT_DIR}\""
  -c "mcp_servers.aionis-dev.startup_timeout_sec=20"
  -c "mcp_servers.aionis-dev.tool_timeout_sec=120"
  -c "mcp_servers.aionis-dev.env.AIONIS_BASE_URL=\"${BASE_URL}\""
  -c "mcp_servers.aionis-dev.env.AIONIS_SCOPE=\"${SCOPE}\""
)

if [[ -n "${TENANT_ID}" ]]; then
  CONFIG_ARGS+=(-c "mcp_servers.aionis-dev.env.AIONIS_TENANT_ID=\"${TENANT_ID}\"")
fi

if [[ "${PRINT_ONLY}" == "true" ]]; then
  printf 'project_root=%s\n' "${PROJECT_ROOT}"
  printf 'aionis_base_url=%s\n' "${BASE_URL}"
  printf 'aionis_scope=%s\n' "${SCOPE}"
  if [[ -n "${TENANT_ID}" ]]; then
    printf 'aionis_tenant_id=%s\n' "${TENANT_ID}"
  fi
  if (( ${#ARGS[@]} > 0 )); then
    printf 'command=codex %s\n' "${ARGS[*]}"
  else
    printf 'command=codex\n'
  fi
  exit 0
fi

if (( ${#ARGS[@]} > 0 )); then
  exec codex "${CONFIG_ARGS[@]}" "${ARGS[@]}"
else
  exec codex "${CONFIG_ARGS[@]}"
fi
