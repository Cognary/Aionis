BEGIN;

DO $$ BEGIN
  CREATE TYPE memory_lane AS ENUM ('private', 'shared');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE memory_rule_scope AS ENUM ('global', 'team', 'agent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE memory_nodes
  ADD COLUMN IF NOT EXISTS memory_lane memory_lane NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS producer_agent_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS owner_agent_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS owner_team_id TEXT NULL;

-- Legacy compatibility: existing non-agentized rows become shared by default,
-- so old datasets remain visible across callers after enabling lane filtering.
UPDATE memory_nodes
SET memory_lane = 'shared'::memory_lane
WHERE memory_lane = 'private'::memory_lane
  AND producer_agent_id IS NULL
  AND owner_agent_id IS NULL
  AND owner_team_id IS NULL;

CREATE INDEX IF NOT EXISTS memory_nodes_scope_lane_owner_agent_idx
  ON memory_nodes (scope, memory_lane, owner_agent_id);

CREATE INDEX IF NOT EXISTS memory_nodes_scope_lane_owner_team_idx
  ON memory_nodes (scope, memory_lane, owner_team_id)
  WHERE owner_team_id IS NOT NULL;

ALTER TABLE memory_rule_defs
  ADD COLUMN IF NOT EXISTS rule_scope memory_rule_scope NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS target_agent_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS target_team_id TEXT NULL;

CREATE INDEX IF NOT EXISTS memory_rule_defs_scope_state_rule_scope_target_idx
  ON memory_rule_defs (scope, state, rule_scope, target_team_id, target_agent_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS memory_recall_audit (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'default',
  endpoint TEXT NOT NULL,
  consumer_agent_id TEXT NULL,
  consumer_team_id TEXT NULL,
  query_sha256 TEXT NOT NULL,
  seed_count INT NOT NULL DEFAULT 0,
  node_count INT NOT NULL DEFAULT 0,
  edge_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_recall_audit_scope_created_at_idx
  ON memory_recall_audit (scope, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_recall_audit_scope_consumer_agent_created_at_idx
  ON memory_recall_audit (scope, consumer_agent_id, created_at DESC)
  WHERE consumer_agent_id IS NOT NULL;

COMMIT;
