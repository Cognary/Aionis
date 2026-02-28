---
title: "Standalone to HA Runbook"
---

# Standalone to HA Runbook

Last updated: `2026-02-28`

This runbook clarifies deployment tiers and the promotion path from local-first standalone to production HA service.

## Deployment Tiers

## Tier 0: `standalone` (local/demo/CI smoke)

Shape:

1. Single container: Postgres + migrations + API + worker.
2. Best for local agent usage, demos, and smoke checks.

Boundary:

1. Not HA.
2. No process-level isolation between DB/API/worker.
3. Not suitable as production serving topology.

## Tier 1: Compose service (single-host production-like)

Shape:

1. Split services in `docker-compose`: `db`, `api`, `worker`, `migrate`.
2. Operationally closer to production than standalone.

Boundary:

1. Still single-host unless you externalize DB and add redundancy.
2. Host-level failure is still a full outage.

## Tier 2: HA service (recommended for production)

Target shape:

1. External managed Postgres with backups + PITR.
2. Multiple API replicas behind load balancer.
3. Worker deployed independently from API.
4. Rolling deployment and rollback support.
5. Continuous gate evidence (`core-production-gate`, backend parity, sdk-ci).

## HA Minimal Env Baseline

Use this as the minimum runtime baseline before external traffic:

```bash
AIONIS_MODE=service
APP_ENV=prod
MEMORY_AUTH_MODE=api_key
RATE_LIMIT_ENABLED=true
TENANT_QUOTA_ENABLED=true
RATE_LIMIT_BYPASS_LOOPBACK=false
TRUST_PROXY=true
CORS_ALLOW_ORIGINS=https://your-app.example.com
MEMORY_RECALL_PROFILE=strict_edges
DATABASE_URL=postgres://<user>:<pass>@<managed-postgres-host>:5432/<db>
```

Notes:

1. Do not run production with `MEMORY_AUTH_MODE=off`.
2. Use secret manager values for credentials/tokens; do not hardcode in committed env files.
3. Keep `standalone` image only for local/demo/CI smoke paths.

## HA Topology Reference (Minimal)

1. `LB` -> `API x2+` replicas.
2. `Worker x1+` deployed as separate service.
3. `Managed Postgres` externalized from app hosts.
4. Optional read replica/reporting DB is non-blocking for initial cutover.

Operational checks:

1. API readiness/liveness probes enabled.
2. Worker restart policy enabled with log shipping.
3. DB backup + PITR policy verified with restore drill evidence.

## Promotion Checklist (Tier 0/1 -> Tier 2)

## A. Data and durability

1. Move to managed/external Postgres (`DATABASE_URL` not tied to single Docker host).
2. Enable automated backups and verify restore drill.
3. Enforce migration discipline before rollout (`docker compose run --rm migrate` or CI release gate equivalent).

## B. Runtime split and scaling

1. Deploy API and worker as separate services/process groups.
2. Run at least 2 API replicas behind a load balancer.
3. Configure health probes on API and worker restart policy.

## C. Security and traffic controls

1. `AIONIS_MODE=service` or `AIONIS_MODE=cloud`.
2. `MEMORY_AUTH_MODE` must not be `off`.
3. `RATE_LIMIT_ENABLED=true`, `TENANT_QUOTA_ENABLED=true`.
4. `RATE_LIMIT_BYPASS_LOOPBACK=false`.
5. `CORS_ALLOW_ORIGINS` set to explicit allowlist.

## D. Memory/profile baseline

1. Set production recall baseline (`MEMORY_RECALL_PROFILE=strict_edges` or policy override).
2. Apply throughput production profile (`npm run -s env:throughput:prod`).
3. Keep standalone/lite profile only for local/demo paths.

## E. Gate evidence before cutover

1. Local precheck:
   - `npm run -s gate:memory-store-p2:local`
2. Remote CI evidence precheck (local machine with `gh` auth):
   - `npm run -s gate:memory-store-p2:remote`
3. CI must be green:
   - `backend-parity-smoke`
   - `sdk-ci`
   - `core-production-gate`
4. Ops checks:
   - `npm run -s preflight:prod`
   - `npm run -s gate:core:prod -- --base-url <url> --scope default`

## Cutover Plan (Minimal)

1. Freeze schema changes during cutover window.
2. Run migrations on target DB.
3. Bring up worker first, then API replicas.
4. Run health + capability probes on target environment.
5. Switch traffic gradually and monitor request/error/latency telemetry.

## Rollback Plan (Minimal)

1. Route traffic back to previous known-good deployment.
2. Keep failed release image/tag immutable for audit.
3. Re-run:
   - `npm run -s job:health-gate -- --strict-warnings --consistency-check-set scope`
   - `npm run -s job:consistency-check:cross-tenant -- --strict-warnings`

## References

1. [README](./README.md)
2. [Operator Runbook](./OPERATOR_RUNBOOK.md)
3. [Prod Go-Live Gate](./PROD_GO_LIVE_GATE.md)
4. [Production Core Gate](./PRODUCTION_CORE_GATE.md)
5. [HA Failure Drill Template](./HA_FAILURE_DRILL_TEMPLATE.md)
6. [HA Failure Drill Sample](./HA_FAILURE_DRILL_SAMPLE.md)
