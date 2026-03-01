---
title: "Open Core Boundary"
---

# Open Core Boundary

Last updated: `2026-03-01`

## Decision

Aionis uses a **two-repository model**:

1. Open Core repository: `https://github.com/Cognary/Aionis`
2. Hosted/private repository: `https://github.com/Cognary/aionis-hosted`

Commercial/hosted differentiation is implemented by **capability boundary**, not by renaming or re-creating the OSS repo.

## What Stays Public (Open Core)

1. Memory kernel data model (`nodes/edges/commit chain`)
2. Core write/recall APIs and contracts
3. Derived async pipeline (embedding/backfill/outbox baseline)
4. Basic rules and feedback loop primitives
5. SDKs (TypeScript/Python), examples, standalone image
6. Public operator runbooks and production baseline checks

## What Moves Private (Hosted/Enterprise)

1. Control-plane implementation (tenant provisioning, lifecycle orchestration)
2. Billing/metering pipeline and quota monetization logic
3. Enterprise IAM integrations and internal compliance automations
4. SRE internals: incident automation internals, pager routing internals, internal infra modules
5. Managed service operational tooling with provider/internal credentials assumptions

## Public Repo Rules

1. Keep public contracts stable: API/SDK schema is OSS-first.
2. Keep hosted docs in public only at interface/spec level, not private implementation details.
3. Never commit environment-specific secrets, internal endpoints, private credentials, customer data.
4. For hosted features in OSS, keep only:
- architecture principles
- interface contracts
- evidence format/template
5. Private implementation must live in a separate private repo/package and be referenced as “internal module”.

## Release Positioning (External)

Use one fixed message:

`Aionis is a Verifiable / Operable Memory Kernel for agents.`

Three pillars remain fixed:

1. `Audit-first`
2. `Derived async`
3. `Memory -> Policy`

## Migration Checklist (If Something Is Overexposed)

1. Identify file/module that should be private.
2. Keep public contract/type in OSS.
3. Move implementation to private repo/package.
4. Replace OSS implementation with adapter/stub.
5. Update docs to mark hosted implementation as internal.
6. Re-run: `npm run -s docs:check` and core gates.

## Repo Topology (Target)

1. Public: this repository (Open Core)
2. Private: hosted runtime/control-plane/internal ops (not published here)
3. Optional private package(s): hosted adapter modules

This keeps community distribution and standardization in one place while protecting hosted execution moat.
