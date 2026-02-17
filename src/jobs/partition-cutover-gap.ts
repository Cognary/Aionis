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

async function main() {
  const requestedScope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const requestedTenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;

  const tenancy = resolveTenantScope(
    { scope: requestedScope, tenant_id: requestedTenantId },
    { defaultScope: env.MEMORY_SCOPE, defaultTenantId: env.MEMORY_TENANT_ID },
  );

  const hasFn = await db.pool.query<{ ok: boolean }>(
    "SELECT to_regprocedure('aionis_partition_cutover_gap(text)') IS NOT NULL AS ok",
  );
  if (!hasFn.rows[0]?.ok) {
    throw new Error("aionis_partition_cutover_gap(text) not found (apply migration 0017_partition_cutover_prepare.sql)");
  }

  const r = await db.pool.query<{
    table_name: string;
    legacy_count: string;
    v2_count: string;
    delta: string;
  }>(
    `
    SELECT table_name, legacy_count::text, v2_count::text, delta::text
    FROM aionis_partition_cutover_gap($1)
    ORDER BY table_name
    `,
    [tenancy.scope_key],
  );

  const rows = r.rows.map((x) => ({
    table_name: x.table_name,
    legacy_count: Number(x.legacy_count),
    v2_count: Number(x.v2_count),
    delta: Number(x.delta),
  }));

  const mismatched = rows.filter((x) => x.delta !== 0).length;
  const maxAbsDelta = rows.reduce((m, x) => Math.max(m, Math.abs(x.delta)), 0);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: mismatched === 0,
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        scope_key: tenancy.scope_key,
        summary: {
          tables: rows.length,
          mismatched,
          max_abs_delta: maxAbsDelta,
        },
        rows,
      },
      null,
      2,
    ),
  );
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

