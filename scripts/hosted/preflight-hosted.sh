#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v jq >/dev/null 2>&1; then
  echo "missing command: jq" >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "missing command: curl" >&2
  exit 1
fi

if [[ -f .env ]]; then
  # Load .env defaults without clobbering values explicitly provided via
  # process env (CI secrets, one-off CLI overrides).
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ -z "${line}" || "${line}" == \#* ]]; then
      continue
    fi
    if [[ "${line}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      key="${line%%=*}"
      if [[ -z "${!key+x}" ]]; then
        export "${line}"
      fi
    fi
  done < .env
fi

BASE_URL="${BASE_URL:-http://localhost:${PORT:-3001}}"
SCOPE="${SCOPE:-${MEMORY_SCOPE:-default}}"
TENANT_ID="${TENANT_ID:-${MEMORY_TENANT_ID:-default}}"
RUN_API_CHECK=true
RUN_GATES=false
STRICT_WARNINGS=true
RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/hosted_preflight/${RUN_ID}}"

usage() {
  cat <<'USAGE'
Usage: scripts/hosted/preflight-hosted.sh [options]

Options:
  --base-url <url>         API base URL (default: http://localhost:$PORT)
  --scope <scope>          Scope used for optional gate checks
  --tenant-id <id>         Tenant id used for optional gate checks
  --skip-api-check         Skip /health probe
  --run-gates              Run health-gate + cross-tenant consistency checks
  --no-strict-warnings     Run gate checks without --strict-warnings
  --out-dir <dir>          Output directory for logs and summary
  -h, --help               Show help

Exit codes:
  0  pass
  2  failed checks
  1  usage/runtime error
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --scope)
      SCOPE="${2:-}"
      shift 2
      ;;
    --tenant-id)
      TENANT_ID="${2:-}"
      shift 2
      ;;
    --skip-api-check)
      RUN_API_CHECK=false
      shift
      ;;
    --run-gates)
      RUN_GATES=true
      shift
      ;;
    --no-strict-warnings)
      STRICT_WARNINGS=false
      shift
      ;;
    --out-dir)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

mkdir -p "${OUT_DIR}"

checks_json='[]'
fail_reasons='[]'

add_check() {
  local name="$1"
  local pass="$2"
  local severity="$3"
  local detail="$4"
  checks_json="$(echo "${checks_json}" | jq \
    --arg name "${name}" \
    --argjson pass "$([[ "${pass}" == "true" ]] && echo true || echo false)" \
    --arg severity "${severity}" \
    --arg detail "${detail}" \
    '. + [{name:$name, pass:$pass, severity:$severity, detail:$detail}]')"
  if [[ "${pass}" != "true" && "${severity}" == "error" ]]; then
    fail_reasons="$(echo "${fail_reasons}" | jq --arg name "${name}" '. + [$name]')"
  fi
}

to_bool_lower() {
  echo "${1:-}" | tr '[:upper:]' '[:lower:]'
}

auth_mode="$(to_bool_lower "${MEMORY_AUTH_MODE:-off}")"
if [[ "${auth_mode}" == "api_key" || "${auth_mode}" == "jwt" ]]; then
  add_check "auth_mode_enabled" true "error" "MEMORY_AUTH_MODE=${auth_mode}"
else
  add_check "auth_mode_enabled" false "error" "MEMORY_AUTH_MODE should be api_key or jwt (actual=${auth_mode})"
fi

tenant_quota="$(to_bool_lower "${TENANT_QUOTA_ENABLED:-false}")"
if [[ "${tenant_quota}" == "true" ]]; then
  add_check "tenant_quota_enabled" true "error" "TENANT_QUOTA_ENABLED=true"
else
  add_check "tenant_quota_enabled" false "error" "TENANT_QUOTA_ENABLED should be true for hosted"
fi

rate_limit="$(to_bool_lower "${RATE_LIMIT_ENABLED:-false}")"
if [[ "${rate_limit}" == "true" ]]; then
  add_check "rate_limit_enabled" true "error" "RATE_LIMIT_ENABLED=true"
else
  add_check "rate_limit_enabled" false "error" "RATE_LIMIT_ENABLED should be true for hosted"
fi

loopback_bypass="$(to_bool_lower "${RATE_LIMIT_BYPASS_LOOPBACK:-false}")"
if [[ "${loopback_bypass}" == "false" ]]; then
  add_check "loopback_bypass_disabled" true "error" "RATE_LIMIT_BYPASS_LOOPBACK=false"
else
  add_check "loopback_bypass_disabled" false "error" "RATE_LIMIT_BYPASS_LOOPBACK should be false in hosted"
fi

