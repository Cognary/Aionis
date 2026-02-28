import fs from "node:fs";
import path from "node:path";

import { buildTelemetryRollup, isTelemetryRecord } from "./embedded-snapshot-telemetry-rollup-common.mjs";
import { envString, toProbeFailure, writeJson } from "./probe-common.mjs";

function listFilesRecursive(rootDir) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  return out;
}

function parseJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const inputDir = envString("EMBEDDED_SNAPSHOT_TELEMETRY_ROLLUP_INPUT_DIR", "artifacts/backend_parity");
const outputFile = envString(
  "EMBEDDED_SNAPSHOT_TELEMETRY_ROLLUP_OUTPUT",
  "artifacts/backend_parity/rollup/embedded_snapshot_telemetry_rollup.json",
);
const failOnAnyFailed = envString("EMBEDDED_SNAPSHOT_TELEMETRY_ROLLUP_FAIL_ON_FAILED", "true") !== "false";

try {
  const files = listFilesRecursive(inputDir).filter((p) => p.toLowerCase().endsWith(".json"));
  const records = [];
  for (const filePath of files) {
    const parsed = parseJsonFile(filePath);
    if (!parsed || !isTelemetryRecord(parsed)) continue;
    records.push(parsed);
  }

  const rollup = buildTelemetryRollup(records);
  const out = {
    ...rollup,
    source: {
      input_dir: inputDir,
      scanned_json_files: files.length,
      telemetry_records: records.length,
    },
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(out, null, 2)}\n`);
  writeJson(process.stdout, out);

  if (failOnAnyFailed && out.totals.failed_samples > 0) {
    process.exit(1);
  }
} catch (err) {
  const out = toProbeFailure(err);
  writeJson(process.stderr, out);
  process.exit(1);
}
