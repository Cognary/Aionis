# Lite Testing Strategy

Last reviewed: 2026-03-23

This document defines how `Aionis Lite` should be tested in its current product shape.

The goal is not generic coverage.
The goal is to protect the execution-memory product contract.

## Core Principle

Lite should be tested as an `execution-memory-first runtime`, not as a collection of unrelated utility functions.

The highest-risk regressions are:

1. product route contract drift
2. execution-memory mainline behavior drift
3. default slim surface versus debug/operator surface drift
4. startup/runtime path breakage

## Test Stack

Lite testing should be treated as a five-layer stack plus one repeatable benchmark command:

1. `baseline`
2. `contract`
3. `mainline behavior`
4. `surface-boundary`
5. `smoke`
6. `real-task benchmark`

These layers serve different purposes and should not be collapsed into one mental bucket.

## 1. Baseline Tests

Purpose:

1. protect repository identity
2. protect source scope
3. protect startup and packaging assumptions
4. prevent server-only regressions from leaking back into Lite

Primary examples:

1. [scripts/ci/lite-startup-contract.test.mjs](../scripts/ci/lite-startup-contract.test.mjs)
2. [scripts/ci/lite-source-scope.test.mjs](../scripts/ci/lite-source-scope.test.mjs)
3. [scripts/ci/lite-release-baseline.test.mjs](../scripts/ci/lite-release-baseline.test.mjs)

What this layer should catch:

1. wrong startup command
2. wrong repository scope
3. accidental server-only route registration
4. broken release baseline assumptions

## 2. Contract Tests

Purpose:

1. protect stable product route shapes
2. protect planner packet and execution-kernel contract
3. protect public behavior of selector and replay-review surfaces

This is the highest-value test layer for Lite.

Primary surfaces:

1. `POST /v1/memory/planning/context`
2. `POST /v1/memory/context/assemble`
3. `POST /v1/memory/tools/select`
4. `POST /v1/memory/replay/playbooks/repair/review`
5. `POST /v1/memory/execution/introspect`

Primary examples:

1. [scripts/ci/lite-context-runtime-packet-contract.test.ts](../scripts/ci/lite-context-runtime-packet-contract.test.ts)
2. [scripts/ci/lite-tools-select-route-contract.test.ts](../scripts/ci/lite-tools-select-route-contract.test.ts)
3. [scripts/ci/lite-replay-governed-learning-projection-route.test.ts](../scripts/ci/lite-replay-governed-learning-projection-route.test.ts)
4. [scripts/ci/lite-execution-introspection-route.test.ts](../scripts/ci/lite-execution-introspection-route.test.ts)

What this layer should catch:

1. accidental response-shape drift
2. canonical versus mirror drift
3. planner packet / summary / execution-kernel misalignment
4. replay-review behavior drift at the route level

## 3. Mainline Behavior Tests

Purpose:

1. protect the two execution-memory product loops
2. protect trust and promotion semantics
3. protect workflow and pattern learning behavior

Primary loops:

1. `Anchor-Guided Rehydration Loop`
2. `Execution Policy Learning Loop`

Primary examples:

1. [scripts/ci/lite-replay-anchor.test.ts](../scripts/ci/lite-replay-anchor.test.ts)
2. [scripts/ci/lite-replay-learning-projection.test.ts](../scripts/ci/lite-replay-learning-projection.test.ts)
3. [scripts/ci/lite-tools-pattern-anchor.test.ts](../scripts/ci/lite-tools-pattern-anchor.test.ts)
4. [scripts/ci/lite-runtime-tool-hints.test.ts](../scripts/ci/lite-runtime-tool-hints.test.ts)
5. [scripts/ci/lite-anchor-rehydration-route.test.ts](../scripts/ci/lite-anchor-rehydration-route.test.ts)

What this layer should catch:

1. stable workflow not outranking candidate workflow
2. trusted pattern not affecting selector reuse
3. contested pattern not being down-ranked
4. explicit `tool.prefer` losing priority to history
5. stable workflow not suppressing duplicate candidate workflow entries
6. learning projection not producing Lite-visible results

## 4. Surface-Boundary Tests

Purpose:

1. protect the product boundary between default response and heavy inspection output
2. keep the default planner/context routes slim
3. keep debug/operator access explicit

This layer is now especially important because Lite has already slimmed the default planner/context response.

