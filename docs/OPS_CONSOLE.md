---
title: "Ops Console"
---

# Ops Console

`apps/ops` is the internal Next.js control and monitoring console built on top of existing `admin/control` APIs.

It provides:

1. `Dashboard` (`/`): runtime + tenant monitoring snapshot.
2. `Governance` (`/governance`): execution-loop snapshot + decision replay inspector + audit risk slice.
3. `Audit` (`/audit`): write-focused control audit stream.
4. `Actions` (`/actions`): explicit admin write operations with safety gates.

## Page Map

### Dashboard (`/`)

Primary data sources:

1. `GET /health`
2. `GET /v1/admin/control/dashboard/tenant/:tenant_id`
3. `GET /v1/admin/control/diagnostics/tenant/:tenant_id`
4. `GET /v1/admin/control/dashboard/tenant/:tenant_id/timeseries`
5. `GET /v1/admin/control/dashboard/tenant/:tenant_id/key-usage`
6. `GET /v1/admin/control/dashboard/tenant/:tenant_id/incident-publish-rollup`
7. `GET /v1/admin/control/dashboard/tenant/:tenant_id/incident-publish-slo`
8. `GET /v1/admin/control/audit-events`

Panel groups:

1. Runtime health (`database_target_hash`, backend mode, feature capabilities)
2. Tenant snapshot (`nodes/edges`, active rules, recalls/commits, outbox state)
3. Request telemetry (`total`, `error_rate`, `p95/p99`)
4. Recall pipeline and outbox diagnostics
5. Incident publish rollup + SLO
6. Timeseries buckets (latest)
7. API key usage anomaly
8. Control audit preview

### Audit (`/audit`)

Focused view over `GET /v1/admin/control/audit-events`:

1. `write_only=true` is the recommended default.
2. Risk badges for fast triage (`high` / `medium` / `low`).
3. Supports focus by `request_id` and quick copy actions.
4. Actor/action/resource/request_id tuples are shown in one table.

### Governance (`/governance`)

Operationalized evidence surface for memory-policy execution:

1. Execution-loop snapshot from diagnostics (`recall_text` error/latency + outbox state).
2. Audit risk slice (write-like/high-risk/replay action counts).
3. Decision replay inspector via `POST /v1/memory/tools/decision`.
4. One-screen evidence commands for governance gates and benchmark runs.

### Actions (`/actions`)

Allow-listed write operations:

1. `POST /v1/admin/control/alerts/routes`
2. `POST /v1/admin/control/incident-publish/jobs/replay`
3. `PUT /v1/admin/control/tenant-quotas/:tenant_id`
4. `DELETE /v1/admin/control/tenant-quotas/:tenant_id`

Safety defaults:

1. Incident replay defaults to `dry_run=true`.
2. Replay statuses are restricted to `failed` and `dead_letter`.
3. Requests are proxied via `app/api/control/execute/route.js` and limited to known operations.
4. Dangerous actions are blocked unless `OPS_DANGEROUS_ACTIONS_ENABLED=true`.

## Runtime Environment

Required:

```bash
AIONIS_BASE_URL=http://127.0.0.1:3001
AIONIS_ADMIN_TOKEN=your-admin-token
```

`AIONIS_ADMIN_TOKEN` can fall back to `ADMIN_TOKEN`.

Optional memory-auth headers (for decision replay lookup):

```bash
AIONIS_API_KEY=your-memory-api-key
# or
AIONIS_AUTH_BEARER=Bearer <jwt>
```

Optional Basic Auth:

```bash
OPS_BASIC_AUTH_ENABLED=true
OPS_BASIC_AUTH_USER=ops
OPS_BASIC_AUTH_PASS=change-me
```

Optional IP allowlist with trusted proxy chain:

```bash
OPS_IP_ALLOWLIST=127.0.0.1,::1,10.0.0.0/8
OPS_TRUSTED_PROXY_CIDRS=10.0.0.0/8,192.168.0.0/16
```

Rules:

1. `x-forwarded-for` / `x-real-ip` are trusted only when the direct peer IP is in `OPS_TRUSTED_PROXY_CIDRS`.
2. In `NODE_ENV=production`, setting `OPS_IP_ALLOWLIST` without `OPS_TRUSTED_PROXY_CIDRS` fails closed at startup.

Dangerous-action gate:

```bash
OPS_DANGEROUS_ACTIONS_ENABLED=false
```

When disabled (default), blocked actions include:

1. Replay with `dry_run=false`
2. Replay with `allow_all_tenants=true`
3. Tenant quota delete

## Local Run

```bash
npm --prefix apps/ops install
npm run -s ops:dev
npm run -s ops:build
npm run -s ops:start
```

## Validation

```bash
node --test scripts/ci/ops-*.test.mjs
npx --prefix apps/ops playwright install chromium
npm --prefix apps/ops run test:e2e:smoke
```

## Related References

1. [API Contract](./API_CONTRACT.md)
2. [Operator Runbook](./OPERATOR_RUNBOOK.md)
3. [Prod Go-Live Gate](./PROD_GO_LIVE_GATE.md)
