---
title: "Aionis Docs Restructure Master Plan"
---

# Aionis Docs Restructure Master Plan

Last updated: 2026-03-12

## 1. Why This Plan Exists

This plan replaces the earlier "docs IA cleanup" posture with a product-stage documentation restructure.

The problem is no longer that Aionis lacks documentation. The problem is that the current documentation tree reflects several historical phases at once:

1. early root-level markdown docs
2. the newer `docs/public/en` and `docs/public/zh` trees
3. archived public migration snapshots
4. internal strategy, remediation, progress, and plan logs

At the same time, the codebase has now clearly formed real product surfaces:

1. `Lite` as a local SQLite-backed edition
2. `Server core` as the public open-core runtime
3. `Cloud` as a private control-plane direction
4. `MCP / SDK / Codex local` as first-class integration surfaces
5. `Ops` and `Playground` as real apps
6. `Automation beta` as a bounded public surface

The documentation should now be reorganized around those realities, not around older conceptual migrations.

## 2. Code-Backed Product Reality

This plan is based on the current code, not only the current docs.

### 2.1 Runtime and Editions

The repository now has explicit edition and host boundaries:

1. main host bootstrap and route registration:
   [http-host.ts](/Users/lucio/Desktop/Aionis/src/host/http-host.ts)
2. Lite edition gating:
   [lite-edition.ts](/Users/lucio/Desktop/Aionis/src/host/lite-edition.ts)
3. runtime wiring:
   [runtime-services.ts](/Users/lucio/Desktop/Aionis/src/app/runtime-services.ts)
4. local startup:
   [package.json](/Users/lucio/Desktop/Aionis/package.json) via `start:lite`, `lite:dogfood`

### 2.2 Public Runtime Surfaces

The current HTTP product is not just write/recall. It includes:

1. memory write:
   [memory-write.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-write.ts)
2. recall, recall_text, planning/context, context/assemble:
   [memory-recall.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-recall.ts)
   [memory-context-runtime.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-context-runtime.ts)
3. access surfaces:
   sessions, packs, find, resolve in
   [memory-access.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-access.ts)
4. replay:
   [memory-replay-core.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-replay-core.ts)
   [memory-replay-governed.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-replay-governed.ts)
5. rules/tools policy loop:
   [memory-feedback-tools.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-feedback-tools.ts)
6. lifecycle and sandbox:
   [memory-lifecycle.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-lifecycle.ts)
   [memory-sandbox.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-sandbox.ts)
7. automations:
   [automations.ts](/Users/lucio/Desktop/Aionis/src/routes/automations.ts)
8. admin/control:
   [admin-control-config.ts](/Users/lucio/Desktop/Aionis/src/routes/admin-control-config.ts)
   [admin-control-dashboard.ts](/Users/lucio/Desktop/Aionis/src/routes/admin-control-dashboard.ts)
   [admin-control-entities.ts](/Users/lucio/Desktop/Aionis/src/routes/admin-control-entities.ts)
   [admin-control-alerts.ts](/Users/lucio/Desktop/Aionis/src/routes/admin-control-alerts.ts)

### 2.3 Integration and App Surfaces

The repository also exposes real non-API product surfaces:

1. SDK:
   [client.ts](/Users/lucio/Desktop/Aionis/src/sdk/client.ts)
   [types.ts](/Users/lucio/Desktop/Aionis/src/sdk/types.ts)
2. Dev MCP:
   [aionis-dev-mcp.ts](/Users/lucio/Desktop/Aionis/src/mcp/aionis-dev-mcp.ts)
   [tools.ts](/Users/lucio/Desktop/Aionis/src/mcp/dev/tools.ts)
3. Codex local and launcher flows:
   `aionis:codex`, `aionis:setup:codex`, `aionis:doctor:codex`,
   `aionis:install:codex-launcher`
4. Ops app:
   [/Users/lucio/Desktop/Aionis/apps/ops](/Users/lucio/Desktop/Aionis/apps/ops)
5. Playground app:
   [/Users/lucio/Desktop/Aionis/apps/playground](/Users/lucio/Desktop/Aionis/apps/playground)

### 2.4 Evidence and Gates

The repository now has strong evidence and release-discipline surfaces:

1. benchmark and perf jobs:
   [/Users/lucio/Desktop/Aionis/src/jobs](/Users/lucio/Desktop/Aionis/src/jobs)
