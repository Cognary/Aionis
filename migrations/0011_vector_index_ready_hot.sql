BEGIN;

-- Performance: a smaller ANN index that matches the recall seed predicate.
-- This makes it more likely the planner chooses HNSW at scale, while keeping results constrained
-- to the recall-eligible subset (tier=hot, embedding_status=ready).
CREATE INDEX IF NOT EXISTS memory_nodes_embedding_ready_hot_hnsw_idx
  ON memory_nodes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL
    AND tier = 'hot'::memory_tier
    AND embedding_status = 'ready'::memory_embedding_status;

COMMIT;

