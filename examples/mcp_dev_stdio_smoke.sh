#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need jq
need npm

out="$(mktemp -t aionis_dev_mcp_smoke_out.XXXXXX)"
err="$(mktemp -t aionis_dev_mcp_smoke_err.XXXXXX)"
trap 'rm -f "${out}" "${err}"' EXIT

cd "${ROOT_DIR}"
npm run -s mcp:aionis:dev < "${ROOT_DIR}/examples/mcp_dev_smoke.jsonl" > "${out}" 2> "${err}"

jq -s -e 'any(.[]; .id==1 and (.result.serverInfo.name=="aionis-dev-mcp"))' "${out}" >/dev/null
jq -s -e 'any(.[]; .id==2 and ((.result.tools | length) >= 10))' "${out}" >/dev/null
jq -s -e 'any(.[]; .id==3 and (.result.content | type=="array"))' "${out}" >/dev/null
jq -s -e 'any(.[]; .id==4 and (.result==null))' "${out}" >/dev/null

jq -n '{
  ok: true,
  integration: "aionis_dev_mcp_stdio",
  checks: {
    initialize: true,
    tools_list: true,
    local_quality_gate_tool: true,
    shutdown: true
  }
}'
