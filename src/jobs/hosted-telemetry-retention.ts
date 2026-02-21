import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";
import { purgeMemoryRequestTelemetry } from "../control-plane.js";
import { formatError } from "../util/error-format.js";

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
  const olderThanHours = clampInt(
    Number(argValue("--older-than-hours") ?? String(env.CONTROL_TELEMETRY_RETENTION_HOURS)),
    1,
    24 * 3650,
  );
  const tenantId = (argValue("--tenant-id") ?? "").trim() || null;
  const batchLimit = clampInt(
    Number(argValue("--batch-limit") ?? String(env.CONTROL_TELEMETRY_PURGE_BATCH_LIMIT)),
    1,
    200_000,
  );
  const maxPasses = clampInt(Number(argValue("--max-passes") ?? "20"), 1, 1000);
  const strict = hasFlag("--strict");
  const outFileArg = argValue("--out");

  const passes: Array<{ pass: number; deleted: number; ok: boolean }> = [];
  let totalDeleted = 0;
  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const out = await purgeMemoryRequestTelemetry(db, {
      older_than_hours: olderThanHours,
      tenant_id: tenantId,
      batch_limit: batchLimit,
    });
    const deleted = Number((out as any)?.deleted ?? 0);
    passes.push({ pass, deleted, ok: !!(out as any)?.ok });
    totalDeleted += deleted;
    if (deleted < batchLimit) break;
  }

  const reachedPassLimit = passes.length === maxPasses && passes[passes.length - 1]?.deleted === batchLimit;
  const summary = {
    ok: !reachedPassLimit,
    strict,
    checked_at: new Date().toISOString(),
    tenant_id: tenantId,
    older_than_hours: olderThanHours,
    batch_limit: batchLimit,
    max_passes: maxPasses,
    passes: passes.length,
    total_deleted: totalDeleted,
    reached_pass_limit: reachedPassLimit,
    detail: passes,
  };

  if (outFileArg) {
    const outPath = path.resolve(outFileArg);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok && strict) {
    process.exitCode = 2;
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ ok: false, error: formatError(err) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db).catch(() => {});
  });
