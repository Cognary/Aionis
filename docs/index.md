---
title: "Aionis Documentation Home"
---

# Aionis Documentation

**Aionis is a Verifiable / Operable Memory Kernel for agents.**

Use this site as the canonical entry for onboarding, API contracts, SDK usage, release packaging, and production operations.

Internal GTM/hosted/operator execution docs are maintained in the private repository:
- `https://github.com/Cognary/aionis-hosted`

## Narrative Canon

1. Main narrative: `Verifiable / Operable Memory Kernel`
2. Pillars: `Audit-first`, `Derived async`, `Memory -> Policy`
3. Release template: `Problem -> Architecture Principles -> Evidence -> Boundaries -> Next Step`

Narrative assets:

- [Narrative Canon](./NARRATIVE_CANON.md)
- [Packaging Plan](./PACKAGING_PLAN.md)
- [Commercial Strategy](./COMMERCIAL_STRATEGY.md)
- [Release Narrative Template](./RELEASE_NARRATIVE_TEMPLATE.md)
- [Technical Release Material](./RELEASE_MATERIAL_TECHNICAL.md)
- [Product Release Material](./RELEASE_MATERIAL_PRODUCT.md)
- [Business Release Material](./RELEASE_MATERIAL_BUSINESS.md)

## Token Compression as Evidence Layer

Compression is part of Aionis production evidence, not the primary category claim.

Required KPI set:

1. `compression_ratio`
2. `items_retain_ratio`
3. `citations_retain_ratio`

References:

- [Adaptive Compression Plan](./ADAPTIVE_COMPRESSION_PLAN.md)
- [Performance Baseline](./PERFORMANCE_BASELINE.md)
- [Production Core Gate](./PRODUCTION_CORE_GATE.md)

## Start Here

1. [5-Minute Onboarding](./ONBOARDING_5MIN.md)
2. [API Contract](./API_CONTRACT.md)
3. [SDK Guide](./SDK.md)
4. [Operator Runbook](./OPERATOR_RUNBOOK.md)
5. [Packaging Plan](./PACKAGING_PLAN.md)

## By Responsibility

1. Application Engineer:
   [ONBOARDING_5MIN.md](./ONBOARDING_5MIN.md),
   [SDK.md](./SDK.md),
   [SDK_COMPATIBILITY_MATRIX.md](./SDK_COMPATIBILITY_MATRIX.md)
2. Platform / API Owner:
   [API_CONTRACT.md](./API_CONTRACT.md),
   [PLANNER_CONTEXT.md](./PLANNER_CONTEXT.md),
   [RULE_LIFECYCLE.md](./RULE_LIFECYCLE.md),
   [EXECUTION_LOOP_GATE.md](./EXECUTION_LOOP_GATE.md),
   [POLICY_ADAPTATION_GATE.md](./POLICY_ADAPTATION_GATE.md),
   [GOVERNANCE_WEEKLY_REPORT.md](./GOVERNANCE_WEEKLY_REPORT.md)
3. SRE / Operations:
   [OPERATOR_RUNBOOK.md](./OPERATOR_RUNBOOK.md),
   [E2E_REGRESSION.md](./E2E_REGRESSION.md),
   [PERFORMANCE_BASELINE.md](./PERFORMANCE_BASELINE.md)
4. Release Manager:
   [SDK_RELEASE.md](./SDK_RELEASE.md),
   [DOCKER_RELEASE.md](./DOCKER_RELEASE.md)

## Full Catalog

Use [README.md](./README.md) for the complete documentation index.

## Release Artifacts

1. npm: [@aionis/sdk](https://www.npmjs.com/package/@aionis/sdk)
2. PyPI: [aionis-sdk](https://pypi.org/project/aionis-sdk/)
3. Docker: [ghcr.io/cognary/aionis](https://github.com/orgs/cognary/packages/container/package/aionis)
