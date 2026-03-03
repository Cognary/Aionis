---
title: "Standalone to HA Runbook"
---

# Standalone to HA Runbook

Last updated: `2026-03-03`

This runbook defines the migration path from local/standalone usage to production-grade high availability.

## Deployment Tiers

### Tier 0: Standalone

1. Single-container runtime for local dev, demos, and smoke validation.
2. Not suitable for production traffic.

### Tier 1: Single-Host Service

1. Split services (`db`, `api`, `worker`) on one host.
2. Better isolation than standalone, but still single-host failure risk.

### Tier 2: HA Service (Production Target)

1. Managed Postgres with backup and restore policy.
2. Multiple API replicas behind load balancer.
3. Worker deployed independently.
4. Rolling deployment and tested rollback path.

## Production Baseline (Minimum)

```bash
AIONIS_MODE=service
APP_ENV=prod
MEMORY_AUTH_MODE=api_key
RATE_LIMIT_ENABLED=true
TENANT_QUOTA_ENABLED=true
RATE_LIMIT_BYPASS_LOOPBACK=false
TRUST_PROXY=true
CORS_ALLOW_ORIGINS=https://your-app.example.com
DATABASE_URL=postgres://<user>:<pass>@<managed-postgres-host>:5432/<db>
```

Requirements:

1. Never expose production with `MEMORY_AUTH_MODE=off`.
2. Use secret manager values for keys/tokens.
3. Keep standalone image for local/demo only.

## Promotion Checklist (Tier 0/1 -> Tier 2)

1. Externalize database and validate restore drill.
2. Split API and worker as independent services.
3. Run at least 2 API replicas behind load balancer.
4. Enable auth, rate limit, quota, and explicit CORS allowlists.
5. Run core gate and smoke workflow against target environment.

## Cutover Plan

1. Freeze schema-changing work in cutover window.
2. Run migrations on target database.
3. Bring up worker, then API replicas.
4. Validate health and smoke path.
5. Shift traffic gradually and observe latency/error metrics.

## Rollback Plan

1. Redirect traffic to last known-good deployment.
2. Keep failed release artifacts for audit.
3. Re-run health and consistency checks.
4. Resume traffic only after gate passes.

## Success Criteria

1. Production core gate is passing.
2. P95 latency/error rate are within baseline.
3. Replay IDs (`request_id`, `run_id`, `decision_id`, `commit_uri`) are available in telemetry.

## Related

1. [Production Core Gate](/public/en/operations/03-production-core-gate)
2. [Production Go-Live Gate](/public/en/operations/04-prod-go-live-gate)
3. [HA Failure Drill Template](/public/en/operations/07-ha-failure-drill-template)
4. [HA Failure Drill Sample](/public/en/operations/08-ha-failure-drill-sample)