embed_provider="$(to_bool_lower "${EMBEDDING_PROVIDER:-}")"
if [[ -z "${embed_provider}" ]]; then
  add_check "embedding_provider_configured" false "error" "EMBEDDING_PROVIDER is empty"
elif [[ "${embed_provider}" == "fake" ]]; then
  add_check "embedding_provider_configured" false "error" "EMBEDDING_PROVIDER=fake is not production-safe"
else
  add_check "embedding_provider_configured" true "error" "EMBEDDING_PROVIDER=${embed_provider}"
fi

app_env="$(to_bool_lower "${APP_ENV:-dev}")"
if [[ "${app_env}" == "prod" ]]; then
  add_check "app_env_prod" true "warning" "APP_ENV=prod"
else
  add_check "app_env_prod" false "warning" "APP_ENV is ${app_env} (recommended: prod)"
fi

health_code="skipped"
if [[ "${RUN_API_CHECK}" == "true" ]]; then
  health_code="$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}/health" || true)"
  health_code="${health_code: -3}"
  if [[ "${health_code}" == "200" ]]; then
    add_check "api_health" true "error" "GET ${BASE_URL}/health => 200"
  else
    add_check "api_health" false "error" "GET ${BASE_URL}/health => ${health_code}"
  fi
fi

gate_health_rc=0
gate_cross_tenant_rc=0
if [[ "${RUN_GATES}" == "true" ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    add_check "npm_available_for_gates" false "error" "npm is required when --run-gates is set"
  else
    health_gate_log="${OUT_DIR}/health_gate_scope.json"
    cross_tenant_log="${OUT_DIR}/consistency_cross_tenant.json"

    health_gate_cmd=(npm run -s job:health-gate -- --scope "${SCOPE}" --consistency-check-set scope)
    cross_tenant_cmd=(npm run -s job:consistency-check:cross-tenant --)
    if [[ "${STRICT_WARNINGS}" == "true" ]]; then
      health_gate_cmd+=(--strict-warnings)
      cross_tenant_cmd+=(--strict-warnings)
    fi

    set +e
    "${health_gate_cmd[@]}" > "${health_gate_log}" 2>&1
    gate_health_rc=$?
    "${cross_tenant_cmd[@]}" > "${cross_tenant_log}" 2>&1
    gate_cross_tenant_rc=$?
    set -e

    if [[ "${gate_health_rc}" -eq 0 ]]; then
      add_check "health_gate_scope" true "error" "scope=${SCOPE}"
    else
      add_check "health_gate_scope" false "error" "see ${health_gate_log}"
    fi
    if [[ "${gate_cross_tenant_rc}" -eq 0 ]]; then
      add_check "consistency_cross_tenant" true "error" "tenant_id=${TENANT_ID}"
    else
      add_check "consistency_cross_tenant" false "error" "see ${cross_tenant_log}"
    fi
  fi
fi

ok=true
if [[ "$(echo "${fail_reasons}" | jq 'length')" != "0" ]]; then
  ok=false
fi

summary_json="${OUT_DIR}/summary.json"
jq -n \
  --argjson ok "$([[ "${ok}" == "true" ]] && echo true || echo false)" \
  --arg run_id "${RUN_ID}" \
  --arg base_url "${BASE_URL}" \
  --arg scope "${SCOPE}" \
  --arg tenant_id "${TENANT_ID}" \
  --arg app_env "${app_env}" \
  --arg auth_mode "${auth_mode}" \
  --arg embedding_provider "${embed_provider}" \
  --arg health_code "${health_code}" \
  --argjson run_api_check "$([[ "${RUN_API_CHECK}" == "true" ]] && echo true || echo false)" \
  --argjson run_gates "$([[ "${RUN_GATES}" == "true" ]] && echo true || echo false)" \
  --argjson strict_warnings "$([[ "${STRICT_WARNINGS}" == "true" ]] && echo true || echo false)" \
  --argjson checks "${checks_json}" \
  --argjson fail_reasons "${fail_reasons}" \
  --arg out_dir "${OUT_DIR}" \
  '{
    ok: $ok,
    run_id: $run_id,
    target: {
      base_url: $base_url,
      scope: $scope,
      tenant_id: $tenant_id
    },
    mode: {
      run_api_check: $run_api_check,
      run_gates: $run_gates,
      strict_warnings: $strict_warnings
    },
    runtime: {
      app_env: $app_env,
      auth_mode: $auth_mode,
      embedding_provider: $embedding_provider,
      health_code: ($health_code | tonumber? // $health_code)
    },
    checks: $checks,
    fail_reasons: $fail_reasons,
    artifacts: {
      out_dir: $out_dir,
      summary_json: ($out_dir + "/summary.json")
    }
  }' > "${summary_json}"

cat "${summary_json}"

if [[ "${ok}" != "true" ]]; then
  exit 2
fi
