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
  return spawnSync(process.execPath, ["--import", "tsx", "packages/aionis-doc/src/cli.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

test("compile-aionis-doc emits full compile envelope for a valid fixture", () => {
  const result = runCli(["packages/aionis-doc/fixtures/valid-minimal.aionis.md"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.command, "compile-aionis-doc");
  assert.equal(parsed.compile_result_version, "aionis_doc_compile_result_v1");
  assert.equal(parsed.artifacts.ir.doc.id, "demo-001");
  assert.equal(parsed.artifacts.graph.nodes.length, 1);
  assert.equal(parsed.summary.has_errors, false);
});

test("compile-aionis-doc supports graph-only output", () => {
  const result = runCli([
    "packages/aionis-doc/fixtures/valid-workflow.aionis.md",
    "--emit",
    "graph",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.selected_artifact, "graph");
  assert.equal(parsed.artifacts.ast, null);
  assert.equal(parsed.artifacts.ir, null);
  assert.equal(parsed.artifacts.graph.doc_id, "workflow-001");
  assert.equal(parsed.artifacts.graph.nodes.length, 2);
});

test("compile-aionis-doc strict mode exits non-zero on compiler errors", () => {
  const result = runCli([
    "packages/aionis-doc/fixtures/unresolved-ref.aionis.md",
    "--strict",
    "--emit",
    "diagnostics",
  ]);
  assert.equal(result.status, 1, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.selected_artifact, "diagnostics");
  assert.equal(parsed.artifacts.ast, null);
  assert.equal(parsed.artifacts.ir, null);
  assert.equal(parsed.artifacts.graph, null);
  assert.ok(parsed.diagnostics.some((item) => item.code === "UNRESOLVED_REF"));
});

test("compile-aionis-doc writes output to a file when --out is provided", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-cli-"));
  const outPath = path.join(dir, "compiled.json");
  try {
    const result = runCli([
      "packages/aionis-doc/fixtures/valid-minimal.aionis.md",
      "--emit",
      "ir",
      "--out",
      outPath,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    const parsed = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(parsed.selected_artifact, "ir");
    assert.equal(parsed.artifacts.ir.doc.id, "demo-001");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
