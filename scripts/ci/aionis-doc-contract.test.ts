import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  AIONIS_DOC_COMPILE_RESULT_VERSION,
  AionisDocExecutionResultSchema,
  AionisDocCompileEnvelopeSchema,
  ExecutionModuleManifestSchema,
  buildCompileEnvelope,
  compileAndExecuteAionisDoc,
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
  assert.equal(parsed.artifacts.plan?.plan_version, "execution_plan_v1");
  assert.equal(parsed.artifacts.plan?.executions.length, 2);
  assert.deepEqual(parsed.artifacts.plan?.expected_outputs, ["out.hero"]);
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
  assert.equal(envelope.artifacts.plan, null);
});

test("execution result schema validates direct execution output", async () => {
  const result = await compileAndExecuteAionisDoc(await loadFixture("valid-minimal.aionis.md"));
  const parsed = AionisDocExecutionResultSchema.parse(result);
  assert.equal(parsed.execution_result_version, "aionis_doc_execution_result_v1");
  assert.equal(parsed.status, "success");
  assert.deepEqual(parsed.artifacts, []);
  assert.deepEqual(parsed.evidence, []);
  assert.equal(parsed.outputs["out.message"]?.message, "Hello from Aionis Doc: Say hello");
});

test("module manifest schema validates runtime-neutral module contracts", () => {
  const manifest = ExecutionModuleManifestSchema.parse({
    module: "custom.echo.v1",
    version: "1.0.0",
    deterministic: true,
    required_capabilities: ["direct_execution"],
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
  });

  assert.equal(manifest.module, "custom.echo.v1");
  assert.equal(manifest.output_contract?.kind, "object");
  assert.equal(manifest.artifact_contract?.kind, "object");
  assert.equal(manifest.evidence_contract?.kind, "object");
});
