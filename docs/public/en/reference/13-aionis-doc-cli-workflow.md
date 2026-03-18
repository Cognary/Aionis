---
title: "Aionis Doc CLI Workflow"
---

# Aionis Doc CLI Workflow

This page distinguishes two command surfaces:

1. the `@aionis/sdk` integrated CLI: `aionis doc ...`
2. the standalone binaries exposed by the `@aionis/doc` package

## SDK-Integrated CLI Path

If you use the current public main-CLI path, the entrypoints are:

1. `aionis doc compile`
2. `aionis doc execute`
3. `aionis doc runtime-handoff`
4. `aionis doc store-request`
5. `aionis doc publish`
6. `aionis doc recover`
7. `aionis doc resume`

## Compile

Use `compile` when you want compiler artifacts.

```bash
npx @aionis/sdk@0.2.20 doc compile ./workflow.aionis.md --emit all
```

Supported emit modes:

1. `all`
2. `ast`
3. `ir`
4. `graph`
5. `plan`
6. `diagnostics`

The `plan` mode emits a runtime-neutral `execution_plan_v1`, which is intended to become the primary compiled artifact for the future direct execution path.

## Execute

Use `execute` when you want an execution result directly from the document or from a compiled plan artifact.

```bash
npx @aionis/sdk@0.2.20 doc execute ./workflow.aionis.md
```

Supported input kinds:

1. `source`
2. `compile-envelope`
3. `plan`

This path produces a versioned `aionis_doc_execution_result_v1` and currently runs against a small local runtime with fixed demo modules. The important boundary change is that the public path is no longer continuity-only; it now includes a minimal direct execution path.

## Runtime Handoff

Use `runtime-handoff` when you want execution continuity payloads derived from a document.

```bash
npx @aionis/sdk@0.2.20 doc runtime-handoff ./workflow.aionis.md --scope default
```

This produces a versioned runtime handoff envelope with:

1. `execution_state_v1`
2. `execution_packet_v1`
3. `execution_ready_handoff`
4. `graph_summary`
5. optional `execution_result_summary` when an execution result is already available
6. optional `execution_artifacts` and `execution_evidence` when execution-side outputs exist

## Store Request

Use `store-request` when you want the explicit `/v1/handoff/store` payload.

```bash
npx @aionis/sdk@0.2.20 doc store-request ./runtime-handoff.json --scope default
```

This is useful for:

1. inspection
2. pipeline handoff
3. native handoff-store integration

## Publish

Use `publish` when you want to persist the document into Aionis handoff memory.

```bash
npx @aionis/sdk@0.2.20 doc publish ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
```

Supported input kinds:

1. `source`
2. `runtime-handoff`
3. `handoff-store-request`

## Recover

Use `recover` when you want the native recovered handoff and continuity payload back.

```bash
npx @aionis/sdk@0.2.20 doc recover ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
```

Supported input kinds:

1. `source`
2. `runtime-handoff`
3. `handoff-store-request`
4. `publish-result`

The `publish-result` mode is useful when publish already happened earlier and you only want the recover step.

## Resume

Use `resume` when you want recovered continuity to continue directly into `context/assemble -> tools/select -> tools/decision -> tools/run`.

```bash
npx @aionis/sdk@0.2.20 doc resume ./recover-result.json --input-kind recover-result --candidate resume_patch --candidate request_review --base-url http://127.0.0.1:3001 --scope default
```

Supported input kinds:

1. `source`
2. `runtime-handoff`
3. `handoff-store-request`
4. `publish-result`
5. `recover-result`

This command automatically chains:

1. recover when needed
2. `POST /v1/memory/context/assemble`
3. `POST /v1/memory/tools/select`
4. `POST /v1/memory/tools/decision`
5. `POST /v1/memory/tools/run`
6. a versioned `aionis_doc_resume_result_v1`

The result envelope explicitly carries:

1. `resume_summary`
2. `context_assemble_response`
3. `tools_select_response`
4. `tools_decision_response`
5. `tools_run_response`

If you explicitly pass `--feedback-outcome positive|negative|neutral`, the command also continues into:

1. `POST /v1/memory/tools/feedback`
2. with `tools_feedback_request` in the result envelope
3. and `tools_feedback_response` in the result envelope
4. plus a second `tools_run_post_feedback_response` read after the feedback write

The `resume_summary` block gives the compact view directly:

1. `selected_tool`
2. `resume_state`
3. `feedback_written`
4. `pre_feedback_run_status`
5. `post_feedback_run_status`
6. `lifecycle_transition`

`resume_state` is the machine-friendly verdict:

1. `inspection_only`
2. `feedback_applied`
3. `lifecycle_advanced`

Recommended read order:

1. read `resume_state` first when you only need the branch verdict
2. read `pre_feedback_run_status` and `post_feedback_run_status` when you need the exact transition

## Practical Flow

For authoring:

1. `doc compile`
2. `doc execute`
3. `doc runtime-handoff`

For persistence:

1. `doc publish`

For continuity recovery:

1. `doc recover`

For post-recover resume:

1. `doc resume`

## `@aionis/doc` Standalone Binaries

If you use the `@aionis/doc` package directly, the current entrypoints are:

1. `compile-aionis-doc`
2. `execute-aionis-doc`
3. `build-aionis-doc-runtime-handoff`
4. `build-aionis-doc-handoff-store-request`
5. `publish-aionis-doc-handoff`
6. `recover-aionis-doc-handoff`
7. `resume-aionis-doc-runtime`

These binaries and `aionis doc ...` describe the same workflow through two different surfaces:

1. `aionis doc ...` is intended for users of the main product CLI
2. the standalone binaries are closer to an internal package and lower-level integration surface

## Current Product Boundary

Today, the fully publicized path is the `aionis doc ...` integrated CLI exposed by `@aionis/sdk`. It now includes a minimal direct execution path, while continuity, publish, and recover still represent the richer Aionis-native integration layer.

The current public boundary is:

1. compile the document
2. emit `execution_plan_v1`
3. run a minimal local direct execution path
4. convert it into runtime continuity
5. publish it into handoff memory
6. recover it through the native recover endpoint
7. continue into `context/assemble -> tools/select -> tools/decision -> tools/run`

The `@aionis/doc` standalone package now has a minimal standalone release surface in-repo:

1. `aionis-doc:release-check`
2. `aionis-doc:pack-dry-run`
3. `aionis-doc:publish:dry-run`
4. `aionis-doc:publish`
5. the tag-driven `Aionis Doc Publish` workflow for `doc-v*`

Whether users can immediately run `npm install @aionis/doc@<version>` still depends on whether that version has already been published to npm.

## Read Next

1. [Aionis Doc Contracts](/public/en/reference/14-aionis-doc-contracts)
2. [Aionis Doc Examples](/public/en/reference/15-aionis-doc-examples)
3. [Aionis Doc Diagnostics](/public/en/reference/16-aionis-doc-diagnostics)
