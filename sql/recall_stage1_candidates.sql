-- Stage 1 candidate retrieval using pgvector.
-- Inputs (bind params):
--   $1 :: vector(1536)  -- query embedding
--   $2 :: text          -- scope
--   $3 :: int           -- limit
--
-- Notes:
-- - Default recall excludes cold tier.
-- - Cosine distance operator: `<=>` (lower is closer). Similarity = 1 - distance.
SELECT
  id,
  type,
  title,
  text_summary,
  tier,
  salience,
  confidence,
  1.0 - (embedding <=> $1) AS similarity
FROM memory_nodes
WHERE scope = $2
  AND tier = 'hot'
  AND embedding IS NOT NULL
  AND type IN ('event', 'topic', 'entity', 'rule')
  AND (
    type <> 'topic'
    OR COALESCE(slots->>'topic_state', 'active') = 'active'
  )
  AND (
    type <> 'rule'
    OR EXISTS (
      SELECT 1
      FROM memory_rule_defs d
      WHERE d.scope = memory_nodes.scope
        AND d.rule_node_id = memory_nodes.id
        AND d.state IN ('shadow', 'active')
    )
  )
ORDER BY embedding <=> $1
LIMIT $3;
