# Aionis Four Pillars Code Map

Date: `2026-03-17`  
Status: `working map`

## Purpose

This document maps the current Aionis codebase onto the four-pillar runtime architecture:

1. `Execution Memory`
2. `Execution Continuity`
3. `Execution Control`
4. `Execution Evaluation`

It is not a full repository index.

It is a practical map for:

1. locating the current runtime core
2. understanding which files define each pillar
3. keeping future work inside the four-pillar model

## 1. Execution Memory

`Execution Memory` is the state substrate.

### Core code

1. `src/execution/types.ts`
2. `src/execution/packet.ts`
3. `src/execution/profiles.ts`
4. `src/execution/state-store.ts`
5. `src/execution/transitions.ts`
6. `src/execution/index.ts`

### Route surfaces

1. `src/routes/memory-context-runtime.ts`
2. `src/routes/memory-write.ts`

### Related notes

These files define or persist:

1. `ExecutionState`
2. `ExecutionPacket`
3. `ControlProfile`
4. state-first overlays and execution artifacts

### Current tests

1. `scripts/ci/execution-continuity-phase2-state.test.mjs`
2. `scripts/ci/execution-continuity-phase2-context-assembly.test.mjs`
3. `scripts/ci/execution-continuity-phase2-memory-write.test.mjs`

## 2. Execution Continuity

`Execution Continuity` keeps the execution loop moving across boundaries.

### Core code

1. `src/routes/handoff.ts`
2. `src/memory/handoff.ts`
3. `src/execution/assemble.ts`

### Related notes

These files cover the current continuity loop:

1. handoff storage
2. handoff recovery
3. replay-oriented assembly
4. state-first continuity packet construction

### Current tests

1. `scripts/ci/execution-continuity-phase1.test.mjs`
2. `scripts/ci/execution-continuity-phase1-integration.test.ts`
3. `scripts/ci/execution-continuity-phase2-handoff-store.test.mjs`
4. `scripts/ci/execution-continuity-phase2-handoff-recover.test.mjs`

## 3. Execution Control

`Execution Control` constrains runtime behavior.

### Core code

1. `src/memory/tools-select.ts`
2. `src/memory/tool-selector.ts`
3. `src/memory/tool-registry.ts`
4. `src/routes/memory-feedback-tools.ts`

### Related notes

These files currently cover:

1. candidate filtering
2. control-profile-aware tool governance
3. narrow tool registry metadata
4. family-aware ordering logic

Important boundary:

`tool selection` here should still be read as a limited control surface, not a promoted first-class product promise.

### Current tests

1. `scripts/ci/control-profile-tools-select.test.mjs`
2. `scripts/ci/tool-registry.test.mjs`
3. `scripts/ci/tool-evolution-tools-select-route.test.mjs`

## 4. Execution Evaluation

`Execution Evaluation` judges whether execution outcomes are good enough to pass.

### Core code

1. `src/eval/types.ts`
2. `src/eval/score.ts`
3. `src/eval/summarize.ts`
4. `scripts/eval/execution-eval.ts`

### Related notes

These files currently power:

1. `execution_eval_v1`
2. benchmark artifact summarization
3. completion and reviewer-readiness gate reading
4. continuity / recovery / control-quality scoring

### Current tests

1. `scripts/ci/execution-eval-core.test.mjs`

## 5. Shared Cross-Pillar Files

Some files sit across more than one pillar.

### Shared contracts

1. `packages/sdk/src/types.ts`

Why it matters:

1. SDK types expose the runtime contract surface consumed by external callers
2. `tools/select`, continuity, and eval-facing contracts all depend on this layer staying consistent

## 6. Reading Order

If someone needs the fastest way to understand the current runtime, read in this order:

1. `docs/internal/architecture/AIONIS_RUNTIME_ARCHITECTURE_2026-03-17.md`
2. `docs/internal/architecture/AIONIS_FOUR_PILLARS_CODE_MAP_2026-03-17.md`
3. `src/execution/types.ts`
4. `src/routes/handoff.ts`
5. `src/memory/tools-select.ts`
6. `src/eval/summarize.ts`

## 7. Maintenance Rule

Any new runtime feature should be mappable to one of these four pillars.

If a new feature cannot be clearly classified as:

1. memory
2. continuity
3. control
4. evaluation

it should be treated as:

1. out of scope
2. unshaped
3. not ready for promotion
