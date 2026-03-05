# Changelog

All notable changes to Aionis core are documented in this file.

The format is based on Keep a Changelog and this project follows SemVer for tagged core releases.

## [0.2.8] - 2026-03-05

### Fixed

1. Fixed `SANDBOX_ADMIN_ONLY` enforcement to read `X-Admin-Token` from request headers correctly in sandbox routes.
2. Hardened remote sandbox execution against DNS rebinding by pinning outbound HTTP(S) connections to validated resolved IP addresses.
3. Added a bounded remote response-body guard for sandbox remote executor transport to prevent unbounded in-memory buffering.
4. Added contract-smoke regression coverage for remote transport pinning and oversized response handling.

## [0.2.7] - 2026-03-05

### Changed

1. Extended replay execution with sandbox-native backends in `playbooks/run` (`local_process`, `sandbox_sync`, `sandbox_async`) plus project-scoped execution input.
2. Added replay safety controls for sensitive command execution (`sensitive_review_mode`, explicit override gating) and surfaced decision evidence in replay step reports.
3. Hardened replay review shadow validation with deeper sandbox policy controls (`profile=fast|balanced|thorough`, `execution_mode=sync|async_queue`) and pending-state reporting.
4. Synced replay API references and rollout plan status to reflect Phase 3-6 progress and current operational contracts.

## [0.2.6] - 2026-03-05

### Changed

1. Re-aligned public API documentation with runtime routes, including `GET /v1/memory/sessions/:session_id/events` and sandbox artifact endpoint visibility.
2. Closed SDK parity gaps by exposing replay automation routes and additional memory-control endpoints across TypeScript and Python SDKs.
3. Updated SDK docs and exported type surfaces so published clients match current server contracts without replay/policy coverage drift.

## [0.2.4] - 2026-03-03

### Changed

1. Promoted URI-first and planner lifecycle updates to release baseline, including `/v1/memory/tools/run` execution lifecycle coverage and expanded URI-linked object surfaces.
2. Added experimental sandbox runtime capabilities with remote execution hardening, budget controls, retention handling, telemetry probes, and stress tooling.
3. Synced docs and integration contracts (MCP/OpenWork/LangGraph), plus coordinated release metadata for core, npm, PyPI, and Docker channels.

## [0.2.3] - 2026-03-02

### Changed

1. Promoted post-`v0.2.2` production updates into a new release baseline, including context orchestration API hardening and dual-layer diagnostics/telemetry coverage.
2. Advanced Playground and Ops usability with the new three-pane workflow UI, bilingual controls, and API-template contract alignment.
3. Updated docs/runbooks and release metadata to the coordinated `0.2.3` baseline across core, npm, PyPI, and Docker channels.

## [0.2.2] - 2026-03-02

### Changed

1. Promoted all post-`v0.2.1` production updates to release baseline, including evidence-pack gate hardening, MCP/docs consistency fixes, and Ops console decision-first UI refresh.
2. Unified coordinated distribution baseline to `0.2.2` across core, npm, PyPI, and Docker release lanes.

## [0.2.1] - 2026-03-01

### Changed

1. Promoted post-`v0.2.0` stability hardening to release baseline, including Ops console route/middleware safeguards and e2e smoke reliability fixes.
2. Extended admin/control API and SDK parity coverage into the default CI line so capability negotiation checks are enforced outside parity-only workflows.
3. Added perf gate refinements for profile comparison, including a stable benchmark profile and tighter preflight behavior for phase-4 smoke and consistency checks.

## [0.1.2] - 2026-02-22

### Changed

1. GitHub Pages documentation stack migrated from Jekyll to VitePress, with custom-domain support (`doc.aionisos.com`) and root-path asset serving.
2. Docs UX refreshed with a modern home layout and interactive evidence widgets (compression estimator and recall profile explorer).
3. Release metadata aligned so core versioning is no longer pinned to `0.1.0` in repository runtime metadata.

### Added

1. `docs/public/CNAME` for custom docs domain binding.
2. VitePress site toolchain under `docs-site/`.
3. VitePress theme extension under `docs/.vitepress/theme/`.

## [0.1.1] - 2026-02-17

### Added

1. Initial public core release baseline and container distribution channel.
