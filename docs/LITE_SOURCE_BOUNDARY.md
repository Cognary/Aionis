# Lite Source Boundary

This repository is intentionally slimmer than the monorepo export it came from.

Current source boundary:
- `apps/lite/` owns the product-facing Lite wrapper.
- `apps/lite/src/index.js` is the source-owned launcher into the Lite runtime.
- `src/runtime-entry-sdk-demo.ts` is the public runtime truth for Lite startup.
- `src/app/runtime-services.ts` is narrowed to Lite-owned store/runtime wiring only.
- `src/app/request-guards.ts` is narrowed to local-only identity and rate-limit guards.
- `src/routes/sdk-demo-memory-access.ts` is the public Lite demo access surface.
- `src/routes/sdk-demo-memory-access.ts` also exposes Lite-only anchor payload rehydration without restoring server lifecycle routes.
- `src/routes/sdk-demo-memory-feedback-tools.ts` is the public Lite demo feedback/rules/tools surface.
- `src/routes/memory-context-runtime.ts` is narrowed to direct Lite recall access plus Lite rule/tool assembly.
- `src/routes/sdk-demo-memory-replay-governed.ts` is the public Lite replay-governed demo surface.
- `packages/runtime-core/` is the shared extraction seam.
- `src/host/http-host-bootstrap-shared.ts` holds the public demo host bootstrap helpers.
- `src/host/http-host-sdk-demo.ts` is the public Lite host surface for SDK demo route registration.
- `src/app/replay-repair-review-policy.ts` is narrowed to global plus endpoint defaults only.
- `src/jobs/` is reduced to kernel-linked helpers only:
  - `associative-linking-lib.ts`
  - `topicClusterLib.ts`

Explicitly removed from this repo:
- benchmark, perf, hosted, and backfill jobs
- dev, eval, MCP, SDK, and bench entrypoints
- admin/control, automation, handoff, recall-core, and sandbox route source files
- legacy feedback/find/resolve/sessions/packs/tool-run helper modules no longer required by the public SDK demo surface
- benchmark fixtures and job docs tied to the full/server topology

Still unsupported in Lite:
- archive rehydrate and node activation lifecycle routes
- server-style archive lifecycle orchestration remains unsupported even though Lite may rehydrate anchor-linked payloads locally
- reviewer workflows
- promotion/control-plane flows
- server alerting, automation, handoff, recall-core, and sandbox surfaces
- repair approval/rejection workflows
- tenant-scoped replay repair review policy overlays
- compensation tooling, telemetry, and shadow review/report surfaces

Still pending before Lite becomes a clean source-built repo:
- shrink the copied `src/` tree further so only the Lite/shared-core minimum remains
- keep deleting legacy non-demo memory helper modules as they fall out of the `public:keep-manifest`
- keep tightening shared-boundary metadata so public demo and private runtime surfaces are described separately
