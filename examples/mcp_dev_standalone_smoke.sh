#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

CONTAINER_NAME="${AIONIS_STANDALONE_CONTAINER:-aionis-standalone}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing command: $1" >&2
    exit 1
  }
}

need docker
need jq
need bash

if ! docker inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
  echo "standalone container not found: ${CONTAINER_NAME}" >&2
  echo "start it first, for example with a named container:" >&2
  echo "  docker run -d --name ${CONTAINER_NAME} -p 3001:3001 -v aionis-standalone-data:/var/lib/postgresql/data aionis-standalone:local" >&2
  exit 1
fi

if [[ "$(docker inspect -f '{{.State.Running}}' "${CONTAINER_NAME}")" != "true" ]]; then
  echo "standalone container is not running: ${CONTAINER_NAME}" >&2
  exit 1
fi

out="$(mktemp -t aionis_dev_mcp_standalone_out.XXXXXX)"
err="$(mktemp -t aionis_dev_mcp_standalone_err.XXXXXX)"
trap 'rm -f "${out}" "${err}"' EXIT

cd "${ROOT_DIR}"
bash "${ROOT_DIR}/scripts/mcp-aionis-dev-standalone.sh" \
  < "${ROOT_DIR}/examples/mcp_dev_smoke.jsonl" \
  > "${out}" \
  2> "${err}"

jq -s -e 'any(.[]; .id==1 and (.result.serverInfo.name=="aionis-dev-mcp"))' "${out}" >/dev/null
jq -s -e 'any(.[]; .id==2 and ((.result.tools | length) >= 10))' "${out}" >/dev/null
jq -s -e 'any(.[]; .id==3 and (.result.content | type=="array"))' "${out}" >/dev/null
jq -s -e 'any(.[]; .id==4 and (.result==null))' "${out}" >/dev/null

jq -n \
  --arg container "${CONTAINER_NAME}" \
  '{
    ok: true,
    integration: "aionis_dev_mcp_standalone_launcher",
    container: $container,
    checks: {
      initialize: true,
      tools_list: true,
      local_quality_gate_tool: true,
      shutdown: true
    }
  }'
