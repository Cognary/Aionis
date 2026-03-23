# Aionis SDK V1 Package Shape

Date: 2026-03-23

## Goal

Define the first concrete package shape for the public Aionis SDK.

This document is intentionally narrower than the broader release-direction design.
Its goal is to answer:

1. what package should exist
2. what the first public modules should be
3. how examples should be organized
4. what should explicitly stay out of SDK v1

## Current Repository Reality

Current package state:

1. [packages/runtime-core](/Volumes/ziel/Aionisgo/packages/runtime-core) already exists
2. `@aionis/runtime-core` is currently a shared-boundary package, not the public SDK
3. the repository's strongest stable public behavior still lives at the HTTP route/runtime layer

Interpretation:

1. `@aionis/runtime-core` should remain a low-level shared boundary package
2. SDK v1 should be a new package layered on top of stable route contracts
3. SDK v1 should not require a consumer to think in raw route terms

## Recommended Public Package Layout

Recommended package sequence:

1. `@aionis/runtime-core`
2. `@aionis/sdk`

Meaning:

1. `@aionis/runtime-core`
   shared boundary and low-level contracts
2. `@aionis/sdk`
   first-class developer API for normal Aionis usage

Later optional packages:

1. `@aionis/mcp-adapter`
2. `@aionis/codex-adapter`
3. `@aionis/examples` or example-specific packages only if distribution pressure makes that worthwhile

## Recommended SDK V1 Scope

SDK v1 should wrap only the surfaces that already meet all three conditions:

1. current route contract is stable
2. behavior is benchmark-defended or route-defended
3. developer value is obvious in examples

### Included in SDK v1

Recommended modules:

1. `memory.write`
2. `memory.planningContext`
3. `memory.contextAssemble`
4. `memory.executionIntrospect`
5. `memory.tools.select`
6. `memory.tools.feedback`
7. `memory.replay.repairReview`
8. `memory.anchors.rehydratePayload`

### Excluded from SDK v1

Do not expose as first-class SDK v1 modules:

1. raw archive lifecycle controls
2. broad admin/control-plane surfaces
3. every internal governance operation name
4. unstable maintenance controls
5. server-only automation orchestration surfaces
6. MCP/Codex-specific abstractions

Reason:

1. SDK v1 should expose Aionis's strongest public story
2. weak or noisy surfaces should stay internal until they are clearly productized

## Recommended SDK API Shape

### Primary constructor

Recommended constructor:

```ts
import { createAionisClient } from "@aionis/sdk";

const aionis = createAionisClient({
  baseUrl: "http://127.0.0.1:8787",
});
```

### Recommended top-level namespaces

```ts
aionis.memory.write(...)
aionis.memory.planningContext(...)
aionis.memory.contextAssemble(...)
aionis.memory.executionIntrospect(...)

aionis.memory.tools.select(...)
aionis.memory.tools.feedback(...)

aionis.memory.replay.repairReview(...)

aionis.memory.anchors.rehydratePayload(...)
```

### Recommended option shape

SDK v1 should prefer:

1. explicit typed request objects
2. minimal transformation over runtime contracts
3. named namespaces matching the product story

SDK v1 should avoid:

1. over-abstracting current route semantics
2. inventing a second mental model detached from the runtime
3. mixing adapter-specific host concepts into the core client

## Recommended Internal Module Layout

Suggested package layout:

```text
packages/sdk/
  package.json
  README.md
  src/
    index.ts
    client.ts
    transport/
      http.ts
    modules/
      memory-write.ts
      planning-context.ts
      context-assemble.ts
      execution-introspect.ts
      tools-select.ts
      tools-feedback.ts
      replay-repair-review.ts
      anchors-rehydrate-payload.ts
    contracts/
      shared.ts
```

### Recommended responsibility split

1. `client.ts`
   public constructor and shared config
2. `transport/http.ts`
   low-level request execution
3. `modules/*`
   stable module wrappers around current route families
4. `contracts/*`
   shared reusable request/response ownership types when SDK-local composition is needed

## Recommended README Story For `@aionis/sdk`

The SDK README should lead with:

1. what Aionis is
2. what the SDK wraps
3. one short workflow-learning example
4. one short tool-feedback example

Recommended outline:

1. headline
2. quickstart
3. core modules
4. first examples
5. route-contract relationship
6. pointer to advanced docs

## Recommended Examples Structure

Do not start with a huge example zoo.
Start with a small set of examples that prove product value.

Suggested directory:

```text
examples/
  sdk/
    01-write-to-workflow-guidance/
    02-tool-feedback-to-trusted-pattern/
    03-replay-governed-learning/
    04-external-governance-shadow/
    05-minimal-agent-loop/
```

### Example 1: Write To Workflow Guidance

Goal:

1. show repeated continuity writes becoming stable workflow guidance

Should demonstrate:

1. `memory.write`
2. `memory.planningContext`

### Example 2: Tool Feedback To Trusted Pattern

Goal:

1. show pattern learning and selector reuse

Should demonstrate:

1. `tools.select`
2. `tools.feedback`
3. `executionIntrospect`

### Example 3: Replay-Governed Learning

Goal:

1. show replay review leading to governed learning projection

Should demonstrate:

1. `replay.repairReview`
2. `planningContext`

### Example 4: External Governance Shadow

Goal:

1. show that the same Aionis product surface can compare builtin governance to external LLM governance

Should demonstrate:

1. benchmark or example-level external HTTP config
2. outcome comparison

### Example 5: Minimal Agent Loop

Goal:

1. show Aionis under a simple agent loop without dragging in MCP or Codex

Should demonstrate:

1. write
2. plan
3. tool feedback
4. second-run improvement

## Relationship To `@aionis/runtime-core`

Recommended rule:

1. `@aionis/runtime-core` remains low-level and shared-boundary oriented
2. `@aionis/sdk` becomes the first public developer surface

This means:

1. SDK v1 should depend on stable contracts, not on every internal runtime helper
2. runtime-core should not be forced to become the full SDK by accretion
3. the public story should say "use `@aionis/sdk`", not "start from runtime-core"

## Packaging Recommendation

Recommended package metadata direction for SDK v1:

1. public package
2. ESM-first
3. typed client surface
4. no dependency on MCP/Codex host abstractions
5. examples runnable against a normal local Lite runtime

## What Should Happen After SDK V1

After SDK v1 is shaped:

1. rewrite top-level README examples to use SDK terminology
2. add the first example set
3. then, and only then, design downstream adapters

Adapter order should be:

1. optional MCP adapter
2. optional Codex adapter
3. optional IDE/framework adapters

## Final Recommendation

SDK v1 should be:

1. a new package
2. route-backed
3. small
4. stable-surface-first
5. example-driven

The package should not try to expose all of Aionis.
It should expose the part of Aionis that already best represents the product:

1. workflow learning
2. pattern learning
3. governed replay/workflow/tools behavior
4. planner-visible execution memory
