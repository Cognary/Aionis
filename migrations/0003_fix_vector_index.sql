BEGIN;

-- Ensure the embedding HNSW index only covers non-NULL embeddings.
-- (If you applied an older version of 0001_init.sql, this migration corrects it.)
DROP INDEX IF EXISTS memory_nodes_embedding_hnsw_idx;
CREATE INDEX IF NOT EXISTS memory_nodes_embedding_hnsw_idx
  ON memory_nodes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

COMMIT;

