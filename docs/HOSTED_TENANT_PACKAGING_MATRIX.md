---
title: "Hosted Tenant Packaging Matrix"
---

# Hosted Tenant Packaging Matrix

Last updated: `2026-02-21`

This matrix defines hosted packaging boundaries without changing the core API contract.

Positioning stays fixed:

1. Verifiable / Operable Memory Kernel
2. Audit-first
3. Derived async
4. Memory -> Policy

## Tier Summary

| Tier | Primary buyer | Tenant scale | SLO package | Isolation mode |
| --- | --- | --- | --- | --- |
| Starter | Product team (early prod) | 1-5 tenants | Shared baseline | Shared cluster |
| Growth | Multi-team app platform | 5-50 tenants | Enhanced + governance ops | Shared cluster + dedicated quotas |
| Enterprise | Regulated / high criticality | 50+ tenants or strict compliance | Contracted SLO + evidence registry | Dedicated shard/project options |

## Capability Matrix

| Capability | Starter | Growth | Enterprise |
| --- | --- | --- | --- |
| Core memory kernel API | Yes | Yes | Yes |
| Commit-chain traceability | Yes | Yes | Yes |
| Derived async pipeline | Yes | Yes | Yes |
| Rule engine (base) | Yes | Yes | Yes |
| Hosted preflight + core gate evidence | Yes | Yes | Yes |
| Tenant quota policy tuning | Baseline presets | Custom per tenant | Custom + contractual guardrails |
| Governance weekly report | Shared report | Tenant-sliced export | Tenant + compliance evidence package |
| Dead-letter + replay operations | Standard runbook | Priority ops window | Priority + change-managed workflow |
| Partition/read-shadow cutover support | Best effort | Managed with ops checklist | Managed with migration runbook + rollback rehearsal |
| Observability granularity | Service level | Tenant level | Tenant + contractual SLO view |
| Dedicated isolation | No | Optional by approval | Yes (recommended) |
| Private network path | No | Optional roadmap | Yes (plan-dependent) |
| Compliance control mapping | Baseline security checklist | Extended controls | Formal mapping + audit evidence registry |

## Commercial Guardrails

1. Keep one API contract across all tiers.
2. Differentiate by operations, governance, SLOs, and isolation.
3. Never gate correctness-critical kernel behavior by pricing tier.

## Operational Defaults by Tier

1. Starter
- Shared region and shared cluster.
- Strict release gate required (`preflight:hosted` + `gate:core:prod`).
- Weekly governance report retained for 30 days.

2. Growth
- Per-tenant quota profiles with controlled overrides.
- Dead-letter replay drill required monthly.
- Weekly governance report retained for 90 days.

3. Enterprise
- Dedicated isolation profile per tenant/project where contracted.
- Release evidence bundle required for every customer-impacting rollout.
- Governance + compliance evidence retained per contract.

## Upgrade Path

1. Starter -> Growth
- Trigger: sustained tenant count growth or higher governance demand.
- Required evidence: quota pressure trend + replay drill outcome.

2. Growth -> Enterprise
- Trigger: compliance requirement, dedicated isolation demand, or contracted SLO target.
- Required evidence: isolation plan, migration runbook, rollback rehearsal result.

## Verification Commands

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s preflight:hosted -- --run-gates
npm run -s gate:core:prod -- --base-url "http://localhost:${PORT:-3001}" --scope default --run-perf false
```

## Verification Stamp

1. Last reviewed: `2026-02-21`
2. Owner: `product + ops + core`
