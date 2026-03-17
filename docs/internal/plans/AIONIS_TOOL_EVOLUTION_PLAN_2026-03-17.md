# Aionis Tool Evolution Plan

Date: `2026-03-17`
Status: `design for post-phase-2 stabilization`
Depends on:
- [AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE2_PLAN_2026-03-16.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE2_PLAN_2026-03-16.md)
- [AIONIS_PROJECT_STATUS_2026-03-15.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_PROJECT_STATUS_2026-03-15.md)
- [AIONIS_STAGE_CLOSEOUT_AND_GTM_PLAN_2026-03-16.md](/Users/lucio/Desktop/Aionis/docs/internal/strategy/AIONIS_STAGE_CLOSEOUT_AND_GTM_PLAN_2026-03-16.md)
- [AIONIS_TOOL_EVOLUTION_RUNTIME_ROLLOUT_DECISION_2026-03-17.md](/Users/lucio/Desktop/Aionis/docs/internal/strategy/AIONIS_TOOL_EVOLUTION_RUNTIME_ROLLOUT_DECISION_2026-03-17.md)

## Summary

Aionis is already good at continuity and execution control, but it is not yet good at controlled tool migration.

Current reading:

1. kernel work is continuing
2. adapter-side runtime rollout is paused until the host can support real tool reroute
3. this plan remains valid, but runtime promotion is now explicitly gated by host capability

Today, the strongest runtime surfaces do this well:

1. restore execution state
2. assemble compact continuity context
3. constrain tool use by stage and policy
4. replay or hand off when the run should stop

What they do not yet do well is answer a different question:

**when a new tool or skill is introduced, how should Aionis safely migrate from an older successful path to the newer path without breaking completion?**

This plan defines that missing layer.

## Problem

The current system can easily become path-dependent.

That is a feature for continuity, but it becomes a limitation when better tools are added later.

Typical failure modes are:

1. a replayable path keeps preferring an older tool because it was part of the previous successful run
2. `tools/select` only filters or constrains the candidate set that the host already supplied, instead of understanding replacement relationships across tools
3. a newer tool exists, but the runtime treats it as unrelated because only raw tool names are available
4. a new tool reduces cost, but its completion effect is unknown
5. a new tool appears stronger, but replacing the old one silently could invalidate replay assumptions

In short:

**without a tool-evolution layer, continuity can preserve the wrong tool choice for too long.**

## Goals

This plan must achieve all of the following:

1. let Aionis understand tools as capability families, not only as names
2. allow a newer tool to become preferred without immediate unsafe replacement
3. prevent replay and continuity from hard-binding the runtime to obsolete tool names
4. preserve the existing completion-first promotion rule
5. make tool migration auditable and reversible

## Non-Goals

This plan does not attempt to:

1. build a fully generic tool marketplace
2. let the model freely discover arbitrary new tools with no policy guardrail
3. replace host-side candidate generation with unconstrained Aionis planning
4. promote tools on token or wall-clock gains alone
5. solve every multi-tool orchestration problem in one phase

## Current Constraint

The current OpenClaw adapter path usually sends `tools/select` a narrow candidate set, and in some paths it sends only the currently requested tool.

That means the current Aionis selector can often only decide:

1. allow this tool
2. deny this tool
3. prefer this tool among a very small set

It cannot reliably decide:

1. a new tool in the same family is now better
2. an old replay path should be migrated to a newer tool
3. a deprecated tool should still be tolerated only as fallback

So the missing abstraction is not more continuity. It is **tool evolution metadata**.

## Core Rule

Tool evolution must remain subordinate to the current product rule:

**completion first, controlled migration second, efficiency claims last.**

That means no tool promotion is allowed on token or wall-clock gains alone if the strongest-slice completion baseline drops.

## Phase A Boundary

Phase A is intentionally non-disruptive.

It adds registry metadata and response visibility, but it does not yet change:

1. final tool selection ordering
2. replay migration behavior
3. host-side candidate expansion

Phase A exists to make tool-family metadata visible before it becomes policy-bearing.

## Core Design

The main design move is:

**introduce a Tool Capability Registry that sits between raw tool names and runtime selection.**

This registry should let Aionis reason in three layers:

1. `tool name`
2. `capability family`
3. `promotion status`

That allows the system to distinguish between:

1. a totally different tool
2. a new version of the same capability
3. a temporary experimental candidate
4. a deprecated but still tolerated fallback

## Deliverable 1: Tool Capability Registry

Aionis should maintain a registry record for every governed tool or skill.

Each record should include at minimum:

1. `tool_name`
2. `capability_family`
3. `capability_tags`
4. `quality_tier`
5. `status`
6. `replacement_for`
7. `replaced_by`
8. `introduced_at`
9. `operator_note`

Suggested tiers:

1. `experimental`
2. `supported`
3. `preferred`
4. `deprecated`

Suggested statuses:

1. `active`
2. `disabled`
3. `shadow_only`

Example shape:

