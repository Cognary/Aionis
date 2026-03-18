import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function runCli(args) {
  return spawnSync(process.execPath, ["--import", "tsx", "packages/aionis-doc/src/runtime-handoff-cli.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

function runCompileCli(args) {
  return spawnSync(process.execPath, ["--import", "tsx", "packages/aionis-doc/src/cli.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

test("build-aionis-doc-runtime-handoff builds handoff from source input", () => {
  const result = runCli(["packages/aionis-doc/fixtures/valid-workflow.aionis.md", "--scope", "default"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.runtime_handoff_version, "aionis_doc_runtime_handoff_v1");
  assert.equal(parsed.source_doc_id, "workflow-001");
  assert.equal(parsed.execution_packet_v1.review_contract.required_outputs[0], "out.hero");
});

test("build-aionis-doc-runtime-handoff builds handoff from compile envelope input", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-runtime-handoff-cli-"));
  const envelopePath = path.join(dir, "compile-envelope.json");
  try {
    const compile = runCompileCli([
      "packages/aionis-doc/fixtures/valid-minimal.aionis.md",
      "--emit",
      "all",
      "--out",
      envelopePath,
    ]);
    assert.equal(compile.status, 0, compile.stderr);

    const result = runCli([
      envelopePath,
      "--input-kind",
      "compile-envelope",
      "--scope",
      "runtime-demo",
      "--compact",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.scope, "runtime-demo");
    assert.equal(parsed.source_doc_id, "demo-001");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("build-aionis-doc-runtime-handoff rejects compile-envelope input without IR artifacts", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-runtime-handoff-cli-"));
  const envelopePath = path.join(dir, "graph-envelope.json");
  try {
    const compile = runCompileCli([
      "packages/aionis-doc/fixtures/valid-minimal.aionis.md",
      "--emit",
      "graph",
      "--out",
      envelopePath,
    ]);
    assert.equal(compile.status, 0, compile.stderr);

    const result = runCli([envelopePath, "--input-kind", "compile-envelope"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires an envelope with IR artifacts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("build-aionis-doc-runtime-handoff writes output file", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-runtime-handoff-cli-"));
  const outPath = path.join(dir, "handoff.json");
  try {
    const result = runCli([
      "packages/aionis-doc/fixtures/valid-workflow.aionis.md",
      "--out",
      outPath,
      "--repo-root",
      ROOT,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    const parsed = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(parsed.execution_state_v1.resume_anchor.repo_root, ROOT);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
