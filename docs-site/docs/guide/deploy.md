# Deploy

This page describes migration from local runtime to production HA.

## What this page covers

1. The deployment shape from local development to HA production.
2. The minimum configuration required before live traffic.
3. A practical cutover and rollback sequence.

## Deployment tiers

1. Tier 0: standalone container for local/dev.
2. Tier 1: single-host split (`db`, `api`, `worker`).
3. Tier 2: HA target with managed Postgres and multi-replica API.

## Production baseline

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

## Promotion checklist

1. Externalize database and validate backup/restore drill.
2. Run API and workers independently.
3. Run at least two API replicas behind a load balancer.
4. Enable auth, quota, rate-limit, and CORS controls.
5. Run core gate before cutover.

## Feature bundle starting points

If you want a faster starting point before refining per-environment secrets and network settings, apply one of the built-in feature bundles:

```bash
npm run -s env:bundle:team-shared
```

For local evaluation:

```bash
npm run -s env:bundle:local-safe
npm run -s env:bundle:experimental
```

Do not use `env:bundle:high-risk` as a normal production baseline. Reserve it for short-lived, explicitly approved operator windows.

See:

1. [Tutorial: Feature Bundles](/guide/tutorials/feature-bundles)

## Cutover steps

1. Freeze schema-changing work in cutover window.
2. Run migrations on target DB.
3. Start workers, then API replicas.
4. Verify health + smoke path.
5. Shift traffic gradually while monitoring p95 and error rate.

## Rollback minimum

1. Shift traffic to last known-good release.
2. Preserve failed release artifacts for audit.
3. Re-run core health and consistency checks.

## Post-deploy verification

Immediately after deployment:

1. Run a fresh `write` and `recall_text` request in the target environment.
2. Run one policy evaluation request with a real `run_id`.
3. Confirm logs contain `request_id`, `decision_id`, and `commit_uri`.
4. Confirm dashboards show stable error rate and latency.
5. Capture one replayable execution path before declaring success.