2. Lite alpha/beta gates:
   [lite-alpha-gate.ts](/Users/lucio/Desktop/Aionis/src/jobs/lite-alpha-gate.ts)
   [lite-beta-gate.ts](/Users/lucio/Desktop/Aionis/src/jobs/lite-beta-gate.ts)
   [lite-beta-gate-v2.ts](/Users/lucio/Desktop/Aionis/src/jobs/lite-beta-gate-v2.ts)
3. public beta feedback intake:
   [lite-feedback-gate.ts](/Users/lucio/Desktop/Aionis/src/jobs/lite-feedback-gate.ts)
   [lite-public-beta-feedback-wave.ts](/Users/lucio/Desktop/Aionis/src/jobs/lite-public-beta-feedback-wave.ts)

The docs need to mirror this actual product surface.

## 3. Current Documentation Problems

### 3.1 Root-Level Legacy Duplication

The repository still contains many root-level docs such as:

1. [GET_STARTED.md](/Users/lucio/Desktop/Aionis/docs/GET_STARTED.md)
2. [CONTEXT_ORCHESTRATION.md](/Users/lucio/Desktop/Aionis/docs/CONTEXT_ORCHESTRATION.md)
3. [SDK.md](/Users/lucio/Desktop/Aionis/docs/SDK.md)
4. [MCP_INTEGRATION.md](/Users/lucio/Desktop/Aionis/docs/MCP_INTEGRATION.md)
5. [BENCHMARKS.md](/Users/lucio/Desktop/Aionis/docs/BENCHMARKS.md)

These coexist with canonical public pages in `docs/public/**`.

The result is:

1. unclear canonical source of truth
2. duplicated maintenance burden
3. mixed signals for first-time readers

### 3.2 Public IA Reflects Migration History More Than Product Shape

The public tree is much better than the legacy root, but it still reflects older category design:

1. `concepts`
2. `core-concepts`
3. `context-orchestration`
4. `about`
5. `overview`

These categories overlap. For example:

1. [concepts/01-context-orchestration.md](/Users/lucio/Desktop/Aionis/docs/public/en/concepts/01-context-orchestration.md)
2. [context-orchestration/00-context-orchestration.md](/Users/lucio/Desktop/Aionis/docs/public/en/context-orchestration/00-context-orchestration.md)

And:

1. [concepts/02-architecture.md](/Users/lucio/Desktop/Aionis/docs/public/en/concepts/02-architecture.md)
2. [architecture/01-architecture.md](/Users/lucio/Desktop/Aionis/docs/public/en/architecture/01-architecture.md)

This is manageable internally but confusing externally.

### 3.3 README Is Strong, But It Still Mixes Phases

The current [README.md](/Users/lucio/Desktop/Aionis/README.md) has a good category narrative, but it still mixes:

1. product marketing
2. benchmark proof
3. Lite posture
4. quickstart
5. operator evidence

It also still contains stale language such as "Current Lite alpha" in the Lite section, while the repository state has already moved to controlled public beta.

### 3.4 Public Docs Do Not Yet Lead With Product Choices

Today, the most important external choice is:

1. use Lite
2. use Server core
3. integrate through MCP/SDK/Codex

But public navigation still leads more through concept buckets than through product choice and user task.

### 3.5 Internal Docs Need a Lighter Operating Model

Internal docs are valuable, but currently sprawl across:

1. `plans`
2. `progress`
3. `strategy`
4. `architecture`
5. `remediation`
6. `public-archive`

This is useful for history, but there is no clearly defined policy for:

1. canonical internal current-state docs
2. historical logs
3. stale plan retirement

## 4. Restructure Objectives

The new docs structure should achieve five things:

1. make the public repo feel like a product, not a research notebook
2. align public docs with actual code surfaces and actual launch paths
3. reduce duplication and canonical-source ambiguity
4. keep internal strategy/progress docs available without making them feel like public product entrypoints
5. make future Cloud separation cleaner without documenting private implementation detail in the public repo

## 4.1 Evidence Constraint

The restructure must not become a copywriting-only pass.

Public product language should be tied to real repository evidence wherever a claim is central to product positioning.

Required rule:

1. every major public claim should map to at least one concrete evidence page, gate, benchmark, or reproducible workflow

Examples from the current repository:

1. continuity and cross-session resume value:
   [AIONIS_CODEX_VS_AIONIS_AB_TEST_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_CODEX_VS_AIONIS_AB_TEST_2026-03-12.md)
2. larger-project token savings:
   [AIONIS_CLICK_TOKEN_AB_TEST_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_CLICK_TOKEN_AB_TEST_2026-03-12.md)
