# Changelog

All notable changes to Aionis core are documented in this file.

The format is based on Keep a Changelog and this project follows SemVer for tagged core releases.

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
