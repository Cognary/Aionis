#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

echo "== run compression rollup =="
npm run -s job:compression-rollup

echo
echo "== consistency checks (compression related) =="
npm run -s job:consistency-check | jq '{
  ok,
  summary,
  compression_citations_invalid: (.checks[] | select(.name=="compression_citations_invalid") | .count),
  compression_citation_node_missing: (.checks[] | select(.name=="compression_citation_node_missing") | .count)
}'

echo
echo "== compression node inventory =="
psql aionis -c "
select
  count(*) as compression_concepts
from memory_nodes
where scope='${MEMORY_SCOPE:-default}'
  and type='concept'
  and slots->>'summary_kind'='compression_rollup';
"

echo
echo "== top active topics by linked events =="
psql aionis -c "
select
  t.id as topic_id,
  t.title,
  count(e.id) as linked_events
from memory_nodes t
left join memory_edges pe
  on pe.scope=t.scope and pe.type='part_of' and pe.dst_id=t.id
left join memory_nodes e
  on e.id=pe.src_id and e.scope=t.scope and e.type='event'
where t.scope='${MEMORY_SCOPE:-default}'
  and t.type='topic'
  and coalesce(t.slots->>'topic_state','active')='active'
group by t.id, t.title
order by linked_events desc, t.id
limit 20;
"
