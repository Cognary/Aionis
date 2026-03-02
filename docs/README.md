---
title: "Docs Index"
---

# Docs Index

This is the complete Aionis documentation catalog, organized by user journey.

## 1) Start

1. [Documentation Home](./index.md)
2. [Get Started](./GET_STARTED.md)
3. [Core Differentiators](./CORE_DIFFERENTIATORS.md)
4. [5-Minute Onboarding](./ONBOARDING_5MIN.md)
5. [Embedding Setup](./EMBEDDING_SETUP.md)

## 2) Build Memory

1. [Build Memory](./BUILD_MEMORY.md)
2. [Context Orchestration](./CONTEXT_ORCHESTRATION.md)
3. [Playground](./PLAYGROUND.md)
4. [Planner Context](./PLANNER_CONTEXT.md)
5. [Architecture](./ARCHITECTURE.md)
6. [Context Orchestrator Plan](./CONTEXT_ORCHESTRATOR_PLAN.md)

## 3) Control & Policy

1. [Control & Policy](./CONTROL_POLICY.md)
2. [Rule Lifecycle](./RULE_LIFECYCLE.md)
3. [Execution Loop Gate](./EXECUTION_LOOP_GATE.md)
4. [Policy Adaptation Gate](./POLICY_ADAPTATION_GATE.md)
5. [Rule Promotion Governance](./RULE_PROMOTION_GOVERNANCE.md)
6. [Rule Conflict Report](./RULE_CONFLICT_REPORT.md)

## 4) Operate

1. [Operate](./OPERATE.md)
2. [Operator Runbook](./OPERATOR_RUNBOOK.md)
3. [Ops Console](./OPS_CONSOLE.md)
4. [Production Core Gate](./PRODUCTION_CORE_GATE.md)
5. [Prod Go-Live Gate](./PROD_GO_LIVE_GATE.md)
6. [E2E Regression Checklist](./E2E_REGRESSION.md)
7. [Standalone to HA Runbook](./STANDALONE_TO_HA_RUNBOOK.md)
8. [HA Failure Drill Template](./HA_FAILURE_DRILL_TEMPLATE.md)
9. [HA Failure Drill Sample](./HA_FAILURE_DRILL_SAMPLE.md)

## 5) Integrations

1. [Integrations Overview](./INTEGRATIONS.md)
2. [MCP Integration](./MCP_INTEGRATION.md)
3. [OpenWork (OpenCode Desktop)](./OPENWORK_INTEGRATION.md)
4. [LangGraph](./LANGGRAPH_INTEGRATION.md)

## 6) Reference

1. [Reference](./REFERENCE.md)
2. [API Contract](./API_CONTRACT.md)
3. [SDK Guide](./SDK.md)
4. [SDK Compatibility Matrix](./SDK_COMPATIBILITY_MATRIX.md)

## 7) Benchmarks & Evidence

1. [Benchmarks](./BENCHMARKS.md)
2. [Benchmark Snapshot (Public)](./BENCHMARK_SNAPSHOT_PUBLIC.md)
3. [Performance Baseline](./PERFORMANCE_BASELINE.md)
4. [AionisBench v0.1](./AIONIS_BENCH_V01.md)
5. [Differentiation Evidence](./DIFFERENTIATION_EVIDENCE.md)
6. [Governance Weekly Report](./GOVERNANCE_WEEKLY_REPORT.md)

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