Current required boundary:

1. default `planning_context` must not return `layered_context`
2. default `context_assemble` must not return `layered_context`
3. `return_layered_context=true` must still return the explicit debug/operator view
4. `execution/introspect` remains the heavy execution-memory inspection route

Primary examples:

1. [scripts/ci/lite-context-runtime-packet-contract.test.ts](../scripts/ci/lite-context-runtime-packet-contract.test.ts)
2. [scripts/ci/lite-execution-introspection-route.test.ts](../scripts/ci/lite-execution-introspection-route.test.ts)

What this layer should catch:

1. accidental reintroduction of heavy fields onto default product surfaces
2. drift between slim product output and debug/operator output
3. hidden dependence on `layered_context` for canonical packet or summary generation

## 5. Smoke Tests

Purpose:

1. verify the runtime actually starts
2. verify critical live paths work end-to-end
3. catch environment or startup regressions that unit/contract tests may miss

Current commands:

```bash
npm run test:lite
npm run smoke:lite
npm run smoke:lite:local-process
npm run validate:lite:real
```

Primary script:

1. [scripts/lite-smoke.sh](../scripts/lite-smoke.sh)

What smoke should cover:

1. health/startup
2. automation kernel path
3. replay -> playbook promote path
4. sandbox session path

Smoke should stay small and real.
It should not become a duplicate of the full contract suite.

## 6. Real-Task Benchmark

Purpose:

1. prove current Lite product value with repeatable scenario runs
2. keep one command that demonstrates workflow learning, multi-step repair continuity, policy learning, and slim planner surfaces together
3. provide comparable benchmark output without bloating default CI

Current command:

```bash
npm run benchmark:lite:real
```

Baseline compare with regression gates:

```bash
npx tsx scripts/lite-real-task-benchmark.ts \
  --baseline-json /tmp/lite-benchmark-baseline.json \
  --fail-on-status-regression \
  --fail-on-hard-profile-drift \
  --fail-on-profile-drift \
  --max-suite-score-drop 0 \
  --max-scenario-score-drop 0
```

Stable suite-profile artifact:

```bash
npx tsx scripts/lite-real-task-benchmark.ts --out-json /tmp/lite-benchmark-baseline.json
```

Artifact mode:

```bash
npx tsx scripts/lite-real-task-benchmark.ts --out-json /tmp/lite-benchmark.json --out-md /tmp/lite-benchmark.md
```

Isolated full validation:

```bash
npm run validate:lite:real
```

Isolated validation against a stored baseline:

```bash
bash scripts/lite-real-validation.sh --baseline-json /tmp/lite-benchmark-baseline.json
```

Primary script:

1. [scripts/lite-real-task-benchmark.ts](../scripts/lite-real-task-benchmark.ts)

Current benchmark scenarios:

1. `policy_learning_loop`
2. `cross_task_isolation`
3. `nearby_task_generalization`
4. `contested_revalidation_cost`
5. `wrong_turn_recovery`
6. `workflow_progression_loop`
7. `multi_step_repair_loop`
8. `governed_learning_runtime_loop`
9. `governed_replay_runtime_loop`
10. `governance_provider_precedence_runtime_loop`
11. `custom_model_client_runtime_loop`
12. `slim_surface_boundary`

What this layer should catch:

1. route behavior that still passes narrow tests but no longer demonstrates product value
2. cross-task pattern-isolation regressions where nearby-task recall stops carrying affinity labels or accidentally reintroduces flat trusted reuse
3. nearby-task generalization regressions where same-family reuse stops working
4. contested-pattern recovery regressions, including duplicate-run versus fresh-run revalidation behavior
5. wrong-turn recovery regressions where selector continues to trust a contested path
6. workflow progression regressions across repeated execution continuity writes
7. workflow carry-forward regressions across longer inspect/patch/validate repair sequences
8. selector/pattern regressions across candidate, trusted, contested, and revalidated states
9. accidental reintroduction of heavy planner/context payload into default product surfaces
10. benchmark score drift across the fixed scenario set
11. scenario status regressions against a stored baseline artifact
12. scenario score regressions beyond an allowed threshold
13. benchmark profile drift across the stable core execution-memory metrics
14. hard-profile drift across the long-lived execution-memory product contract

Current stable suite profile keys:

