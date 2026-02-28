---
title: "Docs Index"
---

# Docs Index

This is the public documentation index for Aionis Open Core.

## Getting Started

- [Documentation Home](./index.md)
- [5-Minute Developer Onboarding](./ONBOARDING_5MIN.md)
- [Architecture](./ARCHITECTURE.md)
- [Open Core Boundary](./OPEN_CORE_BOUNDARY.md)

## API & SDK

- [API Contract](./API_CONTRACT.md)
- [SDK Guide](./SDK.md)
- [SDK Compatibility Matrix](./SDK_COMPATIBILITY_MATRIX.md)
- [Planner Context](./PLANNER_CONTEXT.md)
- [Rule Lifecycle](./RULE_LIFECYCLE.md)
- [Execution Loop Gate](./EXECUTION_LOOP_GATE.md)
- [Policy Adaptation Gate](./POLICY_ADAPTATION_GATE.md)

## Deploy & Ops

- [Operator Runbook](./OPERATOR_RUNBOOK.md)
- [Standalone to HA Runbook](./STANDALONE_TO_HA_RUNBOOK.md)
- [HA Failure Drill Template](./HA_FAILURE_DRILL_TEMPLATE.md)
- [HA Failure Drill Sample](./HA_FAILURE_DRILL_SAMPLE.md)
- [Prod Go-Live Gate](./PROD_GO_LIVE_GATE.md)
- [Production Core Gate](./PRODUCTION_CORE_GATE.md)
- [Two-Phase Migrations](./MIGRATIONS_TWO_PHASE.md)
- [Docker Release Runbook](./DOCKER_RELEASE.md)
- [E2E Regression Checklist](./E2E_REGRESSION.md)

## Performance & Evidence

- [Performance Baseline](./PERFORMANCE_BASELINE.md)
- [Recall Tail Latency Plan](./RECALL_TAIL_LATENCY_PLAN.md)
- [Adaptive Compression Plan](./ADAPTIVE_COMPRESSION_PLAN.md)
- [AionisBench v0.1](./AIONIS_BENCH_V01.md)

## Integrations

- [OpenWork (MCP)](./OPENWORK_INTEGRATION.md)
- [LangGraph](./LANGGRAPH_INTEGRATION.md)

## Narrative (Optional)

- [Narrative Canon](./NARRATIVE_CANON.md)
- [Packaging Plan](./PACKAGING_PLAN.md)
- [Release Narrative Template](./RELEASE_NARRATIVE_TEMPLATE.md)
- [Technical Release Material](./RELEASE_MATERIAL_TECHNICAL.md)
- [Product Release Material](./RELEASE_MATERIAL_PRODUCT.md)
- [Business Release Material](./RELEASE_MATERIAL_BUSINESS.md)

## Scope Notes

This documentation set covers the Open Core surface (kernel, API/SDK contracts, and public operations/evidence gates).
Managed/hosted control-plane runbooks and GTM execution docs are intentionally not published here.

## Maintenance

```bash
npm --prefix docs-site run dev
npm run docs:check
```

## Docs Website (GitHub Pages)

- Publish workflow: `.github/workflows/docs-pages.yml`
- VitePress config: `docs/.vitepress/config.ts`
- Theme override: `docs/.vitepress/theme/custom.css`
- URL: `https://doc.aionisos.com/`

## Public Release Baseline

1. Core release tag: `v0.2.0` (latest tagged release)
2. npm SDK: `0.2.0`
3. PyPI SDK: `0.2.0`
4. Docker line: `v0.2.0` (main), `standalone-v0.2.0` (standalone)
