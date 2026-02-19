import "dotenv/config";
import stableStringify from "fast-json-stable-stringify";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { sha256Hex } from "../util/crypto.js";
import { resolveTenantScope } from "../memory/tenant.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

type ResetStats = {
  outbox: number;
  rule_feedback: number;
  execution_decisions: number;
  rule_defs: number;
  edges: number;
  nodes: number;
  commits: number;
};

async function tableExists(table: string): Promise<boolean> {
  const r = await db.pool.query<{ ok: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    ) AS ok
    `,
    [table],
  );
  return !!r.rows[0]?.ok;
}

async function listScopeBoundPartitions(table: string, scopeKey: string): Promise<string[]> {
  const r = await db.pool.query<{ fqname: string }>(
    `
    SELECT quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS fqname
    FROM pg_inherits i
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.relname = $1
      AND pg_get_expr(c.relpartbound, c.oid) ILIKE ('%' || quote_literal($2) || '%')
    ORDER BY 1
    `,
    [table, scopeKey],
  );
  return r.rows.map((x) => x.fqname);
}

async function tryTruncateScopePartitions(
  table:
    | "memory_outbox"
    | "memory_rule_feedback"
    | "memory_execution_decisions"
    | "memory_rule_defs"
    | "memory_edges"
    | "memory_nodes"
    | "memory_commits",
  scopeKey: string,
  log: (msg: string, extra?: Record<string, unknown>) => void,
): Promise<{ applied: boolean; rows: number; partitions: string[] }> {
  const partitions = await listScopeBoundPartitions(table, scopeKey);
  if (partitions.length === 0) return { applied: false, rows: 0, partitions: [] };

  let rows = 0;
  for (const part of partitions) {
    const c = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${part}`);
    rows += Number(c.rows[0]?.n ?? 0);
  }
  for (const part of partitions) {
    await db.pool.query(`TRUNCATE TABLE ${part}`);
  }
  log("reset_scope:partition_truncate", { table, partitions, rows });
  return { applied: true, rows, partitions };
}

async function deleteScopeChunked(
  table:
    | "memory_outbox"
    | "memory_rule_feedback"
    | "memory_execution_decisions"
    | "memory_rule_defs"
    | "memory_edges"
    | "memory_nodes"
    | "memory_commits",
  scopeKey: string,
  batchSize: number,
  log: (msg: string, extra?: Record<string, unknown>) => void,
): Promise<number> {
  const fast = await tryTruncateScopePartitions(table, scopeKey, log);
  if (fast.applied) return fast.rows;

  let total = 0;
  for (;;) {
    const r = await db.pool.query<{ n: number }>(
      `
      WITH picked AS (
        SELECT ctid
        FROM ${table}
        WHERE scope = $1
        LIMIT $2
      ),
      deleted AS (
        DELETE FROM ${table} t
        USING picked p
        WHERE t.ctid = p.ctid
        RETURNING 1
      )
      SELECT count(*)::int AS n FROM deleted
      `,
      [scopeKey, batchSize],
    );
    const n = Number(r.rows[0]?.n ?? 0);
    if (n <= 0) break;
    total += n;
    if (total % Math.max(batchSize * 10, 50000) === 0) {
      log("reset_scope:progress", { table, deleted: total });
    }
  }
  return total;
}

async function resetScopeChunked(
  scopeKey: string,
  batchSize: number,
  log: (msg: string, extra?: Record<string, unknown>) => void,
): Promise<ResetStats> {
  // FK-safe order: child tables first, then nodes/commits.
  const outbox = await deleteScopeChunked("memory_outbox", scopeKey, batchSize, log);
  const ruleFeedback = await deleteScopeChunked("memory_rule_feedback", scopeKey, batchSize, log);
  let executionDecisions = 0;
  if (await tableExists("memory_execution_decisions")) {
    executionDecisions = await deleteScopeChunked("memory_execution_decisions", scopeKey, batchSize, log);
  }
  const ruleDefs = await deleteScopeChunked("memory_rule_defs", scopeKey, batchSize, log);
  const edges = await deleteScopeChunked("memory_edges", scopeKey, batchSize, log);
  const nodes = await deleteScopeChunked("memory_nodes", scopeKey, batchSize, log);
  const commits = await deleteScopeChunked("memory_commits", scopeKey, batchSize, log);
  return {
    outbox,
    rule_feedback: ruleFeedback,
    execution_decisions: executionDecisions,
    rule_defs: ruleDefs,
    edges,
    nodes,
    commits,
  };
}

