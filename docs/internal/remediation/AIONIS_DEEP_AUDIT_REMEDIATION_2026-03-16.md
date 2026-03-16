# Aionis Deep Audit Remediation 2026-03-16

## Scope

This remediation closes the highest-risk gaps found during the deep review of replay, resolve, and runtime ingress hardening.

Fixed areas:

1. Replay writes now preserve lane and owner identity across route injection, schema validation, write preparation, replay mirrors, and governed replay fan-out calls.
2. `memory/resolve` now enforces private-lane visibility for `edge`, `commit`, and `decision` payloads in both Postgres and Lite implementations.
3. Proxy trust is now fail-closed in production when `TRUST_PROXY=true` without explicit trusted CIDRs, and request guards derive client IP from verified proxy peers only.
4. Regression coverage now includes replay visibility, Lite resolve visibility, and trusted-proxy fail-closed behavior.

## Code Changes

### Replay visibility and ownership

- `src/app/request-guards.ts`
  - Extended replay read/write kinds so authenticated principals inject `consumer_*`, `producer_*`, and `owner_*` fields consistently.
- `src/memory/schemas.ts`
  - Added replay consumer/write identity fields to replay lifecycle, playbook, run, repair, review, and dispatch requests.
- `src/memory/replay.ts`
  - Added replay visibility helpers.
  - Enforced replay store reads through consumer visibility.
  - Preserved write identity on replay run/step/end/playbook operations.
  - Fixed `replayPlaybookDispatch` and `replayPlaybookRun` internal fan-out calls to carry consumer/owner identity end-to-end.
- `src/memory/replay-write.ts`
  - Replay sqlite/postgres mirror extraction now uses the prepared write payload, so normalized lane/owner fields are not lost before mirror persistence.
- `src/store/replay-access.ts`
  - Postgres replay access now selects replay ownership fields and filters private rows by owner match.
- `src/store/lite-replay-store.ts`
  - Lite replay mirror schema now stores lane/owner fields and filters replay reads by owner match.

### Resolve visibility

- `src/memory/resolve.ts`
  - Added owner-aware visibility filters for `edge`, `commit`, and `decision`.
  - Commit resolve now hides commits that include invisible private nodes.
  - Decision resolve now hides decisions linked to invisible commits or invisible private source-rule nodes.
- `src/store/lite-write-store.ts`
  - Added Lite-side commit/decision/edge visibility helpers so sqlite inspection paths fail closed the same way as Postgres.

### Proxy trust hardening

- `src/util/ip-guard.ts`
  - Added CIDR parsing and trusted forwarded-IP resolution helpers.
- `src/config.ts`
  - Added `TRUSTED_PROXY_CIDRS`.
  - Production now fails closed when `TRUST_PROXY=true` and no trusted CIDRs are configured.
- `src/app/request-guards.ts`
  - Rate limiting, recall debug checks, and loopback bypass now use verified client IP resolution instead of blindly trusting forwarded headers.
- `.env.example`
  - Added `TRUSTED_PROXY_CIDRS` example entry.
- `docs/public/en/operations/06-standalone-to-ha-runbook.md`
  - Documented the required trusted CIDR configuration for production proxy deployments.

## Regression Coverage

- `scripts/ci/lite-replay-routes.test.mjs`
  - Verifies authenticated replay writes remain visible to the owner and hidden from a foreign consumer.
- `scripts/ci/lite-find-resolve-routes.test.mjs`
  - Verifies private `edge`, `commit`, and `decision` resolve paths 404 for non-owners and resolve for the owner.
- `scripts/ci/trusted-proxy-config.test.mjs`
  - Verifies production fails closed without `TRUSTED_PROXY_CIDRS`.
  - Verifies forwarded IP headers are ignored when the direct peer is not in a trusted proxy CIDR.

## Verification

Commands run after remediation:

```bash
npm run -s build
node --test scripts/ci/lite-find-resolve-routes.test.mjs scripts/ci/lite-replay-routes.test.mjs
node --test scripts/ci/trusted-proxy-config.test.mjs
npm run -s docs:check
npm audit --omit=dev --json
```

## Remaining Follow-up

At audit time, production dependencies still included a Fastify advisory on `5.7.4` (`GHSA-573f-x89g-hqp9`). The remediation is not complete until the runtime dependency is upgraded and the production audit is clean.
