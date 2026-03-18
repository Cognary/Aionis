import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function runRuntimeHandoffCli(args) {
  return spawnSync(process.execPath, ["--import", "tsx", "packages/aionis-doc/src/runtime-handoff-cli.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

function runStoreRequestCli(args) {
  return spawnSync(process.execPath, ["--import", "tsx", "packages/aionis-doc/src/handoff-store-cli.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

test("build-aionis-doc-handoff-store-request converts runtime handoff into handoff store payload", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-store-request-cli-"));
  const runtimePath = path.join(dir, "runtime-handoff.json");
  try {
    const handoff = runRuntimeHandoffCli([
      "packages/aionis-doc/fixtures/valid-workflow.aionis.md",
      "--out",
      runtimePath,
    ]);
    assert.equal(handoff.status, 0, handoff.stderr);

    const result = runStoreRequestCli([runtimePath, "--scope", "default", "--compact"]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.request_version, "aionis_doc_handoff_store_request_v1");
    assert.equal(parsed.handoff_kind, "task_handoff");
    assert.deepEqual(parsed.execution_artifacts, []);
    assert.deepEqual(parsed.execution_evidence, []);
    assert.equal(parsed.execution_state_v1.current_stage, "patch");
    assert.equal(parsed.execution_packet_v1.state_id, parsed.execution_state_v1.state_id);
    assert.deepEqual(parsed.execution_packet_v1.artifact_refs, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("build-aionis-doc-handoff-store-request writes payload to file", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-store-request-cli-"));
  const runtimePath = path.join(dir, "runtime-handoff.json");
  const outPath = path.join(dir, "handoff-store.json");
  try {
    const handoff = runRuntimeHandoffCli([
      "packages/aionis-doc/fixtures/valid-minimal.aionis.md",
      "--out",
      runtimePath,
    ]);
    assert.equal(handoff.status, 0, handoff.stderr);

    const result = runStoreRequestCli([
      runtimePath,
      "--out",
      outPath,
      "--memory-lane",
      "private",
      "--tag",
      "demo",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(parsed.memory_lane, "private");
    assert.ok(parsed.tags.includes("demo"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