async function main() {
  const requestedScope = argValue("--scope") ?? "perf";
  const requestedTenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;
  const srcScope = argValue("--src-scope") ?? env.MEMORY_SCOPE;
  const srcTenantId = argValue("--src-tenant-id") ?? env.MEMORY_TENANT_ID;
  const eventCount = clampInt(Number(argValue("--events") ?? "50000"), 100, 1_000_000);
  const topicCount = clampInt(
    Number(argValue("--topics") ?? String(Math.max(50, Math.min(5000, Math.floor(eventCount / 100))))),
    1,
    100_000,
  );
  const reset = hasFlag("--reset");
  const allowResetActiveScope = hasFlag("--allow-reset-active-scope");
  const resetBatch = clampInt(Number(argValue("--reset-batch") ?? "5000"), 100, 50000);

  const targetTenancy = resolveTenantScope(
    { scope: requestedScope, tenant_id: requestedTenantId },
    { defaultScope: env.MEMORY_SCOPE, defaultTenantId: env.MEMORY_TENANT_ID },
  );
  const srcTenancy = resolveTenantScope(
    { scope: srcScope, tenant_id: srcTenantId },
    { defaultScope: env.MEMORY_SCOPE, defaultTenantId: env.MEMORY_TENANT_ID },
  );

  const startedAt = Date.now();
  const log = (msg: string, extra?: Record<string, unknown>) => {
    const payload = extra ? ` ${JSON.stringify(extra)}` : "";
    // eslint-disable-next-line no-console
    console.error(`[perf-seed] ${msg}${payload}`);
  };

  if (reset && !allowResetActiveScope && targetTenancy.scope_key === srcTenancy.scope_key) {
    throw new Error(
      `refusing to reset active/source scope ${targetTenancy.scope_key}; use --allow-reset-active-scope if you really want this`,
    );
  }

  let resetStats: ResetStats | null = null;
  if (reset) {
    log("reset_scope:start", { reset_batch: resetBatch });
    resetStats = await resetScopeChunked(targetTenancy.scope_key, resetBatch, log);
    log("reset_scope:done", resetStats as any);
  }

  const out = await withTx(db, async (client) => {
    log("begin", {
      tenant_id: targetTenancy.tenant_id,
      scope: targetTenancy.scope,
      scope_key: targetTenancy.scope_key,
      source_scope_key: srcTenancy.scope_key,
      events: eventCount,
      topics: topicCount,
      reset,
    });

    log("pick_embedding:start");
    const embRes = await client.query<{ embedding: string }>(
      `
      SELECT embedding::text AS embedding
      FROM memory_nodes
      WHERE scope = $1
        AND embedding_status = 'ready'
        AND embedding IS NOT NULL
      LIMIT 1
      `,
      [srcTenancy.scope_key],
    );
    if (embRes.rowCount !== 1) {
      throw new Error(
        `no READY embedding found in source scope=${srcTenancy.scope} tenant_id=${srcTenancy.tenant_id} (scope_key=${srcTenancy.scope_key})`,
      );
    }
    const embeddingLiteral = embRes.rows[0].embedding;
    log("pick_embedding:done");

    log("commit:create:start");
    const parentRes = await client.query<{ id: string; commit_hash: string }>(
      "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
      [targetTenancy.scope_key],
    );
    const parentId = parentRes.rows[0]?.id ?? null;
    const parentHash = parentRes.rows[0]?.commit_hash ?? "";

    const inputSha = sha256Hex(
      stableStringify({
        kind: "perf_seed",
        started_at_ms: startedAt,
        scope_key: targetTenancy.scope_key,
        source_scope_key: srcTenancy.scope_key,
        events: eventCount,
        topics: topicCount,
        reset,
      }),
    );
    const diff = {
      kind: "perf_seed",
      tenant_id: targetTenancy.tenant_id,
      scope: targetTenancy.scope,
      source_tenant_id: srcTenancy.tenant_id,
      source_scope: srcTenancy.scope,
      events: eventCount,
      topics: topicCount,
      reset,
    };
    const diffSha = sha256Hex(stableStringify(diff));
    const commitHash = sha256Hex(
      stableStringify({
        parentHash,
        inputSha,
        diffSha,
        scope: targetTenancy.scope_key,
        actor: "job",
        kind: "perf_seed",
      }),
    );

    const commitRes = await client.query<{ id: string }>(
      `
      INSERT INTO memory_commits (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
      VALUES ($1, $2, $3, $4::jsonb, 'job:perf_seed', $5)
      RETURNING id
      `,
      [targetTenancy.scope_key, parentId, inputSha, JSON.stringify(diff), commitHash],
    );
    const commitId = commitRes.rows[0].id;
    log("commit:create:done", { commit_id: commitId, commit_hash: commitHash });

    log("temp_topics:start");
    await client.query(
      `
      CREATE TEMP TABLE perf_topics_tmp (
        rn INT PRIMARY KEY,
        id UUID NOT NULL
      ) ON COMMIT DROP
      `,
    );
    await client.query(
      `
      INSERT INTO perf_topics_tmp (rn, id)
      SELECT gs, gen_random_uuid()
      FROM generate_series(1, $1::int) gs
      `,
      [topicCount],
    );
    log("temp_topics:done", { topics: topicCount });

    log("insert_topics:start", { topics: topicCount });
    await client.query(
      `
      INSERT INTO memory_nodes (
        id, scope, type, tier, title, text_summary, slots, embedding, embedding_status, embedding_ready_at,
        embedding_model, memory_lane, salience, importance, confidence, commit_id
      )
      SELECT
        t.id, $1, 'topic'::memory_node_type, 'hot'::memory_tier,
        ('perf topic #' || t.rn::text),
        ('synthetic perf topic #' || t.rn::text),
        '{}'::jsonb,
        $2::vector(1536),
        'ready'::memory_embedding_status,
        now(),
        'perf:seed',
        'shared'::memory_lane,
        0.4, 0.4, 0.9,
        $3::uuid
      FROM perf_topics_tmp t
      `,
      [targetTenancy.scope_key, embeddingLiteral, commitId],
    );
    log("insert_topics:done");

    log("temp_events:start");
    await client.query(
      `
      CREATE TEMP TABLE perf_events_tmp (
        rn INT PRIMARY KEY,
        id UUID NOT NULL
      ) ON COMMIT DROP
      `,
    );
    await client.query(
      `
      INSERT INTO perf_events_tmp (rn, id)
      SELECT gs, gen_random_uuid()
      FROM generate_series(1, $1::int) gs
      `,
      [eventCount],
    );
    log("temp_events:done", { events: eventCount });

    log("insert_events:start", { events: eventCount });
    await client.query(
      `
      INSERT INTO memory_nodes (
        id, scope, type, tier, title, text_summary, slots, embedding, embedding_status, embedding_ready_at,
        embedding_model, memory_lane, salience, importance, confidence, commit_id
      )
      SELECT
        e.id, $1, 'event'::memory_node_type, 'hot'::memory_tier,
        NULL,
        ('synthetic perf event #' || e.rn::text),
        '{}'::jsonb,
        $2::vector(1536),
        'ready'::memory_embedding_status,
        now(),
        'perf:seed',
        'shared'::memory_lane,
        0.5, 0.5, 0.8,
        $3::uuid
      FROM perf_events_tmp e
      `,
      [targetTenancy.scope_key, embeddingLiteral, commitId],
    );
    log("insert_events:done");

    log("insert_edges_part_of:start", { edges: eventCount });
    await client.query(
      `
      INSERT INTO memory_edges (
        id, scope, type, src_id, dst_id, weight, confidence, decay_rate, commit_id
      )
      SELECT
        gen_random_uuid(), $1, 'part_of'::memory_edge_type, e.id, t.id, 0.75, 0.75, 0.01, $3::uuid
      FROM perf_events_tmp e
      JOIN perf_topics_tmp t
        ON t.rn = 1 + ((e.rn - 1) % $2::int)
      `,
      [targetTenancy.scope_key, topicCount, commitId],
    );
    log("insert_edges_part_of:done");

    log("insert_edges_derived_from:start", { edges: eventCount });
    await client.query(
      `
      INSERT INTO memory_edges (
        id, scope, type, src_id, dst_id, weight, confidence, decay_rate, commit_id
      )
      SELECT
        gen_random_uuid(), $1, 'derived_from'::memory_edge_type, t.id, e.id, 1.0, 1.0, 0.01, $3::uuid
      FROM perf_events_tmp e
      JOIN perf_topics_tmp t
        ON t.rn = 1 + ((e.rn - 1) % $2::int)
      `,
      [targetTenancy.scope_key, topicCount, commitId],
    );
    log("insert_edges_derived_from:done");

    log("analyze:start");
    await client.query("ANALYZE memory_nodes");
    await client.query("ANALYZE memory_edges");
    log("analyze:done");

    const countsRes = await client.query<{ nodes: string; edges: string }>(
      `
      SELECT
        (SELECT count(*)::text FROM memory_nodes WHERE scope = $1) AS nodes,
        (SELECT count(*)::text FROM memory_edges WHERE scope = $1) AS edges
      `,
      [targetTenancy.scope_key],
    );
    log("counts:done", {
      nodes: Number(countsRes.rows[0]?.nodes ?? 0),
      edges: Number(countsRes.rows[0]?.edges ?? 0),
    });

    return {
      scope: targetTenancy.scope,
      tenant_id: targetTenancy.tenant_id,
      scope_key: targetTenancy.scope_key,
      source_scope: srcTenancy.scope,
      source_tenant_id: srcTenancy.tenant_id,
      source_scope_key: srcTenancy.scope_key,
      reset,
      reset_stats: resetStats,
      inserted: {
        topics: topicCount,
        events: eventCount,
        edges: eventCount * 2,
      },
      totals_in_scope: {
        nodes: Number(countsRes.rows[0]?.nodes ?? 0),
        edges: Number(countsRes.rows[0]?.edges ?? 0),
      },
      commit_id: commitId,
      commit_hash: commitHash,
      elapsed_ms: Date.now() - startedAt,
    };
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, ...out }, null, 2));
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db);
  });
