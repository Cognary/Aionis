#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need curl
need jq

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BASE_URL="${BASE_URL:-http://localhost:${PORT:-3001}}"
TENANT_ID="${TENANT_ID:-${MEMORY_TENANT_ID:-default}}"
SCOPE="${SCOPE:-pack_gate_$(date +%s)}"
PACK_MAX_ROWS="${PACK_MAX_ROWS:-2000}"

API_KEY="${API_KEY:-${PERF_API_KEY:-}}"
AUTH_BEARER="${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

AUTH_ARGS=()
if [[ -n "${API_KEY}" ]]; then
  AUTH_ARGS+=( -H "X-Api-Key: ${API_KEY}" )
fi
if [[ -n "${AUTH_BEARER}" ]]; then
  AUTH_ARGS+=( -H "Authorization: Bearer ${AUTH_BEARER}" )
fi
if [[ -n "${ADMIN_TOKEN}" ]]; then
  AUTH_ARGS+=( -H "X-Admin-Token: ${ADMIN_TOKEN}" )
fi

RUN_ID="$(date +%Y%m%d_%H%M%S)"
CLIENT_ID="pack_gate_evt_${RUN_ID}"
SUMMARY_FILE="$(mktemp -t aionis_pack_roundtrip_gate.XXXXXX)"

emit_fail() {
  local message="$1"
  jq -n \
    --arg base_url "${BASE_URL}" \
    --arg tenant_id "${TENANT_ID}" \
    --arg scope "${SCOPE}" \
    --arg run_id "${RUN_ID}" \
    --arg message "${message}" \
    '{
      ok: false,
      base_url: $base_url,
      tenant_id: $tenant_id,
      scope: $scope,
      run_id: $run_id,
      error: $message
    }' | tee "${SUMMARY_FILE}"
  exit 1
}

post_json() {
  local path="$1"
  local payload="$2"
  local body_file="$3"
  local code
  code="$(
    curl -sS -o "${body_file}" -w "%{http_code}" \
      "${BASE_URL}${path}" \
      -H "content-type: application/json" \
      "${AUTH_ARGS[@]}" \
      --data-binary "${payload}" || true
  )"
  echo "${code}"
}

health_code="$(curl -sS -o /tmp/aionis_pack_health.json -w "%{http_code}" "${BASE_URL}/health" || true)"
if [[ "${health_code}" != "200" ]]; then
  emit_fail "health check failed code=${health_code}"
fi

write_payload="$(
  jq -cn \
    --arg tenant "${TENANT_ID}" \
    --arg scope "${SCOPE}" \
    --arg cid "${CLIENT_ID}" \
    '{
      tenant_id:$tenant,
      scope:$scope,
      input_text:"pack roundtrip gate seed",
      auto_embed:false,
      memory_lane:"shared",
      nodes:[{client_id:$cid,type:"event",text_summary:"pack roundtrip seed"}],
      edges:[]
    }'
)"
write_file="$(mktemp -t aionis_pack_write.XXXXXX)"
write_code="$(post_json "/v1/memory/write" "${write_payload}" "${write_file}")"
if [[ "${write_code}" != "200" ]]; then
  emit_fail "write failed code=${write_code} body=$(cat "${write_file}")"
fi
seed_node_id="$(jq -r '.nodes[0].id // empty' "${write_file}")"
if [[ -z "${seed_node_id}" ]]; then
  emit_fail "write response missing seed node id"
fi

export_payload="$(
  jq -cn \
    --arg tenant "${TENANT_ID}" \
    --arg scope "${SCOPE}" \
    --argjson max_rows "${PACK_MAX_ROWS}" \
    '{tenant_id:$tenant,scope:$scope,max_rows:$max_rows}'
)"
export_file="$(mktemp -t aionis_pack_export.XXXXXX)"
export_code="$(post_json "/v1/memory/packs/export" "${export_payload}" "${export_file}")"
if [[ "${export_code}" != "200" ]]; then
  emit_fail "pack export failed code=${export_code} body=$(cat "${export_file}")"
fi
pack_sha="$(jq -r '.manifest.sha256 // empty' "${export_file}")"
pack_nodes="$(jq -r '.pack.nodes | length' "${export_file}")"
if [[ -z "${pack_sha}" || "${pack_nodes}" -lt 1 ]]; then
  emit_fail "pack export missing sha or nodes"
fi
pack_json="$(jq '.pack' "${export_file}")"

