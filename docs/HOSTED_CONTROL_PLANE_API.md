---
title: "Hosted Control Plane API (MVP)"
---

# Hosted Control Plane API (MVP)

Last updated: `2026-02-21`

This API is for hosted operators, not end-user agent traffic.

## Auth

All control-plane endpoints require:

- Header: `X-Admin-Token: <ADMIN_TOKEN>`

If `ADMIN_TOKEN` is not configured, control-plane APIs return non-success.

## Base Paths

- `/v1/admin/control/tenants`
- `/v1/admin/control/projects`
- `/v1/admin/control/api-keys`
- `/v1/admin/control/alerts/routes`
- `/v1/admin/control/alerts/deliveries`
- `/v1/admin/control/incident-publish/jobs`
- `/v1/admin/control/tenant-quotas`
- `/v1/admin/control/audit-events`
- `/v1/admin/control/dashboard/tenant/:tenant_id`

## Tenant Lifecycle

1. Create/Upsert tenant

`POST /v1/admin/control/tenants`

Request:

```json
{
  "tenant_id": "tenant_acme",
  "display_name": "ACME",
  "status": "active",
  "metadata": { "tier": "growth" }
}
```

2. List tenants

`GET /v1/admin/control/tenants?status=active&limit=100&offset=0`

## Project Lifecycle

1. Create/Upsert project

`POST /v1/admin/control/projects`

Request:

```json
{
  "project_id": "proj_agent_ops",
  "tenant_id": "tenant_acme",
  "display_name": "Agent Ops",
  "status": "active",
  "metadata": { "region": "us" }
}
```

## API Key Lifecycle

1. Create API key

`POST /v1/admin/control/api-keys`

Request:

```json
{
  "tenant_id": "tenant_acme",
  "project_id": "proj_agent_ops",
  "label": "ci-key",
  "role": "member",
  "agent_id": "agent_ci",
  "team_id": "team_ops",
  "metadata": { "owner": "platform" }
}
```

Response includes plaintext `api_key` once. Stored value is hash only.

2. List API keys

`GET /v1/admin/control/api-keys?tenant_id=tenant_acme&status=active`

3. List stale API keys (SLA helper)

`GET /v1/admin/control/api-keys/stale?max_age_days=30&warn_age_days=21&rotation_window_days=30&limit=200`

4. Revoke API key

`POST /v1/admin/control/api-keys/:id/revoke`

5. Rotate API key (atomic revoke + issue new)

`POST /v1/admin/control/api-keys/:id/rotate`

Optional request:

```json
{
  "label": "ci-key-rotated",
  "metadata": { "rotation_reason": "scheduled" }
}
```

Response returns new plaintext `api_key` once and marks old key as revoked.

## Alert Routing

1. Create alert route

`POST /v1/admin/control/alerts/routes`

Request:

```json
{
  "tenant_id": "tenant_acme",
  "channel": "webhook",
  "label": "ops-webhook",
  "events": ["key_rotation_sla_failed", "key_usage_anomaly"],
  "target": "https://ops.example.com/aionis-alerts",
  "secret": "hmac_shared_secret",
  "headers": { "x-env": "prod" },
  "metadata": {
    "owner": "platform",
    "policy": {
      "severity_thresholds": {
        "key_usage_anomaly": { "warning_anomalies": 1, "critical_anomalies": 5 },
        "key_rotation_sla_failed": {
          "warning_stale_count": 1,
          "critical_stale_count": 3,
          "warning_no_recent_rotation": true
        }
      },
      "quiet_windows": [
        {
          "days": [1, 2, 3, 4, 5],
          "start": "00:00",
          "end": "07:00",
          "timezone": "UTC",
          "mode": "warning_only"
        }
      ],
      "dedupe": {
        "key": "{{tenant_id}}:{{event_type}}:{{severity}}:{{route_id}}",
        "ttl_seconds": 1800
      }
    }
  }
}
```

Supported `channel` values:

- `webhook`: generic JSON webhook
- `slack_webhook`: Slack incoming webhook target
- `pagerduty_events`: PagerDuty Events v2 (`secret` used as routing key)

2. List alert routes

`GET /v1/admin/control/alerts/routes?tenant_id=tenant_acme&status=active&limit=100&offset=0`

3. Update route status

`POST /v1/admin/control/alerts/routes/:id/status`

Request:

```json
{
  "status": "disabled"
}
```

4. List alert deliveries

`GET /v1/admin/control/alerts/deliveries?tenant_id=tenant_acme&event_type=key_usage_anomaly&status=failed&limit=200`

