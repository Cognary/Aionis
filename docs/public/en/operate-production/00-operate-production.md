---
title: "Operate and Production"
---

# Operate and Production

Aionis production operation is built around a repeatable loop:

```mermaid
flowchart LR
  A["Validate in Staging"] --> B["Run Core Gate"]
  B --> C["Go-Live Decision"]
  C --> D["Serve Production Traffic"]
  D --> E["Daily Health and Governance Review"]
  E --> F["Failure Drill and Replay Validation"]
```

## Production Model

1. **Readiness**: release only after objective gate pass.
2. **Observability**: keep health, latency, and policy-loop quality visible.
3. **Replayability**: persist IDs needed for incident reconstruction.
4. **Resilience**: run regular rollback and recovery drills.

## Operating Cadence

### Daily

1. Check health/performance baseline.
2. Review governance drift indicators.
3. Validate one replay chain from recent traffic.

### Weekly

1. Run evidence and benchmark review.
2. Confirm rollback readiness.
3. Review drill outcomes and follow-ups.

## Where to Start

1. [Operate Index](/public/en/operations/00-operate)
2. [Production Core Gate](/public/en/operations/03-production-core-gate)
3. [Operator Runbook](/public/en/operations/02-operator-runbook)
4. [Standalone to HA Runbook](/public/en/operations/06-standalone-to-ha-runbook)
