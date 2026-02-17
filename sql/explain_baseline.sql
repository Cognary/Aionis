-- Performance Baseline: Recall Queries
--
-- Usage:
--   psql "$DATABASE_URL" -v scope='default' -v lim='30' -v hops='2' -f sql/explain_baseline.sql
--
-- This file avoids requiring you to paste a 1536-dim vector by selecting an existing embedding as the query vector.
-- It produces EXPLAIN (ANALYZE, BUFFERS) output for:
-- - Stage 1: pgvector seed retrieval
-- - Stage 2: neighborhood edges (hop1/hop2)
--
-- Note:
-- - On very small tables, Postgres may prefer Seq Scan + Sort even when HNSW exists.
-- - Also, pgvector ANN indexes are much more likely to be used when the query vector is a bind parameter.
--   This script uses PREPARE/EXECUTE to mirror the app's parameterized query shape.
-- - To sanity-check index usage, run with: -v force_index=1
-- - To keep the output readable (avoid printing the full 1536-dim vector literal in the plan),
--   run with: -v compact_plan=1 (default).

\set ON_ERROR_STOP on

\set compact_plan 1

\if :compact_plan
  -- This typically keeps EXPLAIN output compact by preferring a generic plan (parameters stay as $1),
  -- instead of inlining the full vector literal.
  SET plan_cache_mode = force_generic_plan;
\endif

\if :{?force_index}
  SET enable_seqscan = off;
  SET enable_bitmapscan = off;
\endif

-- Choose a query embedding from existing READY nodes in the scope.
-- psql limitation: EXECUTE parameters cannot contain subqueries. We therefore materialize the vector as text into a psql variable.
SELECT embedding::text AS qvec
FROM memory_nodes
WHERE scope = :'scope'
  AND tier IN ('hot', 'warm')
  AND embedding_status = 'ready'
  AND embedding IS NOT NULL
LIMIT 1
\gset

\if :{?qvec}
  SELECT 1 AS ok;
\else
  \echo 'No READY embedding found in scope; cannot run EXPLAIN baseline.'
  \quit 0
\endif

-- Prepare statements to ensure the query vector is passed as a bind parameter (like the API does).
DEALLOCATE ALL;

PREPARE stage1(vector(1536), text, int, int) AS
WITH knn AS (
  SELECT
    n.id,
    n.type::text AS type,
    n.title,
    n.text_summary,
    n.tier::text AS tier,
    n.salience,
    n.confidence,
    (n.embedding <=> $1::vector(1536)) AS distance
  FROM memory_nodes n
        WHERE n.scope = $2
          AND n.tier IN ('hot', 'warm')
          AND n.embedding IS NOT NULL
          AND n.embedding_status = 'ready'
  ORDER BY n.embedding <=> $1::vector(1536)
  LIMIT $3
)
SELECT
  k.id,
  k.type,
  k.title,
  k.text_summary,
  k.tier,
  k.salience,
  k.confidence,
  1.0 - k.distance AS similarity
FROM knn k
WHERE k.type IN ('event', 'topic', 'entity', 'rule')
  AND (
    k.type <> 'topic'
    OR EXISTS (
      SELECT 1
      FROM memory_nodes t
      WHERE t.id = k.id
        AND COALESCE(t.slots->>'topic_state', 'active') = 'active'
    )
  )
  AND (
    k.type <> 'rule'
    OR EXISTS (
      SELECT 1
      FROM memory_rule_defs d
      WHERE d.scope = $2
        AND d.rule_node_id = k.id
        AND d.state IN ('shadow', 'active')
    )
  )
ORDER BY k.distance ASC
LIMIT $4;

PREPARE stage2(vector(1536), text, int) AS
WITH seed_ids AS (
  SELECT n.id
  FROM memory_nodes n
  WHERE n.scope = $2
    AND n.tier IN ('hot', 'warm')
    AND n.embedding IS NOT NULL
    AND n.embedding_status = 'ready'
  ORDER BY n.embedding <=> $1::vector(1536)
  LIMIT $3
),
seed AS (
  SELECT id FROM seed_ids
),
hop1 AS (
  (
    SELECT e.*
    FROM memory_edges e
    JOIN seed s ON s.id = e.src_id
    WHERE e.scope = $2
    ORDER BY e.weight DESC, e.confidence DESC
    LIMIT 500
  )
  UNION
  (
    SELECT e.*
    FROM memory_edges e
    JOIN seed s ON s.id = e.dst_id
    WHERE e.scope = $2
    ORDER BY e.weight DESC, e.confidence DESC
    LIMIT 500
  )
),
nodes AS (
  SELECT src_id AS id FROM hop1
  UNION
  SELECT dst_id AS id FROM hop1
  UNION
  SELECT id FROM seed
),
hop2 AS (
  (
    SELECT e.*
    FROM memory_edges e
    JOIN nodes n ON n.id = e.src_id
    WHERE e.scope = $2
    ORDER BY e.weight DESC, e.confidence DESC
    LIMIT 500
  )
  UNION
  (
    SELECT e.*
    FROM memory_edges e
    JOIN nodes n ON n.id = e.dst_id
    WHERE e.scope = $2
    ORDER BY e.weight DESC, e.confidence DESC
    LIMIT 500
  )
)
SELECT
  id,
  scope,
  type::text AS type,
  src_id,
  dst_id,
  weight,
  confidence,
  created_at
FROM hop2
ORDER BY weight DESC, confidence DESC
LIMIT 500;

-- 1) Stage 1 vector retrieval
EXPLAIN (ANALYZE, BUFFERS)
EXECUTE stage1(:'qvec'::vector(1536), :'scope', (:'lim'::int * 5), :'lim');

-- 2) Stage 2 neighborhood edges (seed ids derived from stage1)
EXPLAIN (ANALYZE, BUFFERS)
EXECUTE stage2(:'qvec'::vector(1536), :'scope', :'lim');
