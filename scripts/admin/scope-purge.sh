#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

SCOPE="${SCOPE:-${MEMORY_SCOPE:-default}}"
TENANT_ID="${TENANT_ID:-${MEMORY_TENANT_ID:-default}}"
MODE="${MODE:-auto}" # auto|partition|delete
BATCH_SIZE="${BATCH_SIZE:-5000}"
APPLY="${APPLY:-false}"
ALLOW_FALLBACK_DELETE="${ALLOW_FALLBACK_DELETE:-false}"
FAIL_ON_DELETE="${FAIL_ON_DELETE:-false}"
V2_ONLY="${V2_ONLY:-false}"
LEGACY_ONLY="${LEGACY_ONLY:-false}"

args=(
  --scope "${SCOPE}"
  --tenant-id "${TENANT_ID}"
  --mode "${MODE}"
  --batch-size "${BATCH_SIZE}"
)

if [[ "${APPLY}" == "true" ]]; then
  args+=(--apply)
fi
if [[ "${ALLOW_FALLBACK_DELETE}" == "true" ]]; then
  args+=(--allow-fallback-delete)
fi
if [[ "${FAIL_ON_DELETE}" == "true" ]]; then
  args+=(--fail-on-delete)
fi
if [[ "${V2_ONLY}" == "true" ]]; then
  args+=(--v2-only)
fi
if [[ "${LEGACY_ONLY}" == "true" ]]; then
  args+=(--legacy-only)
fi

echo "[scope-purge] scope=${SCOPE} tenant_id=${TENANT_ID} mode=${MODE} apply=${APPLY} fail_on_delete=${FAIL_ON_DELETE} v2_only=${V2_ONLY} legacy_only=${LEGACY_ONLY}"
npm run -s job:scope-purge -- "${args[@]}"
