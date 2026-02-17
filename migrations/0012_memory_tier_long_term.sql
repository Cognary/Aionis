DO $$
BEGIN
  ALTER TYPE memory_tier ADD VALUE IF NOT EXISTS 'warm';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE memory_tier ADD VALUE IF NOT EXISTS 'archive';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Recall now targets the "active memory" set (hot + warm).
CREATE INDEX IF NOT EXISTS memory_nodes_embedding_ready_hot_warm_hnsw_idx
  ON memory_nodes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL
    AND tier IN ('hot'::memory_tier, 'warm'::memory_tier)
    AND embedding_status = 'ready'::memory_embedding_status;
