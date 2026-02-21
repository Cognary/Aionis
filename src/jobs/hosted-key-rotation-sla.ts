import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";
import { listStaleControlApiKeys } from "../control-plane.js";
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
  const maxAgeDays = clampInt(Number(argValue("--max-age-days") ?? "30"), 1, 3650);
  const warnAgeDays = clampInt(Number(argValue("--warn-age-days") ?? "21"), 1, maxAgeDays);
  const rotationWindowDays = clampInt(Number(argValue("--rotation-window-days") ?? "30"), 1, 3650);
  const limit = clampInt(Number(argValue("--limit") ?? "200"), 1, 2000);
  const strict = hasFlag("--strict");
  const outFileArg = argValue("--out");

  const out = await listStaleControlApiKeys(db, {
    max_age_days: maxAgeDays,
    warn_age_days: warnAgeDays,
    rotation_window_days: rotationWindowDays,
    limit,
  });

  const staleCount = Number((out as any)?.stale?.count ?? 0);
  const missingRotationTenants = Array.isArray((out as any)?.tenants_without_recent_rotation)
    ? (out as any).tenants_without_recent_rotation.length
    : 0;
  const ok = !!(out as any)?.ok && staleCount === 0;

  const summary = {
    ok,
    strict,
    checked_at: (out as any)?.checked_at ?? new Date().toISOString(),
    thresholds: (out as any)?.thresholds ?? {
      max_age_days: maxAgeDays,
      warn_age_days: warnAgeDays,
      rotation_window_days: rotationWindowDays,
    },
    stale_count: staleCount,
    warning_count: Number((out as any)?.warning_window?.count ?? 0),
    tenants_without_recent_rotation: missingRotationTenants,
    details: out,
  };

  if (outFileArg) {
    const outPath = path.resolve(outFileArg);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));

  if (!ok && strict) {
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
