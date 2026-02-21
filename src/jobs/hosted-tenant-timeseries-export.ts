import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";
import { getTenantDashboardSummary, getTenantRequestTimeseries } from "../control-plane.js";
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

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function nowRunId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function buildMarkdown(summary: any): string {
  const lines: string[] = [];
  lines.push("# Hosted Tenant Timeseries");
  lines.push("");
  lines.push(`1. tenant_id: \`${summary.tenant_id}\``);
  lines.push(`2. generated_at: \`${summary.generated_at}\``);
  lines.push(`3. window_hours: \`${summary.window_hours}\``);
  lines.push("");
  lines.push("## Endpoint Budget");
  lines.push("");
  lines.push("| endpoint | total | server_errors | throttled | error_budget_consumed | error_rate |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const r of summary.budget ?? []) {
    lines.push(
      `| ${r.endpoint} | ${r.total} | ${r.server_errors} | ${r.throttled} | ${r.error_budget_consumed} | ${r.error_rate} |`,
    );
  }
  lines.push("");
  lines.push("## Recent Series (sample)");
  lines.push("");
  lines.push("| bucket_utc | endpoint | total | budget_errors | error_rate | p95(ms) |");
  lines.push("|---|---|---:|---:|---:|---:|");
  for (const r of (summary.series ?? []).slice(-60)) {
    lines.push(`| ${r.bucket_utc} | ${r.endpoint} | ${r.total} | ${r.error_budget_consumed} | ${r.error_rate} | ${r.latency_p95_ms} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const tenantId = (argValue("--tenant-id") ?? env.MEMORY_TENANT_ID).trim();
  if (!tenantId) throw new Error("--tenant-id is required");
  const windowHours = clampInt(Number(argValue("--window-hours") ?? "168"), 1, 24 * 30);
  const runId = argValue("--run-id") ?? nowRunId();
  const outDir = path.resolve(argValue("--out-dir") ?? path.join("artifacts", "hosted_timeseries", `${tenantId}_${runId}`));

  const timeseries = await getTenantRequestTimeseries(db, {
    tenant_id: tenantId,
    window_hours: windowHours,
    bucket: "hour",
  });
  const dashboard = await getTenantDashboardSummary(db, {
    tenant_id: tenantId,
    default_tenant_id: env.MEMORY_TENANT_ID,
  });

  const summary = {
    ...timeseries,
    ok: !!(timeseries as any)?.ok,
    tenant_id: tenantId,
    generated_at: new Date().toISOString(),
    window_hours: windowHours,
    dashboard,
    artifacts: {
      out_dir: outDir,
      summary_json: path.join(outDir, "summary.json"),
      report_md: path.join(outDir, "TIMESERIES_REPORT.md"),
    },
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(path.join(outDir, "TIMESERIES_REPORT.md"), buildMarkdown(summary), "utf8");

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
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
