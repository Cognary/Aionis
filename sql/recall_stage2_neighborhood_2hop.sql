-- Stage 2 neighborhood fetch (for app-layer spreading activation).
-- Inputs:
--   $1 :: uuid[]  -- seed node ids (from stage 1)
--   $2 :: text    -- scope
--
-- Returns edges + the connected nodes (1-2 hop). Keep budgets in the app.
WITH seed AS (
  SELECT unnest($1::uuid[]) AS id
),
hop1 AS (
  SELECT e.*
  FROM memory_edges e
  JOIN seed s ON s.id = e.src_id
  WHERE e.scope = $2
  UNION ALL
  SELECT e.*
  FROM memory_edges e
  JOIN seed s ON s.id = e.dst_id
  WHERE e.scope = $2
),
nodes AS (
  SELECT src_id AS id FROM hop1
  UNION
  SELECT dst_id AS id FROM hop1
  UNION
  SELECT id FROM seed
),
hop2 AS (
  SELECT e.*
  FROM memory_edges e
  JOIN nodes n ON n.id = e.src_id
  WHERE e.scope = $2
  UNION ALL
  SELECT e.*
  FROM memory_edges e
  JOIN nodes n ON n.id = e.dst_id
  WHERE e.scope = $2
)
SELECT
  'edge' AS row_type,
  to_jsonb(hop2) AS row
FROM hop2
UNION ALL
SELECT
  'node' AS row_type,
  to_jsonb(n) AS row
FROM (
  SELECT *
  FROM memory_nodes
  WHERE scope = $2
    AND id IN (SELECT id FROM nodes)
) n;

