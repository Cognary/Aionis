---
title: "Operator Runbook"
---

# Operator Runbook

This runbook is the public operations baseline for production Aionis deployments.

## Daily Checks

1. Service health and readiness

```bash
curl -sS http://localhost:${PORT:-3001}/health | jq
```

2. Core production gate

```bash
npm run -s gate:core:prod -- --base-url "http://localhost:${PORT:-3001}" --scope default
```

3. Planner/policy sanity

```bash
curl -sS http://localhost:${PORT:-3001}/v1/memory/rules/evaluate \
  -H 'content-type: application/json' \
  -d '{"context":{"intent":"support_triage"}}' | jq '{matched}'
```

## Weekly Checks

1. Run benchmark snapshot workflow used in your environment.
2. Review governance and consistency report outputs.
3. Confirm replayability for one recent incident-class request chain.

## Incident Response Flow

1. Capture IDs: `request_id`, `run_id`, `decision_id`, `commit_uri`.
2. Resolve core objects via `POST /v1/memory/resolve`.
3. Replay policy path with same context and compare decisions.
4. Apply rollback or policy adjustments through approved control path.

## Change Management

Before production changes:

1. Run core gate in staging.
2. Verify auth/isolation configuration in target environment.
3. Verify rollback path and operator ownership.

After production changes:

1. Re-run core gate.
2. Validate p95 latency and error-rate against baseline.
3. Record change outcome in operations log.

## Recommended SLO Guardrails

1. Recall p95 within team-defined target.
2. Write p95 within team-defined target.
3. Error rate below release threshold.
4. Tenant/scope isolation checks remain clean.

## Related

1. [Production Core Gate](/public/en/operations/03-production-core-gate)
2. [Prod Go-Live Gate](/public/en/operations/04-prod-go-live-gate)
3. [HA Failure Drill Template](/public/en/operations/07-ha-failure-drill-template)
4. [Operate and Production](/public/en/operate-production/00-operate-production)
