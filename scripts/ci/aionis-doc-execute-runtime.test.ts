import assert from "node:assert/strict";
import test from "node:test";

import {
  ModuleRegistryExecutionRuntime,
  StaticModuleRegistry,
  compileAndExecuteAionisDoc,
} from "../../packages/aionis-doc/src/index.js";

test("compileAndExecuteAionisDoc supports an injected module-registry runtime", async () => {
  const source = `
@doc {
  id: "custom-runtime-001"
  version: "1.0"
  kind: "workflow"
}

@context {
  text: "portable execution"
}

@execute {
  module: "custom.uppercase.v1"
  input_ref: "ctx"
  output_ref: "out.message"
}

@replay {
  executable: true
  mode: "assisted"
  expected_outputs: ["out.message"]
}
`;

  const runtime = new ModuleRegistryExecutionRuntime({
    runtime_id: "custom_registry_runtime_v1",
    registry: new StaticModuleRegistry([
      {
        manifest: {
          module: "custom.uppercase.v1",
          version: "1.0.0",
          description: "Uppercase one text field.",
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
              runtime: { kind: "string" },
            },
            required: ["text", "runtime"],
            additional_properties: false,
          },
          artifact_contract: {
            kind: "object",
            properties: {
              uri: { kind: "string" },
              kind: { kind: "string" },
            },
            required: ["uri", "kind"],
            additional_properties: false,
          },
          evidence_contract: {
            kind: "object",
            properties: {
              claim: { kind: "string" },
              confidence: { kind: "number" },
            },
            required: ["claim", "confidence"],
            additional_properties: false,
          },
        },
        handler: (input, context) => {
          const text =
            typeof input === "object" &&
            input !== null &&
            !Array.isArray(input) &&
            typeof input.text === "string"
              ? input.text
              : "unknown";
          return {
            kind: "module_result",
            output: {
              text: text.toUpperCase(),
              runtime: context.runtime_id,
            },
            artifacts: [
              {
                uri: "memory://artifacts/custom.uppercase.v1/output.txt",
                kind: "note",
              },
            ],
            evidence: [
              {
                claim: "Uppercase transformation completed",
                confidence: 0.99,
              },
            ],
          };
        },
      },
    ]),
  });

  const result = await compileAndExecuteAionisDoc(source, { runtime });
  assert.equal(result.execution_result_version, "aionis_doc_execution_result_v1");
  assert.equal(result.runtime_id, "custom_registry_runtime_v1");
  assert.equal(result.status, "success");
  assert.deepEqual(result.outputs["out.message"], {
    text: "PORTABLE EXECUTION",
    runtime: "custom_registry_runtime_v1",
  });
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0]?.execution_id, "out.message");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.node_results[0]?.artifacts?.[0]?.uri, "memory://artifacts/custom.uppercase.v1/output.txt");
  assert.equal(result.node_results[0]?.evidence?.[0]?.claim, "Uppercase transformation completed");
});

test("module-registry runtime fails gracefully when a module is unsupported", async () => {
  const source = `
@doc {
  id: "custom-runtime-unsupported-001"
  version: "1.0"
  kind: "workflow"
}

@execute {
  module: "custom.missing.v1"
  output_ref: "out.message"
}

@replay {
  executable: true
  mode: "assisted"
  expected_outputs: ["out.message"]
}
`;

  const runtime = new ModuleRegistryExecutionRuntime({
    runtime_id: "empty_registry_runtime_v1",
    registry: new StaticModuleRegistry([]),
  });

  const result = await compileAndExecuteAionisDoc(source, { runtime });
  assert.equal(result.runtime_id, "empty_registry_runtime_v1");
  assert.equal(result.status, "failed");
  assert.match(result.errors[0] ?? "", /custom\.missing\.v1/);
  assert.equal(result.node_results[0]?.status, "failed");
});

test("module-registry runtime enforces manifest output contracts", async () => {
  const source = `
@doc {
  id: "custom-runtime-invalid-output-001"
  version: "1.0"
  kind: "workflow"
}

@execute {
  module: "custom.invalid-output.v1"
  output_ref: "out.message"
}
`;

  const runtime = new ModuleRegistryExecutionRuntime({
    runtime_id: "invalid_output_runtime_v1",
    registry: new StaticModuleRegistry([
      {
        manifest: {
          module: "custom.invalid-output.v1",
          version: "1.0.0",
          output_contract: {
            kind: "object",
            properties: {
              message: { kind: "string" },
            },
            required: ["message"],
            additional_properties: false,
          },
        },
        handler: () => ({
          message: 42,
        }),
      },
    ]),
  });

  const result = await compileAndExecuteAionisDoc(source, { runtime });
  assert.equal(result.status, "failed");
  assert.match(result.errors[0] ?? "", /Output contract validation failed/);
});

test("module-registry runtime enforces manifest evidence contracts", async () => {
  const source = `
@doc {
  id: "custom-runtime-invalid-evidence-001"
  version: "1.0"
  kind: "workflow"
}

@execute {
  module: "custom.invalid-evidence.v1"
  output_ref: "out.message"
}
`;

  const runtime = new ModuleRegistryExecutionRuntime({
    runtime_id: "invalid_evidence_runtime_v1",
    registry: new StaticModuleRegistry([
      {
        manifest: {
          module: "custom.invalid-evidence.v1",
          version: "1.0.0",
          output_contract: {
            kind: "object",
            properties: {
              message: { kind: "string" },
            },
            required: ["message"],
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
        handler: () => ({
          kind: "module_result",
          output: {
            message: "ok",
          },
          evidence: [
            {
              claim: 42,
            },
          ],
        }),
      },
    ]),
  });

  const result = await compileAndExecuteAionisDoc(source, { runtime });
  assert.equal(result.status, "failed");
  assert.match(result.errors[0] ?? "", /Evidence contract validation failed/);
});
