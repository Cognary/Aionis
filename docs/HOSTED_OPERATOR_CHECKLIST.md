---
title: "Hosted Operator Checklist"
---

# Hosted Operator Checklist

Last updated: `2026-02-21`

Use this checklist for hosted staging and production operations.

## 1. Pre-Deploy

1. Config posture:
- `APP_ENV=prod`
- `MEMORY_AUTH_MODE=api_key` or `jwt`
- `RATE_LIMIT_ENABLED=true`
- `TENANT_QUOTA_ENABLED=true`
- `RATE_LIMIT_BYPASS_LOOPBACK=false`
- non-fake embedding provider configured
- `CONTROL_TELEMETRY_RETENTION_HOURS` set for dashboard data horizon

2. Gate commands:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s preflight:hosted -- --run-gates
npm run -s gate:core:prod -- --base-url "http://localhost:${PORT:-3001}" --scope default --run-perf false
```

## 2. Tenant Onboarding

1. Create tenant.
2. Create project(s).
3. Create API key(s) and distribute once.
4. Set tenant quota profile (or confirm default policy).
5. Validate key auth via `/health` + smoke write/recall.

## 3. Weekly Operations

1. Governance report:

```bash
npm run -s job:governance-weekly-report -- --scope default --window-hours 168 --strict-warnings
```

2. Dead-letter review and replay drill.
3. Quota pressure review by tenant.
4. Error budget and SLO trend review.
5. Control audit review:
- `GET /v1/admin/control/audit-events?limit=200`
6. Key hygiene:
- rotate high-risk keys with `POST /v1/admin/control/api-keys/:id/rotate`
- run SLA checker: `npm run -s job:hosted-key-rotation-sla -- --strict`
7. Key-prefix abuse/anomaly review:
- `npm run -s job:hosted-key-usage-anomaly -- --strict`
8. Telemetry retention cleanup:
- `npm run -s job:hosted-telemetry-retention -- --strict`

## 4. Incident Triage

1. Identify blast radius:
- tenant(s)
- scope(s)
- API surface (write/recall/recall_text)

2. Collect artifacts:
- core gate summary
- hosted preflight summary
- worker logs
- replay/dead-letter evidence
- control audit events filtered by `tenant_id` and `request_id`
- tenant dashboard snapshot (`GET /v1/admin/control/dashboard/tenant/:tenant_id`)

3. Immediate mitigations:
- revoke compromised key
- lower tenant quotas if abuse
- rollback to prior image if regression

## 5. Release Sign-off

1. Fill hosted evidence bundle:
- `docs/HOSTED_RELEASE_EVIDENCE_BUNDLE_TEMPLATE.md`
2. Export hosted incident bundle:
- `npm run -s incident:bundle:hosted -- --scope default --tenant-id <tenant>`
3. If required, publish bundle to object storage with evidence signature:
- `INCIDENT_BUNDLE_SIGNING_KEY=<secret> npm run -s incident:bundle:hosted -- --scope default --tenant-id <tenant> --publish-target s3://<bucket>/<prefix>`
4. Confirm workflow green:
- `core-production-gate.yml`
- `hosted-staging-gate.yml`
- `docs-pages.yml` (if docs changed)
5. Attach Docker digest + SDK versions (if changed).

## Verification Stamp

1. Last reviewed: `2026-02-21`
2. Owner: `ops + release engineering`
