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
CONTAINER_NAME="${AIONIS_STANDALONE_CONTAINER:-aionis-standalone}"
BASE_URL="${AIONIS_BASE_URL:-http://127.0.0.1:3001}"
SCOPE="${AIONIS_SCOPE:-default}"
WRITE_PATH=""
INSTALL_LAUNCHER="false"
INSTALL_OUTPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --container)
      CONTAINER_NAME="$2"
      shift 2
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --scope)
      SCOPE="$2"
      shift 2
      ;;
    --write)
      WRITE_PATH="$2"
      shift 2
      ;;
    --install-launcher)
      INSTALL_LAUNCHER="$2"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing command: $1" >&2
    exit 1
  }
}

need bash
need python3

CONTAINER_STATE="not_checked"
HEALTH_STATUS="unknown"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
    if [[ "$(docker inspect -f '{{.State.Running}}' "${CONTAINER_NAME}")" == "true" ]]; then
      CONTAINER_STATE="running"
    else
      CONTAINER_STATE="stopped"
    fi
  else
    CONTAINER_STATE="missing"
  fi
fi

if command -v curl >/dev/null 2>&1 && curl -fsS "${BASE_URL%/}/health" >/dev/null 2>&1; then
  HEALTH_STATUS="ok"
else
  HEALTH_STATUS="unreachable"
fi

if [[ "${INSTALL_LAUNCHER}" == "true" ]]; then
  AIONIS_STANDALONE_CONTAINER="${CONTAINER_NAME}" \
  AIONIS_BASE_URL="${BASE_URL}" \
  AIONIS_SCOPE="${SCOPE}" \
    INSTALL_OUTPUT="$(bash "${ROOT_DIR}/scripts/aionis-codex-install-launcher.sh" --force true)"
fi

JSON_PAYLOAD="$(
ROOT_DIR_ENV="${ROOT_DIR}" \
CONTAINER_NAME_ENV="${CONTAINER_NAME}" \
BASE_URL_ENV="${BASE_URL}" \
SCOPE_ENV="${SCOPE}" \
CONTAINER_STATE_ENV="${CONTAINER_STATE}" \
HEALTH_STATUS_ENV="${HEALTH_STATUS}" \
AIONIS_TENANT_ID_ENV="${AIONIS_TENANT_ID:-}" \
AIONIS_ADMIN_TOKEN_ENV="${AIONIS_ADMIN_TOKEN:-}" \
AIONIS_API_KEY_ENV="${AIONIS_API_KEY:-}" \
AIONIS_AUTH_BEARER_ENV="${AIONIS_AUTH_BEARER:-}" \
INSTALL_OUTPUT_ENV="${INSTALL_OUTPUT}" \
python3 - <<'PY'
import json
import os
root = os.environ["ROOT_DIR_ENV"]
container_name = os.environ["CONTAINER_NAME_ENV"]
base_url = os.environ["BASE_URL_ENV"]
scope = os.environ["SCOPE_ENV"]
container_state = os.environ["CONTAINER_STATE_ENV"]
health_status = os.environ["HEALTH_STATUS_ENV"]
environment = {
  "AIONIS_STANDALONE_CONTAINER": container_name,
  "AIONIS_BASE_URL": base_url,
  "AIONIS_SCOPE": scope,
}
if os.environ["AIONIS_TENANT_ID_ENV"]:
  environment["AIONIS_TENANT_ID"] = os.environ["AIONIS_TENANT_ID_ENV"]
if os.environ["AIONIS_ADMIN_TOKEN_ENV"]:
  environment["AIONIS_ADMIN_TOKEN"] = os.environ["AIONIS_ADMIN_TOKEN_ENV"]
if os.environ["AIONIS_API_KEY_ENV"]:
  environment["AIONIS_API_KEY"] = os.environ["AIONIS_API_KEY_ENV"]
if os.environ["AIONIS_AUTH_BEARER_ENV"]:
  environment["AIONIS_AUTH_BEARER"] = os.environ["AIONIS_AUTH_BEARER_ENV"]
payload = {
  "ok": True,
  "profile": "aionis_codex_local",
  "summary": {
    "root": root,
    "container": container_name,
    "base_url": base_url,
    "scope": scope,
    "container_state": container_state,
    "health": health_status,
  },
  "codex_mcp_config": {
    "mcp": {
      "aionis-dev": {
        "type": "local",
        "command": ["bash", f"{root}/scripts/mcp-aionis-dev-standalone.sh"],
        "enabled": True,
        "environment": environment,
      }
    }
  },
  "recommended_launch": [
    "bash",
    f"{root}/scripts/aionis-codex-local.sh",
    "--root",
    root,
    "--title",
    "Your task title",
    "--goal",
    "Your concrete goal",
    "--query",
    "Your natural language task description",
    "--",
    "codex",
  ],
  "recommended_steps": [
    f"npm run -s aionis:doctor:codex -- --container {container_name} --base-url {base_url} --scope {scope}",
    f"npm run -s aionis:codex -- --root {root} --title 'Your task title' --goal 'Your concrete goal' --query 'Your natural language task description' -- codex",
  ],
}
if os.environ["INSTALL_OUTPUT_ENV"]:
  payload["launcher_install"] = json.loads(os.environ["INSTALL_OUTPUT_ENV"])
print(json.dumps(payload, indent=2))
PY
)"

if [[ -n "${WRITE_PATH}" ]]; then
  mkdir -p "$(dirname "${WRITE_PATH}")"
  printf '%s\n' "${JSON_PAYLOAD}" > "${WRITE_PATH}"
fi

printf '%s\n' "${JSON_PAYLOAD}"
