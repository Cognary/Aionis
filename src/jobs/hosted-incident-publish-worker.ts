import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";
import {
  claimControlIncidentPublishJob,
  markControlIncidentPublishJobFailed,
  markControlIncidentPublishJobSucceeded,
} from "../control-plane.js";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonObject(raw: string): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function main() {
  const workerId = (argValue("--worker-id") ?? `incident_publish_worker_${randomUUID()}`).trim();
  const tenantId = (argValue("--tenant-id") ?? "").trim() || undefined;
  const maxJobs = clampInt(Number(argValue("--max-jobs") ?? "20"), 1, 2000);
  const retryBaseSeconds = clampInt(Number(argValue("--retry-base-seconds") ?? "30"), 1, 24 * 3600);
  const retryMaxSeconds = clampInt(Number(argValue("--retry-max-seconds") ?? "900"), retryBaseSeconds, 7 * 24 * 3600);
  const idleSleepMs = clampInt(Number(argValue("--idle-sleep-ms") ?? "2000"), 100, 120_000);
  const loop = hasFlag("--loop");
  const strict = hasFlag("--strict");

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const rows: any[] = [];

  while (processed < maxJobs) {
    const job = await claimControlIncidentPublishJob(db, {
      worker_id: workerId,
      tenant_id: tenantId,
    });
    if (!job) {
      if (!loop) break;
      await sleep(idleSleepMs);
      continue;
    }

    const sourceDir = String(job.source_dir ?? "");
    const target = String(job.target ?? "");
    const runId = String(job.run_id ?? "");

    const cmd = ["scripts/hosted/publish-incident-bundle.sh", "--source-dir", sourceDir, "--target", target, "--run-id", runId];
    const res = spawnSync("bash", cmd, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });

    processed += 1;
    const stdout = String(res.stdout ?? "").trim();
    const stderr = String(res.stderr ?? "").trim();
    const outObj = parseJsonObject(stdout);
    const publishUri = typeof outObj.published_uri === "string" ? outObj.published_uri : null;

    if (res.status === 0) {
      await markControlIncidentPublishJobSucceeded(db, {
        id: String(job.id),
        published_uri: publishUri,
        response: outObj,
      });
      succeeded += 1;
      rows.push({
        id: job.id,
        status: "succeeded",
        published_uri: publishUri,
      });
      continue;
    }

    const attempts = clampInt(Number(job.attempts ?? 1), 1, 10000);
    const retryDelaySeconds = Math.min(retryMaxSeconds, retryBaseSeconds * 2 ** Math.max(0, attempts - 1));
    const errorMsg = stderr || stdout || `publish command failed with exit ${String(res.status ?? "unknown")}`;
    const marked = await markControlIncidentPublishJobFailed(db, {
      id: String(job.id),
      retry_delay_seconds: retryDelaySeconds,
      error: errorMsg.slice(0, 4000),
      response: {
        exit_code: res.status,
        stdout: stdout.slice(0, 8000),
        stderr: stderr.slice(0, 8000),
      },
    });
    failed += 1;
    rows.push({
      id: job.id,
      status: marked?.status ?? "failed",
      retry_delay_seconds: retryDelaySeconds,
      error: errorMsg.slice(0, 1000),
    });
  }

  const summary = {
    ok: failed === 0,
    strict,
    loop,
    worker_id: workerId,
    tenant_id: tenantId ?? null,
    processed,
    succeeded,
    failed,
    rows,
    checked_at: new Date().toISOString(),
  };

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
