---
title: "Policy Guide"
description: "Use the Aionis policy loop to evaluate rules, persist decisions, inspect runs, and feed back execution outcomes."
---

# Policy

Policy is where Aionis becomes governable instead of just helpful.

Without policy, memory only influences prompts.

With policy, memory can influence action selection in a way operators can inspect.

## What Is Live In Code Today

The current policy loop is implemented around:

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/tools/decision`
4. `POST /v1/memory/tools/run`
5. `POST /v1/memory/tools/feedback`
6. `POST /v1/memory/feedback`
7. `POST /v1/memory/rules/state`

That is already a real loop:

1. evaluate
2. select
3. inspect decision
4. inspect run lifecycle
5. feed outcomes back

## Best First Policy Integration

Do not start with a huge rule library.

Start with one high-value decision boundary:

1. tool choice for one risky workflow
2. allow/deny/prefer guidance for a small candidate set
3. feedback after real outcomes

That is enough to make the product value visible.

## Minimal Useful Flow

The first working policy loop usually looks like:

1. send normalized runtime context to `rules/evaluate`
2. send the same context and candidate tools to `tools/select`
3. persist `run_id` and `decision_id`
4. report outcome through `tools/feedback`

After that, you can inspect:

1. what rule matched
2. what tool was selected
3. what happened on the run
4. how feedback linked back

## Why This Matters

Most agent systems have hidden routing logic.

Aionis gives you a path toward:

1. inspectable tool choice
2. explicit review surfaces
3. governed adaptation
4. auditable provenance

This is one of the biggest differences between "memory for agents" and "runtime infrastructure for agent systems."

## Important Boundary

Policy is not autonomous self-optimization.

What it gives teams is a reviewable policy loop for action selection and replay promotion.

## Evidence Status

Current public material already supports:

1. the policy loop exists in code
2. tool choice and decision provenance are inspectable
3. at least one documented policy-loop benchmark already exists

Ongoing policy comparison experiments do not change the public claim set until they are disclosed.

## What To Read Next

1. [Replay](./replay)
2. [Reference And Operations](../04-reference-and-operations)
