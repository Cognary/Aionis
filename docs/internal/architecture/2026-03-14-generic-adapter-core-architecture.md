# Generic Adapter Core Architecture

Date: 2026-03-14  
Repo context: `Aionis` + `clawbot-aionis-adapter`

## Summary

Aionis already has a real backend core:

- memory
- handoff
- policy
- replay
- SDK
- Lite / server runtime

What is missing for a **generic adapter** is not another Aionis core.  
What is missing is a **host-agnostic adapter control core** between:

1. the Aionis service surface
2. the host-specific runtime binding

Today, `@aionis/openclaw-adapter` contains both:

- reusable control logic
- OpenClaw-specific integration logic

That is acceptable for the first product version, but it is the wrong long-term shape if we want:

- multiple host runtimes
- cleaner testing
- reusable benchmark harnesses
- lower maintenance cost per host

The right next step is:

**keep shipping `@aionis/openclaw-adapter` as the product, while extracting a reusable adapter control core behind it.**

## The Problem

The current package mixes three different concerns:

1. **Aionis transport**
   - HTTP client and request payloads
2. **Control logic**
   - loop state
   - threshold evaluation
   - handoff / replay / stop policy
   - decision shaping
3. **OpenClaw binding**
   - hook names
   - plugin lifecycle
   - OpenClaw event shapes
   - plugin manifest / package integration

Only the third category is truly OpenClaw-specific.

The second category is the real candidate for generalization.

## Proposed Architecture

The architecture should be split into three layers.

### Layer 1: Aionis Service Core

This already exists outside this repository.

Responsibilities:

- execute `context/assemble`
- execute `rules/evaluate`
- execute `tools/select`
- accept `tools/feedback`
- accept `memory/write`
- execute `handoff/store`
- execute replay lookup and dispatch

This layer stays where it is.

### Layer 2: Adapter Control Core

This is the missing reusable layer.

Responsibilities:

- normalize host runtime events into a generic execution model
- maintain run state
- apply loop heuristics
- evaluate stop conditions
- decide when to:
  - continue
  - block
  - reroute
  - handoff
  - replay
- produce generic stop reasons and evidence records

This layer should be **host-agnostic**.

It should not know:

- OpenClaw hook names
- plugin manifests
- host package ids
- OpenClaw-specific message decoration details

### Layer 3: Host Binding

This is host-specific glue.

Responsibilities:

- map host events into adapter core input
- map adapter decisions back into host actions
- own packaging and installation shape for that host

For the current product, this is:

- `@aionis/openclaw-adapter`

Future bindings could be:

- `@aionis/langgraph-adapter`
- `@aionis/<host>-adapter`

## Recommended Package Shape

Do **not** immediately split into many npm packages.

First, split the source tree internally:

1. `src/core/`
2. `src/hosts/openclaw/`
3. `src/client/`
4. `src/types/`

Then, only publish additional packages if reuse becomes real.

### Phase 1 source layout

```text
src/
  client/
    aionis-http-client.ts
  core/
    control-engine.ts
    event-model.ts
    heuristics.ts
    decisions.ts
    state.ts
    policy.ts
    replay.ts
    handoff.ts
  hosts/
    openclaw/
      binding.ts
      plugin.ts
      types.ts
  index.ts
```

### Phase 2 package layout

Only if needed:

1. `@aionis/adapter-core`
2. `@aionis/openclaw-adapter`

The current repo can still remain the OpenClaw product repo even if the internal core is extracted first.

## What Belongs In Adapter Control Core

The following logic should move out of the OpenClaw-specific layer.

### 1. Normalized Event Model

Define generic runtime events:

- `run_started`
- `tool_call_requested`
- `tool_call_finished`
- `run_finished`
- `session_started`
- `session_finished`

Generic event payloads should use fields like:

- `runId`
- `sessionId`
- `agentId`
- `workspaceDir`
- `toolName`
- `toolParams`
- `toolResultSummary`
- `toolError`
- `durationMs`

This lets multiple hosts project their local lifecycle onto one model.

### 2. Run State

The following is already generic:

- `stepCount`
- `sameToolStreak`
- `duplicateObservationStreak`
- `noProgressStreak`
- `estimatedTokenBurn`
- `broadScanCount`
- `broadTestCount`
- `lastDecisionId`
- `forcedStopReason`

This belongs in the adapter control core, not in an OpenClaw-specific binding.

### 3. Heuristics

These are generic control heuristics:

- classify broad scan
- classify broad test
- infer progress from result summaries
- summarize tool result
- threshold evaluation

