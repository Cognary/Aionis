---
title: "Decision and Run Model"
---

# Decision and Run Model

Aionis tracks execution with typed IDs for replay and audit.

## Primary IDs

1. `request_id`: request correlation
2. `run_id`: execution chain instance
3. `decision_id`: planner/policy decision object
4. `commit_id`: memory write lineage anchor

## Why It Matters

1. Deterministic replay and diagnostics
2. Rule-impact attribution
3. Compliance-grade operation trails

## Related

1. [Policy & Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
2. [API Contract](/public/en/api/01-api-contract)
