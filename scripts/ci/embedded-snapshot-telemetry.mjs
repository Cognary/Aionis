import fs from "node:fs";
import path from "node:path";

import { buildEmbeddedSnapshotTelemetry } from "./embedded-snapshot-telemetry-common.mjs";
import { envString, toProbeFailure, writeJson } from "./probe-common.mjs";

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label}: invalid JSON (${filePath}): ${String(err?.message || err)}`);
  }
}

function envNumber(name, fallback) {
  const n = Number(envString(name, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
}

const label = "embedded-snapshot-telemetry";
const beforeFile = envString("EMBEDDED_SNAPSHOT_TELEMETRY_BEFORE_FILE", "/tmp/backend_parity_health.json");
const afterFile = envString("EMBEDDED_SNAPSHOT_TELEMETRY_AFTER_FILE", "/tmp/backend_parity_health_after.json");
const outputFile = envString("EMBEDDED_SNAPSHOT_TELEMETRY_OUTPUT", "/tmp/backend_parity_embedded_snapshot_telemetry.json");
const timelineDir = envString("EMBEDDED_SNAPSHOT_TELEMETRY_TIMELINE_DIR", "");
const profile = envString("BACKEND_PARITY_PROFILE", "");

try {
  const beforeHealth = readJsonFile(beforeFile, `${label}: before`);
  const afterHealth = readJsonFile(afterFile, `${label}: after`);

  const out = buildEmbeddedSnapshotTelemetry({
    beforeHealth,
    afterHealth,
    maxDroppedNodesGuard: envNumber("EMBEDDED_SNAPSHOT_MAX_DROPPED_NODES_GUARD", 32),
    maxPersistFailuresDeltaGuard: envNumber("EMBEDDED_SNAPSHOT_MAX_PERSIST_FAILURES_DELTA_GUARD", 0),
    maxLoadQuarantinedDeltaGuard: envNumber("EMBEDDED_SNAPSHOT_MAX_LOAD_QUARANTINED_DELTA_GUARD", 0),
  });

  const enriched = {
    ...out,
    profile: profile || null,
    run: {
      github_run_id: envString("GITHUB_RUN_ID", ""),
      github_run_attempt: envString("GITHUB_RUN_ATTEMPT", ""),
      github_sha: envString("GITHUB_SHA", ""),
    },
    sources: {
      before_file: beforeFile,
      after_file: afterFile,
    },
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(enriched, null, 2)}\n`);

  if (timelineDir) {
    fs.mkdirSync(timelineDir, { recursive: true });
    const runId = envString("GITHUB_RUN_ID", "local");
    const runAttempt = envString("GITHUB_RUN_ATTEMPT", "1");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeProfile = (profile || "default").replace(/[^a-zA-Z0-9._-]+/g, "_");
    const timelineFile = path.join(timelineDir, `${safeProfile}_${runId}_${runAttempt}_${stamp}.json`);
    fs.writeFileSync(timelineFile, `${JSON.stringify(enriched, null, 2)}\n`);
  }

  if (!enriched.ok) {
    writeJson(process.stderr, enriched);
    process.exit(1);
  }

  writeJson(process.stdout, enriched);
} catch (err) {
  const out = toProbeFailure(err);
  writeJson(process.stderr, out);
  process.exit(1);
}