1. `policy_learning.trusted_pattern_count_after_revalidation`
2. `policy_learning.contested_revalidation_fresh_runs_needed`
3. `workflow_progression.stable_workflow_count_after_second`
4. `multi_step_repair.stable_workflow_count_after_validate`
5. `governed_learning.workflow_promotion_state`
6. `governed_learning.tools_pattern_state`
7. `governed_learning.tools_credibility_state`
8. `governed_replay.replay_learning_rule_state`
9. `governed_replay.stable_workflow_count_after_replay`
10. `governance_provider_precedence.workflow_provider_override_blocked`
11. `governance_provider_precedence.tools_provider_override_blocked`
12. `governance_provider_precedence.tools_pattern_state`
13. `custom_model_client.workflow_governed_state`
14. `custom_model_client.tools_pattern_state`
15. `custom_model_client.replay_learning_rule_state`
16. `slim_surface_boundary.planning_has_layered_context`
17. `slim_surface_boundary.assemble_has_layered_context`

Current benchmark profile policy:

Hard regression indicators:

1. `workflow_progression.stable_workflow_count_after_second`
2. `multi_step_repair.stable_workflow_count_after_validate`
3. `governed_learning.workflow_promotion_state`
4. `governed_learning.tools_pattern_state`
5. `governed_learning.tools_credibility_state`
6. `governed_replay.replay_learning_rule_state`
7. `governed_replay.stable_workflow_count_after_replay`
8. `governance_provider_precedence.workflow_provider_override_blocked`
9. `governance_provider_precedence.tools_provider_override_blocked`
10. `custom_model_client.workflow_governed_state`
11. `custom_model_client.tools_pattern_state`
12. `custom_model_client.replay_learning_rule_state`
13. `slim_surface_boundary.planning_has_layered_context`
14. `slim_surface_boundary.assemble_has_layered_context`

Soft profile indicators:

1. `policy_learning.trusted_pattern_count_after_revalidation`
2. `policy_learning.contested_revalidation_fresh_runs_needed`
3. `governance_provider_precedence.tools_pattern_state`

## Current Command Model

Today the repository exposes:

1. `npm run test:lite`
2. `npm run smoke:lite`
3. `npm run smoke:lite:local-process`
4. `npm run benchmark:lite:real`
5. `npm run validate:lite:real`

This is acceptable for now, but conceptually `test:lite` already contains multiple layers at once.

Future cleanup should consider splitting it into:

1. `test:lite:baseline`
2. `test:lite:contract`
3. `test:lite:mainlines`
4. `test:lite:smoke`
5. `benchmark:lite:real`

This is an execution convenience improvement, not a correctness requirement.

## What Not To Over-Invest In

Lite should not currently over-invest in:

1. large volumes of low-value unit tests for tiny helpers
2. broad snapshot testing of evolving route payloads
3. UI-first end-to-end suites

Reason:

1. Lite risk is concentrated in runtime contracts and mainline behavior
2. not in isolated helper logic
3. and not in a broad UI layer

## Minimum PR Validation Rule

For changes that affect runtime, routes, or contracts:

1. run `npx tsc --noEmit`
2. run `npm run test:lite`
3. run `npm run smoke:lite` for startup/runtime-affecting changes
4. run `npm run benchmark:lite:real` for changes that affect workflow learning, tool-pattern learning, or planner/context slimness
5. prefer `npm run validate:lite:real` when you want one reviewable external workdir with smoke plus benchmark artifacts

For changes that specifically affect slim/default versus debug/operator boundaries:

1. rerun [scripts/ci/lite-context-runtime-packet-contract.test.ts](../scripts/ci/lite-context-runtime-packet-contract.test.ts)
2. confirm default planner/context responses remain slim

## Recommended Testing Priority

If test work must be prioritized, do it in this order:

1. contract tests
2. mainline behavior tests
3. surface-boundary tests
4. baseline tests
5. smoke tests

Reason:

1. contract drift is the fastest way to damage product stability
2. mainline behavior drift is the fastest way to damage Lite differentiation
3. surface-boundary drift is the fastest way to reintroduce response bloat

## Final Guidance

Lite should be tested as a product runtime with explicit execution-memory contracts.

The testing question is not:

`Did every helper function get covered?`

The testing question is:

`Did the execution-memory product surface, its two main loops, and its slim-versus-heavy boundary remain correct?`
