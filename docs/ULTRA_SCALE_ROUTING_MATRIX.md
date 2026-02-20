---
title: "Ultra-Scale Routing Matrix"
---

# Ultra-Scale Routing Matrix

This matrix defines when Aionis should stay on single-cluster Postgres, when to move to read replicas, and when to split tenants into shards.

## Scope

- Applies to production traffic only (`APP_ENV=prod`).
- Primary signals:
  - write throughput (`writes/s`, p95 write latency)
  - recall latency (`recall_text` p95)
  - storage growth per tenant/scope
  - queue pressure (`inflight_wait_ms`, queue-full/timeout events)

## Routing Tiers

### Tier A: Single Cluster (default)

Use when all are true:
- write p95 <= 200ms
- recall_text p95 <= 800ms
- DB CPU p95 <= 65%
- tenant top-1 write QPS <= 20% of cluster steady-state capacity

Actions:
- Keep one primary.
- Partition-first maintenance (`scope-purge` partition mode).
- Keep adaptive recall downgrade enabled.

### Tier B: Primary + Read Replicas

Trigger when any is true for 3 consecutive days:
- recall_text p95 > 800ms
- DB CPU p95 > 65%
- read QPS saturates pool while writes remain stable

Actions:
- Route recall/read-only paths to replicas.
- Keep writes and commit-chain on primary.
- Tighten tenant read quotas for noisy tenants.

Exit back to Tier A:
- all metrics return under Tier A thresholds for 7 consecutive days.

### Tier C: Tenant-Aware Sharding

Trigger when any is true for 7 consecutive days:
- top tenant consumes >= 35% write capacity
- storage growth of top tenant >= 30% of monthly cluster growth
- write p95 > 300ms after Tier B is fully applied

Actions:
- Move high-volume tenants to dedicated shard groups.
- Keep API contract stable; route by tenant id.
- Run shard onboarding with dual-write verification window before cutover.

Exit back to Tier B:
- usually not recommended; treat as one-way unless tenant churn justifies merge.

## Guardrails

1. Never disable commit-chain SoR semantics during scale migration.
2. Keep destructive reset in partition mode; fail if delete fallback appears in gated production path.
3. New shard onboarding requires:
   - scope/tenant consistency checks green
   - partition cutover readiness evidence
   - replay drill evidence for outbox/dead-letter path

## Weekly Decision Template

Record in ops review:
- current tier (`A|B|C`)
- threshold breaches observed (with dates)
- decision (`stay|promote|rollback`)
- evidence files:
  - `artifacts/core_gate/<run_id>/summary.json`
  - `artifacts/gtm/gate_c/<run_id>/summary.json`
  - `artifacts/partition_cutover/<run_id>/summary.json` (if applicable)
