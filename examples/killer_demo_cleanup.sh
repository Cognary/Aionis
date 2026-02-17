#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required." >&2
  exit 1
fi

SCOPE="${MEMORY_SCOPE:-default}"
DB_URL="${DATABASE_URL:-}"
DEMO_ID=""
ALL=false
APPLY=false
SAMPLE=20

usage() {
  cat <<USAGE
Usage:
  ./examples/killer_demo_cleanup.sh --demo-id <killer_demo_xxx> [--scope <scope>] [--sample <n>] [--apply]
  ./examples/killer_demo_cleanup.sh --all [--scope <scope>] [--sample <n>] [--apply]

Default mode is dry-run (no deletion). Use --apply to execute deletion.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --demo-id)
      DEMO_ID="${2:-}"
      shift 2
      ;;
    --all)
      ALL=true
      shift
      ;;
    --scope)
      SCOPE="${2:-}"
      shift 2
      ;;
    --sample)
      SAMPLE="${2:-20}"
      shift 2
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$DB_URL" ]]; then
  echo "DATABASE_URL is empty." >&2
  exit 1
fi

if [[ "$ALL" != "true" && -z "$DEMO_ID" ]]; then
  echo "Provide either --demo-id or --all." >&2
  exit 1
fi

if [[ "$ALL" == "true" && -n "$DEMO_ID" ]]; then
  echo "Use either --demo-id or --all, not both." >&2
  exit 1
fi

if ! [[ "$SAMPLE" =~ ^[0-9]+$ ]]; then
  echo "--sample must be an integer." >&2
  exit 1
fi

if [[ "$ALL" == "true" ]]; then
  NODE_WHERE="
    (client_id LIKE 'evt_killer_demo_%'
      OR client_id LIKE 'ent_killer_demo_%'
      OR client_id LIKE 'topic_killer_demo_%'
      OR client_id LIKE 'rule_killer_demo_%')
  "
else
  NODE_WHERE="
    (client_id = 'evt_' || :'demo_id' || '_1'
      OR client_id = 'evt_' || :'demo_id' || '_2'
      OR client_id = 'ent_' || :'demo_id'
      OR client_id = 'topic_' || :'demo_id'
      OR client_id = 'rule_' || :'demo_id')
  "
fi

summary_sql="
WITH target AS (
  SELECT id, type::text AS type, client_id
  FROM memory_nodes
  WHERE scope = :'scope'
    AND ${NODE_WHERE}
)
SELECT
  (SELECT count(*) FROM target) AS target_nodes,
  (SELECT count(*) FROM memory_edges e
    WHERE e.scope = :'scope'
      AND (e.src_id IN (SELECT id FROM target) OR e.dst_id IN (SELECT id FROM target))) AS cascaded_edges,
  (SELECT count(*) FROM memory_rule_defs d
    WHERE d.scope = :'scope'
      AND d.rule_node_id IN (SELECT id FROM target)) AS cascaded_rule_defs,
  (SELECT count(*) FROM memory_rule_feedback f
    WHERE f.scope = :'scope'
      AND f.rule_node_id IN (SELECT id FROM target)) AS cascaded_rule_feedback;
"

sample_sql="
WITH target AS (
  SELECT id, type::text AS type, client_id
  FROM memory_nodes
  WHERE scope = :'scope'
    AND ${NODE_WHERE}
)
SELECT id, type, client_id
FROM target
ORDER BY client_id NULLS LAST
LIMIT ${SAMPLE};
"

run_psql() {
  psql "$DB_URL" \
    -v ON_ERROR_STOP=1 \
    -v scope="$SCOPE" \
    -v demo_id="$DEMO_ID" \
    -P pager=off \
    -f -
}

MODE="dry-run"
if [[ "$APPLY" == "true" ]]; then
  MODE="apply"
fi

echo "== killer demo cleanup (${MODE}) =="
echo "scope=${SCOPE}"
if [[ "$ALL" == "true" ]]; then
  echo "selector=all killer_demo rows"
else
  echo "selector=demo_id:${DEMO_ID}"
fi

echo
echo "-- impact summary --"
printf "%s\n" "$summary_sql" | run_psql

echo
echo "-- sample target nodes --"
printf "%s\n" "$sample_sql" | run_psql

if [[ "$APPLY" != "true" ]]; then
  echo
  echo "dry-run complete (no data deleted)."
  echo "Re-run with --apply to execute."
  exit 0
fi

delete_sql="
WITH target AS (
  SELECT id
  FROM memory_nodes
  WHERE scope = :'scope'
    AND ${NODE_WHERE}
),
deleted AS (
  DELETE FROM memory_nodes
  WHERE id IN (SELECT id FROM target)
  RETURNING id
)
SELECT count(*) AS deleted_nodes FROM deleted;
"

echo
echo "-- applying delete --"
printf "%s\n" "$delete_sql" | run_psql

echo
echo "cleanup applied."
