---
title: "Replay Candidate And Dispatch"
description: "Overview of the Aionis replay candidate and dispatch surfaces, including how eligibility and execution choice fit together."
---

# Replay Candidate And Dispatch

## Status

`code-backed`

## Covered Endpoints

1. `POST /v1/memory/replay/playbooks/candidate`
2. `POST /v1/memory/replay/playbooks/dispatch`

Dedicated endpoint pages now exist for each surface:

1. [POST /v1/memory/replay/playbooks/candidate](./replay-playbook-candidate)
2. [POST /v1/memory/replay/playbooks/dispatch](./replay-dispatch)

## What They Do

These two endpoints answer a higher-level question:

Can this playbook be reused deterministically right now, and if yes, should replay execute now or fall back?

## Candidate

`playbooks/candidate` is the recommendation surface.

The main fields to care about are:

1. deterministic replay eligibility
2. recommended mode
3. mismatch reasons
4. next action

## Dispatch

`playbooks/dispatch` is the decision-and-execute surface.

The main fields to care about are:

1. dispatch decision
2. whether deterministic replay executed
3. whether fallback replay executed
4. resulting replay summary

## Why This Matters

These endpoints are where replay starts feeling like runtime infrastructure instead of a one-off debug feature.

They let Aionis decide between:

1. deterministic reuse
2. bounded fallback
3. candidate-only inspection

## Important Boundary

These are strong product surfaces, but they are not yet part of the current `live-verified` set.

Treat them as `code-backed` until they are run through the same validation workflow.

## Grounding

1. `src/memory/schemas.ts`
2. `src/routes/memory-replay-core.ts`
3. `src/routes/memory-replay-governed.ts`
4. `src/memory/replay.ts`
5. `docs/public/en/api-reference/00-api-reference.md`
