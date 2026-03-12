---
title: "Architecture"
---

# Architecture

This page focuses on system shape, not product positioning.

If you are still choosing between editions or entry paths, start with:

1. [Get Started](/public/en/getting-started/01-get-started)
2. [Choose Lite vs Server](/public/en/getting-started/07-choose-lite-vs-server)

Aionis architecture is built around three concerns:

1. reliable state
2. replayable execution
3. controlled runtime behavior

## System Components

| Component | Role |
| --- | --- |
| API service | memory, context, policy, and resolve endpoints |
| Memory store | durable graph objects and commit lineage |
| Derived workers | async embedding/topic/compression processing |
| Control jobs | consistency, quality, and release checks |
| Operator tooling | monitoring, replay, and gated operations |

The public open-core tree covers Lite and Server paths. Some hosted control-plane capabilities live outside the public distribution.

## Request Paths

### Write Path

1. Request enters `POST /v1/memory/write`.
2. Nodes/edges are persisted and linked to a commit.
3. Response returns write lineage (`commit_id`, `commit_uri`).
4. Derived jobs are queued asynchronously when enabled.

### Recall and Context Path

1. Recall retrieves memory candidates.
2. Ranking and graph expansion produce bounded context candidates.
3. Context assembly composes layers under explicit budgets.
4. Response includes traceable object references.

### Policy Path

1. Runtime sends planner context to `rules/evaluate`.
2. Policy constraints apply in `tools/select`.
3. Decision is persisted via `tools/decision`.
4. Run lifecycle is inspected via `tools/run`.
5. Outcome feedback is written via `tools/feedback`.

## Control Points

1. Isolation: tenant/scope and lane visibility enforcement.
2. Budgeting: layer budgets and item caps for context.
3. Reliability: release gates and consistency checks.
4. Replay: URI-based resolve flows.

## Deployment Profiles

1. Lite: local SQLite-backed runtime for single-user and beta use.
2. Service: self-hosted production baseline.
3. HA: multi-replica topology with resilience workflows.

## Start Here

1. [Build Memory Workflows](/public/en/guides/01-build-memory)
2. [Context Orchestration](/public/en/context-orchestration/00-context-orchestration)
3. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)

## Next Steps

1. [Operate and Production](/public/en/operate-production/00-operate-production)
2. [Detailed Architecture Notes](/public/en/concepts/02-architecture)
