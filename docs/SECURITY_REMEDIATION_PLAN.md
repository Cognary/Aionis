# Security Remediation Plan

Date: 2026-02-23
Owner: Aionis Core
Status: In Progress

## Scope

This plan tracks remediation for the security findings identified in the deep code audit:

1. `pack export/import` bypasses private-lane visibility and ownership constraints.
2. Rule engine allows unbounded user-controlled regex execution.
3. JWT auth path does not require `exp` claim.
4. Proxy/IP assumptions may weaken rate-limit behavior in production.
5. Some operational defaults are too weak for production if copied as-is.

## Priorities

- P0: Data confidentiality and tenant/lane isolation violations.
- P1: Abuse and availability risks.
- P2: Hardening and operational safety.

## Execution Plan

### Phase 1 (P0) - Pack isolation hardening

- [x] Restrict `POST /v1/memory/packs/export` to admin-only.
- [x] Restrict `POST /v1/memory/packs/import` to admin-only.
- [x] Add explicit docs note: pack APIs are operator pathways, not general client APIs.
- [x] Validate that non-admin callers now receive `401 unauthorized_admin`.

Acceptance:

- Non-admin API key/JWT cannot export or import packs.
- Existing admin workflows remain functional.

Rollback:

- Revert endpoint guard changes in `src/index.ts`.

### Phase 2 (P1) - Rule-engine regex safety

- [x] Add regex length and complexity guard in rule engine.
- [x] Fail closed on unsafe patterns.
- [x] Add unit/contract coverage for safe vs unsafe regex cases.

Acceptance:

- Catastrophic backtracking patterns are rejected.
- Existing simple regex matching still works.

### Phase 3 (P1) - JWT expiry hardening

- [x] Require `exp` claim when `APP_ENV=prod`.
- [x] Keep compatibility path for non-prod local dev where explicitly allowed.
- [x] Document token requirements (`exp`, recommended `iss/aud`).

Acceptance:

- In production mode, tokens without `exp` are rejected.

### Phase 4 (P2) - Deployment hardening

- [x] Document required `trustProxy` behavior for reverse proxy deployments.
- [x] Set secure CORS guidance for production allowlist.
- [x] Clarify local-only weak defaults in docker examples.

Acceptance:

- Runbook and `.env.example` clearly separate local defaults from production requirements.

## Progress Log

- 2026-02-23: Plan created.
- 2026-02-23: Phase 1 implementation started.
- 2026-02-23: `packs/export` and `packs/import` switched to admin-only guards in API routes.
- 2026-02-23: API contract updated to document pack endpoints as `X-Admin-Token` required.
- 2026-02-23: Production JWT auth now requires `exp` claim (`jwtRequireExp`).
- 2026-02-23: Rule-engine regex safety guard added with fail-closed behavior; contract smoke coverage added.
- 2026-02-23: `TRUST_PROXY` introduced and wired to Fastify; CORS default tightened (`prod` no implicit `*`).
- 2026-02-23: `.env.example` updated with proxy/CORS hardening guidance.
- 2026-02-23: Admin-token guard extracted and covered in contract smoke (`503` when not configured, `401` on bad token).
- 2026-02-23: JWT docs updated with production `exp` requirement and `iss/aud` hardening recommendation.
- 2026-02-23: Non-prod JWT compatibility retained (`exp` required only when `APP_ENV=prod`).
- 2026-02-23: Control alert route creation now enforces HTTPS/public-routable targets with channel-specific host rules (Slack/PagerDuty) and contract smoke coverage.
- 2026-02-23: Incident publish enqueue input now validates `source_dir` (absolute local path, no dot-segments) and `target` URI (allowlist schemes `https/s3/gs/az/abfs/oci/arn`; rejects local path / unsafe schemes / private hosts), with contract smoke coverage.
- 2026-02-23: Added HTTP smoke `e2e:control-admin-validation` to assert control alert/incident invalid inputs return expected `400` error codes.
- 2026-02-23: `regression:oneclick` now includes optional `e2e:control-admin-validation` step (`RUN_CONTROL_ADMIN_VALIDATION`, default true on dev/ci and false on prod).
- 2026-02-23: `core-production-gate` now supports optional control admin validation smoke (`--run-control-admin-validation true|false`, default false) and reports result in gate summary.
