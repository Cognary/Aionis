# Aionis Self-Learning Mechanism

Date: `2026-03-17`  
Status: `current working mechanism`

## Core Definition

Aionis does have a self-learning capability.

But the correct definition is:

**Aionis self-learning is runtime-asset learning, not model-weight training.**

It learns by:

1. collecting execution feedback
2. linking that feedback to decisions, rules, and runs
3. projecting successful replay/playbook patterns into reusable runtime assets
4. governing whether those assets should remain `draft`, move to `shadow`, or promote further

It does **not** currently mean:

1. unconstrained autonomous model training
2. automatic LLM fine-tuning
3. always-on unrestricted self-modification

## What Aionis Actually Learns

At the current project state, Aionis learns these kinds of things:

1. which rules are receiving positive or negative execution feedback
2. which tool decisions and rule sources were associated with good or bad outcomes
3. which successful runs are good enough to compile into playbooks
4. which approved replay/playbook patterns can be projected into rule or episode assets
5. which learned rule assets are strong enough to stay in `draft`, move to `shadow`, promote to `active`, or be disabled

So the learning target is:

**execution policy and reusable execution assets**

not:

**model parameters**

## Closed-Loop Structure

The current mechanism is a guarded closed loop:

```text
execution
  -> decision persistence
  -> feedback writeback
  -> replay / review approval
  -> learning projection
  -> generated rule / episode assets
  -> governance and promotion gates
  -> future execution policy
```

This means Aionis learns by changing the runtime's memory/policy layer.

## Mechanism 1: Feedback Writeback

The first learning signal is feedback.

### Rule feedback

Source:

1. [feedback.ts](/Users/lucio/Desktop/Aionis/src/memory/feedback.ts)

What it does:

1. validates the target rule exists in scope
2. writes a `memory_rule_feedback` row
3. updates aggregate counters in `memory_rule_defs`
4. creates a memory commit
5. syncs embedded runtime state where needed

This is the simplest form of learning:

**rule outcome -> feedback row -> aggregate rule evidence**

### Tool-selection feedback

Source:

1. [tools-feedback.ts](/Users/lucio/Desktop/Aionis/src/memory/tools-feedback.ts#L238)
2. [memory-feedback-tools.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-feedback-tools.ts)

What it does:

1. normalizes the tool decision feedback payload
2. re-evaluates applied rules for attribution instead of trusting the caller blindly
3. links, infers, or creates the related execution decision
4. writes tool feedback and related rule feedback records
5. updates rule aggregate counts

This means the system can learn from:

1. tool outcomes
2. source-rule attribution
3. execution decision lineage

Important boundary:

This feedback path exists today, but it does **not** prove that tool-selection uplift is already a mature promoted product capability.

## Mechanism 2: Replay Learning Projection

The second and more important learning path is replay learning projection.

Sources:

1. [replay.ts](/Users/lucio/Desktop/Aionis/src/memory/replay.ts#L3935)
2. [replay-learning.ts](/Users/lucio/Desktop/Aionis/src/memory/replay-learning.ts#L382)

### Trigger conditions

Replay learning projection is not unconditional.

It only becomes eligible when:

1. replay/playbook review action is `approve`
2. review state resolves to `approved`
3. learning projection is enabled

That is already a guardrail.

### What projection does

Once triggered, Aionis can:

1. read the approved playbook
2. derive preferred tools from the playbook step template
3. build a policy patch, currently centered on `tool.prefer`
4. compute matcher and policy fingerprints
5. skip duplicate projections
6. warn on overlapping rule space
7. create:
   - a generated replay-learning rule
   - a replay-learning episode event
8. optionally move the generated rule to `shadow`

This is the core “self-learning” implementation in the runtime today:

**successful replay/playbook -> projected runtime rule/episode**

## Mechanism 3: Async Learning Delivery

Replay learning does not have to run inline.

Source:

1. [outbox-worker.ts](/Users/lucio/Desktop/Aionis/src/jobs/outbox-worker.ts#L325)

Current delivery modes:

1. `sync_inline`
2. `async_outbox`

In async mode, Aionis:

1. enqueues a `replay_learning_projection` outbox job
2. processes it in the outbox worker
3. records success or classified failure back into the outbox payload

So replay learning is a real background job path, not a docs-only idea.

## Mechanism 4: Governance and Promotion

The learning loop is intentionally governed.

Sources:

1. [policy-adaptation-gate.ts](/Users/lucio/Desktop/Aionis/src/jobs/policy-adaptation-gate.ts#L88)
2. [rule-promotion-governance.ts](/Users/lucio/Desktop/Aionis/src/jobs/rule-promotion-governance.ts)

### Policy Adaptation Gate

This job reads recent feedback and computes:

1. confidence
2. risk
3. reasons
4. suggested actions

Examples:

1. `promote_to_shadow`
2. `promote_to_active`
3. disable suggestions for unhealthy active rules

### Rule Promotion Governance

This job checks whether a state transition should be allowed.

It evaluates things like:

1. positive feedback count
2. negative ratio
3. distinct runs
4. score (`positive - negative`)
5. policy patch validity
6. scope-target validity

This means Aionis learning is:

**feedback-driven and governance-gated**

not:

**blind self-promotion**

## Mechanism 5: Retention and Lifecycle

Learning assets also have lifecycle management.

Source:

1. [replay-learning-retention.ts](/Users/lucio/Desktop/Aionis/src/jobs/replay-learning-retention.ts)

This job can archive replay-learning episodes based on:

1. TTL expiry
2. rule stabilization

So the learning loop includes:

1. creation
2. evaluation
3. promotion or disablement
4. retention and archival

## Developer-Facing Learning Gate

There is also a clear developer-side entrypoint for learning.

Source:

1. [profile.ts](/Users/lucio/Desktop/Aionis/src/mcp/dev/profile.ts)

Key concepts:

1. `evaluateCodexGate(...)`
2. `eligible_for_learning`
3. `submitCodexLearnFromRun(...)`

Current behavior:

1. evaluate the quality gate of a run
2. if quality is good enough, mark the run `eligible_for_learning`
3. optionally submit tool feedback
4. optionally compile a playbook from the run

This is another sign that Aionis self-learning is defined as:

**quality-gated experience capture and reuse**

## Current Boundaries

The current mechanism is real, but bounded.

### What is already true

1. rule feedback exists
2. tool feedback exists
3. replay learning projection exists
4. async learning delivery exists
5. governance and promotion gates exist
6. learning episode retention exists

### What is not true

1. Aionis does not fine-tune model weights
2. Aionis does not run unconstrained autonomous self-modification
3. Aionis does not currently prove that every learning surface is already a stable product win
4. tool-selection learning should still be treated as narrow and benchmark-gated

## Most Accurate One-Sentence Definition

The most accurate definition today is:

**Aionis self-learning is a guarded runtime loop that turns execution feedback and approved replay experience into reusable policy, rule, and episode assets.**

## Relation To The Four Runtime Pillars

This mechanism sits across the existing four-pillar model:

1. `Execution Memory`
   - stores feedback, decisions, playbooks, episodes, and rule assets
2. `Execution Continuity`
   - provides replay/review paths that produce learnable successful procedures
3. `Execution Control`
   - consumes and governs the learned rules and policy surfaces
4. `Execution Evaluation`
   - provides the execution-quality signals that should determine whether learning is safe to trust

So self-learning is not a fifth pillar.

It is a cross-pillar closed loop built on top of the four pillars.
