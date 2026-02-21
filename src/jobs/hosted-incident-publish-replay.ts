import "dotenv/config";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";
import { replayControlIncidentPublishJobs } from "../control-plane.js";

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

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function parseStatuses(raw: string | null): Array<"failed" | "dead_letter"> {
  if (!raw || raw.trim().length === 0) return ["dead_letter", "failed"];
  const out: Array<"failed" | "dead_letter"> = [];
  for (const item of raw.split(",")) {
    const v = item.trim();
    if (v === "failed" || v === "dead_letter") out.push(v);
  }
  return out.length > 0 ? out : ["dead_letter", "failed"];
}

async function main() {
  const tenantId = (argValue("--tenant-id") ?? "").trim() || undefined;
  const limit = clampInt(Number(argValue("--limit") ?? "100"), 1, 500);
  const statuses = parseStatuses(argValue("--statuses"));
  const ids = parseIds(argValue("--ids"));
  const resetAttempts = !hasFlag("--no-reset-attempts");
  const reason = (argValue("--reason") ?? "manual_replay").trim();
  const strict = hasFlag("--strict");

  const jobs = await replayControlIncidentPublishJobs(db, {
    tenant_id: tenantId,
    statuses,
    ids,
    limit,
    reset_attempts: resetAttempts,
    reason,
  });

  const summary = {
    ok: true,
    strict,
    tenant_id: tenantId ?? null,
    replayed_count: jobs.length,
    statuses,
    ids_count: ids.length,
    limit,
    reset_attempts: resetAttempts,
    reason,
    jobs,
    checked_at: new Date().toISOString(),
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));

  if (strict && jobs.length === 0) {
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
