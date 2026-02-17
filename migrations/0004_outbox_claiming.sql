BEGIN;

-- Reliable outbox processing needs "claim then process then mark done".
-- We keep published_at as the "processed_at" timestamp, and add claimed_at/attempts/last_error for retries.

ALTER TABLE memory_outbox
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT NULL;

CREATE INDEX IF NOT EXISTS memory_outbox_unpublished_claimed_at_idx
  ON memory_outbox (claimed_at)
  WHERE published_at IS NULL;

COMMIT;

