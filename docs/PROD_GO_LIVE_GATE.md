---
title: "Production Go-Live Gate"
---

# Production Go-Live Gate

Last updated: `2026-02-23`

This document is the release gate for deciding whether Aionis can go to production traffic.

## Release Decision

Only mark **go** when all P0/P1 items are closed and all **production core gate** checks below pass.

Auxiliary benchmarks (`LongMemEval` / `LoCoMo`) are non-blocking regression evidence and should not block release decisions.

## T-24h Checklist

1. Secrets and config
- `.env` / runtime env must use production credentials and secret manager sources.
- Apply throughput production profile baseline:
  - `npm run -s env:throughput:prod`
- `APP_ENV=prod`
- `MEMORY_AUTH_MODE` is not `off` (`api_key`, `jwt`, or `api_key_or_jwt`).
- `RATE_LIMIT_ENABLED=true`
- `TENANT_QUOTA_ENABLED=true`
- `RATE_LIMIT_BYPASS_LOOPBACK=false`
- If deployed behind reverse proxy/load-balancer, set `TRUST_PROXY=true` and verify real client IP attribution.
- Set `CORS_ALLOW_ORIGINS` to explicit production allowlist (do not rely on wildcard behavior).

2. Build and contract
- `npm run -s build`
- `npm run -s test:contract`
- `npm run -s docs:check`

3. Integrity gates
- `npm run -s job:health-gate -- --strict-warnings --consistency-check-set scope`
- `npm run -s job:consistency-check:cross-tenant -- --strict-warnings`

4. SDK and packaging
- `npm run -s sdk:build`
- `npm run -s sdk:release-check`
- `npm run -s sdk:py:compile`
- `npm run -s sdk:py:release-check`
- `npm run -s sdk:pack-dry-run`

## T-2h Checklist

1. Runtime readiness
- `docker compose up -d`
- `docker compose ps` shows `api` and `worker` as `Up`.
- `docker compose logs worker --tail=200` has no `tsx: not found` and no crash loop.

2. Smoke value path (isolated scope)
- `make quickstart`
- Must pass strict demo criteria:
  - `memory_recall_improved=true`
  - `cross_session_recall_stable=true`

3. Preflight gate
- Run production preflight in strict orchestration mode:

```bash
APP_ENV=prod \
MEMORY_AUTH_MODE=api_key \
RATE_LIMIT_ENABLED=true \
TENANT_QUOTA_ENABLED=true \
RATE_LIMIT_BYPASS_LOOPBACK=false \
PREFLIGHT_START_SERVICES_IF_NEEDED=false \
SKIP_MIGRATE=true \
npm run -s preflight:prod
```

## One-Command Acceptance (recommended)

Run this from repo root to fail-fast on hard blockers:

```bash
npm run -s gate:core:prod -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope default \
  --run-control-admin-validation true \
  --run-perf true \
  --recall-p95-max-ms 1200 \
  --write-p95-max-ms 800 \
  --error-rate-max 0.02
```

## Publish Commands

1. Docker image dry-run:

```bash
npm run -s docker:publish:ghcr:dry-run
```

2. Docker image publish:

```bash
export GHCR_USERNAME=<your_user>
export GHCR_TOKEN=<your_token>
IMAGE_REPO=ghcr.io/cognary/aionis \
TAG=vX.Y.Z \
PLATFORMS=linux/amd64,linux/arm64 \
PUBLISH_LATEST=true \
npm run -s docker:publish:ghcr
```

3. SDK publish (if version changed and release approved):

```bash
npm run -s sdk:publish:dry-run
npm run -s sdk:py:build-dist
npm run -s sdk:py:publish:dry-run
```

4. GitHub checks must be green for release commit before announcing GA.

## Rollback Minimum

1. Re-point deployment to previous known-good Docker tag.
2. Keep failed tag immutable for audit.
3. Re-run:
- `npm run -s job:health-gate -- --strict-warnings --consistency-check-set scope`
- `npm run -s job:consistency-check:cross-tenant -- --strict-warnings`

## Final Gate Output

Record these artifacts per release:

- `artifacts/preflight/<run_id>/summary.json`
- CI run URLs (SDK CI + Docs Pages)
- Docker image digest for released tag
- SDK version evidence (npm/PyPI)
