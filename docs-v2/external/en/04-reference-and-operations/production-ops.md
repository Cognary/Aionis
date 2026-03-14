---
title: "Production Operations"
description: "Operate Aionis as a real system with deployment tiers, readiness signals, release gates, and production boundaries."
---

# Production Operations

This page is the external answer to a practical question:

Can Aionis be operated as a real system, not only run as a demo?

## Production Posture

The current repository already distinguishes between local validation and serious deployment:

1. Lite is the lowest-friction validation path
2. Server is the control-plane and production-oriented path
3. admin control and automations remain server-only

That boundary matters because production operations require surfaces that should not be implied by a local embedded mode.

## Deployment Tiers

The current operational model is easiest to understand in three tiers:

1. standalone: local dev, demos, smoke checks
2. single-host service: split `db`, `api`, and `worker` on one host
3. HA service: managed Postgres, multiple API replicas, independent worker, controlled rollout and rollback

## What `/health` Already Gives You

The health surface is more useful than a simple boolean.

Today it exposes operational facts such as:

1. `aionis_edition`
2. `memory_store_backend`
3. capability-contract and store-capability fields
4. sandbox health snapshot
5. Lite route matrix when running Lite

That makes `/health` a real readiness and topology signal, not just a liveness probe.

## Minimum Production Baseline

The current runbooks and host config point to a straightforward baseline:

1. production auth enabled
2. rate limiting enabled
3. tenant quotas enabled
4. trusted proxy and explicit CORS settings
5. external Postgres for production traffic
6. API and worker separated before HA cutover

## Release and Gate Model

Aionis already treats operations as a gated workflow, not only a deployment command.

The existing operator flow includes:

1. `job:health-gate`
2. scope-only strict-warning mode for fast deployment gating
3. governance weekly report for release evidence
4. consistency and quality checks as explicit pass/fail steps

This is one of the stronger product signals in the repository: operations are part of the system shape.

## Migration To HA

The current documented promotion path is:

1. externalize the database
2. split API and worker
3. run at least two API replicas behind a load balancer
4. validate restore and rollback drills
5. shift traffic gradually while observing latency and error behavior

## Telemetry and Diagnostics

The host layer already records request telemetry for key memory endpoints.

That includes request-level recording of:

1. endpoint category
2. latency
3. status code
4. tenant and scope
5. request ID

On the server side, the control-plane surface also exposes tenant dashboards and diagnostics endpoints.

## External Bottom Line

The strongest external takeaway is not that Aionis has every operations feature.

It is that the repository already has:

1. a deployment posture
2. a health surface with useful topology data
3. a gate-driven release model
4. an HA migration story that is more concrete than most early agent infrastructure projects

## Primary Code and Doc Grounding

1. `src/host/lite-edition.ts`
2. `src/host/http-host.ts`
3. `docs/public/en/operations/00-operate.md`
4. `docs/public/en/operations/06-standalone-to-ha-runbook.md`
5. `src/jobs/README.md`
