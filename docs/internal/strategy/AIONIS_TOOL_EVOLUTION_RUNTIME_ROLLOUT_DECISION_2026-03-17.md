---
title: "Tool Evolution Runtime Rollout Decision"
---

# Tool Evolution Runtime Rollout Decision

Date: `2026-03-17`  
Status: `runtime rollout paused, kernel work continues`

Related:

1. [Tool Evolution Plan](../plans/AIONIS_TOOL_EVOLUTION_PLAN_2026-03-17.md)
2. [Phase 2 Plan](../plans/AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE2_PLAN_2026-03-16.md)
3. [Project Status](../progress/AIONIS_PROJECT_STATUS_2026-03-15.md)
4. [Stage Closeout and GTM Plan](AIONIS_STAGE_CLOSEOUT_AND_GTM_PLAN_2026-03-16.md)

## Decision

Tool Evolution should continue on the **Aionis kernel path**, but the **adapter-side runtime rollout is paused** until the host can support real tool reroute.

The current decision is:

1. keep Tool Evolution Phase A and Phase B in `Aionis main`
2. do not merge the current adapter-side host candidate expansion experiment
3. do not continue repeated benchmark promotion on the current block-only runtime contract
4. do not start replay migration work yet

This is not a rollback of Tool Evolution. It is a scope correction.

## What Has Landed

The following kernel work is already valid and should stay in `main`:

1. tool registry primitives
2. family metadata in `tools/select`
3. family-aware ordering inside a known capability family
4. explicit policy precedence over family-aware ordering
5. route-level and focused CI coverage for the above

This work improves the kernel's ability to understand new-versus-old tool relationships without yet forcing runtime migration.

## What Was Tested on the Adapter Path

A narrow adapter-side runtime experiment was built on a separate branch.

The experiment did only this:

1. expand `before_tool_call` candidates from the current tool to a same-family pair
2. let Aionis select between those candidates
3. keep the current host behavior unchanged if a different tool is selected

The experiment was intentionally narrow:

1. one known tool family
2. no replay migration
3. no broad candidate expansion
4. no host-side tool-name reroute

Focused adapter tests passed and a strongest-slice real smoke stayed route-safe.

## Why Runtime Rollout Is Paused

The current OpenClaw hook contract cannot perform a true tool reroute.

Today, `before_tool_call` can effectively do only two things:

1. rewrite params
2. block the current tool

It cannot directly replace:

1. requested tool name
2. executed tool name

That means the adapter can already learn:

1. which tool was requested
2. which same-family tool Aionis would prefer

But it cannot safely do the final step:

1. execute the preferred replacement instead of the requested tool

So the current runtime experiment degrades into:

1. current tool requested
2. preferred replacement detected
3. current tool blocked instead of rerouted

That creates more decision overhead without the clean execution gain that true reroute would provide.

## Evidence Behind the Decision

The narrow runtime experiment did not create a promotion-worthy result.

Single-run strongest-slice smoke reading:

1. baseline reviewer-ready rate: `1`
2. treatment reviewer-ready rate: `1`
3. treatment token cost: higher
4. treatment wall-clock: slower
5. treatment tool-call count: higher

The result is therefore:

1. route-safe
2. completion-non-regressing
3. not good enough to promote

Under the current completion-first rule, that is not sufficient to expand the runtime rollout.

## What This Means

Tool Evolution should now be read in two layers.

### Kernel Layer

Continue.

Why:

1. the kernel now understands capability families
2. the kernel can express preferred versus supported tools
3. the selector can make better in-family ordering decisions

This is low-risk, high-leverage work.

### Adapter Runtime Layer

Pause.

Why:

1. the host cannot yet reroute the actual tool invocation
2. block-only behavior introduces extra friction
3. the latest smoke did not produce a stronger completion result

This is the wrong place to keep pushing until the host contract changes.

## Decision Rules Going Forward

Until the host supports real reroute, Tool Evolution runtime rollout must follow these rules:

1. do not merge host candidate expansion that only leads to block-only substitution
2. do not promote a runtime experiment on route safety alone
3. do not continue repeated validation if the single-run smoke is completion-flat and cost-worse
4. do not start replay migration before the host can cleanly execute selected replacements

## Preconditions To Resume Runtime Rollout

Runtime rollout should resume only when all of the following are true:

1. the host hook contract can express a reroute result, not only params rewrite or block
2. the host executor can actually run the selected replacement tool
3. telemetry can distinguish:
   - requested tool
   - selected tool
   - executed tool
4. one whitelisted tool family has compatible params and effect contract
5. strongest-slice completion remains the hard promotion gate

## Recommended Next Steps

Near-term:

1. keep Tool Evolution kernel work in `Aionis main`
2. document the adapter runtime pause clearly
3. treat host reroute as the next required capability, not as optional polish

Do not do next:

1. do not keep expanding families on the current adapter runtime contract
2. do not start replay migration
3. do not present Tool Evolution as a current public product claim

## Final Reading

The correct reading is:

**Tool Evolution is valid as kernel work today, but not yet valid as an expanded adapter runtime rollout.**

That is not a failure.

It means the next real step is now clear:

**host reroute capability must come before further Tool Evolution runtime promotion.**
