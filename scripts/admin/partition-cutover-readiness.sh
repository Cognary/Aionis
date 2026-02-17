#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need npm
need psql
need jq

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

SCOPE="${SCOPE:-${MEMORY_SCOPE:-default}}"
TENANT_ID="${TENANT_ID:-${MEMORY_TENANT_ID:-default}}"
SAMPLE_LIMIT="${SAMPLE_LIMIT:-20}"
FAIL_ON_FAIL="${FAIL_ON_FAIL:-false}"
READ_SHADOW_CHECK="${READ_SHADOW_CHECK:-false}"
READ_SHADOW_LIMIT="${READ_SHADOW_LIMIT:-20}"
READ_SHADOW_MIN_OVERLAP="${READ_SHADOW_MIN_OVERLAP:-0.95}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/partition_cutover/${RUN_ID}}"
mkdir -p "${OUT_DIR}"

VERIFY_JSON="${OUT_DIR}/partition_verify.json"
SUMMARY_JSON="${OUT_DIR}/summary.json"

echo "[partition-cutover] out dir: ${OUT_DIR}"
echo "[partition-cutover] tenant_id=${TENANT_ID} scope=${SCOPE}"

db_reachable=true
if ! psql "${DATABASE_URL}" -qAtX -c "select 1;" >/dev/null 2>&1; then
  db_reachable=false
  echo "[partition-cutover] database is not reachable via DATABASE_URL" >&2
fi

migration_0016_applied=false
if [[ "${db_reachable}" == "true" ]] && psql "${DATABASE_URL}" -tAc "select 1 from schema_migrations where filename='0016_partition_shadow_scaffold.sql' limit 1;" | rg -q '^1$'; then
  migration_0016_applied=true
fi

migration_0017_applied=false
if [[ "${db_reachable}" == "true" ]] && psql "${DATABASE_URL}" -tAc "select 1 from schema_migrations where filename='0017_partition_cutover_prepare.sql' limit 1;" | rg -q '^1$'; then
  migration_0017_applied=true
fi

v2_tables_exist=true
if [[ "${db_reachable}" == "true" ]]; then
  for t in memory_commits_v2 memory_nodes_v2 memory_edges_v2 memory_outbox_v2; do
    if ! psql "${DATABASE_URL}" -tAc "select to_regclass('public.${t}') is not null;" | rg -q '^t$'; then
      v2_tables_exist=false
      break
    fi
  done
else
  v2_tables_exist=false
fi

dual_write_enabled=false
if [[ "${MEMORY_SHADOW_DUAL_WRITE_ENABLED:-false}" == "true" ]]; then
  dual_write_enabled=true
fi

verify_rc=99
if [[ "${db_reachable}" == "true" ]]; then
  set +e
  npm run -s job:partition-verify -- \
    --scope "${SCOPE}" \
    --tenant-id "${TENANT_ID}" \
    --sample-limit "${SAMPLE_LIMIT}" \
    --strict > "${VERIFY_JSON}" 2> "${OUT_DIR}/partition_verify.err"
  verify_rc=$?
  set -e
fi

partition_verify_ok=false
if [[ "${verify_rc}" -eq 0 ]]; then
  partition_verify_ok=true
fi

read_shadow_checked=false
read_shadow_ok=true
read_shadow_rc=0
read_shadow_json="${OUT_DIR}/partition_read_shadow.json"
if [[ "${READ_SHADOW_CHECK}" == "true" ]]; then
  read_shadow_checked=true
  set +e
  npm run -s job:partition-read-shadow-check -- \
    --scope "${SCOPE}" \
    --tenant-id "${TENANT_ID}" \
    --limit "${READ_SHADOW_LIMIT}" \
    --min-overlap "${READ_SHADOW_MIN_OVERLAP}" \
    --strict > "${read_shadow_json}" 2> "${OUT_DIR}/partition_read_shadow.err"
  read_shadow_rc=$?
  set -e
  if [[ "${read_shadow_rc}" -ne 0 ]]; then
    read_shadow_ok=false
  fi
