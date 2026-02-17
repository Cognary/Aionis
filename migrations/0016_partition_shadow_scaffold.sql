BEGIN;

-- Phase B scaffold:
-- Create partition-ready shadow tables (v2) without switching read/write path yet.
-- Purpose: enable safe rehearsal of partition DDL + scope-level backfill/reset strategy.

CREATE TABLE IF NOT EXISTS memory_commits_v2 (
  LIKE memory_commits
) PARTITION BY LIST (scope);

CREATE TABLE IF NOT EXISTS memory_nodes_v2 (
  LIKE memory_nodes
) PARTITION BY LIST (scope);

CREATE TABLE IF NOT EXISTS memory_edges_v2 (
  LIKE memory_edges
) PARTITION BY LIST (scope);

CREATE TABLE IF NOT EXISTS memory_outbox_v2 (
  LIKE memory_outbox
) PARTITION BY LIST (scope);

CREATE TABLE IF NOT EXISTS memory_commits_v2_default PARTITION OF memory_commits_v2 DEFAULT;
CREATE TABLE IF NOT EXISTS memory_nodes_v2_default PARTITION OF memory_nodes_v2 DEFAULT;
CREATE TABLE IF NOT EXISTS memory_edges_v2_default PARTITION OF memory_edges_v2 DEFAULT;
CREATE TABLE IF NOT EXISTS memory_outbox_v2_default PARTITION OF memory_outbox_v2 DEFAULT;

-- Scope+id unique keys for idempotent backfill/replay into v2.
CREATE UNIQUE INDEX IF NOT EXISTS memory_commits_v2_scope_id_uniq ON memory_commits_v2 (scope, id);
CREATE UNIQUE INDEX IF NOT EXISTS memory_nodes_v2_scope_id_uniq ON memory_nodes_v2 (scope, id);
CREATE UNIQUE INDEX IF NOT EXISTS memory_edges_v2_scope_id_uniq ON memory_edges_v2 (scope, id);
CREATE UNIQUE INDEX IF NOT EXISTS memory_outbox_v2_scope_id_uniq ON memory_outbox_v2 (scope, id);

-- Minimal operational indexes aligned with current hot paths.
CREATE INDEX IF NOT EXISTS memory_commits_v2_scope_created_at_idx
  ON memory_commits_v2 (scope, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_nodes_v2_scope_type_created_at_idx
  ON memory_nodes_v2 (scope, type, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_nodes_v2_scope_tier_salience_idx
  ON memory_nodes_v2 (scope, tier, salience DESC);

CREATE INDEX IF NOT EXISTS memory_edges_v2_scope_src_type_idx
  ON memory_edges_v2 (scope, src_id, type);

CREATE INDEX IF NOT EXISTS memory_edges_v2_scope_dst_type_idx
  ON memory_edges_v2 (scope, dst_id, type);

CREATE INDEX IF NOT EXISTS memory_outbox_v2_unpublished_unfailed_idx
  ON memory_outbox_v2 (scope, id)
  WHERE published_at IS NULL AND failed_at IS NULL;

CREATE OR REPLACE FUNCTION aionis_partition_scope_exists(parent_table TEXT, scope_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_inherits i
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE p.relname = parent_table
      AND pg_get_expr(c.relpartbound, c.oid) ILIKE ('%' || quote_literal(scope_key) || '%')
  );
$$;

CREATE OR REPLACE FUNCTION aionis_partition_ensure_scope(scope_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  tbl TEXT;
  part_name TEXT;
  created_parts TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH tbl IN ARRAY ARRAY['memory_commits_v2', 'memory_nodes_v2', 'memory_edges_v2', 'memory_outbox_v2']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = tbl) THEN
      CONTINUE;
    END IF;
    IF aionis_partition_scope_exists(tbl, scope_key) THEN
      CONTINUE;
    END IF;

    part_name := format('%s_p_%s', tbl, substr(md5(scope_key), 1, 16));
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES IN (%L)', part_name, tbl, scope_key);
    created_parts := array_append(created_parts, part_name);
  END LOOP;

  RETURN jsonb_build_object(
    'scope', scope_key,
    'created', to_jsonb(created_parts)
  );
END;
$$;

CREATE OR REPLACE FUNCTION aionis_partition_list_scope(scope_key TEXT)
RETURNS TABLE(parent_table TEXT, partition_table TEXT, bound_expr TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.relname::TEXT AS parent_table,
    (n.nspname || '.' || c.relname)::TEXT AS partition_table,
    pg_get_expr(c.relpartbound, c.oid)::TEXT AS bound_expr
  FROM pg_inherits i
  JOIN pg_class p ON p.oid = i.inhparent
  JOIN pg_class c ON c.oid = i.inhrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE p.relname IN ('memory_commits_v2', 'memory_nodes_v2', 'memory_edges_v2', 'memory_outbox_v2')
    AND pg_get_expr(c.relpartbound, c.oid) ILIKE ('%' || quote_literal(scope_key) || '%')
  ORDER BY p.relname, partition_table;
$$;

COMMIT;
