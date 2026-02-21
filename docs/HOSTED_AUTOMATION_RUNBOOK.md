---
title: "Hosted Automation Runbook"
---

# Hosted Automation Runbook

Last updated: `2026-02-21`

This runbook covers hosted automation for:

1. key rotation SLA + stale-key alerting,
2. tenant latency/error-budget timeseries export,
3. incident evidence bundle export.

## 1) Key Rotation SLA Check

Command:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:hosted-key-rotation-sla -- --strict --max-age-days 30 --warn-age-days 21 --rotation-window-days 30 --out artifacts/hosted/key_sla/summary.json
```

Output:

- stale active keys older than SLA threshold,
- tenants without recent rotation events,
- warning-window keys nearing SLA violation.

## 2) Tenant Timeseries Export

Command:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:hosted-tenant-timeseries-export -- --tenant-id tenant_acme --window-hours 168 --out-dir artifacts/hosted/timeseries/tenant_acme
```

Output:

1. `summary.json`
2. `TIMESERIES_REPORT.md`

Metrics:

- per-hour request totals by endpoint (`write`, `recall`, `recall_text`),
- error-budget consumption (`server_errors + throttled`),
- p50/p95/p99 latency.

## 3) Incident Bundle Export

Command:

```bash
cd /Users/lucio/Desktop/Aionis
ADMIN_TOKEN=<admin_token> \
npm run -s incident:bundle:hosted -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope default \
  --tenant-id tenant_acme \
  --window-hours 168
```

Default bundle steps:

1. `gate:core:prod` (`run-perf=false`)
2. governance weekly report (`--strict-warnings`)
3. key rotation SLA check
4. tenant timeseries export
5. audit/dashboard snapshot from admin APIs

Output directory:

- `artifacts/hosted_incident_bundle/<run_id>/`

## Admin API Endpoints for Dashboard/Ops

1. `GET /v1/admin/control/api-keys/stale`
2. `GET /v1/admin/control/audit-events`
3. `GET /v1/admin/control/dashboard/tenant/:tenant_id`
4. `GET /v1/admin/control/dashboard/tenant/:tenant_id/timeseries`

## Verification Stamp

1. Last reviewed: `2026-02-21`
2. Owner: `ops + core`
