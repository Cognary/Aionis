---
title: "Docs Index"
---

# Docs Index

This is the public documentation index for Aionis Open Core.

## Public Docs (External)

### Start Here

- [Documentation Home](./index.md)
- [5-Minute Developer Onboarding](./ONBOARDING_5MIN.md)
- [Architecture](./ARCHITECTURE.md)
- [API Contract](./API_CONTRACT.md)
- [SDK Guide](./SDK.md)
- [Packaging Plan](./PACKAGING_PLAN.md)

### Operations / Reliability

- [Operator Runbook](./OPERATOR_RUNBOOK.md)
- [Production Core Gate](./PRODUCTION_CORE_GATE.md)
- [E2E Regression Checklist](./E2E_REGRESSION.md)
- [Performance Baseline](./PERFORMANCE_BASELINE.md)
- [Adaptive Compression Plan](./ADAPTIVE_COMPRESSION_PLAN.md)
- [Docker Release Runbook](./DOCKER_RELEASE.md)

### Integrations

- [OpenWork Integration](./OPENWORK_INTEGRATION.md)
- [LangGraph Integration](./LANGGRAPH_INTEGRATION.md)

### Narrative / Positioning

- [Narrative Canon](./NARRATIVE_CANON.md)
- [Packaging Plan](./PACKAGING_PLAN.md)
- [Release Narrative Template](./RELEASE_NARRATIVE_TEMPLATE.md)
- [Technical Release Material](./RELEASE_MATERIAL_TECHNICAL.md)
- [Product Release Material](./RELEASE_MATERIAL_PRODUCT.md)
- [Business Release Material](./RELEASE_MATERIAL_BUSINESS.md)

### Compression Evidence

- [Adaptive Compression Plan](./ADAPTIVE_COMPRESSION_PLAN.md)
- [Performance Baseline](./PERFORMANCE_BASELINE.md)
- [Production Core Gate](./PRODUCTION_CORE_GATE.md)

### Boundary

- [Open Core Boundary](./OPEN_CORE_BOUNDARY.md)

## Internal Docs (Private)

Internal GTM/product execution/hosted operator docs are no longer maintained publicly.

Private repository:
- `https://github.com/Cognary/aionis-hosted`

## Maintenance

```bash
cd /Users/lucio/Desktop/Aionis
npm --prefix docs-site run dev
npm run docs:check
```

## Docs Website (GitHub Pages)

- Publish workflow: `/Users/lucio/Desktop/Aionis/.github/workflows/docs-pages.yml`
- VitePress config: `/Users/lucio/Desktop/Aionis/docs/.vitepress/config.ts`
- Theme override: `/Users/lucio/Desktop/Aionis/docs/.vitepress/theme/custom.css`
- URL: `https://doc.aionisos.com/`