These should not depend on OpenClaw.

### 4. Decision Model

The generic control layer should return decisions like:

- `continue`
- `block`
- `rewrite_params`
- `selected_tool`
- `stop_reason`
- `dispatch_replay`
- `store_handoff`

The binding layer then translates those into host-native actions.

### 5. Replay / Handoff Control Policy

This part is generic:

- if loop thresholds are exceeded, decide whether replay is preferred
- if replay is unavailable, fall back to handoff
- record reason codes consistently

The host layer should not own this policy.

## What Must Stay In The OpenClaw Binding

The following is OpenClaw-specific and should stay there.

### 1. Hook Wiring

- `session_start`
- `session_end`
- `before_agent_start`
- `before_tool_call`
- `after_tool_call`
- `agent_end`
- `tool_result_persist`
- `before_message_write`

### 2. OpenClaw Event Shapes

The binding should own:

- OpenClaw run / tool context types
- OpenClaw message decoration format
- OpenClaw-specific fields like `sessionKey`

### 3. Packaging

- `openclaw.plugin.json`
- plugin entrypoint
- package install semantics
- OpenClaw plugin id

## Migration Strategy

This must be incremental.

Do not break the working product to chase purity.

### Phase 1: Internal Refactor Only

Goal:

- keep `@aionis/openclaw-adapter` behavior unchanged
- move reusable logic into `src/core/`

Actions:

1. move `src/adapter/state.ts` into `src/core/state.ts`
2. move `src/adapter/heuristics.ts` into `src/core/heuristics.ts`
3. introduce a generic event model in `src/core/event-model.ts`
4. rename `AionisLoopControlAdapter` to a host-agnostic control engine internally
5. keep the existing OpenClaw binding API stable

Success condition:

- all current tests still pass
- package output and public product behavior do not change

### Phase 2: Introduce Explicit OpenClaw Binding Layer

Goal:

- make OpenClaw integration visibly separate from control logic

Actions:

1. move `src/binding/openclaw-hook-binding.ts` under `src/hosts/openclaw/`
2. move `src/plugin.ts` under `src/hosts/openclaw/`
3. move OpenClaw-specific types under `src/hosts/openclaw/types.ts`
4. keep `src/index.ts` re-exporting the same public product API

Success condition:

- the package still installs into OpenClaw exactly the same way
- all benchmark scripts still run

### Phase 3: Adapter Kit Surface

Goal:

- allow future host bindings without cloning OpenClaw logic

Actions:

1. expose a generic control engine constructor
2. expose generic event input / decision output types
3. expose default heuristics and threshold policies

Success condition:

- a second host can be prototyped without touching OpenClaw binding internals

## ADR

### Decision

Extract a host-agnostic adapter control core from `@aionis/openclaw-adapter`, while keeping OpenClaw as the public product surface.

### Why

- preserves product focus
- reduces future duplication across hosts
- keeps current evidence and installation path intact
- creates a cleaner control model for benchmarking and testing

### Alternatives Considered

#### Alternative A: Keep everything in one package forever

Pros:

- least short-term work

Cons:

- every new host duplicates control logic
- testability stays weaker
- architectural boundaries keep blurring

Rejected.

#### Alternative B: Immediately publish multiple packages

Pros:

- clean external modularity early

Cons:

- unnecessary packaging complexity now
- weakens current OpenClaw product focus
- adds release overhead before reuse is proven

Rejected for now.

#### Alternative C: Internal extraction first, package split later if needed

Pros:

- lowest-risk path
- preserves shipping product
- enables future generalization

Chosen.

## Risks

### 1. Over-abstraction

Risk:

- abstracting too early around imagined hosts

Mitigation:

- only extract logic already proven generic in current code

### 2. Product dilution

Risk:

- losing the clear OpenClaw story while chasing genericity

Mitigation:

- keep `@aionis/openclaw-adapter` as the outward-facing product

### 3. Regression during refactor

Risk:

- breaking the currently working OpenClaw install and benchmark path

Mitigation:

- phase the refactor
- keep behavior identical in Phase 1
- require current benchmark harnesses to keep passing

## Recommended Next Step

The next implementation step should be narrow:

**Phase 1 internal extraction only.**

That means:

1. introduce `src/core/`
2. move generic state and heuristics there
3. rename the current adapter engine internally so it reads like a reusable control engine
4. leave public packaging, plugin id, and npm surface unchanged

This is enough to create the right architecture without destabilizing the working product.
