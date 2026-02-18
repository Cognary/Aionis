---
title: "Docs Index"
---

# Docs Index

This index is the entry point for project documentation.

## Core

- [Architecture](./ARCHITECTURE.md)
- [5-Minute Developer Onboarding](./ONBOARDING_5MIN.md)
- [API Contract (Hard)](./API_CONTRACT.md)
- [Stability Roadmap](./STABILITY_ROADMAP.md)
- [Long-Term Memory Roadmap](./LONG_TERM_MEMORY_ROADMAP.md)
- [Operator Runbook](./OPERATOR_RUNBOOK.md)
- [Production Core Gate](./PRODUCTION_CORE_GATE.md)
- [E2E Regression Checklist](./E2E_REGRESSION.md)
- [Prod Orchestration & Partition Plan](./PROD_ORCHESTRATION_PARTITION_PLAN.md)

## Performance

- [Performance Baseline](./PERFORMANCE_BASELINE.md)
- [LongMemEval Gate (Auxiliary)](./LONGMEMEVAL_GATE.md)
- [Performance Report v1 Template](./PERFORMANCE_REPORT_V1_TEMPLATE.md)
- [Partition Shadow Migration](./PARTITION_SHADOW_MIGRATION.md)

## Rules / Planner

- [Planner Context Schema](./PLANNER_CONTEXT.md)
- [Rule Lifecycle](./RULE_LIFECYCLE.md)
- [Three Gaps Priority Plan](./THREE_GAPS_PRIORITY_PLAN.md)
- [Product / Scale / Cognition Priority Plan](./PRODUCT_SCALE_COGNITION_PRIORITY_PLAN.md)

## Integrations / Ops

- [OpenWork Integration](./OPENWORK_INTEGRATION.md)
- [LangGraph Integration](./LANGGRAPH_INTEGRATION.md)
- [Website Skeleton (Next.js + HeroUI)](./WEBSITE_NEXTJS_HEROUI_SKELETON.md)
- [Go-To-Market 120-Day Plan](./GO_TO_MARKET_EXECUTION_PLAN.md)
- [Go-To-Market Personal + Custom Plan](./GO_TO_MARKET_PERSONAL_PLUS_CUSTOM_PLAN.md)
- [Go-To-Market Personal + Custom Weekly Board](./GO_TO_MARKET_PERSONAL_PLUS_CUSTOM_WEEKLY_BOARD.md)
- [Go-To-Market Week 1 Daily Playbook](./GO_TO_MARKET_WEEK1_DAILY_PLAYBOOK.md)
- [Go-To-Market Week 2 Daily Playbook](./GO_TO_MARKET_WEEK2_DAILY_PLAYBOOK.md)
- [Go-To-Market Week 3 Daily Playbook](./GO_TO_MARKET_WEEK3_DAILY_PLAYBOOK.md)
- [Go-To-Market Week 4 Daily Playbook](./GO_TO_MARKET_WEEK4_DAILY_PLAYBOOK.md)
- [GTM Phase 1 Execution Board](./GTM_PHASE1_EXECUTION_BOARD.md)
- [GTM Phase 2 Execution Board](./GTM_PHASE2_EXECUTION_BOARD.md)
- [GTM Phase 3 Execution Board](./GTM_PHASE3_EXECUTION_BOARD.md)
- [GTM Weekly Status Template](./GTM_WEEKLY_STATUS_TEMPLATE.md)
- [SDK (TypeScript, P1 MVP)](./SDK.md)
- [SDK Compatibility Matrix](./SDK_COMPATIBILITY_MATRIX.md)
- [SDK Release Runbook](./SDK_RELEASE.md)
- [Docker Release Runbook](./DOCKER_RELEASE.md)
- [Production Go-Live Gate](./PROD_GO_LIVE_GATE.md)
- [macOS Daemon (launchd)](./DAEMON_MAC.md)
- [Two-Phase Migrations](./MIGRATIONS_TWO_PHASE.md)

## Research / Narrative

- [Aionis Memory Graph Paper (CN)](./AIONIS_MEMORY_GRAPH_PAPER_CN.md)

## Maintenance

- Run docs link checks:

```bash
cd /Users/lucio/Desktop/Aionis
npm run docs:check
```

## Docs Website (GitHub Pages)

- Publish workflow: `/Users/lucio/Desktop/Aionis/.github/workflows/docs-pages.yml`
- Site config: `/Users/lucio/Desktop/Aionis/docs/_config.yml`
- Expected URL after Pages is enabled:
  - `https://cognary.github.io/Aionis/`

Local preview (Docker-based Jekyll):

```bash
cd /Users/lucio/Desktop/Aionis
docker run --rm -it --platform linux/amd64 -p 4000:4000 -v "$PWD/docs:/srv/jekyll" \
  jekyll/jekyll:pages sh -lc 'gem install webrick -N && jekyll serve --host 0.0.0.0 --port 4000 --config _config.yml,_config.local.yml'
```

Then open: `http://localhost:4000/`

Verification stamp:
- Last reviewed: `2026-02-18`
- Reviewer: `codex`
