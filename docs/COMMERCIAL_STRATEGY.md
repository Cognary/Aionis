---
title: "Commercial Strategy"
---

# Aionis Commercial Strategy

Last updated: `2026-02-19`

## Strategic Decision

Adopt `Open Core + Hosted + Kernel Control` as the default operating model.

## Positioning

Canonical market position:

`Aionis is a Verifiable / Operable Memory Kernel for agents.`

The primary value claim is not "higher memory accuracy." The primary claim is:

1. Verifiable memory writes (`source of record + commit lineage`)
2. Operable derived pipelines (`async and non-blocking for core writes`)
3. Executable memory policy (`memory -> planner/tool behavior`)

## Three-Layer Model

## Layer 1: Open Source Kernel (must stay open)

Open capabilities:

1. Single-tenant memory kernel
2. Commit-chain and replayable history
3. Graph memory core (`nodes + edges`)
4. Basic recall and `recall_text`
5. Derived async pipeline baseline
6. Rule system baseline
7. Production single-tenant essentials:
   `auth`, `runbook`, `health gate`, migrations, export/import

Role in strategy:

1. Establish kernel standard
2. Attract infra builders
3. Drive GitHub distribution
4. Build technical authority

Boundary rule:

Do not intentionally cripple Layer 1 into demo-only quality.

## Layer 2: Hosted Aionis (primary revenue)

Hosted/closed capabilities:

1. Multi-tenant isolation and enterprise identity controls
2. SLO/HA operations and managed reliability
3. Large-scale recall and throughput optimization
4. Advanced rule/policy governance workflows
5. Operational control plane (observability, quota, replay ops)
6. Compliance and governance tooling
7. Managed long-term memory lifecycle

Role in strategy:

1. Convert production demand into recurring revenue
2. Reduce adoption friction for teams that need managed operations

Boundary rule:

Charge for scale, governance, and managed operations; do not hide core kernel truth.

## Layer 3: Execution Memory Platform (long-term moat)

Platform capabilities:

1. Memory -> Planner -> Execution substrate
2. Policy memory with verifiable execution effects
3. Multi-agent shared memory governance
4. Verifiable agent execution history
5. Autonomous memory evolution with strict guardrails

Role in strategy:

1. Category leadership beyond "memory feature"
2. Durable moat through control-plane depth and ecosystem lock-in

## Product Boundary Matrix

1. Always open:
   write/recall contract, commit-chain invariants, base rule model, migration format
2. Hosted differentiators:
   tenancy, HA/SLO operations, observability, governance controls, compliance tooling
3. Future platform differentiators:
   execution substrate integration and policy-driven autonomous operation

## Revenue Model

1. Free OSS kernel for adoption and standard setting
2. Hosted usage tiers for production workloads
3. Enterprise plans for governance/compliance/SLO commitments
4. Future platform pricing for execution-memory control plane

## Evidence Standard for Go-To-Market

Every release communication follows:

`Problem -> Architecture Principles -> Evidence -> Boundaries -> Next Step`

Required evidence bundle:

1. Passing gates/checks commands
2. Artifact versions (GitHub/Docker/npm/PyPI)
3. Explicit boundary statement (what is not solved in this release)

## Key Risks and Controls

1. Risk: Open layer too weak -> no standardization momentum
   Control: keep production single-tenant capabilities open
2. Risk: Hosted value unclear -> low paid conversion
   Control: enforce strict open/hosted boundary by governance and operations depth
3. Risk: Overclaim narrative -> trust loss
   Control: lead with verifiability/operability evidence, not generic accuracy claims

## Next 90 Days

1. Publish open/hosted boundary page on website and docs
2. Standardize release notes to evidence template
3. Define hosted packaging by tenant scale and governance requirements
4. Add quarterly platform milestones for Layer 3 proof points
