-- Seed a larger dataset (in an isolated scope) for performance baselines.
--
-- Usage:
--   psql "$DATABASE_URL" -v src_scope='default' -v scope='perf' -v n='50000' -f sql/seed_perf_dataset.sql
--
-- Notes:
-- - This writes N new nodes (scope=:scope). It is meant for local perf testing.
-- - It copies an existing READY embedding from :src_scope as the embedding payload (distance ties are fine).
-- - It creates a dedicated commit for auditability and sets embedding_model for consistency-check cleanliness.

\set ON_ERROR_STOP on

\if :{?src_scope}
\else
  \set src_scope 'default'
\endif

\if :{?scope}
\else
  \set scope 'perf'
\endif

\if :{?n}
\else
  \set n 50000
\endif

-- Pick a query embedding source (must exist).
SELECT embedding::text AS qvec
FROM memory_nodes
WHERE scope = :'src_scope'
  AND tier = 'hot'
  AND embedding_status = 'ready'
  AND embedding IS NOT NULL
LIMIT 1
\gset

\if :{?qvec}
\else
  \echo 'No READY embedding found in src_scope; cannot seed perf dataset.'
  \quit 1
\endif

-- Create a commit for the seeded nodes.
WITH c AS (
  SELECT
    gen_random_uuid() AS id,
    encode(digest('seed_perf_dataset:' || now()::text, 'sha256'), 'hex') AS input_sha256,
    encode(digest('seed_perf_dataset:commit:' || now()::text, 'sha256'), 'hex') AS commit_hash
)
INSERT INTO memory_commits (id, scope, parent_id, input_sha256, diff_json, actor, model_version, prompt_version, commit_hash)
SELECT
  c.id,
  :'scope',
  NULL,
  c.input_sha256,
  jsonb_build_object('kind', 'seed_perf_dataset', 'n', (:'n')::int, 'src_scope', :'src_scope'),
  'job:seed_perf_dataset',
  NULL,
  NULL,
  c.commit_hash
FROM c
RETURNING id AS commit_id
\gset

-- Insert N nodes (embedding READY + model set).
INSERT INTO memory_nodes (
  scope,
  type,
  tier,
  title,
  text_summary,
  slots,
  embedding,
  embedding_status,
  embedding_ready_at,
  embedding_model,
  commit_id
)
SELECT
  :'scope',
  'event'::memory_node_type,
  'hot'::memory_tier,
  NULL,
  'perf seed event #' || gs.i::text,
  '{}'::jsonb,
  :'qvec'::vector(1536),
  'ready'::memory_embedding_status,
  now(),
  'perf:seed',
  :'commit_id'::uuid
FROM generate_series(1, (:'n')::int) AS gs(i);

-- Update planner stats for more realistic EXPLAIN.
ANALYZE memory_nodes;

