---
title: "Hosted Automation Runbook"
---

# Hosted Automation Runbook

Last updated: `2026-02-21`

This runbook covers hosted automation for:

1. key rotation SLA + stale-key alerting,
2. tenant latency/error-budget timeseries export,
3. incident evidence bundle export + publish,
4. key-prefix usage anomaly checks,
5. request telemetry retention cleanup,
6. tenant alert dispatch routing,
7. incident evidence checksum/signature verify.

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
  --window-hours 168 \
  --dispatch-alerts \
  --publish-async \
  --publish-target "s3://my-bucket/aionis/incident-bundles"
```

`--publish-target` supports:

- `s3://bucket/prefix`
- `gs://bucket/prefix`
- `az://account/container/prefix` (Azure account mode)
- `az://container/prefix` with `AZURE_STORAGE_CONNECTION_STRING`
- `file:///path` or local path
- add `--publish-async` to queue publish jobs instead of immediate upload

Standalone publisher plugin:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s incident:publish:hosted -- \
  --source-dir artifacts/hosted_incident_bundle/<run_id> \
  --target gs://my-bucket/aionis/incidents \
  --run-id <run_id>
```

Async queue worker:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:hosted-incident-publish-worker -- --max-jobs 50 --strict
```

Default bundle steps:

1. `gate:core:prod` (`run-perf=false`)
2. governance weekly report (`--strict-warnings`)
3. key rotation SLA check
4. tenant timeseries export
5. key-prefix usage anomaly check
6. optional tenant alert dispatch (`--dispatch-alerts`, default dry-run)
7. audit/dashboard snapshot from admin APIs
8. evidence index generation (+ optional HMAC signature)
9. evidence checksum/signature verification
10. optional publish to object storage/local target

Output directory:

- `artifacts/hosted_incident_bundle/<run_id>/`
- includes `evidence_index.json` and optional `evidence_index.sig.json`

## 4) Key-Prefix Usage Anomaly Check

Command:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:hosted-key-usage-anomaly -- \
  --tenant-id tenant_acme \
  --window-hours 24 \
  --baseline-hours 168 \
  --min-requests 30 \
  --zscore-threshold 3 \
  --strict \
  --out artifacts/hosted/key_usage/tenant_acme.json
```

## 5) Telemetry Retention Cleanup

Command:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:hosted-telemetry-retention -- \
  --older-than-hours 720 \
  --batch-limit 20000 \
  --max-passes 20 \
  --strict \
  --out artifacts/hosted/telemetry_retention/summary.json
```

## 6) Tenant Alert Dispatch

Dry-run dispatch (recommended for rehearsal):

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:hosted-alert-dispatch -- \
  --tenant-id tenant_acme \
  --dry-run \
  --out artifacts/hosted/alert_dispatch/tenant_acme.json
```

Live dispatch:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:hosted-alert-dispatch -- \
  --tenant-id tenant_acme \
  --strict \
  --out artifacts/hosted/alert_dispatch/tenant_acme_live.json
```

Route policy DSL (configured in route `metadata.policy`) is applied in dispatch order:

1. severity thresholds
2. quiet window policy
3. dedupe TTL/key suppression

## 7) Incident Evidence Verify

Command:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:hosted-incident-verify -- \
  --bundle-dir artifacts/hosted_incident_bundle/<run_id> \
  --strict
```

## Admin API Endpoints for Dashboard/Ops

1. `GET /v1/admin/control/api-keys/stale`
2. `GET /v1/admin/control/audit-events`
3. `GET /v1/admin/control/dashboard/tenant/:tenant_id`
4. `GET /v1/admin/control/dashboard/tenant/:tenant_id/timeseries`
5. `GET /v1/admin/control/dashboard/tenant/:tenant_id/key-usage`
6. `GET /v1/admin/control/alerts/routes`
7. `GET /v1/admin/control/alerts/deliveries`

## Verification Stamp

1. Last reviewed: `2026-02-21`
2. Owner: `ops + core`