verify_payload="$(
  jq -cn \
    --arg tenant "${TENANT_ID}" \
    --arg scope "${SCOPE}" \
    --arg sha "${pack_sha}" \
    --argjson pack "${pack_json}" \
    '{tenant_id:$tenant,scope:$scope,verify_only:true,manifest_sha256:$sha,pack:$pack}'
)"
verify_file="$(mktemp -t aionis_pack_verify.XXXXXX)"
verify_code="$(post_json "/v1/memory/packs/import" "${verify_payload}" "${verify_file}")"
if [[ "${verify_code}" != "200" ]]; then
  emit_fail "pack verify failed code=${verify_code} body=$(cat "${verify_file}")"
fi
if [[ "$(jq -r '.verified // false' "${verify_file}")" != "true" ]]; then
  emit_fail "pack verify response verified=false"
fi

import_payload="$(
  jq -cn \
    --arg tenant "${TENANT_ID}" \
    --arg scope "${SCOPE}" \
    --arg sha "${pack_sha}" \
    --argjson pack "${pack_json}" \
    '{tenant_id:$tenant,scope:$scope,verify_only:false,manifest_sha256:$sha,pack:$pack}'
)"
import_file="$(mktemp -t aionis_pack_import.XXXXXX)"
import_code="$(post_json "/v1/memory/packs/import" "${import_payload}" "${import_file}")"
if [[ "${import_code}" != "200" ]]; then
  emit_fail "pack import failed code=${import_code} body=$(cat "${import_file}")"
fi
if [[ "$(jq -r '.imported // false' "${import_file}")" != "true" ]]; then
  emit_fail "pack import response imported=false"
fi

# Replay import should still keep deterministic singleton identity by client_id.
import2_file="$(mktemp -t aionis_pack_import2.XXXXXX)"
import2_code="$(post_json "/v1/memory/packs/import" "${import_payload}" "${import2_file}")"
if [[ "${import2_code}" != "200" ]]; then
  emit_fail "pack re-import failed code=${import2_code} body=$(cat "${import2_file}")"
fi

find_payload="$(
  jq -cn \
    --arg tenant "${TENANT_ID}" \
    --arg scope "${SCOPE}" \
    --arg cid "${CLIENT_ID}" \
    '{tenant_id:$tenant,scope:$scope,client_id:$cid,limit:10,offset:0}'
)"
find_file="$(mktemp -t aionis_pack_find.XXXXXX)"
find_code="$(post_json "/v1/memory/find" "${find_payload}" "${find_file}")"
if [[ "${find_code}" != "200" ]]; then
  emit_fail "find failed code=${find_code} body=$(cat "${find_file}")"
fi
found_count="$(jq -r '.nodes | length' "${find_file}")"
found_id="$(jq -r '.nodes[0].id // empty' "${find_file}")"
if [[ "${found_count}" != "1" ]]; then
  emit_fail "find returned unexpected count=${found_count}"
fi
if [[ -z "${found_id}" || "${found_id}" != "${seed_node_id}" ]]; then
  emit_fail "find id mismatch found=${found_id} seed=${seed_node_id}"
fi

jq -n \
  --arg base_url "${BASE_URL}" \
  --arg tenant_id "${TENANT_ID}" \
  --arg scope "${SCOPE}" \
  --arg run_id "${RUN_ID}" \
  --arg seed_node_id "${seed_node_id}" \
  --arg found_id "${found_id}" \
  --arg pack_sha256 "${pack_sha}" \
  --argjson pack_nodes "${pack_nodes}" \
  --argjson pack_edges "$(jq -r '.pack.edges | length' "${export_file}")" \
  --argjson pack_commits "$(jq -r '.pack.commits | length' "${export_file}")" \
  --arg import_commit_id "$(jq -r '.commit_id // empty' "${import_file}")" \
  --arg import_commit_hash "$(jq -r '.commit_hash // empty' "${import_file}")" \
  '{
    ok: true,
    base_url: $base_url,
    tenant_id: $tenant_id,
    scope: $scope,
    run_id: $run_id,
    pack_sha256: $pack_sha256,
    counts: {
      nodes: $pack_nodes,
      edges: $pack_edges,
      commits: $pack_commits
    },
    identity_check: {
      seed_node_id: $seed_node_id,
      found_node_id: $found_id,
      singleton_by_client_id: true
    },
    import_result: {
      commit_id: (if ($import_commit_id|length)>0 then $import_commit_id else null end),
      commit_hash: (if ($import_commit_hash|length)>0 then $import_commit_hash else null end)
    }
  }' | tee "${SUMMARY_FILE}"
