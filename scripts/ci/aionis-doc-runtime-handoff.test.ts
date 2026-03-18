import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  AIONIS_DOC_RUNTIME_HANDOFF_VERSION,
  AionisDocRuntimeHandoffError,
  AionisDocRuntimeHandoffSchema,
  ModuleRegistryExecutionRuntime,
  StaticModuleRegistry,
  buildCompileEnvelope,
  buildRuntimeHandoffV1,
  buildRuntimeHandoffV1FromEnvelope,
  compileAionisDoc,
  compileAndExecuteAionisDoc,
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
  assert.deepEqual(parsed.execution_packet_v1.artifact_refs, []);
  assert.equal(parsed.graph_summary.graph_node_count, 2);
  assert.equal(parsed.graph_summary.artifact_count, 0);
  assert.equal(parsed.graph_summary.evidence_count, 0);
  assert.equal(parsed.execution_result_summary, null);
});

test("runtime handoff maps execution artifacts and evidence into continuity payloads", async () => {
  const source = `
@doc {
  id: "handoff-artifacts-001"
  version: "1.0"
  kind: "workflow"
}

@context {
  text: "handoff ready"
}

@execute {
  module: "custom.bundle.v1"
  input_ref: "ctx"
  output_ref: "out.bundle"
}

@replay {
  executable: true
  mode: "assisted"
  expected_outputs: ["out.bundle"]
}
`;

  const runtime = new ModuleRegistryExecutionRuntime({
    runtime_id: "handoff_bundle_runtime_v1",
    capabilities: {
      evidence_capture: true,
    },
    registry: new StaticModuleRegistry([
      {
        manifest: {
          module: "custom.bundle.v1",
          version: "1.0.0",
          required_capabilities: ["direct_execution", "evidence_capture"],
          input_contract: {
            kind: "object",
            properties: {
              text: { kind: "string" },
            },
            required: ["text"],
            additional_properties: false,
          },
          output_contract: {
            kind: "object",
            properties: {
              text: { kind: "string" },
            },
            required: ["text"],
            additional_properties: false,
          },
          artifact_contract: {
            kind: "object",
            properties: {
              uri: { kind: "string" },
            },
            required: ["uri"],
            additional_properties: false,
          },
          evidence_contract: {
            kind: "object",
            properties: {
              claim: { kind: "string" },
            },
            required: ["claim"],
            additional_properties: false,
          },
        },
        handler: (input) => ({
          kind: "module_result",
          output: {
            text:
              typeof input === "object" && input !== null && !Array.isArray(input) && typeof input.text === "string"
                ? input.text
                : "unknown",
          },
          artifacts: [{ uri: "memory://artifacts/custom.bundle.v1/result.json" }],
          evidence: [{ claim: "Bundle artifact captured" }],
        }),
      },
    ]),
  });

  const result = compileAionisDoc(source);
  const executionResult = await compileAndExecuteAionisDoc(source, { runtime });
  const handoff = buildRuntimeHandoffV1({
    inputPath: "inline://handoff-artifacts-001",
    result,
    executionResult,
    scope: "default",
    generatedAt: "2026-03-18T00:00:00.000Z",
  });

  assert.equal(handoff.execution_result_summary?.runtime_id, "handoff_bundle_runtime_v1");
  assert.equal(handoff.graph_summary.artifact_count, 1);
  assert.equal(handoff.graph_summary.evidence_count, 1);
  assert.equal(handoff.execution_artifacts[0]?.ref, "artifact:out.bundle:1");
  assert.equal(handoff.execution_evidence[0]?.ref, "evidence:out.bundle:1");
  assert.deepEqual(handoff.execution_packet_v1.artifact_refs, ["artifact:out.bundle:1"]);
  assert.deepEqual(handoff.execution_packet_v1.evidence_refs, ["evidence:out.bundle:1"]);
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
