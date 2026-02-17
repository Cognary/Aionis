BEGIN;

ALTER TABLE memory_outbox
  ADD COLUMN IF NOT EXISTS job_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS payload_sha256 TEXT NULL;

-- Prevent duplicate enqueues for the same logical job (per scope + event_type + job_key).
CREATE UNIQUE INDEX IF NOT EXISTS memory_outbox_scope_type_job_key_uniq
  ON memory_outbox (scope, event_type, job_key);

COMMIT;