```json
{
  "tool_name": "read-source-focused-v2",
  "capability_family": "focused_repo_read",
  "capability_tags": ["repo_read", "file_targeted", "source"],
  "quality_tier": "preferred",
  "status": "active",
  "replacement_for": ["read-markdown-impl"],
  "replaced_by": [],
  "introduced_at": "2026-03-17",
  "operator_note": "preferred for source-targeted reads after strongest-slice validation"
}
```

## Deliverable 2: Family-Aware Tool Policy

`tools/select` should stop treating all candidates as unrelated names.

Instead, once candidates are supplied by the host, Aionis should:

1. normalize each candidate into a capability family
2. apply stage/profile filters at the family level first
3. apply tier preference inside each family second
4. keep deprecated tools available only when policy explicitly allows fallback

This gives a cleaner runtime rule:

1. filter by stage and safety first
2. prefer the best active tool in the same family second
3. only then fall back to older family members

This should be layered on top of the current:

1. allow list
2. deny list
3. prefer list
4. control-profile candidate filter

not replace them.

## Deliverable 3: Replay Compatibility Metadata

Replay and continuity must stop binding purely to raw tool names.

A replayable path should also record:

1. `capability_family`
2. `tool tier at capture time`
3. `compatibility assumptions`
4. `migration eligibility`

That enables three replay modes:

1. `exact replay`: use the original tool unchanged
2. `family-compatible replay`: preserve the path shape but swap to the current preferred tool in the same family
3. `replay blocked for migration review`: do not reuse automatically because the new tool is not contract-compatible

This is the key mechanism that prevents continuity from becoming stale path worship.

## Deliverable 4: Promotion Rules

The current completion-first discipline must remain the hard gate.

A tool may move:

1. `experimental -> supported`
2. `supported -> preferred`
3. `preferred -> deprecated`

only when the strongest relevant slice remains completion-safe.

Hard rule:

**no tool promotion is allowed on token or wall-clock improvement alone if the strongest-slice completion baseline drops.**

This matches the same rule already used for `tools/select` surface promotion.

## Deliverable 5: Host Candidate Strategy

Aionis cannot evolve tools if the host never gives it meaningful alternatives.

So the host integration must eventually expose a richer candidate set for important decisions.

Minimum host-side evolution should be:

1. include the current tool
2. include same-family preferred replacements when safe
3. include explicit fallback tools only when policy allows fallback

The host does not need to dump every possible tool.

It only needs to stop forcing the selector into a one-tool decision when a controlled family-aware decision is actually possible.

## Proposed Internal Layout

This can remain additive to the current tree.

Suggested additions:

```text
src/
  memory/
    tool-registry.ts
    tool-family-policy.ts
    tools-select.ts
    tool-selector.ts
  execution/
    replay-compatibility.ts
```

The goal is not more folders. The goal is to separate:

1. raw tool policy
2. capability-family normalization
3. promotion and deprecation metadata
4. replay migration decisions

## Rollout Sequence

### Phase A: Registry Only

Ship the capability registry and family metadata without changing replay.

Success means:

1. Aionis can understand new and old tools as the same family when appropriate
2. operators can mark preferred and deprecated tools explicitly
3. current tool selection remains backward-compatible
4. metadata is visible in `tools/select` responses before it becomes policy-bearing

### Phase B: Family-Aware Selection

Update `tools/select` so that family preference can influence final ordering.

Success means:

1. new preferred tools can be selected when they are present in the candidate set
2. deprecated tools are tolerated only as fallback
3. strongest-slice completion does not regress

### Phase C: Replay Migration Rules

Allow replay to migrate from exact tool names to family-compatible preferred tools where compatibility is explicit.

Success means:

1. old replay paths do not permanently freeze obsolete tools
2. migration is visible and auditable
3. unsupported migrations are blocked instead of guessed

## Validation Requirements

This work must be validated on real strongest slices.

Minimum evidence set:

1. one slice where a newer preferred tool replaces an older supported tool in the same family
2. one slice where replay remains exact because migration is not safe
3. one slice where a deprecated tool is still used only as controlled fallback

And for each validation:

1. reviewer-ready completion is the first gate
2. token and wall-clock are secondary signals
3. any completion regression blocks promotion

## Operational Readout

Operators should be able to answer all of these from logs or API metadata:

1. which tool family was selected
2. whether the chosen tool was `experimental`, `supported`, `preferred`, or `deprecated`
3. whether replay used exact or family-compatible migration
4. whether a deprecated tool was used because of explicit fallback
5. why a newer tool was not selected

Without this, tool evolution will become invisible drift.

## Exit Criteria

This plan is complete only when:

1. Aionis can represent governed tools as capability families rather than isolated names
2. `tools/select` can prefer newer tools in the same family when they are present and validated
3. replay no longer binds only to raw historical tool names
4. deprecated tools are still usable as explicit fallback, not silent default
5. strongest-slice completion remains the hard promotion gate

## Recommended Next Move

Do not open another phase for this.

The correct next step is:

1. add the registry and family metadata as an additive internal layer
2. validate it first on a narrow tool family with a clear old-tool/new-tool relationship
3. only then allow replay migration

That keeps the work aligned with the current product rule:

**completion first, controlled migration second, efficiency claims last.**
