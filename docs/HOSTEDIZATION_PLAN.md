---
title: "Hostedization Execution Plan"
---

# Hostedization Execution Plan

This plan turns Aionis into a production hosted product in a staged, auditable way.

Narrative stays fixed:

1. Verifiable / Operable Memory Kernel
2. Audit-first
3. Derived async
4. Memory -> Policy

## Goals

1. Keep Open Core strong and usable.
2. Build hosted-only value on top of operations, governance, and tenant controls.
3. Make hosted launch measurable with hard gates, not narrative-only milestones.

## Non-goals (Phase 1-2)

1. Do not fork API contract by customer tier.
2. Do not ship enterprise compliance claims without auditable controls and evidence.
3. Do not run perf/load tests in business scopes.

## Workstreams

1. Control Plane
2. Data Plane / Isolation
3. SLO + Observability
4. Security + Compliance Baseline
5. Commercial Packaging + Release Ops

## Phase Plan

## Phase 0 (Now): Hosted Readiness Baseline (1-2 weeks)

Deliverables:

1. Hosted preflight command for environment + runtime checks.
2. Hosted operator checklist in docs.
3. Release rule: prod gate + hosted preflight must pass before hosted rollout.

Acceptance:

1. `npm run -s preflight:hosted -- --run-gates` exits 0 in hosted-staging.
2. `npm run -s gate:core:prod` exits 0 in isolated scope.
3. No perf run in tenant business scope.

## Phase 1: Control Plane MVP (2-4 weeks)

Deliverables:

1. Tenant/project/api-key lifecycle endpoints (create, rotate, revoke).
2. Per-tenant quotas persisted in control plane storage.
3. Audit events for control-plane operations.

Acceptance:

1. Tenant key rotation without downtime.
2. Revoked key cannot access APIs within SLA window.
3. All mutations have auditable actor/timestamp/event records.

## Phase 2: Hosted Reliability + Governance (4-8 weeks)

Deliverables:

1. Hosted dashboard: request/error/latency/outbox backlog by tenant.
2. Dead-letter and replay operations in hosted admin workflows.
3. Policy/governance evidence export (weekly + release snapshots).

Acceptance:

1. SLO dashboard and alerts are actionable by on-call.
2. Dead-letter replay drill is reproducible from runbook.
3. Governance weekly report is automated and archived.

## Phase 3: Enterprise Isolation Options (8-12 weeks)

Deliverables:

1. Dedicated tenant routing profile (shared cluster -> isolated shard/project).
2. Private network deployment options (VPC peering/PrivateLink-equivalent path).
3. Compliance control mapping and evidence registry.

Acceptance:

1. Tenant migration runbook with cutover and rollback evidence.
2. Isolation mode does not break API contract.
3. Contractual SLO package can be backed by telemetry evidence.

## Core Hosted Gates

Required before hosted production rollout:

1. `preflight:hosted` pass
2. `gate:core:prod` pass
3. `job:consistency-check:cross-tenant -- --strict-warnings` pass
4. `job:health-gate -- --strict-warnings --consistency-check-set scope` pass

## Immediate Execution Batch (Started)

1. Added hosted preflight command: `npm run -s preflight:hosted`
2. Added docs entry for hostedization plan + command
3. Next batch:
   - add hosted-staging CI workflow using preflight + core gate
   - add tenant packaging matrix doc (Starter / Growth / Enterprise)
   - add release evidence bundle template for hosted go-live

## Operating Rules

1. Perf and stress tests must use isolated scope and tenant.
2. `default` scope is reserved for smoke/local checks only.
3. Hosted rollout decisions require artifact links, not screenshots-only approval.

## Verification Stamp

1. Last reviewed: `2026-02-21`
2. Owner: `core + ops + product`
