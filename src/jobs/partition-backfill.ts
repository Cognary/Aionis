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

function qIdent(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

type TableMap = {
  key: "commits" | "nodes" | "edges" | "outbox";
  source: string;
  target: string;
};

const TABLES: TableMap[] = [
  { key: "commits", source: "memory_commits", target: "memory_commits_v2" },
  { key: "nodes", source: "memory_nodes", target: "memory_nodes_v2" },
  { key: "edges", source: "memory_edges", target: "memory_edges_v2" },
  { key: "outbox", source: "memory_outbox", target: "memory_outbox_v2" },
];

async function commonColumns(source: string, target: string): Promise<string[]> {
  const r = await db.pool.query<{ column_name: string }>(
    `
    SELECT s.column_name
    FROM information_schema.columns s
    JOIN information_schema.columns t
      ON t.table_schema = 'public'
     AND t.table_name = $2
     AND t.column_name = s.column_name
    WHERE s.table_schema = 'public'
      AND s.table_name = $1
    ORDER BY s.ordinal_position
    `,
    [source, target],
  );
  return r.rows.map((x) => x.column_name);
}

async function backfillTable(args: {
  source: string;
  target: string;
  scopeKey: string;
  batchSize: number;
  maxBatches: number;
  dryRun: boolean;
}) {
  const cols = await commonColumns(args.source, args.target);
  if (cols.length === 0) {
    throw new Error(`no shared columns found between ${args.source} and ${args.target}`);
  }
  if (!cols.includes("scope") || !cols.includes("id")) {
    throw new Error(`shared columns must include scope and id: ${args.source} -> ${args.target}`);
  }

  const colList = cols.map(qIdent).join(", ");
  const sourceSql = qIdent(args.source);
  const targetSql = qIdent(args.target);

  let total = 0;
  let batches = 0;

  for (;;) {
    if (args.maxBatches > 0 && batches >= args.maxBatches) break;

    if (args.dryRun) {
      const r = await db.pool.query<{ n: number }>(
        `
        WITH picked AS (
          SELECT ${colList}
          FROM ${sourceSql} s
          WHERE s.scope = $1
            AND NOT EXISTS (
              SELECT 1
              FROM ${targetSql} t
              WHERE t.scope = s.scope
                AND t.id = s.id
            )
          ORDER BY s.id
          LIMIT $2
        )
        SELECT count(*)::int AS n FROM picked
        `,
        [args.scopeKey, args.batchSize],
      );
      const n = Number(r.rows[0]?.n ?? 0);
      if (n <= 0) break;
      total += n;
      batches += 1;
      continue;
    }

    const r = await db.pool.query<{ n: number }>(
      `
      WITH picked AS (
        SELECT ${colList}
        FROM ${sourceSql} s
        WHERE s.scope = $1
          AND NOT EXISTS (
            SELECT 1
            FROM ${targetSql} t
            WHERE t.scope = s.scope
              AND t.id = s.id
          )
        ORDER BY s.id
        LIMIT $2
      ),
      inserted AS (
        INSERT INTO ${targetSql} (${colList})
        SELECT ${colList}
        FROM picked
        ON CONFLICT (scope, id) DO NOTHING
        RETURNING 1
      )
      SELECT count(*)::int AS n FROM inserted
      `,
      [args.scopeKey, args.batchSize],
    );
    const n = Number(r.rows[0]?.n ?? 0);
    if (n <= 0) break;
    total += n;
    batches += 1;
  }

  return { rows: total, batches };
}

async function main() {
  const requestedScope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const requestedTenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;
  const tableArg = (argValue("--table") ?? "all").toLowerCase();
  const dryRun = hasFlag("--dry-run");
  const ensureScopePartition = hasFlag("--ensure-scope-partition");
  const batchSize = clampInt(Number(argValue("--batch-size") ?? "5000"), 100, 50000);
  const maxBatches = clampInt(Number(argValue("--max-batches") ?? "0"), 0, 1000000);

  const tenancy = resolveTenantScope(
    { scope: requestedScope, tenant_id: requestedTenantId },
    { defaultScope: env.MEMORY_SCOPE, defaultTenantId: env.MEMORY_TENANT_ID },
  );

  const selected =
    tableArg === "all"
      ? TABLES
      : TABLES.filter((t) => t.key === tableArg || t.source === tableArg || t.target === tableArg);
  if (selected.length === 0) {
    throw new Error(`invalid --table=${tableArg}; expected one of: all, commits, nodes, edges, outbox`);
  }

  const out: Record<string, unknown> = {
    ok: true,
    dry_run: dryRun,
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    scope_key: tenancy.scope_key,
    batch_size: batchSize,
    max_batches: maxBatches,
    ensured_scope_partition: false,
    ensure_result: null,
    tables: {} as Record<string, unknown>,
  };

  if (ensureScopePartition) {
    const r = await db.pool.query<{ out: unknown }>(
      "SELECT aionis_partition_ensure_scope($1) AS out",
      [tenancy.scope_key],
    );
    out.ensured_scope_partition = true;
    out.ensure_result = r.rows[0]?.out ?? null;
  }

  const tableStats: Record<string, unknown> = {};
  for (const t of selected) {
    const stat = await backfillTable({
      source: t.source,
      target: t.target,
      scopeKey: tenancy.scope_key,
      batchSize,
      maxBatches,
      dryRun,
    });
    tableStats[t.key] = {
      source: t.source,
      target: t.target,
      rows: stat.rows,
      batches: stat.batches,
    };
  }
  out.tables = tableStats;

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
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