fi

cutover_gap_supported=false
cutover_gap_ok=false
cutover_gap_rows_json='[]'
scope_sql="${SCOPE//\'/\'\'}"
if [[ "${db_reachable}" == "true" ]] && psql "${DATABASE_URL}" -tAc "select to_regprocedure('aionis_partition_cutover_gap(text)') is not null;" | rg -q '^t$'; then
  cutover_gap_supported=true
  cutover_gap_rows_json="$(
    psql "${DATABASE_URL}" -tAc \
      "select coalesce(json_agg(t), '[]'::json)::text from (select table_name, legacy_count, v2_count, delta from aionis_partition_cutover_gap('${scope_sql}') order by table_name) t;" \
      2>/dev/null || echo '[]'
  )"
  if psql "${DATABASE_URL}" -tAc "select case when exists (select 1 from aionis_partition_cutover_gap('${scope_sql}') where delta <> 0) then 'f' else 't' end" | rg -q '^t$'; then
    cutover_gap_ok=true
  fi
fi

verify_summary_json='{}'
if [[ -f "${VERIFY_JSON}" ]]; then
  verify_summary_json="$(jq -c '.summary // {}' "${VERIFY_JSON}" 2>/dev/null || echo '{}')"
fi

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg scope "${SCOPE}" \
  --arg tenant_id "${TENANT_ID}" \
  --argjson db_reachable "${db_reachable}" \
  --argjson migration_0016_applied "${migration_0016_applied}" \
  --argjson migration_0017_applied "${migration_0017_applied}" \
  --argjson v2_tables_exist "${v2_tables_exist}" \
  --argjson dual_write_enabled "${dual_write_enabled}" \
  --argjson partition_verify_ok "${partition_verify_ok}" \
  --argjson read_shadow_checked "${read_shadow_checked}" \
  --argjson read_shadow_ok "${read_shadow_ok}" \
  --argjson read_shadow_rc "${read_shadow_rc}" \
  --arg read_shadow_json "${read_shadow_json}" \
  --argjson cutover_gap_supported "${cutover_gap_supported}" \
  --argjson cutover_gap_ok "${cutover_gap_ok}" \
  --argjson cutover_gap_rows "${cutover_gap_rows_json}" \
  --argjson verify_rc "${verify_rc}" \
  --arg verify_json "${VERIFY_JSON}" \
  --argjson verify_summary "${verify_summary_json}" \
  '{
    ok: (
      $db_reachable
      and $migration_0016_applied
      and $migration_0017_applied
      and $v2_tables_exist
      and $dual_write_enabled
      and $partition_verify_ok
      and (($read_shadow_checked | not) or $read_shadow_ok)
      and (($cutover_gap_supported | not) or $cutover_gap_ok)
    ),
    run_id: $run_id,
    out_dir: $out_dir,
    scope: $scope,
    tenant_id: $tenant_id,
    checks: {
      db_reachable: $db_reachable,
      migration_0016_applied: $migration_0016_applied,
      migration_0017_applied: $migration_0017_applied,
      v2_tables_exist: $v2_tables_exist,
      dual_write_enabled: $dual_write_enabled,
      partition_verify_ok: $partition_verify_ok,
      read_shadow_checked: $read_shadow_checked,
      read_shadow_ok: $read_shadow_ok,
      cutover_gap_supported: $cutover_gap_supported,
      cutover_gap_ok: $cutover_gap_ok
    },
    read_shadow: {
      rc: $read_shadow_rc,
      file: (if $read_shadow_checked then $read_shadow_json else null end)
    },
    cutover_gap: {
      rows: $cutover_gap_rows
    },
    verify: {
      rc: $verify_rc,
      file: $verify_json,
      summary: $verify_summary
    }
  }' | tee "${SUMMARY_JSON}"

if [[ "${FAIL_ON_FAIL}" == "true" ]]; then
  ok="$(jq -r '.ok' "${SUMMARY_JSON}")"
  if [[ "${ok}" != "true" ]]; then
    exit 1
  fi
fi
