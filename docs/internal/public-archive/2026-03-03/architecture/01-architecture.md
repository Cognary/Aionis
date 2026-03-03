---
title: "Architecture"
---

# Architecture

Aionis architecture is designed for production reliability and auditability.

## System Components

| Component | Role |
| --- | --- |
| API service | write, recall, policy, and resolve endpoints |
| Memory store | durable graph objects and commit lineage |
| Derived workers | async processing (embedding/topic/compression/etc.) |
| Control jobs | quality, consistency, and governance checks |
| Operator tooling | gate execution and incident diagnostics |

## Write Path

1. Request enters `POST /v1/memory/write` (or session/event variants).
2. Nodes/edges are persisted and linked to a new commit.
3. Response returns write lineage (`commit_id`, `commit_uri`).
4. Derived jobs are queued asynchronously when enabled.

Write success is decoupled from derived-job completion.

## Recall and Context Path

1. Recall retrieves relevant memory candidates.
2. Graph expansion and ranking produce bounded context candidates.
3. Context assembly composes layers under explicit budgets.
4. Response returns context plus traceable object references.

## Policy Path

1. Runtime sends planner context to `rules/evaluate`.
2. Policy constraints are applied in `tools/select`.
3. Decision is recorded (`tools/decision`) for replay provenance.
4. Outcome feedback (`tools/feedback`) updates future behavior.

## Control Points

1. Isolation: tenant/scope and lane visibility enforcement.
2. Budgeting: layer budgets and item caps for context.
3. Reliability: gates and checks before production rollout.
4. Replay: URI-based inspect/resolve workflows.

## Failure Model

Aionis handles common production failure classes with explicit contracts:

1. Derived pipeline lag: writes continue, backfill catches up.
2. Unsupported backend capability: typed `501` fallback contract.
3. Policy drift: gate metrics detect degradation before rollout.
4. Cross-tenant leakage risk: consistency checks and isolation guards.

## Deployment Shapes

1. Standalone: local development and validation.
2. Service profile: production baseline with separated concerns.
3. HA topology: scaled runtime with operational gate workflows.

## Related

1. [Detailed Architecture Notes](/public/en/concepts/02-architecture)
2. [Context Orchestration](/public/en/context-orchestration/00-context-orchestration)
3. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
4. [Operate and Production](/public/en/operate-production/00-operate-production)
