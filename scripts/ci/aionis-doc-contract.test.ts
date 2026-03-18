import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  AIONIS_DOC_COMPILE_RESULT_VERSION,
  AionisDocCompileEnvelopeSchema,
  buildCompileEnvelope,
} from "../../packages/aionis-doc/src/index.js";
import { compileAionisDoc } from "../../packages/aionis-doc/src/compile.js";

const fixturesDir = path.resolve("packages/aionis-doc/fixtures");

async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(fixturesDir, name), "utf8");
}

test("compile envelope schema validates all-artifact output", async () => {
  const result = compileAionisDoc(await loadFixture("valid-workflow.aionis.md"));
  const envelope = buildCompileEnvelope({
    inputPath: path.join(fixturesDir, "valid-workflow.aionis.md"),
    emit: "all",
    result,
    generatedAt: "2026-03-18T00:00:00.000Z",
  });

  const parsed = AionisDocCompileEnvelopeSchema.parse(envelope);
  assert.equal(parsed.compile_result_version, AIONIS_DOC_COMPILE_RESULT_VERSION);
  assert.equal(parsed.summary.execution_count, 2);
  assert.equal(parsed.artifacts.graph?.edges.length, 2);
});

test("graph-only compile envelope preserves stable shape with null non-selected artifacts", async () => {
  const result = compileAionisDoc(await loadFixture("valid-workflow.aionis.md"));
  const envelope = buildCompileEnvelope({
    inputPath: path.join(fixturesDir, "valid-workflow.aionis.md"),
    emit: "graph",
    result,
    generatedAt: "2026-03-18T00:00:00.000Z",
  });

  assert.equal(envelope.selected_artifact, "graph");
  assert.equal(envelope.artifacts.ast, null);
  assert.equal(envelope.artifacts.ir, null);
  assert.equal(envelope.artifacts.graph?.doc_id, "workflow-001");
});
