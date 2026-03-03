---
title: "Production Go-Live Gate"
---

# Production Go-Live Gate

Last updated: `2026-03-03`

Use this gate to decide if a release can receive production traffic.

## Go/No-Go Rule

Mark **go** only when:

1. P0/P1 issues are closed.
2. [Production Core Gate](/public/en/operations/03-production-core-gate) is passing.
3. Rollback plan is validated and owned.

## T-24h Checklist

1. Production auth, rate limits, and tenant controls are enabled.
2. CORS allowlists are explicit for public and admin surfaces.
3. Build, contract checks, and docs checks are green.
4. SDK/package versioning is consistent with release tag.
5. Release owner and rollback owner are assigned.

## T-2h Checklist

1. Target environment health is green.
2. Write -> recall -> policy flow smoke passes on production-like scope.
3. Core gate re-run passes against target URL.
4. Monitoring and alert channels are active.

## One-Command Acceptance

```bash
npm run -s gate:core:prod -- \
  --base-url "https://api.your-domain.com" \
  --scope default
```

## Release Record (Required)

Capture these for every release:

1. Release tag and image digest.
2. Core gate run summary.
3. Smoke validation evidence.
4. Rollback target version.
5. Release decision (`go` / `no-go`) with approver.

## Rollback Minimum

1. Route traffic to last known-good version.
2. Keep failed version immutable for audit.
3. Re-run health and consistency checks.
4. Publish an incident/release note with next action.

## Related

1. [Production Core Gate](/public/en/operations/03-production-core-gate)
2. [Standalone to HA Runbook](/public/en/operations/06-standalone-to-ha-runbook)
3. [Operator Runbook](/public/en/operations/02-operator-runbook)
