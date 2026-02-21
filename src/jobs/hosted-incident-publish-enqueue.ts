import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../config.js";
import { closeDb, createDb } from "../db.js";
import { enqueueControlIncidentPublishJob } from "../control-plane.js";

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

function parseMetadataJson(raw: string | null): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

async function main() {
  const tenantId = (argValue("--tenant-id") ?? env.MEMORY_TENANT_ID).trim();
  const runId = (argValue("--run-id") ?? "").trim();
  const sourceDir = path.resolve(argValue("--source-dir") ?? "");
  const target = (argValue("--target") ?? "").trim();
  const maxAttempts = clampInt(Number(argValue("--max-attempts") ?? "5"), 1, 100);
  const metadata = parseMetadataJson(argValue("--metadata-json"));
  const outFileArg = argValue("--out");

  if (!tenantId) throw new Error("--tenant-id is required");
  if (!runId) throw new Error("--run-id is required");
  if (!sourceDir) throw new Error("--source-dir is required");
  if (!target) throw new Error("--target is required");

  const job = await enqueueControlIncidentPublishJob(db, {
    tenant_id: tenantId,
    run_id: runId,
    source_dir: sourceDir,
    target,
    max_attempts: maxAttempts,
    metadata,
  });

  const summary = {
    ok: true,
    queued_at: new Date().toISOString(),
    job,
  };

  if (outFileArg) {
    const outPath = path.resolve(outFileArg);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
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
