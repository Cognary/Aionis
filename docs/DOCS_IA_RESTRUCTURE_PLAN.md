---
title: "Docs IA Restructure Plan"
---

# Docs IA Restructure Plan

Last updated: 2026-03-03

## Progress Update (2026-03-03)

Phase 1 pilot executed:

1. Added `docs/public/en`, `docs/public/zh`, and `docs/internal` skeleton.
2. Migrated five core pages to new public paths:
   - `public/en/getting-started/01-get-started.md`
   - `public/en/guides/01-build-memory.md`
   - `public/en/guides/02-playground.md`
   - `public/en/operations/01-ops-console.md`
   - `public/en/api/01-api-contract.md`
3. Kept legacy root-path compatibility stubs at original file paths.
4. Updated VitePress nav/sidebar to point to new pilot paths.
5. Excluded `docs/internal/**` from public site build.

Phase 2 (core public migration) started:

1. Migrated additional public core pages:
   - `public/en/getting-started/02-onboarding-5min.md`
   - `public/en/getting-started/03-embedding-setup.md`
   - `public/en/operations/00-operate.md`
   - `public/en/integrations/00-overview.md`
   - `public/en/integrations/01-mcp.md`
   - `public/en/reference/01-reference.md`
2. Kept compatibility stubs on legacy root paths.
3. Updated VitePress nav/sidebar and docs indexes to new public paths.
4. Added `public/zh` mirrored placeholders for core onboarding/build/api/ops/integration/reference pages.

## 1. Objective

Refactor Aionis docs to an OpenViking-style information architecture:

1. Fixed top-level sections with clear user journey.
2. Public docs and internal docs strictly separated.
3. Stable ordering and naming rules for long-term maintainability.
4. No content loss and no broken public links during migration.

## 2. Design Principles

1. Structure-first: reshape navigation and file placement before rewriting content.
2. Public-first: only public-safe docs are published to `doc.aionisos.com`.
3. Backward-safe: keep temporary redirects/aliases for high-traffic pages.
4. Single source of truth: each topic has one canonical page path.

## 3. Target Architecture

Proposed public tree (OpenViking-style, adapted for Aionis):

```text
docs/
  public/
    en/
      getting-started/
      concepts/
      guides/
      api/
      operations/
      integrations/
      benchmarks/
      reference/
      faq/
      about/
    zh/
      getting-started/
      concepts/
      guides/
      api/
      operations/
      integrations/
      benchmarks/
      reference/
      faq/
      about/
  internal/
    plans/
    remediation/
    gtm/
    audits/
    release-working/
```

## 4. Section Definition

1. `getting-started`: onboarding, 5-minute setup, first run.
2. `concepts`: model, memory graph, URI system, context orchestration model.
3. `guides`: task-oriented implementation guides.
4. `api`: API contract and endpoint group pages.
5. `operations`: runbooks, gates, SLO/diagnostics, failure drills.
6. `integrations`: MCP/OpenWork/LangGraph and ecosystem adapters.
7. `benchmarks`: benchmark method, snapshot, evidence reports.
8. `reference`: SDK matrix, config reference, glossary-like pages.
9. `faq`: common usage and troubleshooting Q&A.
10. `about`: changelog, roadmap, release notes entry points.

## 5. Naming Rules

1. Use numeric prefixes inside each section: `01-...`, `02-...`.
2. Use kebab-case filenames for new pages.
3. Keep page titles stable and user-facing; path changes should not change product terms.
4. Keep Chinese and English structure mirrored.

## 6. Migration Mapping (Current -> Target)

Priority P0 public pages:

1. `GET_STARTED.md` -> `public/en/getting-started/01-get-started.md`
2. `ONBOARDING_5MIN.md` -> `public/en/getting-started/02-onboarding-5min.md`
3. `BUILD_MEMORY.md` -> `public/en/guides/01-build-memory.md`
4. `CONTEXT_ORCHESTRATION.md` -> `public/en/concepts/01-context-orchestration.md`
5. `PLAYGROUND.md` -> `public/en/guides/02-playground.md`
6. `OPS_CONSOLE.md` -> `public/en/operations/01-ops-console.md`
7. `OPERATOR_RUNBOOK.md` -> `public/en/operations/02-operator-runbook.md`
8. `API_CONTRACT.md` -> `public/en/api/01-api-contract.md`
9. `SDK.md` -> `public/en/reference/01-sdk.md`
10. `MCP_INTEGRATION.md` -> `public/en/integrations/01-mcp.md`
11. `BENCHMARKS.md` -> `public/en/benchmarks/01-overview.md`
12. `BENCHMARK_SNAPSHOT_PUBLIC.md` -> `public/en/benchmarks/02-snapshot.md`

Internal-only candidates (move out of public build):

1. `*_PLAN.md`
2. `*_REMEDIATION_*.md`
3. `COMMERCIAL_STRATEGY.md`
4. `PACKAGING_PLAN.md`
5. `OPENVIKING_BORROW_PLAN.md`
6. `RELEASE_MATERIAL_*.md`

## 7. Execution Phases

### Phase 1: Skeleton and Build Split

1. Create `docs/public` and `docs/internal` directories.
2. Move only a minimal pilot set of public pages into `docs/public/en`.
3. Update VitePress source root and sidebar to read from `docs/public`.
4. Keep old root pages as temporary stubs linking to new paths.

### Phase 2: Core Public Migration

1. Migrate all public-facing docs into sectioned structure.
2. Build Chinese mirror for core entry pages first:
   `getting-started`, `guides`, `api`, `operations`.
3. Add FAQ and About hubs.
4. Remove duplicated or overlapping pages.

### Phase 3: Internal Isolation

1. Move plan/remediation/strategy docs to `docs/internal`.
2. Exclude `docs/internal/**` from VitePress build and GitHub Pages artifact.
3. Add internal index page for local-only navigation.

### Phase 4: Link and Navigation Cleanup

1. Replace root-level old links in README/docs/app links.
2. Add redirect stubs for high-traffic legacy URLs.
3. Run full dead-link check across docs and README.

## 8. Risk Control

1. Link break risk:
   Mitigation: keep temporary stub pages and run docs link check each phase.
2. Doc drift risk:
   Mitigation: do migration by section with explicit owner review.
3. Bilingual inconsistency risk:
   Mitigation: enforce mirrored folder structure and minimum parity checklist.

## 9. Acceptance Criteria

1. Public site navigation uses sectioned IA only.
2. No internal strategy/remediation docs appear on `doc.aionisos.com`.
3. All top-level user journeys are reachable in 2 clicks.
4. Zero broken internal links in public docs build.
5. Core pages have both EN and ZH routes for onboarding path.

## 10. Immediate Next Step

Start Phase 1 with a non-breaking pilot:

1. Introduce `docs/public/en` skeleton.
2. Migrate `GET_STARTED`, `BUILD_MEMORY`, `API_CONTRACT`, `PLAYGROUND`, `OPS_CONSOLE`.
3. Switch sidebar to new paths while keeping old-page compatibility stubs.