3. Lite public beta posture:
   [AIONIS_LITE_PUBLIC_BETA_DOGFOOD_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_DOGFOOD_2026-03-12.md)
   [AIONIS_LITE_BETA_GATE_V2_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_BETA_GATE_V2_2026-03-12.md)
4. cost-aware runtime evidence:
   [AIONIS_AGENT_COST_REDUCTION_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_AGENT_COST_REDUCTION_STATUS_2026-03-11.md)

This does not mean all internal experiment logs become public.

It means the public documentation rewrite must explicitly reserve places for:

1. benchmark snapshot links
2. product proof pages
3. reproducible validation commands
4. bounded claims instead of absolute marketing claims

## 5. Canonical Documentation Model

### 5.1 Public

Public docs should answer only these questions:

1. what is Aionis
2. which edition/path should I choose
3. how do I get started
4. how do I build or integrate with it
5. how do I operate it
6. what evidence supports the product claims
7. what is the exact reference/API surface

### 5.2 Internal

Internal docs should answer:

1. what is the current strategy
2. what is the current state
3. what is planned next
4. what has been learned
5. what historical decisions still matter

### 5.3 Legacy

Legacy root docs and old archive material should not remain in the canonical maintenance path.

They should become one of:

1. deleted
2. compatibility stubs
3. archive-only

## 6. Target Public Information Architecture

The public tree should be simplified around product and user journey.

Recommended target top-level public sections:

```text
docs/public/en/
  start/
  products/
  build/
  integrations/
  operate/
  evidence/
  reference/
  roadmap/
```

Recommended mirrored Chinese tree:

```text
docs/public/zh/
  start/
  products/
  build/
  integrations/
  operate/
  evidence/
  reference/
  roadmap/
```

### Section Definitions

1. `start`
   - overview
   - choose Lite vs Server
   - 5-minute onboarding
   - embedder setup

2. `products`
   - Lite
   - Server
   - Cloud boundary statement
   - playground / ops positioning

3. `build`
   - write/recall
   - replay/playbooks
   - rules/tools loop
   - context orchestration
   - automation beta

4. `integrations`
   - MCP
   - Codex local
   - SDK
   - LangGraph / OpenWork / OpenClaw

5. `operate`
   - Lite operator notes
   - troubleshooting
   - ops console
   - production runbooks and gates

6. `evidence`
   - benchmark overview
   - benchmark snapshot
   - differentiation evidence
   - performance baseline
   - selected public A/B proof pages

7. `reference`
   - API reference
   - automation API reference
   - SDK
   - sandbox reference
   - compatibility matrix

8. `roadmap`
   - public roadmap only

## 7. Canonical Page Rules

### 7.1 One Canonical Page Per Topic

These pairs should not both remain canonical:

1. `concepts/01-context-orchestration` vs `context-orchestration/00-context-orchestration`
2. `concepts/02-architecture` vs `architecture/01-architecture`
3. `overview/01-overview` vs `about/02-aionis-onepage` for external entry positioning

Recommended rule:

1. architecture gets one canonical page
2. context orchestration gets one canonical page
3. overview gets one product entry page
4. one-page remains a supporting summary page, not a competing entry page

### 7.2 Root Docs Stop Being Primary

Root-level docs under `/docs/*.md` should no longer be maintained as primary content.

For each root doc, choose one:

1. replace with a short compatibility stub to canonical public path
2. archive it
3. delete it if traffic and value are low

## 8. Product-to-Docs Mapping

### 8.1 Lite

Code-backed sources:

1. `start:lite`
2. `lite:dogfood`
3. Lite gates
4. Lite route support in host/runtime

Docs should expose:

1. Lite quickstart
2. Lite boundary
3. Lite operator notes
4. Lite troubleshooting and feedback

Lite should not be hidden as a sub-note inside the main README anymore. It should be a clearly named product path.

### 8.2 Server Core

Code-backed sources:

1. main host runtime
2. memory routes
3. replay routes
4. policy loop
5. admin/control and automation routes
6. Ops and Playground apps

Docs should expose:

1. self-hosted Server quickstart
2. production operator path
3. admin/control and automation surface as Server-only
4. ops/playground positioning

### 8.3 Cloud

Public repo docs should not document private Cloud implementation.

But public docs should clearly say:

1. Cloud exists as the managed path
2. Cloud is not part of the open public repo surface
3. Server is the self-hosted open-core path

This is a product boundary statement, not an implementation guide.

## 9. Keep / Merge / Archive / Rewrite Decisions

### 9.1 Keep and Strengthen

