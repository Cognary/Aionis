import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";
import { getTenantApiKeyUsageReport } from "../control-plane.js";

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
  const tenantId = (argValue("--tenant-id") ?? env.MEMORY_TENANT_ID).trim();
  if (!tenantId) throw new Error("--tenant-id is required");
  const windowHours = clampInt(Number(argValue("--window-hours") ?? "24"), 1, 24 * 365);
  const baselineHours = clampInt(Number(argValue("--baseline-hours") ?? "168"), windowHours + 1, 24 * 365);
  const minRequests = clampInt(Number(argValue("--min-requests") ?? "30"), 1, 1_000_000);
  const zscoreThreshold = Math.max(0.5, Math.min(100, Number(argValue("--zscore-threshold") ?? "3")));
  const limit = clampInt(Number(argValue("--limit") ?? "500"), 1, 1000);
  const strict = hasFlag("--strict");
  const outFileArg = argValue("--out");

  const report = await getTenantApiKeyUsageReport(db, {
    tenant_id: tenantId,
    window_hours: windowHours,
    baseline_hours: baselineHours,
    min_requests: minRequests,
    zscore_threshold: zscoreThreshold,
    limit,
    offset: 0,
    retention_hours: env.CONTROL_TELEMETRY_RETENTION_HOURS,
  });

  const items = Array.isArray((report as any)?.items) ? ((report as any).items as any[]) : [];
  const anomalies = items.filter((item) => !!item?.anomaly?.is_anomaly);
  const summary = {
    ok: !!(report as any)?.ok && anomalies.length === 0,
    strict,
    checked_at: new Date().toISOString(),
    tenant_id: tenantId,
    thresholds: {
      window_hours: windowHours,
      baseline_hours: baselineHours,
      min_requests: minRequests,
      zscore_threshold: zscoreThreshold,
    },
    anomalies: {
      count: anomalies.length,
      sample: anomalies.slice(0, 200),
    },
    report,
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
    console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db).catch(() => {});
  });
