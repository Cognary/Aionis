---
title: "Docs Index"
---

# Docs Index

This is the complete Aionis documentation catalog, organized by user journey.

## 1) Start

1. [Documentation Home](./index.md)
2. [Get Started](./public/en/getting-started/01-get-started.md)
3. [Core Differentiators](./public/en/about/01-core-differentiators.md)
4. [5-Minute Onboarding](./public/en/getting-started/02-onboarding-5min.md)
5. [Embedding Setup](./public/en/getting-started/03-embedding-setup.md)

## 2) Build Memory

1. [Build Memory](./public/en/guides/01-build-memory.md)
2. [Context Orchestration](./public/en/concepts/01-context-orchestration.md)
3. [Playground](./public/en/guides/02-playground.md)
4. [Planner Context](./public/en/reference/02-planner-context.md)
5. [Architecture](./public/en/concepts/02-architecture.md)
6. [Context Orchestrator Plan](./CONTEXT_ORCHESTRATOR_PLAN.md)

## 3) Control & Policy

1. [Control & Policy](./public/en/control/01-control-policy.md)
2. [Rule Lifecycle](./public/en/control/02-rule-lifecycle.md)
3. [Execution Loop Gate](./public/en/control/03-execution-loop-gate.md)
4. [Policy Adaptation Gate](./public/en/control/04-policy-adaptation-gate.md)
5. [Rule Promotion Governance](./public/en/reference/03-rule-promotion-governance.md)
6. [Rule Conflict Report](./public/en/reference/04-rule-conflict-report.md)

## 4) Operate

1. [Operate](./public/en/operations/00-operate.md)
2. [Operator Runbook](./public/en/operations/02-operator-runbook.md)
3. [Ops Console](./public/en/operations/01-ops-console.md)
4. [Production Core Gate](./public/en/operations/03-production-core-gate.md)
5. [Prod Go-Live Gate](./public/en/operations/04-prod-go-live-gate.md)
6. [E2E Regression Checklist](./public/en/operations/05-e2e-regression.md)
7. [Standalone to HA Runbook](./public/en/operations/06-standalone-to-ha-runbook.md)
8. [HA Failure Drill Template](./public/en/operations/07-ha-failure-drill-template.md)
9. [HA Failure Drill Sample](./public/en/operations/08-ha-failure-drill-sample.md)

## 5) Integrations

1. [Integrations Overview](./public/en/integrations/00-overview.md)
2. [MCP Integration](./public/en/integrations/01-mcp.md)
3. [OpenWork (OpenCode Desktop)](./public/en/integrations/02-openwork.md)
4. [LangGraph](./public/en/integrations/03-langgraph.md)

## 6) Reference

1. [Reference](./public/en/reference/01-reference.md)
2. [API Contract](./public/en/api/01-api-contract.md)
3. [SDK Guide](./public/en/reference/05-sdk.md)
4. [SDK Compatibility Matrix](./public/en/reference/06-sdk-compatibility-matrix.md)
5. [URI Expansion Plan](./public/en/reference/07-uri-expansion-plan.md)

## 7) Benchmarks & Evidence

1. [Benchmarks](./public/en/benchmarks/01-benchmarks.md)
2. [Benchmark Snapshot (Public)](./public/en/benchmarks/02-benchmark-snapshot-public.md)
3. [Performance Baseline](./public/en/benchmarks/05-performance-baseline.md)
4. [AionisBench v0.1](./public/en/benchmarks/06-aionis-bench-v01.md)
5. [Differentiation Evidence](./public/en/benchmarks/03-differentiation-evidence.md)
6. [Governance Weekly Report](./public/en/benchmarks/04-governance-weekly-report.md)

## Website & Tooling

1. Publish workflow: `.github/workflows/docs-pages.yml`
2. VitePress config: `docs/.vitepress/config.ts`
3. Theme override: `docs/.vitepress/theme/custom.css`
4. URL: `https://doc.aionisos.com/`

## Maintenance

```bash
npm --prefix docs-site run dev
npm run docs:check
```
