---
title: "Aionis Test Layering"
---

# Aionis Test Layering

Status: `active` (`2026-03-10`)

This note makes the `Phase A4` test buckets executable.

## Scripts

1. `npm run -s test:layer:kernel`
   Maps to externally meaningful kernel contract coverage.
   Current entrypoints:
   - `test:contract`
   - `test:kernel-contract`

2. `npm run -s test:layer:runtime-host`
   Maps to runtime host, adapter, and host-facing helper coverage.
   Current coverage:
   - `scripts/ci/env-example-shell-source.test.mjs`
   - `scripts/ci/probe-common.test.mjs`
   - `scripts/ci/probe-output.test.mjs`
   - `scripts/ci/probes.test.mjs`
   - `scripts/ci/playground-egress-guard.test.mjs`
   - `scripts/ci/embedded-snapshot-telemetry-common.test.mjs`
   - `scripts/ci/embedded-snapshot-telemetry-history-common.test.mjs`
   - `scripts/ci/embedded-snapshot-telemetry-rollup-common.test.mjs`

3. `npm run -s test:layer:control`
   Maps to `Control & Extensions` coverage.
   Current coverage:
   - `scripts/ci/ops-breadcrumb-import.test.mjs`
   - `scripts/ci/ops-middleware-ip-guard.test.mjs`
   - `scripts/ci/ops-replay-ui.test.mjs`
   - `scripts/ci/ops-secret-compare.test.mjs`

4. `npm run -s test:layers`
   Runs all three buckets in order.

5. `npm run -s test:dependency-direction`
   Runs architecture boundary checks for the currently enforced import rules.
   Current hard rules:
   - `src/memory/*` must not import `src/routes/*`
   - `src/memory/*` must not import `src/app/*`
   - `src/memory/*` must not import `src/control-plane.ts`
   - `src/memory/*` must not import `apps/*`
   - `src/app/*` must not import `src/routes/*`
   - `src/app/*` must not import `src/host/*`
   - `src/routes/*` must not import `src/host/*`
   - `src/routes/*` must not import other `src/routes/*` registrars
   - `src/host/*` must not import `src/memory/*`
   - `src/host/*` must not import `apps/*`
   - `src/control-plane.ts` must not import `src/app/*`
   - `src/control-plane.ts` must not import `src/routes/*`
   - `src/control-plane.ts` must not import `src/host/*`
   - `src/control-plane.ts` must not import `apps/*`

## Working Rule

When adding a new non-trivial test, place it into one of the three buckets:

1. `Kernel correctness`
2. `Runtime host and adapter`
3. `Control & Extensions`

If a test does not clearly fit one bucket, the module boundary is probably still unclear and should be called out in review.

For the current minimum kernel contract checklist, see:

1. [/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_KERNEL_CONTRACT_CHECKLIST.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_KERNEL_CONTRACT_CHECKLIST.md)