Keep and strengthen these public assets:

1. [README.md](/Users/lucio/Desktop/Aionis/README.md)
2. [docs/index.md](/Users/lucio/Desktop/Aionis/docs/index.md)
3. Lite public beta pages
4. API reference and SDK docs
5. integrations docs, especially Codex local and MCP
6. benchmark snapshot and performance baseline

### 9.2 Merge

Merge these overlapping content families:

1. `concepts/*` and `core-concepts/*`
   Keep `core-concepts` for canonical model pages; retire duplicate supplements unless they add unique value
2. `concepts/01-context-orchestration` and `context-orchestration/00-context-orchestration`
   Keep one canonical page under `build` or `reference`, not both
3. `concepts/02-architecture` and `architecture/01-architecture`
   Keep only one canonical architecture page
4. `overview/*` and `about/*` entry roles
   make `overview` the navigation and product entry path, keep `about` as short supporting material only

### 9.3 Archive or Stub

These should stop being primary:

1. root docs in `/docs/*.md`
2. `docs/internal/public-archive/**`

The archive should stay for history, but should not remain in active maintenance or navigation.

### 9.4 Rewrite

These need real rewriting, not just moving:

1. README
2. docs homepage
3. docs navigation map
4. role-based reading paths
5. Lite entry pages
6. "choose Lite vs Server" page
7. operator entry path

## 10. Internal Docs Operating Model

Internal docs should be split into:

1. `strategy`
   - current product/commercial framing
2. `plans`
   - active implementation plans only
3. `progress`
   - current operational state logs
4. `architecture`
   - durable architectural specs and checklists
5. `remediation`
   - audit/remediation history

Recommended new rule:

1. every active plan should have one owner and one status line
2. old progress logs older than a threshold should remain but not be referenced from active entry pages
3. `public-archive` remains historical only and should not be expanded

## 11. Implementation Phases

### Phase A: Canonical Entry Cleanup

1. rewrite [README.md](/Users/lucio/Desktop/Aionis/README.md) around product paths:
   Lite, Server, Integrations, Evidence
2. rewrite [docs/index.md](/Users/lucio/Desktop/Aionis/docs/index.md) to match the same model
3. add one explicit public "Choose Lite vs Server" page
4. update onboarding pages to point to product paths instead of old conceptual map

### Phase B: Public IA Consolidation

1. choose canonical pages for:
   - architecture
   - context orchestration
   - overview
2. turn duplicate pages into short redirects or merge them
3. remove old top-level legacy docs from active maintenance

### Phase C: Product Surface Reframing

1. add clear product docs for:
   - Lite
   - Server
   - Cloud boundary
2. give Ops and Playground explicit documentation roles
3. make automation documentation clearly labeled as bounded public beta / Server-oriented

### Phase D: Evidence and Integration Tightening

1. promote hard evidence pages closer to product entry
2. make MCP / Codex local a first-class integration path
3. add one concise page for "Why Aionis reduces token and continuity cost"

### Phase E: Internal Hygiene

1. reduce internal stale plan noise
2. stop growing root docs
3. define archive policy

## 12. Concrete Deliverables

This plan should produce the following concrete outputs:

1. a rewritten README
2. a rewritten docs homepage
3. a new `choose-edition` public page
4. a canonical public navigation map aligned to actual products
5. a canonical "Lite / Server / Cloud boundary" product page
6. one canonical architecture page
7. one canonical context orchestration page
8. a retirement list for root docs
9. an internal archive and stale-plan policy
10. an evidence map that ties each major product claim to a proof page or reproducible check

## 13. Acceptance Criteria

The restructure is complete when:

1. a first-time user can understand Lite vs Server in under 2 clicks
2. MCP/Codex local is presented as a first-class integration path
3. no major public topic has two competing canonical pages
4. root `/docs/*.md` no longer act as the maintained primary documentation set
5. public docs reflect the actual code-backed surfaces in `src/routes`, `apps`, `src/mcp`, and `package.json`
6. internal docs remain available without leaking into public navigation or product entry flow
7. public product claims for Lite posture, continuity value, and token/cost reduction each point to at least one concrete evidence source

## 14. Recommended Immediate Next Step

Do not start by shuffling every file.

Start with the highest leverage product-entry rewrite:

1. rewrite `README.md`
2. rewrite `docs/index.md`
3. create `choose Lite vs Server`
4. define canonical page winners for `architecture` and `context orchestration`

That sequence will create the new shape first. After that, the lower-level page moves and archive cleanup will be much easier and much safer.
