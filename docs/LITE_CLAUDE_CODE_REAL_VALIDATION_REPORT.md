# Aionis Lite Claude Code Real Validation Report

This document records real HTTP validation runs against fresh Lite instances.

The goal is not to restate unit tests. The goal is to confirm that the execution-memory loops behave correctly on live routes with SQLite-backed Lite runtime state.

## Scope

Validated mainlines:

1. `Execution Policy Learning Loop`
   `tools/select -> tools/feedback -> candidate -> trusted -> contested -> revalidated trusted`
2. `Anchor-Guided Rehydration Loop`
   `stable workflow -> planning/context recall -> runtime guidance -> optional rehydration`
3. workflow lifecycle progression on route surfaces
   `observing candidate -> promotion-ready candidate -> stable workflow guidance`

## Runtime Setup

Validation runs used:

1. fresh temporary Lite SQLite databases
2. real HTTP routes
3. default Lite local actor identity
4. no mocked route responses

Representative routes exercised:

1. `POST /v1/memory/tools/select`
2. `POST /v1/memory/tools/feedback`
3. `POST /v1/memory/execution/introspect`
4. `POST /v1/memory/planning/context`
5. `POST /v1/memory/context/assemble`
6. `POST /v1/memory/replay/playbooks/repair/review`
7. `POST /v1/memory/write`

## Validation 1: Policy Learning

### What was tested

Real tool-selection loops were run across multiple independent feedback events:

1. first successful tool choice
2. second independent successful tool choice
3. negative counter-evidence
4. successful revalidation

### Observed route behavior

The loop progressed as expected:

1. first success created a `candidate` / `provisional` pattern
2. second independent success promoted it to `trusted` / `stable`
3. negative feedback demoted it to `contested`
4. later success revalidated it back to `trusted`

### Observed runtime surfaces

`POST /v1/memory/execution/introspect` reflected the same progression:

1. `candidate_pattern_count`
2. `trusted_pattern_count`
3. `contested_pattern_count`
4. transition states including:
   `candidate_observed`
   `promoted_to_trusted`
   `counter_evidence_opened`
   `revalidated_to_trusted`

`POST /v1/memory/tools/select` also proved the selector behavior was governed, not naive:

1. contested patterns remained visible
2. contested patterns were not trusted
3. selector explanations explicitly surfaced:
   `contested patterns visible but not trusted`

## Validation 2: Default Planner Surface Slimness

### What was tested

Planner/context routes were checked before and after the surface slimming changes.

### Observed route behavior

Default planner/context responses now keep the slim product surface:

1. `planner_packet`
2. `workflow_signals`
3. `pattern_signals`
4. `planning_summary` or `assembly_summary`
5. `execution_kernel`

Heavy assembly output is no longer returned by default.

### Debug/operator boundary

`layered_context` is only present when explicitly requested:

1. default `planning_context` does not include `layered_context`
2. default `context_assemble` does not include `layered_context`
3. `return_layered_context=true` restores the debug/operator surface

## Validation 3: Replay Producer Path To Planner Workflow Recall

### What was tested

A fresh Lite instance was seeded with a real `pending_review` replay playbook, then the following real route was exercised:

1. `POST /v1/memory/replay/playbooks/repair/review`
2. `learning_projection.enabled = true`

This validated the full producer path instead of hand-seeded planner fixtures.

### Observed route behavior

The repair review route succeeded and applied replay learning inline:

1. `learning_projection_result.triggered = true`
2. `delivery = sync_inline`
3. `status = applied`

### Observed workflow state

`POST /v1/memory/execution/introspect` showed the produced workflow state:

1. stable workflow visible in `recommended_workflows`
2. replay-learning episode visible in `candidate_workflows`

### Important bug found and fixed

During real validation, `planning_context` initially failed to recall the private workflow produced by the replay path, even though introspection could see it.

Root cause:

1. default `planning_context` / `context_assemble` requests did not inherit Lite `consumer_agent_id`
2. private workflow nodes were therefore filtered out of recall

Fix:

1. default Lite local actor identity is now injected for `planning_context`
2. default Lite local actor identity is now injected for `context_assemble`

After the fix:

1. `planning_context` consumed the private stable workflow
2. `workflow_signals` surfaced the stable workflow
3. `planning_summary.planner_explanation` included:
   `workflow guidance: Fix export failure`

## Validation 4: Workflow Candidate Maturity Progression

### What was tested

Using real `POST /v1/memory/write` requests, workflow-candidate episodes were written in three stages:

1. observing candidate with `observed_count = 1`
2. promotion-ready candidate with `observed_count = 2`
3. stable workflow anchor with matching `workflow_signature`

### Observed route behavior

#### Stage A: observing candidate

`planning_context` surfaced:

1. candidate workflow in `planner_packet.sections.candidate_workflows`
2. workflow signal with `promotion_ready = false`
3. explanation:
   `candidate workflows visible but not yet promoted`

#### Stage B: promotion-ready candidate

`planning_context` changed accordingly:

1. promotion-ready candidate sorted ahead of observing candidate
2. workflow signal with `promotion_ready = true`
3. explanation:
   `promotion-ready workflow candidates`

#### Stage C: stable workflow

After writing a stable workflow anchor with the same `workflow_signature`:

1. `recommended_workflows` became populated
2. `candidate_workflows` disappeared from the planner product surface
3. `workflow_signals` switched to a single `stable` workflow
4. explanation became:
   `workflow guidance: Fix export failure`

This confirms the route-level progression:

`observing -> promotion-ready -> stable guidance`

## Overall Conclusion

Real HTTP validation now supports these claims:

1. Lite genuinely learns tool-selection policy from repeated feedback
2. Lite genuinely governs that policy with counter-evidence and revalidation
3. Lite default planner/context routes are now slim product surfaces
4. Lite replay producer paths can generate workflow memory that the default planner surface can consume
5. Lite workflow surfaces change with maturity, not just existence

The most important practical conclusion is:

`Aionis Lite is not just storing history. It is learning execution policy and workflow guidance in live runtime behavior.`

## Remaining Observations

The core loops are now validated. Remaining items are product-quality refinements, not mainline correctness blockers.

Current examples:

1. some workflow text surfaces still display generic source labels
2. some compact text surfaces omit richer tool-set details even when the underlying node carries them
3. future demo/operator work can improve how these states are presented without changing the validated runtime behavior
