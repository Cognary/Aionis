import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";
import { getTenantIncidentPublishSloReport } from "../control-plane.js";

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

function clampRate(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

async function main() {
  const tenantId = (argValue("--tenant-id") ?? env.MEMORY_TENANT_ID).trim();
  if (!tenantId) throw new Error("--tenant-id is required");
  const windowHours = clampInt(Number(argValue("--window-hours") ?? "24"), 1, 24 * 365);
  const baselineHours = clampInt(Number(argValue("--baseline-hours") ?? "168"), windowHours + 1, 24 * 365);
  const minJobs = clampInt(Number(argValue("--min-jobs") ?? "20"), 1, 1_000_000);
  const adaptiveMultiplier = clampRate(Number(argValue("--adaptive-multiplier") ?? "2"), 1, 20);
  const failureRateFloor = clampRate(Number(argValue("--failure-rate-floor") ?? "0.05"), 0, 1);
  const deadLetterRateFloor = clampRate(Number(argValue("--dead-letter-rate-floor") ?? "0.02"), 0, 1);
  const backlogWarningAbs = clampInt(Number(argValue("--backlog-warning-abs") ?? "200"), 1, 1_000_000);
  const deadLetterBacklogWarningAbs = clampInt(
    Number(argValue("--dead-letter-backlog-warning-abs") ?? "20"),
    1,
    1_000_000,
  );
  const deadLetterBacklogCriticalAbs = clampInt(
    Number(argValue("--dead-letter-backlog-critical-abs") ?? "50"),
    deadLetterBacklogWarningAbs,
    1_000_000,
  );
  const strict = hasFlag("--strict");
  const outFileArg = argValue("--out");

  const report = await getTenantIncidentPublishSloReport(db, {
    tenant_id: tenantId,
    window_hours: windowHours,
    baseline_hours: baselineHours,
    min_jobs: minJobs,
    adaptive_multiplier: adaptiveMultiplier,
    failure_rate_floor: failureRateFloor,
    dead_letter_rate_floor: deadLetterRateFloor,
    backlog_warning_abs: backlogWarningAbs,
    dead_letter_backlog_warning_abs: deadLetterBacklogWarningAbs,
    dead_letter_backlog_critical_abs: deadLetterBacklogCriticalAbs,
  });

  const summary = {
    ok: !!(report as any)?.ok && !(report as any)?.degraded,
    strict,
    checked_at: new Date().toISOString(),
    tenant_id: tenantId,
    degraded: !!(report as any)?.degraded,
    severity: (report as any)?.severity ?? null,
    warning_signals: Array.isArray((report as any)?.warning_signals) ? (report as any).warning_signals : [],
    critical_signals: Array.isArray((report as any)?.critical_signals) ? (report as any).critical_signals : [],
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
