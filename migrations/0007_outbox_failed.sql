BEGIN;

ALTER TABLE memory_outbox
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS failed_reason TEXT NULL;

-- Helps the worker claim eligible work efficiently.
CREATE INDEX IF NOT EXISTS memory_outbox_unpublished_unfailed_idx
  ON memory_outbox (scope, id)
  WHERE published_at IS NULL AND failed_at IS NULL;

COMMIT;

