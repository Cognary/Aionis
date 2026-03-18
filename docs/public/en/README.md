---
title: "Aionis Public Docs"
---

# Aionis Docs

Aionis gives coding agents execution memory, so the next session can continue the work instead of rereading the repository and reconstructing the same reasoning from scratch.

Recent larger-project evidence in this repository showed:

1. about `30.03%` lower input tokens
2. about `77%` lower output tokens
3. about `33.24%` lower total tokens

for cross-session continuation with Aionis-backed recovery.

Recent handoff and replay evidence now also shows:

1. cross-runtime handoff recovery improving success from `33.33%` to `100%`
2. real-repo strict replay running at `0` model tokens on `pallets/click`
3. guided replay spending model tokens only when repair is required
4. real-repo policy A/B improving success from `0%` to `100%` while converging tool routing onto `rg` and `pytest-focused`

## Layer 1 Snapshot

| Capability | Baseline | With Aionis | Result |
| --- | --- | --- | --- |
| Handoff | `file_export` | `aionis_handoff` | `0% -> 100%` on a real `pallets/click` repo task |
| Policy | no policy / broad tools | `aionis_policy` | `0% -> 100%`, routing converged to `rg` + `pytest-focused` |
| Replay | rerun from scratch | compile + strict replay | replay runs succeeded at `0` model tokens |

See [Layer 1 Capability Matrix](/public/en/benchmarks/14-layer1-capability-matrix) for the full controlled A/B view.

## SDK and CLI Snapshot

1. TypeScript SDK and Python SDK now cover the audited developer-facing route surface.
2. On `2026-03-14`, Aionis ran a `65`-route SDK audit over non-admin, non-control-plane routes and found `no missing` surface in either SDK.
3. The TypeScript package now also ships a Phase 1 local developer CLI: `aionis dev`, `stop`, `health`, `doctor`, and `selfcheck`.

Start with:

1. [SDK Guide](/public/en/reference/05-sdk)
2. [SDK Compatibility Matrix](/public/en/reference/06-sdk-compatibility-matrix)
3. [SDK CLI](/public/en/reference/09-sdk-cli)
4. [Aionis Doc](/public/en/reference/10-aionis-doc)
5. [Python SDK + Aionis CLI](/public/en/getting-started/08-python-sdk-with-cli)

## Start Here

1. [Choose Lite vs Server](/public/en/getting-started/07-choose-lite-vs-server)
2. [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
3. [Python SDK + Aionis CLI](/public/en/getting-started/08-python-sdk-with-cli)
4. [3-Minute Lite Setup Without a Local Repo](/public/en/getting-started/09-no-local-repo-lite)
5. [Embedding Setup](/public/en/getting-started/03-embedding-setup)
5. [Build Memory Workflows](/public/en/guides/01-build-memory)
6. [Playground](/public/en/guides/02-playground)
7. [Docs Navigation Map](/public/en/overview/02-docs-navigation)

## Choose Your Product Path

1. **Lite**: local single-user SQLite-backed edition in controlled public beta
2. **Server**: self-hosted open-core runtime for production-oriented deployment
3. **Cloud**: managed direction outside the public repository runtime surface

## Why Teams Use Aionis

1. Execution memory that captures how work gets done, not just what was said.
2. Context assembly with explicit layers, budgets, and compaction controls.
3. Replay, playbooks, and repair flows that turn successful runs into reusable runtime assets.
4. Governance, diagnostics, and production runbooks that keep agent systems operable after launch.
5. Reproducible evidence for continuity and token savings, not only narrative claims.

## Evidence First

1. [Benchmark Snapshot](/public/en/benchmarks/02-benchmark-snapshot-public)
2. [Differentiation Evidence](/public/en/benchmarks/03-differentiation-evidence)
3. [Performance Baseline](/public/en/benchmarks/05-performance-baseline)
4. [Agent Handoff and Replay](/public/en/benchmarks/07-agent-handoff-and-replay)
5. [Real GitHub Repo Policy A/B](/public/en/benchmarks/11-real-repo-policy-ab)
6. [Aionis Evidence Overview](/public/en/benchmarks/13-aionis-evidence-overview)
7. [Layer 1 Capability Matrix](/public/en/benchmarks/14-layer1-capability-matrix)
8. [L1 Distilled Facts](/public/en/benchmarks/15-l1-distilled-facts)

## Continue By Need

1. [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
2. [Overview](/public/en/overview/01-overview)
3. [Core Concepts](/public/en/core-concepts/00-core-concepts)
4. [Architecture](/public/en/architecture/01-architecture)
5. [Integrations](/public/en/integrations/00-overview)
6. [API Reference](/public/en/api-reference/00-api-reference)
7. [Roadmap](/public/en/roadmap/00-roadmap)
