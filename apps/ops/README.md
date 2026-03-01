# Aionis Ops (Next.js)

Internal ops console for Aionis control/monitoring surfaces.

## Scope (MVP)

Dashboard page (`/`) over existing APIs:

- `GET /health`
- `GET /v1/admin/control/dashboard/tenant/:tenant_id`
- `GET /v1/admin/control/diagnostics/tenant/:tenant_id`
- `GET /v1/admin/control/dashboard/tenant/:tenant_id/timeseries`
- `GET /v1/admin/control/dashboard/tenant/:tenant_id/key-usage`
- `GET /v1/admin/control/dashboard/tenant/:tenant_id/incident-publish-rollup`
- `GET /v1/admin/control/dashboard/tenant/:tenant_id/incident-publish-slo`
- `GET /v1/admin/control/audit-events`

Audit page (`/audit`):

- Focused view over `GET /v1/admin/control/audit-events`
- Default `write_only=true` filtering for write-like control actions
- Risk badges for fast triage (`high`/`medium`/`low`)

Actions page (`/actions`) for explicit write operations:

- `POST /v1/admin/control/alerts/routes`
- `POST /v1/admin/control/incident-publish/jobs/replay`
- `PUT /v1/admin/control/tenant-quotas/:tenant_id`
- `DELETE /v1/admin/control/tenant-quotas/:tenant_id`

Safety defaults:

- Incident replay defaults to `dry_run=true`.
- Replay statuses are restricted to `failed` and `dead_letter`.
- All action calls are routed through `app/api/control/execute/route.js` and only support allow-listed operations.
- Actions result panel includes an `Open in Audit` shortcut with prefilled filters and auto-focus (`focus_request_id` or `focus_latest`).
- `Open in Audit` includes a row anchor (`#focus-row`) so the page jumps directly to the highlighted row.
- Focused audit view supports one-click copy for `request_id` and current audit filter URL.
- Actions page includes browser-local breadcrumbs (timestamp/op/status/request_id/payload summary) with one-click clear.
- Breadcrumbs support quick filtering by `op/status` and export to JSON.
- Breadcrumbs support JSON import and read-only replay view (`Prev/Next`) for incident review.
- Breadcrumb exports are versioned (`schema_version`), and import stays backward-compatible with legacy array / `{ items: [] }` payloads.
- Breadcrumb import validates payload shape, operation allowlist, item count (<=500), and file size (<=256KB).
- Imported replay view surfaces detected import format (`array` / `object_items` / `versioned_object`) and schema version.
- Imported replay panel supports one-click copy for the current replay item.

## Environment

```bash
AIONIS_BASE_URL=http://127.0.0.1:3001
AIONIS_ADMIN_TOKEN=your-admin-token
```

`AIONIS_ADMIN_TOKEN` can also fallback to `ADMIN_TOKEN`.

Optional Basic Auth gate for Ops UI/API:

```bash
OPS_BASIC_AUTH_ENABLED=true
OPS_BASIC_AUTH_USER=ops
OPS_BASIC_AUTH_PASS=change-me
```

Notes:

- If `OPS_BASIC_AUTH_USER` and `OPS_BASIC_AUTH_PASS` are set, Basic Auth is enabled automatically.
- `OPS_BASIC_AUTH_ENABLED=true` requires both user/password to be set; otherwise requests fail with `500`.

Optional IP allowlist gate:

```bash
OPS_IP_ALLOWLIST=127.0.0.1,::1,10.0.0.0/8
# Trusted reverse proxies allowed to supply X-Forwarded-For / X-Real-IP:
OPS_TRUSTED_PROXY_CIDRS=10.0.0.0/8,192.168.0.0/16
```

Notes:

- Comma-separated values.
- Supports exact IP (`127.0.0.1`, `::1`) and IPv4 CIDR (`10.0.0.0/8`).
- When set, requests not in allowlist return `403` before auth checks.
- `x-forwarded-for` / `x-real-ip` are trusted only when the direct peer IP is in `OPS_TRUSTED_PROXY_CIDRS`.
- In `NODE_ENV=production`, setting `OPS_IP_ALLOWLIST` without `OPS_TRUSTED_PROXY_CIDRS` fails closed at startup.

Optional dangerous write gate:

```bash
OPS_DANGEROUS_ACTIONS_ENABLED=false
```

When disabled (default), the following are blocked in `/actions`:

- incident replay with `dry_run=false`
- incident replay with `allow_all_tenants=true`
- tenant quota delete

## Run

```bash
npm --prefix apps/ops install
npm run -s ops:dev
npm run -s ops:build
npm run -s ops:start
node --test scripts/ci/ops-*.test.mjs
npx --prefix apps/ops playwright install chromium
npm --prefix apps/ops run test:e2e:smoke
```
