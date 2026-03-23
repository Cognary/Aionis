# Lite Source Boundary

This repository is intentionally slimmer than the monorepo export it came from.

Current source boundary:
- `apps/lite/` owns the product-facing Lite wrapper.
- `apps/lite/src/index.js` is the source-owned launcher into the Lite runtime.
- `src/runtime-entry-sdk-demo.ts` is the public runtime truth for Lite startup.
- `src/app/runtime-services.ts` is narrowed to Lite-owned store/runtime wiring only.
- `src/app/request-guards.ts` is narrowed to local-only identity and rate-limit guards.
- `src/routes/memory-access.ts` is narrowed to Lite SQLite access only.
- `src/routes/memory-access.ts` also exposes Lite-only anchor payload rehydration without restoring server lifecycle routes.
- `src/routes/memory-feedback-tools.ts` is narrowed to Lite SQLite feedback/rules/tools access only.
- `src/routes/handoff.ts` is narrowed to Lite SQLite handoff store/recover only.
- `src/routes/memory-recall.ts` is narrowed to direct Lite recall access plus Lite rule evaluation.
- `src/routes/memory-context-runtime.ts` is narrowed to direct Lite recall access plus Lite rule/tool assembly.
- `src/routes/memory-replay-governed.ts` is narrowed to Lite replay access plus Lite write-backed governed replay flows.
- `src/routes/memory-sandbox.ts` stays Lite-only while preserving `SANDBOX_ADMIN_ONLY`.
- `packages/runtime-core/` is the shared extraction seam.
- `src/host/http-host-bootstrap-shared.ts` holds the public demo host bootstrap helpers.
- `src/host/http-host-sdk-demo.ts` is the public Lite host surface for SDK demo route registration.
- `src/routes/automations.ts` is reintroduced as a Lite-local automation kernel surface.
- `src/app/replay-repair-review-policy.ts` is narrowed to global plus endpoint defaults only.
- `src/jobs/` is reduced to kernel-linked helpers only:
  - `associative-linking-lib.ts`
  - `topicClusterLib.ts`

Explicitly removed from this repo:
- benchmark, perf, hosted, and backfill jobs
- dev, eval, MCP, SDK, and bench entrypoints
- admin/control and automation route source files
- benchmark fixtures and job docs tied to the full/server topology

Lite-local automation kernel currently supports:
- create/get/list/validate for single-user local automation definitions
- run/get/list/cancel/resume for local playbook-driven automation runs
- SQLite-backed persistence in the Lite write database
- node kinds: `playbook`, `approval`, `condition`, `artifact_gate`
- default local identity via `LITE_LOCAL_ACTOR_ID` so replay/playbook/automation flows work without multi-tenant identity payloads

Still unsupported in Lite:
- archive rehydrate and node activation lifecycle routes
- server-style archive lifecycle orchestration remains unsupported even though Lite may rehydrate anchor-linked payloads locally
- reviewer workflows
- promotion/control-plane flows
- server alerting and admin automation surfaces
- repair approval/rejection workflows
- tenant-scoped replay repair review policy overlays
- compensation tooling, telemetry, and shadow review/report surfaces

Still pending before Lite becomes a clean source-built repo:
- shrink the copied `src/` tree further so only the Lite/shared-core minimum remains
- keep tightening shared-boundary metadata so local automation kernel and server orchestration are described separately
