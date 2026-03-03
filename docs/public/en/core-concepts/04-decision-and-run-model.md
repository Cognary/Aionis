---
title: "Decision and Run Model"
---

# Decision and Run Model

Aionis uses typed execution identifiers to make policy behavior auditable and replayable.

## Core Identifiers

| ID | Meaning | Typical Source |
| --- | --- | --- |
| `request_id` | one API request correlation ID | all endpoint responses |
| `run_id` | one multi-step execution chain | planner/runtime caller |
| `decision_id` | one policy or tool decision record | decision endpoints |
| `commit_id` | one memory mutation anchor | write/session/event endpoints |

## Provenance Chain

```mermaid
flowchart LR
  A["request_id"] --> B["run_id"]
  B --> C["decision_id"]
  C --> D["commit_uri"]
  D --> E["resolve + replay"]
```

## Why It Matters

1. `Replay`: rerun critical execution paths using the same context anchors.
2. `Governance`: prove which policy source influenced a decision.
3. `Operations`: accelerate incident root-cause analysis.
4. `Compliance`: preserve traceable decision lineage.

## Implementation Guidance

1. Treat `request_id`, `run_id`, `decision_id`, and `commit_uri` as required telemetry fields.
2. Persist these IDs in both application logs and observability pipelines.
3. Expose these IDs in operator dashboards for rapid drill-down.
4. Use URI resolver calls in incident workflows instead of ad-hoc DB queries.

## Readiness Checklist

1. Can you start from a user issue and find the exact `decision_id`?
2. Can you resolve the linked commit and memory objects in one workflow?
3. Can you compare old vs new run outputs for the same scenario?

## Related

1. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
2. [URI Object Coverage](/public/en/reference/07-uri-expansion-plan)
3. [API Reference](/public/en/api-reference/00-api-reference)
