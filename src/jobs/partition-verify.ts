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

type Pair = {
  key: "commits" | "nodes" | "edges" | "outbox";
  source: string;
  target: string;
};

const PAIRS: Pair[] = [
  { key: "commits", source: "memory_commits", target: "memory_commits_v2" },
  { key: "nodes", source: "memory_nodes", target: "memory_nodes_v2" },
  { key: "edges", source: "memory_edges", target: "memory_edges_v2" },
  { key: "outbox", source: "memory_outbox", target: "memory_outbox_v2" },
];

async function tableExists(table: string): Promise<boolean> {
  const r = await db.pool.query<{ n: number }>(
    `
    SELECT count(*)::int AS n
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname = 'public'
      AND c.relname = $1
    `,
    [table],
  );
  return Number(r.rows[0]?.n ?? 0) > 0;
}

async function countScopeRows(table: string, scopeKey: string): Promise<number> {
  const r = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE scope = $1`, [scopeKey]);
  return Number(r.rows[0]?.n ?? 0);
}

async function countMissingInTarget(source: string, target: string, scopeKey: string): Promise<number> {
  const r = await db.pool.query<{ n: number }>(
    `
    SELECT count(*)::int AS n
    FROM ${source} s
    WHERE s.scope = $1
      AND NOT EXISTS (
        SELECT 1
        FROM ${target} t
        WHERE t.scope = s.scope
          AND t.id = s.id
      )
    `,
    [scopeKey],
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function countExtraInTarget(source: string, target: string, scopeKey: string): Promise<number> {
  const r = await db.pool.query<{ n: number }>(
    `
    SELECT count(*)::int AS n
    FROM ${target} t
    WHERE t.scope = $1
      AND NOT EXISTS (
        SELECT 1
        FROM ${source} s
        WHERE s.scope = t.scope
          AND s.id = t.id
      )
    `,
    [scopeKey],
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function sampleMissingInTarget(source: string, target: string, scopeKey: string, limit: number): Promise<string[]> {
  const r = await db.pool.query<{ id: string }>(
    `
    SELECT s.id::text AS id
    FROM ${source} s
    WHERE s.scope = $1
      AND NOT EXISTS (
        SELECT 1
        FROM ${target} t
        WHERE t.scope = s.scope
          AND t.id = s.id
      )
    ORDER BY s.id
    LIMIT $2
    `,
    [scopeKey, limit],
  );
  return r.rows.map((x) => x.id);
}

async function sampleExtraInTarget(source: string, target: string, scopeKey: string, limit: number): Promise<string[]> {
  const r = await db.pool.query<{ id: string }>(
    `
    SELECT t.id::text AS id
    FROM ${target} t
    WHERE t.scope = $1
      AND NOT EXISTS (
        SELECT 1
        FROM ${source} s
        WHERE s.scope = t.scope
          AND s.id = t.id
      )
    ORDER BY t.id
    LIMIT $2
    `,
    [scopeKey, limit],
  );
  return r.rows.map((x) => x.id);
}

async function main() {
  const requestedScope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const requestedTenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;
  const sampleLimit = clampInt(Number(argValue("--sample-limit") ?? "20"), 1, 200);
  const strict = hasFlag("--strict");

  const tenancy = resolveTenantScope(
    { scope: requestedScope, tenant_id: requestedTenantId },
    { defaultScope: env.MEMORY_SCOPE, defaultTenantId: env.MEMORY_TENANT_ID },
  );

  const out: any = {
    ok: true,
    strict,
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    scope_key: tenancy.scope_key,
    sample_limit: sampleLimit,
    tables: [] as any[],
    summary: {
      compared: 0,
      mismatched: 0,
      missing_in_target_total: 0,
      extra_in_target_total: 0,
    },
  };

  for (const p of PAIRS) {
    const srcExists = await tableExists(p.source);
    const dstExists = await tableExists(p.target);
    const row: any = {
      key: p.key,
      source: p.source,
      target: p.target,
      source_exists: srcExists,
      target_exists: dstExists,
      compared: false,
      source_count: null as number | null,
      target_count: null as number | null,
      missing_in_target: null as number | null,
      extra_in_target: null as number | null,
      sample_missing_in_target: [] as string[],
      sample_extra_in_target: [] as string[],
      match: null as boolean | null,
      note: null as string | null,
    };

    if (!srcExists || !dstExists) {
      row.note = !srcExists && !dstExists ? "source_and_target_missing" : !srcExists ? "source_missing" : "target_missing";
      out.tables.push(row);
      continue;
    }

    row.compared = true;
    out.summary.compared += 1;

    row.source_count = await countScopeRows(p.source, tenancy.scope_key);
    row.target_count = await countScopeRows(p.target, tenancy.scope_key);
    row.missing_in_target = await countMissingInTarget(p.source, p.target, tenancy.scope_key);
    row.extra_in_target = await countExtraInTarget(p.source, p.target, tenancy.scope_key);
    row.sample_missing_in_target = await sampleMissingInTarget(p.source, p.target, tenancy.scope_key, sampleLimit);
    row.sample_extra_in_target = await sampleExtraInTarget(p.source, p.target, tenancy.scope_key, sampleLimit);
    row.match = row.missing_in_target === 0 && row.extra_in_target === 0;

    out.summary.missing_in_target_total += row.missing_in_target;
    out.summary.extra_in_target_total += row.extra_in_target;
    if (!row.match) out.summary.mismatched += 1;

    out.tables.push(row);
  }

  if (strict && out.summary.mismatched > 0) {
    out.ok = false;
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));

  if (strict && !out.ok) {
    process.exitCode = 2;
  }
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

