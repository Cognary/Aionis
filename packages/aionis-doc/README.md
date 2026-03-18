# @aionis/doc

Parser, compiler, and handoff toolchain for Aionis Doc.

## Install

```bash
npm i @aionis/doc@0.2.20
```

This package exposes standalone binaries for the Aionis Doc workflow:

```bash
npx @aionis/doc@0.2.20 compile-aionis-doc ./workflow.aionis.md --emit all
npx @aionis/doc@0.2.20 execute-aionis-doc ./workflow.aionis.md
npx @aionis/doc@0.2.20 build-aionis-doc-runtime-handoff ./workflow.aionis.md --scope default
npx @aionis/doc@0.2.20 build-aionis-doc-handoff-store-request ./runtime-handoff.json --scope default
npx @aionis/doc@0.2.20 publish-aionis-doc-handoff ./workflow.aionis.md --base-url http://127.0.0.1:3001
npx @aionis/doc@0.2.20 recover-aionis-doc-handoff ./workflow.aionis.md --base-url http://127.0.0.1:3001
npx @aionis/doc@0.2.20 resume-aionis-doc-runtime ./recover-result.json --input-kind recover-result --candidate resume_patch --candidate request_review
```

## CLI Surface

1. `compile-aionis-doc`
2. `execute-aionis-doc`
3. `build-aionis-doc-runtime-handoff`
4. `build-aionis-doc-handoff-store-request`
5. `publish-aionis-doc-handoff`
6. `recover-aionis-doc-handoff`
7. `resume-aionis-doc-runtime`

## Package Usage

```ts
import {
  compileAionisDoc,
  compileAndExecuteAionisDoc,
  buildRuntimeHandoffV1,
  buildHandoffStoreRequestFromRuntimeHandoff,
  ModuleRegistryExecutionRuntime,
  StaticModuleRegistry,
} from "@aionis/doc";

const result = compileAionisDoc(sourceText);

const handoff = buildRuntimeHandoffV1({
  inputPath: "./workflow.aionis.md",
  result,
  scope: "default",
  repoRoot: process.cwd(),
});

const storeRequest = buildHandoffStoreRequestFromRuntimeHandoff({
  handoff,
  scope: "default",
});

const runtime = new ModuleRegistryExecutionRuntime({
  runtime_id: "custom_runtime_v1",
  registry: new StaticModuleRegistry([
    {
      manifest: {
        module: "custom.echo.v1",
        version: "1.0.0",
        description: "Echo a text payload.",
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
      },
      handler: (input) => ({
        kind: "module_result",
        output: input,
        artifacts: [{ uri: "memory://artifacts/custom.echo.v1/result.json" }],
        evidence: [{ claim: "Echo module returned the input payload." }],
      }),
    },
  ]),
});

const executionResult = await compileAndExecuteAionisDoc(sourceText, { runtime });
```

The module contract is now split into:

1. `manifest`: stable runtime-neutral metadata and input/output contracts
2. `artifact_contract` and `evidence_contract`: optional structured side-output contracts
3. `handler`: the runtime-specific implementation

## Local Release Checks

From the repository root:

```bash
npm run aionis-doc:build
npm run aionis-doc:test
npm run aionis-doc:cli:test
npm run aionis-doc:execute:cli:test
npm run aionis-doc:handoff:cli:test
npm run aionis-doc:store-request:cli:test
npm run aionis-doc:publish:cli:test
npm run aionis-doc:recover:cli:test
npm run aionis-doc:release-check
npm run aionis-doc:pack-dry-run
```
