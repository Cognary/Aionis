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

async function main() {
  const requestedScope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const requestedTenantId = argValue("--tenant-id") ?? env.MEMORY_TENANT_ID;
  const ensureScopePartition = hasFlag("--ensure-scope-partition");

  const tenancy = resolveTenantScope(
    { scope: requestedScope, tenant_id: requestedTenantId },
    { defaultScope: env.MEMORY_SCOPE, defaultTenantId: env.MEMORY_TENANT_ID },
  );

  const out: Record<string, unknown> = {
    ok: true,
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    scope_key: tenancy.scope_key,
    ensured_scope_partition: false,
    ensure_result: null,
    partitions: [] as unknown[],
  };

  if (ensureScopePartition) {
    const r = await db.pool.query<{ out: unknown }>(
      "SELECT aionis_partition_ensure_scope($1) AS out",
      [tenancy.scope_key],
    );
    out.ensured_scope_partition = true;
    out.ensure_result = r.rows[0]?.out ?? null;
  }

  const p = await db.pool.query<{ parent_table: string; partition_table: string; bound_expr: string }>(
    "SELECT parent_table, partition_table, bound_expr FROM aionis_partition_list_scope($1)",
    [tenancy.scope_key],
  );
  out.partitions = p.rows;

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

