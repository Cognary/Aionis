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
  return spawnSync(process.execPath, ["--import", "tsx", "packages/aionis-doc/src/execute-cli.ts", ...args], {
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

test("execute-aionis-doc executes source input through the local runtime", () => {
  const result = runCli(["packages/aionis-doc/fixtures/valid-minimal.aionis.md"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.execution_result_version, "aionis_doc_execution_result_v1");
  assert.equal(parsed.runtime_id, "local_demo_runtime_v1");
  assert.equal(parsed.status, "success");
  assert.equal(parsed.outputs["out.message"].message, "Hello from Aionis Doc: Say hello");
});

test("execute-aionis-doc executes compile-envelope input", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-execute-cli-"));
  const envelopePath = path.join(dir, "compile-envelope.json");
  try {
    const compile = runCompileCli([
      "packages/aionis-doc/fixtures/valid-workflow.aionis.md",
      "--emit",
      "all",
      "--out",
      envelopePath,
    ]);
    assert.equal(compile.status, 0, compile.stderr);

    const result = runCli([envelopePath, "--input-kind", "compile-envelope", "--compact"]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.doc_id, "workflow-001");
    assert.equal(parsed.outputs["out.hero"].hero, "EVA helps founders and operators continue work without rediscovery.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("execute-aionis-doc writes output to file", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aionis-doc-execute-cli-"));
  const outPath = path.join(dir, "execution-result.json");
  try {
    const result = runCli([
      "packages/aionis-doc/fixtures/valid-minimal.aionis.md",
      "--out",
      outPath,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    const parsed = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(parsed.status, "success");
    assert.equal(parsed.outputs["out.message"].message, "Hello from Aionis Doc: Say hello");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
