import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  AIONIS_DOC_RUNTIME_HANDOFF_VERSION,
  AionisDocRuntimeHandoffError,
  AionisDocRuntimeHandoffSchema,
  buildCompileEnvelope,
  buildRuntimeHandoffV1,
  buildRuntimeHandoffV1FromEnvelope,
  compileAionisDoc,
} from "../../packages/aionis-doc/src/index.js";

const fixturesDir = path.resolve("packages/aionis-doc/fixtures");

async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(fixturesDir, name), "utf8");
}

test("runtime handoff builds execution state and packet from a valid compile result", async () => {
  const result = compileAionisDoc(await loadFixture("valid-workflow.aionis.md"));
  const handoff = buildRuntimeHandoffV1({
    inputPath: path.join(fixturesDir, "valid-workflow.aionis.md"),
    result,
    scope: "default",
    generatedAt: "2026-03-18T00:00:00.000Z",
    repoRoot: "/Users/lucio/Desktop/Aionis",
  });

  const parsed = AionisDocRuntimeHandoffSchema.parse(handoff);
  assert.equal(parsed.runtime_handoff_version, AIONIS_DOC_RUNTIME_HANDOFF_VERSION);
  assert.equal(parsed.execution_state_v1.current_stage, "patch");
  assert.equal(parsed.execution_packet_v1.review_contract?.required_outputs[0], "out.hero");
  assert.equal(parsed.graph_summary.graph_node_count, 2);
});

test("runtime handoff can be reconstructed from an all-artifact compile envelope", async () => {
  const result = compileAionisDoc(await loadFixture("valid-minimal.aionis.md"));
  const envelope = buildCompileEnvelope({
    inputPath: path.join(fixturesDir, "valid-minimal.aionis.md"),
    emit: "all",
    result,
    generatedAt: "2026-03-18T00:00:00.000Z",
  });

  const handoff = buildRuntimeHandoffV1FromEnvelope({
    envelope,
    scope: "default",
    generatedAt: "2026-03-18T00:00:00.000Z",
  });

  assert.equal(handoff.source_doc_id, "demo-001");
  assert.equal(handoff.execution_packet_v1.next_action, "Produce expected outputs: out.message");
});

test("runtime handoff rejects compile envelopes that omit IR artifacts", async () => {
  const result = compileAionisDoc(await loadFixture("valid-minimal.aionis.md"));
  const envelope = buildCompileEnvelope({
    inputPath: path.join(fixturesDir, "valid-minimal.aionis.md"),
    emit: "graph",
    result,
    generatedAt: "2026-03-18T00:00:00.000Z",
  });

  assert.throws(
    () => buildRuntimeHandoffV1FromEnvelope({ envelope }),
    (error: unknown) =>
      error instanceof AionisDocRuntimeHandoffError && /requires an envelope with IR artifacts/.test(error.message),
  );
});

test("runtime handoff refuses compile results with errors by default", async () => {
  const result = compileAionisDoc(await loadFixture("unresolved-ref.aionis.md"));
  assert.throws(
    () =>
      buildRuntimeHandoffV1({
        inputPath: path.join(fixturesDir, "unresolved-ref.aionis.md"),
        result,
      }),
    (error: unknown) =>
      error instanceof AionisDocRuntimeHandoffError && /error-free compile result/.test(error.message),
  );
});
