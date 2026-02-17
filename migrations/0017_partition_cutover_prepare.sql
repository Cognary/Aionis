BEGIN;

-- Phase C prep:
-- Bring v2 index surface closer to legacy tables so cutover testing uses comparable plans.

DO $$
BEGIN
  IF to_regclass('public.memory_nodes_v2') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS memory_nodes_v2_scope_embedding_status_idx ON memory_nodes_v2 (scope, embedding_status)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS memory_nodes_v2_slots_gin_idx ON memory_nodes_v2 USING gin (slots)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS memory_nodes_v2_scope_lane_owner_agent_idx ON memory_nodes_v2 (scope, memory_lane, owner_agent_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS memory_nodes_v2_scope_lane_owner_team_idx ON memory_nodes_v2 (scope, memory_lane, owner_team_id) WHERE owner_team_id IS NOT NULL';

    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS memory_nodes_v2_embedding_hnsw_idx
        ON memory_nodes_v2 USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE embedding IS NOT NULL
    $sql$;

    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS memory_nodes_v2_embedding_ready_hot_hnsw_idx
        ON memory_nodes_v2 USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE embedding IS NOT NULL
          AND tier = 'hot'::memory_tier
          AND embedding_status = 'ready'::memory_embedding_status
    $sql$;

    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS memory_nodes_v2_embedding_ready_hot_warm_hnsw_idx
        ON memory_nodes_v2 USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE embedding IS NOT NULL
          AND tier IN ('hot'::memory_tier, 'warm'::memory_tier)
          AND embedding_status = 'ready'::memory_embedding_status
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.memory_outbox_v2') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS memory_outbox_v2_published_at_idx ON memory_outbox_v2 (published_at) WHERE published_at IS NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS memory_outbox_v2_unpublished_claimed_at_idx ON memory_outbox_v2 (claimed_at) WHERE published_at IS NULL';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS memory_outbox_v2_scope_type_job_key_uniq ON memory_outbox_v2 (scope, event_type, job_key)';
  END IF;
END $$;

-- Quick SQL helper for legacy-vs-v2 row parity by scope.
CREATE OR REPLACE FUNCTION aionis_partition_cutover_gap(scope_key TEXT)
RETURNS TABLE(table_name TEXT, legacy_count BIGINT, v2_count BIGINT, delta BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT 'memory_commits'::TEXT, l.c, v.c, (l.c - v.c)
  FROM (SELECT count(*)::BIGINT AS c FROM memory_commits WHERE scope = scope_key) l,
       (SELECT count(*)::BIGINT AS c FROM memory_commits_v2 WHERE scope = scope_key) v
  UNION ALL
  SELECT 'memory_nodes'::TEXT, l.c, v.c, (l.c - v.c)
  FROM (SELECT count(*)::BIGINT AS c FROM memory_nodes WHERE scope = scope_key) l,
       (SELECT count(*)::BIGINT AS c FROM memory_nodes_v2 WHERE scope = scope_key) v
  UNION ALL
  SELECT 'memory_edges'::TEXT, l.c, v.c, (l.c - v.c)
  FROM (SELECT count(*)::BIGINT AS c FROM memory_edges WHERE scope = scope_key) l,
       (SELECT count(*)::BIGINT AS c FROM memory_edges_v2 WHERE scope = scope_key) v
  UNION ALL
  SELECT 'memory_outbox'::TEXT, l.c, v.c, (l.c - v.c)
  FROM (SELECT count(*)::BIGINT AS c FROM memory_outbox WHERE scope = scope_key) l,
       (SELECT count(*)::BIGINT AS c FROM memory_outbox_v2 WHERE scope = scope_key) v;
$$;

COMMIT;
