BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'memory_embedding_status') THEN
    CREATE TYPE memory_embedding_status AS ENUM ('ready', 'pending', 'failed');
  END IF;
END $$;

ALTER TABLE memory_nodes
  ADD COLUMN IF NOT EXISTS embedding_status memory_embedding_status NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS embedding_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedding_last_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS embedding_last_attempt_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS embedding_ready_at TIMESTAMPTZ NULL;

-- Backfill for existing rows.
UPDATE memory_nodes
SET
  embedding_status = CASE
    WHEN embedding IS NOT NULL THEN 'ready'::memory_embedding_status
    ELSE 'pending'::memory_embedding_status
  END,
  embedding_ready_at = CASE WHEN embedding IS NOT NULL THEN COALESCE(embedding_ready_at, updated_at) ELSE NULL END
WHERE true;

CREATE INDEX IF NOT EXISTS memory_nodes_scope_embedding_status_idx
  ON memory_nodes (scope, embedding_status);

COMMIT;
