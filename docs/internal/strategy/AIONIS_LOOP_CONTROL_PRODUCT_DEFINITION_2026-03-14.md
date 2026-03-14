---
title: "Aionis Loop Control Product Definition (External Draft)"
---

# Aionis Loop Control Product Definition (External Draft)

Status: `draft` (`2026-03-14`)

Internal references:

1. [/Users/lucio/Desktop/Aionis/docs/plans/2026-03-14-loop-control-audit.md](/Users/lucio/Desktop/Aionis/docs/plans/2026-03-14-loop-control-audit.md)
2. [/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_LOOP_CONTROL_CAPABILITY_DEFINITION_2026-03-14.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_LOOP_CONTROL_CAPABILITY_DEFINITION_2026-03-14.md)

## Purpose

Define how the internal loop-control capability should be translated into external product language.

This document is not a release announcement.
It is a positioning draft that answers:

1. what we should say externally
2. what we should not say externally
3. which product name is defensible
4. which evidence is needed before stronger claims are made

---

## Core Product Decision

External recommendation:

Do **not** launch a product feature literally named `Loop Control` yet.

Recommended external umbrella phrase:

**Execution Control and Closed-Loop Governance**

Shorter optional phrase:

**Bounded Execution**

Why:

1. these phrases match the actual implementation
2. they describe behavior rather than inventing a new noun
3. they avoid implying that there is already one dedicated `Loop Control` API or module
4. they leave room for future packaging without creating cleanup debt

---

## External Problem Statement

Application teams do not only need agents that can act.
They need agents whose execution can be:

1. bounded
2. interrupted
3. explained
4. reviewed
5. improved from outcome data

Without that, teams get one of two bad outcomes:

1. brittle execution that runs without enough controls
2. over-governed systems where every safeguard is outside the runtime and hard to connect back to actual behavior

The product story should therefore be:

> Aionis helps teams run agents under bounded execution rules while preserving end-to-end decision traceability and feedback-driven governance.

---

## Recommended External Definition

### Recommended Capability Definition

Suggested external definition:

> Aionis provides bounded execution controls for agent runs, including step limits, failure-stop behavior, execution time bounds, gated replay, sandbox budget enforcement, and run traceability with feedback-linked governance.

This definition is defensible because every clause maps to existing code paths.

### Recommended Short Version

> Aionis gives teams bounded execution and closed-loop governance for agent behavior.

### What This Capability Includes

Externally safe inclusions:

1. bounded replay execution
2. failure-stop controls
3. timeout-bounded execution
4. deterministic or gated execution paths
5. sandbox budget enforcement and cancellation
6. decision traceability
7. feedback attribution
8. operator-facing governance signals

### What This Capability Does Not Promise

Do not imply:

1. universal workflow orchestration
2. perfect autonomous planning
3. self-healing behavior in all cases
4. a single unified control API
5. that every agent runtime outside Aionis inherits the same guarantees automatically

---

## Messaging Architecture

### Level 1: Headline Message

Use for homepage, overview pages, and high-level positioning:

1. **Bounded execution for agents**
2. **Closed-loop governance for agent behavior**

### Level 2: Supporting Message

Use for product pages and docs intros:

1. step limits and failure-stop behavior keep runs bounded
2. sandbox budgets and cancellation keep command execution governable
3. policy, decision traces, and feedback links make behavior reviewable

### Level 3: Technical Proof Message

Use for technical docs and product evidence:

1. replay runs can be capped by step count
2. execution can stop on failure
3. execution time is bounded
4. sandbox runs can be budget-gated and cancelled
5. decisions and feedback are persisted and attributable
6. governance gates and diagnostics expose health and traceability

---

## Recommended Positioning Angles

### Angle A: Bounded Execution

Best for:

1. platform teams
2. infra buyers
3. technical docs

Claim:

1. Aionis helps keep agent execution bounded and controllable.

Strength:

1. strongest technical defensibility

Risk:

1. sounds infra-heavy if unsupported by governance language

### Angle B: Closed-Loop Governance

Best for:

1. teams already worried about traceability, review, and feedback

Claim:

1. Aionis keeps policy, execution, and feedback in one governable loop.

Strength:

1. differentiates from plain retrieval or planner wrappers

Risk:

1. sounds softer unless paired with hard execution controls

### Recommended Combination

Lead with:

**Bounded execution and closed-loop governance**

This combines the hard-control story and the auditability story without overselling either one alone.

---

## Packaging Recommendation

### Recommended External Packaging Model

Do not package this as one separate SKU yet.

Instead expose it across three existing surfaces:

1. replay/playbook execution
2. sandbox execution
3. policy and feedback governance

Then describe them as one capability family.

This avoids a false promise that users will find one `Loop Control` button, endpoint, or module.

### Future Packaging Option

If the capability becomes more unified later, a stronger public noun could exist.

That should only happen after:

1. one contract exists across replay and sandbox
2. one operator story exists for "why this run was bounded or stopped"
3. one public docs category exists for execution control

Until then, capability family language is safer than feature noun language.

---

## Safe Claims

These are safe to use externally now if backed by docs and examples:

1. Aionis supports bounded replay execution with step caps and failure-stop behavior.
2. Aionis can enforce execution time bounds and deterministic gating on replay paths.
3. Aionis sandbox execution supports budget enforcement and run cancellation.
4. Aionis persists tool decisions and can link feedback back to decision context.
5. Aionis includes governance and diagnostics surfaces for execution-loop health.

---

## Claims To Avoid

These should not be used externally yet:

1. "Aionis has a feature called Loop Control."
2. "Loop Control is a standalone Aionis subsystem."
3. "Aionis guarantees safe execution for any agent framework automatically."
4. "Aionis unifies all execution control into one API today."
5. "Aionis fully orchestrates and governs every autonomous workflow end to end."

Each of those overstates the current packaging or contract coherence.

---

## Suggested External Copy

### One-Sentence Version

> Aionis gives teams bounded execution and closed-loop governance for agent runs, combining step limits, failure-stop controls, gated execution paths, sandbox budgets, and decision-linked feedback traceability.

### Short Product Paragraph

> Aionis is built for teams that need more than agent execution alone. It helps keep runs bounded with replay step limits, failure-stop behavior, execution time bounds, and sandbox enforcement, while preserving the decision traces and feedback links needed to review and improve behavior over time.

### Technical Product Paragraph

> In Aionis, execution control is not bolted on after the fact. Replay and sandbox paths can apply bounded-execution rules such as step caps, timeout limits, deterministic gates, budget checks, and cancellation, while the runtime records decision and feedback evidence needed for governance, diagnostics, and controlled rollout.

---

## Proof Requirements Before Broader Launch

Before this capability is elevated in public positioning, the team should have:

1. one public technical page that explains bounded execution clearly
2. one reproducible evidence path for step limits, failure-stop behavior, and sandbox gating
3. one operator-facing example showing decision trace plus feedback attribution
4. one docs IA section that unifies replay, sandbox, and governance under a single narrative

Without those, the language remains correct but under-supported.

---

## Recommendation

External recommendation:

1. do not market a standalone feature called `Loop Control`
2. market the capability as **bounded execution and closed-loop governance**
3. root every claim in replay bounds, sandbox controls, and traceable policy feedback
4. upgrade to a stronger public noun only after the internal capability contract is more unified

This is the cleanest external story that matches the current implementation and keeps product language defensible.
