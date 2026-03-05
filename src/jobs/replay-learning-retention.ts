import "dotenv/config";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function optText(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

async function countTtlCandidates(scope: string | null, ttlDaysFallback: number): Promise<number> {
  const out = await db.pool.query<{ n: string }>(
    `
    SELECT count(*)::text AS n
    FROM memory_nodes n
    WHERE n.type = 'event'::memory_node_type
      AND coalesce(n.slots->>'replay_learning_episode', 'false') = 'true'
      AND coalesce(n.slots->>'lifecycle_state', 'active') <> 'archived'
      AND coalesce(n.slots->>'archive_candidate', 'true') = 'true'
      AND ($1::text IS NULL OR n.scope = $1)
      AND (
        (
          coalesce(n.slots->>'ttl_expires_at', '') <> ''
          AND nullif(n.slots->>'ttl_expires_at', '')::timestamptz <= now()
        )
        OR (
          coalesce(n.slots->>'ttl_expires_at', '') = ''
          AND n.created_at <= now() - ($2::int * interval '1 day')
        )
      )
    `,
    [scope, ttlDaysFallback],
  );
  return Number(out.rows[0]?.n ?? "0");
}

async function countStableRuleCandidates(
  scope: string | null,
  positiveMin: number,
  negativeWindowDays: number,
): Promise<number> {
  const out = await db.pool.query<{ n: string }>(
    `
    WITH candidates AS (
      SELECT
        n.id,
        n.scope,
        nullif(trim(coalesce(n.slots->>'source_rule_node_id', '')), '') AS source_rule_node_id
      FROM memory_nodes n
      WHERE n.type = 'event'::memory_node_type
        AND coalesce(n.slots->>'replay_learning_episode', 'false') = 'true'
        AND coalesce(n.slots->>'lifecycle_state', 'active') <> 'archived'
        AND coalesce(n.slots->>'archive_candidate', 'true') = 'true'
        AND ($1::text IS NULL OR n.scope = $1)
    )
    SELECT count(*)::text AS n
    FROM candidates c
    JOIN memory_rule_defs d
      ON d.scope = c.scope
     AND d.rule_node_id::text = c.source_rule_node_id
    WHERE d.state = 'active'
      AND d.positive_count >= $2
      AND NOT EXISTS (
        SELECT 1
        FROM memory_rule_feedback f
        WHERE f.scope = c.scope
          AND f.rule_node_id = d.rule_node_id
          AND f.outcome = 'negative'
          AND f.created_at >= now() - ($3::int * interval '1 day')
      )
    `,
    [scope, positiveMin, negativeWindowDays],
  );
  return Number(out.rows[0]?.n ?? "0");
}

async function archiveTtlBatch(scope: string | null, ttlDaysFallback: number, batchSize: number): Promise<number> {
  const out = await db.pool.query<{ n: number }>(
    `
    WITH picked AS (
      SELECT n.id
      FROM memory_nodes n
      WHERE n.type = 'event'::memory_node_type
        AND coalesce(n.slots->>'replay_learning_episode', 'false') = 'true'
        AND coalesce(n.slots->>'lifecycle_state', 'active') <> 'archived'
        AND coalesce(n.slots->>'archive_candidate', 'true') = 'true'
        AND ($1::text IS NULL OR n.scope = $1)
        AND (
          (
            coalesce(n.slots->>'ttl_expires_at', '') <> ''
            AND nullif(n.slots->>'ttl_expires_at', '')::timestamptz <= now()
          )
          OR (
            coalesce(n.slots->>'ttl_expires_at', '') = ''
            AND n.created_at <= now() - ($2::int * interval '1 day')
          )
        )
      ORDER BY n.created_at ASC
      LIMIT $3
    ),
    updated AS (
      UPDATE memory_nodes n
      SET
        tier = 'archive'::memory_node_tier,
        slots = coalesce(n.slots, '{}'::jsonb)
          || jsonb_build_object(
            'lifecycle_state', 'archived',
            'archived_reason', 'ttl_expired',
            'archived_at', to_jsonb(now())
          )
      FROM picked p
      WHERE n.id = p.id
      RETURNING 1
    )
    SELECT count(*)::int AS n
    FROM updated
    `,
    [scope, ttlDaysFallback, batchSize],
  );
  return Number(out.rows[0]?.n ?? 0);
}

async function archiveRuleStableBatch(
  scope: string | null,
  positiveMin: number,
  negativeWindowDays: number,
  batchSize: number,
): Promise<number> {
  const out = await db.pool.query<{ n: number }>(
    `
    WITH candidates AS (
      SELECT
        n.id,
        n.scope,
        nullif(trim(coalesce(n.slots->>'source_rule_node_id', '')), '') AS source_rule_node_id
      FROM memory_nodes n
      WHERE n.type = 'event'::memory_node_type
        AND coalesce(n.slots->>'replay_learning_episode', 'false') = 'true'
        AND coalesce(n.slots->>'lifecycle_state', 'active') <> 'archived'
        AND coalesce(n.slots->>'archive_candidate', 'true') = 'true'
        AND ($1::text IS NULL OR n.scope = $1)
      ORDER BY n.created_at ASC
      LIMIT $4
    ),
    stable AS (
      SELECT c.id
      FROM candidates c
      JOIN memory_rule_defs d
        ON d.scope = c.scope
       AND d.rule_node_id::text = c.source_rule_node_id
      WHERE d.state = 'active'
        AND d.positive_count >= $2
        AND NOT EXISTS (
          SELECT 1
          FROM memory_rule_feedback f
          WHERE f.scope = c.scope
            AND f.rule_node_id = d.rule_node_id
            AND f.outcome = 'negative'
            AND f.created_at >= now() - ($3::int * interval '1 day')
        )
    ),
    updated AS (
      UPDATE memory_nodes n
      SET
        tier = 'archive'::memory_node_tier,
        slots = coalesce(n.slots, '{}'::jsonb)
          || jsonb_build_object(
            'lifecycle_state', 'archived',
            'archived_reason', 'rule_stabilized',
            'archived_at', to_jsonb(now())
          )
      FROM stable s
      WHERE n.id = s.id
      RETURNING 1
    )
    SELECT count(*)::int AS n
    FROM updated
    `,
    [scope, positiveMin, negativeWindowDays, batchSize],
  );
  return Number(out.rows[0]?.n ?? 0);
}

async function deleteInBatches(fn: () => Promise<number>): Promise<{ updated: number; batches: number }> {
  let updated = 0;
  let batches = 0;
  for (;;) {
    const n = await fn();
    if (n <= 0) break;
    updated += n;
    batches += 1;
  }
  return { updated, batches };
}

async function main() {
  const apply = hasFlag("--apply");
  const scope = optText(argValue("--scope"));
  const batchSize = clampInt(Number(argValue("--batch-size") ?? "200"), 10, 10000);
  const ttlDays = clampInt(Number(argValue("--ttl-days") ?? String(env.EPISODE_GC_TTL_DAYS)), 1, 3650);
  const positiveMin = clampInt(
    Number(argValue("--stable-positive-min") ?? String(env.EPISODE_GC_RULE_STABLE_POSITIVE_MIN)),
    1,
    100000,
  );
  const negativeWindowDays = clampInt(
    Number(argValue("--negative-window-days") ?? String(env.EPISODE_GC_RULE_STABLE_NEGATIVE_WINDOW_DAYS)),
    1,
    365,
  );

  const ttlCandidates = await countTtlCandidates(scope, ttlDays);
  const stableCandidates = await countStableRuleCandidates(scope, positiveMin, negativeWindowDays);

  const out: any = {
    ok: true,
    apply,
    scope,
    policy: {
      ttl_days: ttlDays,
      stable_positive_min: positiveMin,
      negative_window_days: negativeWindowDays,
      batch_size: batchSize,
    },
    candidates: {
      ttl_expired: ttlCandidates,
      rule_stabilized: stableCandidates,
    },
    archived: {
      ttl_expired: 0,
      rule_stabilized: 0,
      batches_ttl: 0,
      batches_stable: 0,
    },
  };

  if (apply) {
    const ttlOut = await deleteInBatches(async () => await archiveTtlBatch(scope, ttlDays, batchSize));
    out.archived.ttl_expired = ttlOut.updated;
    out.archived.batches_ttl = ttlOut.batches;

    const stableOut = await deleteInBatches(async () =>
      await archiveRuleStableBatch(scope, positiveMin, negativeWindowDays, batchSize),
    );
    out.archived.rule_stabilized = stableOut.updated;
    out.archived.batches_stable = stableOut.batches;
  }

  out.totals = {
    candidate_total: out.candidates.ttl_expired + out.candidates.rule_stabilized,
    archived_total: out.archived.ttl_expired + out.archived.rule_stabilized,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
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

