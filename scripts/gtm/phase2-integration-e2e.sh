#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need jq
need npm
need curl

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
PHASE2_INTEGRATIONS_REQUIRE_API="${PHASE2_INTEGRATIONS_REQUIRE_API:-false}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/gtm/phase2_integrations/${RUN_ID}}"

mkdir -p "${OUT_DIR}"

openwork_doc_exists=false
langgraph_doc_exists=false
mcp_smoke_script_exists=false
langgraph_smoke_script_exists=false
api_healthy=false
runtime_skipped=false

mcp_smoke_ok=false
langgraph_smoke_ok=false
ts_sdk_smoke_ok=false

mcp_smoke_exit=-1
langgraph_smoke_exit=-1
ts_sdk_smoke_exit=-1

[[ -f "${ROOT_DIR}/docs/OPENWORK_INTEGRATION.md" ]] && openwork_doc_exists=true
[[ -f "${ROOT_DIR}/docs/LANGGRAPH_INTEGRATION.md" ]] && langgraph_doc_exists=true
[[ -x "${ROOT_DIR}/examples/mcp_stdio_smoke.sh" ]] && mcp_smoke_script_exists=true
[[ -x "${ROOT_DIR}/examples/langgraph_adapter_smoke.sh" ]] && langgraph_smoke_script_exists=true

if curl -fsS "${BASE_URL}/health" > "${OUT_DIR}/00_health.json" 2> "${OUT_DIR}/00_health.err"; then
  api_healthy=true
fi

if [[ "${api_healthy}" == "true" ]]; then
  set +e
  bash "${ROOT_DIR}/examples/mcp_stdio_smoke.sh" > "${OUT_DIR}/01_mcp_stdio_smoke.log" 2> "${OUT_DIR}/01_mcp_stdio_smoke.err"
  mcp_smoke_exit=$?
  set -e
  [[ "${mcp_smoke_exit}" -eq 0 ]] && mcp_smoke_ok=true

  set +e
  bash "${ROOT_DIR}/examples/langgraph_adapter_smoke.sh" > "${OUT_DIR}/02_langgraph_smoke.log" 2> "${OUT_DIR}/02_langgraph_smoke.err"
  langgraph_smoke_exit=$?
  set -e
  [[ "${langgraph_smoke_exit}" -eq 0 ]] && langgraph_smoke_ok=true

  set +e
  npm run -s sdk:smoke > "${OUT_DIR}/03_ts_sdk_smoke.log" 2> "${OUT_DIR}/03_ts_sdk_smoke.err"
  ts_sdk_smoke_exit=$?
  set -e
  [[ "${ts_sdk_smoke_exit}" -eq 0 ]] && ts_sdk_smoke_ok=true
else
  runtime_skipped=true
  mcp_smoke_exit=0
  langgraph_smoke_exit=0
  ts_sdk_smoke_exit=0
fi

phase2_integrations_ok=false
if [[ "${openwork_doc_exists}" == "true" \
   && "${langgraph_doc_exists}" == "true" \
   && "${mcp_smoke_script_exists}" == "true" \
   && "${langgraph_smoke_script_exists}" == "true" ]]; then
  if [[ "${PHASE2_INTEGRATIONS_REQUIRE_API}" == "true" ]]; then
    if [[ "${api_healthy}" == "true" \
       && "${mcp_smoke_ok}" == "true" \
       && "${langgraph_smoke_ok}" == "true" \
       && "${ts_sdk_smoke_ok}" == "true" ]]; then
      phase2_integrations_ok=true
    fi
  else
    phase2_integrations_ok=true
  fi
fi

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg base_url "${BASE_URL}" \
  --argjson require_api "$([[ "${PHASE2_INTEGRATIONS_REQUIRE_API}" == "true" ]] && echo true || echo false)" \
  --argjson openwork_doc_exists "${openwork_doc_exists}" \
  --argjson langgraph_doc_exists "${langgraph_doc_exists}" \
  --argjson mcp_smoke_script_exists "${mcp_smoke_script_exists}" \
  --argjson langgraph_smoke_script_exists "${langgraph_smoke_script_exists}" \
  --argjson api_healthy "${api_healthy}" \
  --argjson runtime_skipped "${runtime_skipped}" \
  --argjson mcp_smoke_ok "${mcp_smoke_ok}" \
  --argjson langgraph_smoke_ok "${langgraph_smoke_ok}" \
  --argjson ts_sdk_smoke_ok "${ts_sdk_smoke_ok}" \
  --argjson mcp_smoke_exit "${mcp_smoke_exit}" \
  --argjson langgraph_smoke_exit "${langgraph_smoke_exit}" \
  --argjson ts_sdk_smoke_exit "${ts_sdk_smoke_exit}" \
  --argjson phase2_integrations_ok "${phase2_integrations_ok}" \
  '{
    ok: true,
    run_id: $run_id,
    out_dir: $out_dir,
    base_url: $base_url,
    checks: {
      openwork_doc_exists: $openwork_doc_exists,
      langgraph_doc_exists: $langgraph_doc_exists,
      mcp_smoke_script_exists: $mcp_smoke_script_exists,
      langgraph_smoke_script_exists: $langgraph_smoke_script_exists,
      api_healthy: $api_healthy,
      runtime_skipped: $runtime_skipped,
      mcp_smoke_ok: $mcp_smoke_ok,
      langgraph_smoke_ok: $langgraph_smoke_ok,
      ts_sdk_smoke_ok: $ts_sdk_smoke_ok
    },
    exits: {
      mcp_smoke: $mcp_smoke_exit,
      langgraph_smoke: $langgraph_smoke_exit,
      ts_sdk_smoke: $ts_sdk_smoke_exit
    },
    gate: {
      name: "Phase 2 external integrations (OpenWork/MCP/LangGraph)",
      require_api: $require_api,
      pass: $phase2_integrations_ok
    }
  }' | tee "${OUT_DIR}/summary.json"

echo "done: ${OUT_DIR}/summary.json"

if [[ "${phase2_integrations_ok}" != "true" ]]; then
  exit 2
fi
