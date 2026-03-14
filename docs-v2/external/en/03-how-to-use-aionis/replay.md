---
title: "Replay Guide"
description: "Use Aionis replay APIs to turn successful execution into reusable playbooks and governed replay paths."
---

# Replay

Replay is where Aionis stops being only about remembering prior work and starts becoming about reusing prior execution.

## What Is Live In Code Today

The replay surface is already split into two layers.

Core replay routes:

1. `replay/run/start`
2. `replay/step/before`
3. `replay/step/after`
4. `replay/run/end`
5. `replay/runs/get`
6. `replay/playbooks/compile_from_run`
7. `replay/playbooks/get`
8. `replay/playbooks/candidate`
9. `replay/playbooks/promote`
10. `replay/playbooks/repair`

Governed replay routes:

1. `replay/playbooks/repair/review`
2. `replay/playbooks/run`
3. `replay/playbooks/dispatch`

This split is important.

It means replay is not just a bag of endpoints. It already has a lifecycle.

## The Three Modes

The actual replay run schema supports:

1. `simulate`
2. `strict`
3. `guided`

Use them like this:

1. `simulate` when you want safety and validation first
2. `strict` when deterministic replay is realistic
3. `guided` when repair may be needed

## Best First Replay Path

For most teams, the first believable replay path is:

1. capture one real run
2. compile a playbook from it
3. inspect candidate status
4. run `simulate`
5. move to `strict` only when the path is stable

That is a much better starting point than opening with repair policy details.

## Why Replay Is Different From Retrieval

Retrieval helps the model remember what happened.

Replay helps the system reuse what already worked.

That is a very different product promise.

It is also where some of Aionis's strongest proof lives:

1. strict replay can become a zero-model-token path after compile
2. guided replay isolates model usage to repair moments instead of replay moments

## Important Real Boundaries

Keep the boundaries clear:

1. compile-from-run can consume model tokens
2. strict replay is not the same as guided replay
3. deterministic replay depends on the playbook, mode, and execution conditions
4. replay is real in Lite and Server core, but automation remains server-only in Lite phase boundaries

## Current Evidence Level

Replay currently uses two evidence levels:

1. `public-evidence-backed` for disclosed replay claims such as strict replay behavior
2. `code-backed` for deeper replay endpoint reference that has not yet been run through the current live-verification workflow

That means replay documentation can stay useful without overstating what has already been re-verified in the current documentation cycle.

## What To Expect From Replay

The right expectation is:

1. Aionis turns successful work into reusable execution paths
2. deterministic replay depends on the playbook, mode, and execution conditions

## What To Read Next

1. [Policy](./policy.md)
2. [Reference And Operations](../04-reference-and-operations/index.md)
3. [Replay Run](/04-reference-and-operations/endpoints/replay-run)
