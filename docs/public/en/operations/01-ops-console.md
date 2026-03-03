---
title: "Ops Console"
---

# Ops Console

Ops Console is the operational UI for monitoring Aionis health, governance signals, and controlled admin actions.

## Core Screens

1. **Dashboard**: service health, request performance, tenant-level activity.
2. **Governance**: policy-loop quality, decision replay checks, risk indicators.
3. **Audit**: write-oriented audit stream with request-level trace lookup.
4. **Actions**: approved admin operations with built-in safeguards.

## Minimum Environment

```bash
AIONIS_BASE_URL=https://api.your-domain.com
AIONIS_ADMIN_TOKEN=your_admin_token
```

Optional memory auth for replay/resolve features:

```bash
AIONIS_API_KEY=your_memory_api_key
# or
AIONIS_AUTH_BEARER=Bearer <jwt>
```

## Security Baseline

1. Protect console access with authentication.
2. Use IP allowlists for admin surface exposure.
3. Trust forwarded client IP only behind trusted proxies.
4. Keep destructive actions disabled by default; enable only with explicit approval.

Recommended defaults:

```bash
OPS_BASIC_AUTH_ENABLED=true
OPS_DANGEROUS_ACTIONS_ENABLED=false
```

## Local Run

```bash
npm --prefix apps/ops install
npm run -s ops:dev
```

Production build:

```bash
npm run -s ops:build
npm run -s ops:start
```

## Operator Workflow

1. Confirm dashboard health before making control changes.
2. Validate governance signal quality for active traffic slices.
3. Execute only allowlisted actions with recorded `request_id` evidence.
4. Re-check health and consistency immediately after change.

## Related

1. [Operator Runbook](/public/en/operations/02-operator-runbook)
2. [Production Core Gate](/public/en/operations/03-production-core-gate)
3. [Production Go-Live Gate](/public/en/operations/04-prod-go-live-gate)
