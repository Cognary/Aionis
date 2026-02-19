import "dotenv/config";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";
import { resolveTenantScope } from "../memory/tenant.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

type PurgeMode = "auto" | "partition" | "delete";

type TableDef = {
  table: string;
  order: number;
};

const LEGACY_TABLES: TableDef[] = [
  { table: "memory_outbox", order: 10 },
  { table: "memory_rule_feedback", order: 20 },
  { table: "memory_execution_decisions", order: 25 },
  { table: "memory_rule_defs", order: 30 },
  { table: "memory_edges", order: 40 },
  { table: "memory_nodes", order: 50 },
  { table: "memory_commits", order: 60 },
];

const V2_TABLES: TableDef[] = [
  { table: "memory_outbox_v2", order: 10 },
  { table: "memory_edges_v2", order: 40 },
  { table: "memory_nodes_v2", order: 50 },
  { table: "memory_commits_v2", order: 60 },
];

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

async function truncatePartitions(parts: string[]) {
  for (const part of parts) {
    await db.pool.query(`TRUNCATE TABLE ${part}`);
  }
}

async function deleteScopeChunked(table: string, scopeKey: string, batchSize: number): Promise<{ deleted: number; batches: number }> {
  let deleted = 0;
  let batches = 0;
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
    deleted += n;
    batches += 1;
  }
  return { deleted, batches };
}

async function main() {
  const requestedScope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const requestedTenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;
  const modeRaw = (argValue("--mode") ?? "auto").toLowerCase();
  const mode: PurgeMode = modeRaw === "partition" || modeRaw === "delete" ? modeRaw : "auto";
  const batchSize = clampInt(Number(argValue("--batch-size") ?? "5000"), 100, 50000);
  const apply = hasFlag("--apply");
  const includeLegacy = hasFlag("--legacy-only") ? true : hasFlag("--v2-only") ? false : true;
  const includeV2 = hasFlag("--v2-only") ? true : hasFlag("--legacy-only") ? false : true;
  const allowFallbackDelete = hasFlag("--allow-fallback-delete");
  const failOnDelete = hasFlag("--fail-on-delete");

  const tenancy = resolveTenantScope(
    { scope: requestedScope, tenant_id: requestedTenantId },
    { defaultScope: env.MEMORY_SCOPE, defaultTenantId: env.MEMORY_TENANT_ID },
  );

  const tables = [
    ...(includeLegacy ? LEGACY_TABLES.map((t) => ({ ...t, family: "legacy" as const })) : []),
    ...(includeV2 ? V2_TABLES.map((t) => ({ ...t, family: "v2" as const })) : []),
  ].sort((a, b) => a.order - b.order || a.table.localeCompare(b.table));

  const out: any = {
    ok: true,
    apply,
    mode,
    allow_fallback_delete: allowFallbackDelete,
    fail_on_delete: failOnDelete,
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    scope_key: tenancy.scope_key,
    batch_size: batchSize,
    include_legacy: includeLegacy,
    include_v2: includeV2,
    tables: [] as any[],
    totals: {
      candidate_rows: 0,
      deleted_rows: 0,
      deleted_batches: 0,
      partition_truncate_tables: 0,
      delete_tables: 0,
      delete_strategy_tables: 0,
      skipped_tables: 0,
    },
    warnings: [] as string[],
  };

  for (const t of tables) {
    const exists = await tableExists(t.table);
    const row: any = {
      table: t.table,
      family: t.family,
      exists,
      strategy: "skip",
      partitions: [] as string[],
      candidate_rows: 0,
      deleted_rows: 0,
      deleted_batches: 0,
      applied: false,
      note: null as string | null,
    };

    if (!exists) {
      row.note = "table_not_found";
      out.totals.skipped_tables += 1;
      out.tables.push(row);
      continue;
    }

    row.candidate_rows = await countScopeRows(t.table, tenancy.scope_key);
    out.totals.candidate_rows += row.candidate_rows;

    const parts = await listScopeBoundPartitions(t.table, tenancy.scope_key);
    row.partitions = parts;
    const hasPartitions = parts.length > 0;

    if (mode === "partition") {
      if (!hasPartitions) {
        if (!allowFallbackDelete) {
          throw new Error(`mode=partition but no scope partition found for table=${t.table}; add --allow-fallback-delete or use --mode=auto`);
        }
        row.strategy = "delete";
      } else {
        row.strategy = "partition_truncate";
      }
    } else if (mode === "delete") {
      row.strategy = "delete";
    } else {
      row.strategy = hasPartitions ? "partition_truncate" : "delete";
    }
    if (row.strategy === "delete") out.totals.delete_strategy_tables += 1;

    if (!apply) {
      row.note = "dry_run";
      out.tables.push(row);
      continue;
    }

    if (row.strategy === "partition_truncate") {
      await truncatePartitions(parts);
      row.deleted_rows = row.candidate_rows;
      row.deleted_batches = 1;
      row.applied = true;
      out.totals.partition_truncate_tables += 1;
    } else if (row.strategy === "delete") {
      const r = await deleteScopeChunked(t.table, tenancy.scope_key, batchSize);
      row.deleted_rows = r.deleted;
      row.deleted_batches = r.batches;
      row.applied = true;
      out.totals.delete_tables += 1;
    }

    out.totals.deleted_rows += row.deleted_rows;
    out.totals.deleted_batches += row.deleted_batches;
    out.tables.push(row);
  }

  if (failOnDelete && out.totals.delete_strategy_tables > 0) {
    out.ok = false;
    out.error = "delete_strategy_detected";
    out.message =
      "delete strategy used by one or more tables; rerun with full partition coverage or disable --fail-on-delete explicitly";
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exitCode = 1;
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
