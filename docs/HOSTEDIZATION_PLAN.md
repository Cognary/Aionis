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

## Immediate Execution Batch (Completed)

1. Added hosted preflight command: `npm run -s preflight:hosted`
2. Added docs entry for hostedization plan + command
3. Added hosted-staging CI workflow using preflight + core gate:
   - `.github/workflows/hosted-staging-gate.yml`
4. Added tenant packaging matrix doc (Starter / Growth / Enterprise):
   - `docs/HOSTED_TENANT_PACKAGING_MATRIX.md`
5. Added hosted release evidence bundle template:
   - `docs/HOSTED_RELEASE_EVIDENCE_BUNDLE_TEMPLATE.md`

## Next Execution Batch (Completed)

1. Control plane API spec draft:
   - `docs/HOSTED_CONTROL_PLANE_API.md`
2. Per-tenant quota persistence:
   - migration: `migrations/0022_hosted_control_plane_mvp.sql`
   - runtime + admin update path:
     - `/v1/admin/control/tenant-quotas/:tenant_id`
3. Hosted operator checklist:
   - `docs/HOSTED_OPERATOR_CHECKLIST.md`
4. Control-plane key rotation endpoint:
   - `POST /v1/admin/control/api-keys/:id/rotate`
5. Control-plane audit events stream:
   - migration: `migrations/0023_control_plane_audit_events.sql`
   - endpoint: `GET /v1/admin/control/audit-events`
6. Hosted dashboard tenant summary API:
   - endpoint: `GET /v1/admin/control/dashboard/tenant/:tenant_id`

## Following Batch (Completed)

1. Key rotation SLA automation and proactive stale-key alerting.
   - job: `npm run -s job:hosted-key-rotation-sla`
   - endpoint: `GET /v1/admin/control/api-keys/stale`
2. Per-tenant latency/error budget time-series export for dashboard.
   - migration: `migrations/0024_memory_request_telemetry.sql`
   - endpoint: `GET /v1/admin/control/dashboard/tenant/:tenant_id/timeseries`
   - job: `npm run -s job:hosted-tenant-timeseries-export`
3. Hosted incident bundle auto-export (core gate + governance + audit snapshot).
   - command: `npm run -s incident:bundle:hosted`
   - runbook: `docs/HOSTED_AUTOMATION_RUNBOOK.md`

## Next Batch (Completed)

1. Key-usage telemetry enrichment (key_prefix-level request counters and anomaly detection).
   - migration: `migrations/0025_request_telemetry_key_prefix.sql`
   - endpoint: `GET /v1/admin/control/dashboard/tenant/:tenant_id/key-usage`
   - job: `npm run -s job:hosted-key-usage-anomaly`
2. Tenant dashboard chart API hardening (pagination/filtering + retention policy).
   - endpoint hardening: `GET /v1/admin/control/dashboard/tenant/:tenant_id/timeseries`
   - config: `CONTROL_TELEMETRY_RETENTION_HOURS`
   - retention job: `npm run -s job:hosted-telemetry-retention`
3. Incident bundle upload/export target integration (object storage + signed evidence index).
   - command: `npm run -s incident:bundle:hosted -- --publish-target <uri>`
   - artifacts: `evidence_index.json` + optional `evidence_index.sig.json`

## Upcoming Batch (Completed)

1. Tenant-level alert routing hooks (PagerDuty/Slack/webhook fan-out by policy). (Completed)
   - migration: `migrations/0026_control_alert_routing.sql`
   - endpoints:
     - `POST /v1/admin/control/alerts/routes`
     - `GET /v1/admin/control/alerts/routes`
     - `POST /v1/admin/control/alerts/routes/:id/status`
     - `GET /v1/admin/control/alerts/deliveries`
   - job: `npm run -s job:hosted-alert-dispatch`
2. Dashboard API cursors for high-cardinality tenants (cursor token + snapshot consistency). (Completed)
   - endpoints:
     - `GET /v1/admin/control/dashboard/tenant/:tenant_id/timeseries?cursor=...`
     - `GET /v1/admin/control/dashboard/tenant/:tenant_id/key-usage?cursor=...`
3. Hosted incident publisher plugins (S3/GCS/Azure adapters + checksum verification job). (Completed)
   - checksum verification job: `npm run -s job:hosted-incident-verify`
   - publish adapters:
     - `s3://` (AWS S3)
     - `gs://` (GCS via gsutil/gcloud)
     - `az://` (Azure Blob via az cli)
   - plugin entrypoint: `scripts/hosted/publish-incident-bundle.sh`

## Next Upcoming Batch

1. Alert routing escalation policy DSL (severity thresholds, quiet windows, dedupe keys). (Completed)
   - dispatch policy surface: `metadata.policy`
   - dedupe support index: `migrations/0027_control_alert_dedupe_index.sql`
2. Incident publish async mode (queued uploads + retry/dead-letter for storage provider outages). (Completed)
   - migration: `migrations/0028_control_incident_publish_queue.sql`
   - endpoints:
     - `POST /v1/admin/control/incident-publish/jobs`
     - `GET /v1/admin/control/incident-publish/jobs`
   - jobs:
     - `npm run -s job:hosted-incident-publish-enqueue`
     - `npm run -s job:hosted-incident-publish-worker`
   - incident bundle mode: `npm run -s incident:bundle:hosted -- --publish-async --publish-target <uri>`
3. Provider-specific post-upload integrity attestations (S3 ETag/GCS generation/Azure version id capture). (Completed)
   - sync publish output now includes provider attestation and writes:
     - `artifacts/hosted_incident_bundle/<run_id>/publish_attestation.json`
   - providers:
     - S3: `etag` + `version_id` (if enabled)
     - GCS: `generation` + `metageneration`
     - Azure Blob: `etag` + `version_id` (if available)

## Operating Rules

1. Perf and stress tests must use isolated scope and tenant.
2. `default` scope is reserved for smoke/local checks only.
3. Hosted rollout decisions require artifact links, not screenshots-only approval.

## Verification Stamp

1. Last reviewed: `2026-02-21`
2. Owner: `core + ops + product`
