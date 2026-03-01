---
title: "Docs Index"
---

# Docs Index

This is the public documentation index for Aionis.

## Getting Started

- [Documentation Home](./index.md)
- [Aionis Onepage](./AIONIS_ONEPAGE.md)
- [Aionis Onepage (Public)](./AIONIS_ONEPAGE_PUBLIC.md)
- [5-Minute Developer Onboarding](./ONBOARDING_5MIN.md)
- [Architecture](./ARCHITECTURE.md)

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
- [Ops Console](./OPS_CONSOLE.md)
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
- [Differentiation Evidence](./DIFFERENTIATION_EVIDENCE.md)
- [Weekly Evidence Template](./EVIDENCE_WEEKLY_TEMPLATE.md)

## Integrations

- [MCP Integration](./MCP_INTEGRATION.md)
- [OpenWork (OpenCode Desktop)](./OPENWORK_INTEGRATION.md)
- [LangGraph](./LANGGRAPH_INTEGRATION.md)

## Scope Notes

This documentation set covers product capabilities, API/SDK contracts, and operations/evidence gates.

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

1. Core release tag: `v0.2.1` (latest tagged release)
2. npm SDK: `0.2.1`
3. PyPI SDK: `0.2.1`
4. Docker line: `v0.2.1` (main), `standalone-v0.2.1` (standalone)
