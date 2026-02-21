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
- `/v1/admin/control/tenant-quotas`

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

3. Revoke API key

`POST /v1/admin/control/api-keys/:id/revoke`

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
