BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums (MVP + forward-compatible)
DO $$ BEGIN
  CREATE TYPE memory_node_type AS ENUM (
    'event',
    'entity',
    'topic',
    'rule',
    'evidence',
    'concept',
    'procedure',
    'self_model'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE memory_edge_type AS ENUM (
    'part_of',
    'related_to',
    'derived_from'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE memory_tier AS ENUM ('hot', 'cold');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE memory_rule_state AS ENUM ('draft', 'shadow', 'active', 'disabled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Migrations bookkeeping (very small; scripts insert rows)
CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Commit chain: append-only, hash-chained.
CREATE TABLE IF NOT EXISTS memory_commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'default',
  parent_id UUID NULL REFERENCES memory_commits(id),

  -- Hash of the raw input / run digest / source payload(s) that led to this write.
  input_sha256 TEXT NOT NULL,

  -- Diff describing what this commit changed (ids + key snapshots).
  diff_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Provenance
  actor TEXT NOT NULL DEFAULT 'system',
  model_version TEXT NULL,
  prompt_version TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Commit hash chain (computed by app at write time; unique for auditability).
  commit_hash TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS memory_commits_scope_created_at_idx
  ON memory_commits (scope, created_at DESC);

-- Nodes
CREATE TABLE IF NOT EXISTS memory_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'default',

  type memory_node_type NOT NULL,
  tier memory_tier NOT NULL DEFAULT 'hot',

  title TEXT NULL,         -- for Entity/Topic/Concept/Rule display names
  text_summary TEXT NULL,  -- human/LLM readable summary
  slots JSONB NOT NULL DEFAULT '{}'::jsonb, -- structured attributes (rule if/then, entity attrs, tags)

  raw_ref TEXT NULL,       -- pointer to raw payload outside the graph (optional)
  evidence_ref TEXT NULL,  -- pointer to evidence blob/tool output (optional)

  embedding vector(1536) NULL,

  -- Scoring / dynamics
  salience REAL NOT NULL DEFAULT 0.5,
  importance REAL NOT NULL DEFAULT 0.5,
  confidence REAL NOT NULL DEFAULT 0.5,
  last_activated TIMESTAMPTZ NULL,

  -- Redaction + derivation
  redaction_version INT NOT NULL DEFAULT 1,
  derivation_version INT NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  commit_id UUID NULL REFERENCES memory_commits(id)
);

CREATE INDEX IF NOT EXISTS memory_nodes_scope_type_created_at_idx
  ON memory_nodes (scope, type, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_nodes_scope_tier_salience_idx
  ON memory_nodes (scope, tier, salience DESC);

CREATE INDEX IF NOT EXISTS memory_nodes_slots_gin_idx
  ON memory_nodes USING gin (slots);

-- pgvector index for similarity search (HNSW is friendly to incremental inserts)
CREATE INDEX IF NOT EXISTS memory_nodes_embedding_hnsw_idx
  ON memory_nodes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- Edges
CREATE TABLE IF NOT EXISTS memory_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'default',
  type memory_edge_type NOT NULL,

  src_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  dst_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,

  weight REAL NOT NULL DEFAULT 0.5,
  confidence REAL NOT NULL DEFAULT 0.5,
  decay_rate REAL NOT NULL DEFAULT 0.01,
  last_activated TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  commit_id UUID NULL REFERENCES memory_commits(id),

  CONSTRAINT memory_edges_unique UNIQUE (scope, type, src_id, dst_id),
  CONSTRAINT memory_edges_no_self_loop CHECK (src_id <> dst_id)
);

CREATE INDEX IF NOT EXISTS memory_edges_scope_src_type_idx
  ON memory_edges (scope, src_id, type);

CREATE INDEX IF NOT EXISTS memory_edges_scope_dst_type_idx
  ON memory_edges (scope, dst_id, type);

-- Rule defs (proposal-first lifecycle)
CREATE TABLE IF NOT EXISTS memory_rule_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'default',

  rule_node_id UUID NOT NULL UNIQUE REFERENCES memory_nodes(id) ON DELETE CASCADE,
  state memory_rule_state NOT NULL DEFAULT 'draft',

  -- normalized representation, separate from freeform summary
  if_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  then_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  exceptions_json JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- verification statistics
  positive_count INT NOT NULL DEFAULT 0,
  negative_count INT NOT NULL DEFAULT 0,
  last_evaluated_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  commit_id UUID NULL REFERENCES memory_commits(id)
);

CREATE INDEX IF NOT EXISTS memory_rule_defs_scope_state_idx
  ON memory_rule_defs (scope, state, updated_at DESC);

-- Feedback signals used to promote rules: DRAFT -> SHADOW -> ACTIVE
CREATE TABLE IF NOT EXISTS memory_rule_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'default',
  rule_node_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,

  -- Per-run correlation id (app-defined); optional in MVP.
  run_id TEXT NULL,

  -- simple signal for MVP; expand later (tool trace deltas, user explicit approval, etc.)
  outcome TEXT NOT NULL CHECK (outcome IN ('positive', 'negative', 'neutral')),
  note TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  commit_id UUID NULL REFERENCES memory_commits(id)
);

CREATE INDEX IF NOT EXISTS memory_rule_feedback_scope_rule_created_at_idx
  ON memory_rule_feedback (scope, rule_node_id, created_at DESC);

-- Outbox for syncing to a secondary graph engine later (Neo4j, etc.)
CREATE TABLE IF NOT EXISTS memory_outbox (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'default',
  commit_id UUID NOT NULL REFERENCES memory_commits(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS memory_outbox_published_at_idx
  ON memory_outbox (published_at) WHERE published_at IS NULL;

COMMIT;
