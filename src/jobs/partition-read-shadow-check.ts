import "dotenv/config";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";
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

async function main() {
  const requestedScope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const requestedTenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;
  const limit = clampInt(Number(argValue("--limit") ?? "20"), 1, 200);
  const minOverlap = Math.max(0, Math.min(1, Number(argValue("--min-overlap") ?? "0.95")));
  const strict = hasFlag("--strict");

  const tenancy = resolveTenantScope(
    { scope: requestedScope, tenant_id: requestedTenantId },
    { defaultScope: env.MEMORY_SCOPE, defaultTenantId: env.MEMORY_TENANT_ID },
  );

  const vecRes = await db.pool.query<{ embedding_txt: string }>(
    `
    SELECT embedding::text AS embedding_txt
    FROM memory_nodes
    WHERE scope = $1
      AND embedding_status = 'ready'
      AND embedding IS NOT NULL
      AND tier IN ('hot'::memory_tier, 'warm'::memory_tier)
    LIMIT 1
    `,
    [tenancy.scope_key],
  );
  if (vecRes.rowCount !== 1) {
    throw new Error(`no READY embedding found in legacy table for scope=${tenancy.scope_key}`);
  }
  const embedding = vecRes.rows[0].embedding_txt;

  const legacyRes = await db.pool.query<{ id: string }>(
    `
    SELECT id
    FROM memory_nodes
    WHERE scope = $1
      AND embedding_status = 'ready'
      AND embedding IS NOT NULL
      AND tier IN ('hot'::memory_tier, 'warm'::memory_tier)
    ORDER BY embedding <=> $2::vector(1536)
    LIMIT $3
    `,
    [tenancy.scope_key, embedding, limit],
  );

  const v2Res = await db.pool.query<{ id: string }>(
    `
    SELECT id
    FROM memory_nodes_v2
    WHERE scope = $1
      AND embedding_status = 'ready'
      AND embedding IS NOT NULL
      AND tier IN ('hot'::memory_tier, 'warm'::memory_tier)
    ORDER BY embedding <=> $2::vector(1536)
    LIMIT $3
    `,
    [tenancy.scope_key, embedding, limit],
  );

  const legacyIds = legacyRes.rows.map((r) => r.id);
  const v2Ids = v2Res.rows.map((r) => r.id);
  const legacySet = new Set(legacyIds);
  const v2Set = new Set(v2Ids);
  const overlapIds = legacyIds.filter((id) => v2Set.has(id));

  const overlapCount = overlapIds.length;
  const comparedTopN = Math.max(legacyIds.length, v2Ids.length, 1);
  const overlapRatio = overlapCount / comparedTopN;
  const unionCount = new Set([...legacyIds, ...v2Ids]).size;
  const jaccard = unionCount > 0 ? overlapCount / unionCount : 1;
  const exactOrderMatch =
    legacyIds.length === v2Ids.length && legacyIds.every((id, i) => id === v2Ids[i]);

  const ok = overlapRatio >= minOverlap;
  const out = {
    ok,
    strict,
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    scope_key: tenancy.scope_key,
    limit,
    min_overlap: minOverlap,
    metrics: {
      overlap_count: overlapCount,
      compared_top_n: comparedTopN,
      overlap_ratio: Number(overlapRatio.toFixed(6)),
      jaccard: Number(jaccard.toFixed(6)),
      exact_order_match: exactOrderMatch,
      legacy_count: legacyIds.length,
      v2_count: v2Ids.length,
    },
    sample: {
      legacy_top_ids: legacyIds.slice(0, 10),
      v2_top_ids: v2Ids.slice(0, 10),
      overlap_top_ids: overlapIds.slice(0, 10),
    },
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));

  if (strict && !ok) process.exitCode = 1;
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db);
  });