Policy DSL notes:

- `severity_thresholds`: event-specific threshold controls.
- `quiet_windows`: route-local suppression or critical->warning downgrade windows.
- `dedupe`: suppress repeated sends within `ttl_seconds` by computed key.

## Incident Publish Queue (Async Mode)

1. Enqueue incident publish job

`POST /v1/admin/control/incident-publish/jobs`

Request:

```json
{
  "tenant_id": "tenant_acme",
  "run_id": "20260221_194500",
  "source_dir": "/Users/lucio/Desktop/Aionis/artifacts/hosted_incident_bundle/20260221_194500",
  "target": "gs://my-bucket/aionis/incidents",
  "max_attempts": 8,
  "metadata": { "trigger": "release_signoff" }
}
```

2. List incident publish jobs

`GET /v1/admin/control/incident-publish/jobs?tenant_id=tenant_acme&status=failed&limit=100&offset=0`

Operational note:

- Sync publish path (`incident:bundle:hosted --publish-target ...`) stores provider attestation at:
  - `artifacts/hosted_incident_bundle/<run_id>/publish_attestation.json`
- Attestation schema varies by adapter:
  - S3: `etag`, `version_id`, `last_modified`
  - GCS: `generation`, `metageneration`, `etag`
  - Azure Blob: `etag`, `version_id`, `last_modified`

## Tenant Quota Profile

1. Upsert quota profile

`PUT /v1/admin/control/tenant-quotas/:tenant_id`

Request:

```json
{
  "recall_rps": 60,
  "recall_burst": 120,
  "write_rps": 20,
  "write_burst": 40,
  "write_max_wait_ms": 300,
  "debug_embed_rps": 1,
  "debug_embed_burst": 4,
  "recall_text_embed_rps": 12,
  "recall_text_embed_burst": 24,
  "recall_text_embed_max_wait_ms": 800
}
```

2. Get quota profile

`GET /v1/admin/control/tenant-quotas/:tenant_id`

3. Delete quota profile (fallback to global defaults)

`DELETE /v1/admin/control/tenant-quotas/:tenant_id`

## Control Audit Events

1. List audit events

`GET /v1/admin/control/audit-events?tenant_id=tenant_acme&action=api_key.rotate&limit=100&offset=0`

Events include:

- actor
- action
- resource type/id
- tenant_id
- request_id
- details json
- created_at

## Hosted Dashboard API

Tenant summary:

`GET /v1/admin/control/dashboard/tenant/:tenant_id`

Returns:

1. control-plane state:
- tenant status
- active/revoked key counts
- quota profile

2. data-plane state:
- nodes/edges counts
- active rules
- recalls in 24h
- commits in 24h
- outbox pending/retrying/failed

Tenant timeseries:

`GET /v1/admin/control/dashboard/tenant/:tenant_id/timeseries?window_hours=168&endpoint=recall&limit=500&offset=0`

Returns per-hour endpoint metrics with latency percentiles and error-budget consumption.
Query options:

- `window_hours`: requested lookback window
- `endpoint`: optional filter (`write|recall|recall_text`)
- `limit` + `offset`: series pagination for dashboard chart pulls
- `cursor`: opaque cursor for high-cardinality pagination (preferred over manual offset)

Timeseries API is retention-aware:

- window is capped by `CONTROL_TELEMETRY_RETENTION_HOURS`
- response includes retention metadata + page metadata
- cursor mode pins an `anchor_utc` snapshot to keep paging results stable

Tenant key usage/anomaly:

`GET /v1/admin/control/dashboard/tenant/:tenant_id/key-usage?window_hours=24&baseline_hours=168&min_requests=30&zscore_threshold=3&limit=200&offset=0`

Returns key-prefix level counters and anomaly signals:

- request spike (`recent / expected >= 2`)
- latency regression (`zscore >= threshold`)
- error budget regression (`server_error + throttled` growth)
- supports `cursor` pagination with snapshot anchor consistency

Note:

- key-prefix telemetry is recorded only for authenticated hosted control-plane keys (`x-api-key`).
- static env API keys still authenticate traffic, but do not produce hosted key-prefix attribution.

## Runtime Behavior

1. Request auth (`x-api-key`) checks static env keys first, then control-plane API keys.
2. Tenant quotas use control-plane profile when present.
3. If no tenant profile exists, env defaults apply.

## Verification

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s build
npm run -s preflight:hosted -- --run-gates
```

## Verification Stamp

1. Last reviewed: `2026-02-21`
2. Owner: `core + hosted ops`
