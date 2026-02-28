import fs from "node:fs";
import path from "node:path";

import { buildTelemetryHistory, isRollupSummary } from "./embedded-snapshot-telemetry-history-common.mjs";
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

function parseJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function extractRunIdFromPath(filePath) {
  const m = String(filePath).match(/run_(\d+)/);
  return m ? m[1] : "";
}

const inputDir = envString("EMBEDDED_SNAPSHOT_TELEMETRY_HISTORY_INPUT_DIR", "artifacts/backend_parity/history_input");
const outputFile = envString(
  "EMBEDDED_SNAPSHOT_TELEMETRY_HISTORY_OUTPUT",
  "artifacts/backend_parity/history/summary.json",
);
const failOnRecentFailure = envString("EMBEDDED_SNAPSHOT_TELEMETRY_HISTORY_FAIL_ON_RECENT_FAILURE", "false") === "true";

try {
  const files = listFilesRecursive(inputDir).filter((p) => p.toLowerCase().endsWith(".json"));
  const records = [];
  for (const filePath of files) {
    const payload = parseJson(filePath);
    if (!payload || !isRollupSummary(payload)) continue;
    records.push({
      payload,
      source_path: filePath,
      run_id_hint: extractRunIdFromPath(filePath),
    });
  }

  const out = {
    ...buildTelemetryHistory(records),
    source: {
      input_dir: inputDir,
      scanned_json_files: files.length,
      rollup_records: records.length,
    },
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(out, null, 2)}\n`);
  writeJson(process.stdout, out);

  if (failOnRecentFailure && out.latest && Number(out.latest.failed_samples || 0) > 0) {
    process.exit(1);
  }
} catch (err) {
  const out = toProbeFailure(err);
  writeJson(process.stderr, out);
  process.exit(1);
}
