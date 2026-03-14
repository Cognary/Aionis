---
title: "POST /v1/memory/tools/run"
description: "Reference for inspecting the run-level lifecycle of governed tool selection in Aionis, including linked decisions and feedback."
---

# POST /v1/memory/tools/run

## What It Does

Returns the lifecycle view of one governed tool-selection run.

Use it when you want the run-level audit surface that joins:

1. persisted tool decisions
2. linked feedback
3. compact lifecycle summary

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `run_id`
4. `decision_limit`
5. `include_feedback`
6. `feedback_limit`

## Verified Request

Verified payload:

`/fixtures/docs-v2-verified/tools-run.json`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the memory scope to inspect. |
| `run_id` | yes | Correlates the governed tool-selection run to inspect. |
| `decision_limit` | no | Caps the number of persisted decisions returned. |
| `include_feedback` | no | Includes linked feedback summary and recent feedback records. |
| `feedback_limit` | no | Caps how many recent feedback records are returned. |

## Response Fields That Matter First

1. `lifecycle_summary.status`
2. `lifecycle_summary.decision_count`
3. `lifecycle_summary.feedback_total`
4. `decisions`
5. `feedback`

## Verified Response Shape

Verified against Lite on `2026-03-13`:

```json
{
  "tenant_id": "default",
  "scope": "docs_v2_verified",
  "run_id": "docs_v2_verified_run_002",
  "lifecycle": {
    "status": "feedback_linked",
    "decision_count": 1
  },
  "feedback": {
    "total": 1,
    "linked_decision_count": 1,
    "tools_feedback_count": 1
  },
  "lifecycle_summary": {
    "summary_version": "tools_lifecycle_summary_v1",
    "kind": "run_lifecycle",
    "run_id": "docs_v2_verified_run_002",
    "status": "feedback_linked",
    "decision_count": 1,
    "feedback_total": 1,
    "tools_feedback_count": 1
  }
}
```

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `lifecycle` | Run-level status and timestamps. | Basic audit surface for the run. |
| `lifecycle_summary` | Compact run lifecycle rollup. | Start here for summaries and monitoring UIs. |
| `decisions[]` | Persisted decisions associated with the run. | Useful for deep audit and replay of routing choices. |
| `feedback.total` | Total feedback records linked to the run. | Quick signal that the run has learning feedback. |
| `feedback.linked_decision_count` | Count of feedback records tied to persisted decisions. | Useful for measuring attribution quality. |
| `feedback.tools_feedback_count` | Count of feedback records sourced from `tools/feedback`. | Useful for distinguishing direct tool feedback from other rule feedback. |
| `feedback.recent[]` | Recent feedback records for the run. | Useful for operator inspection and debugging. |

## Important Contract Note

This is the run-level audit surface for the policy loop.

If you only need one decision, use `tools/decision`. If you need the whole run lifecycle, use `tools/run`.

## Common Errors

1. `run_not_found_in_scope`
   Trigger: the provided `run_id` has no persisted decision records in this scope.
2. `invalid_tenant_id` or `invalid_scope`
   Trigger: request tenancy fields are empty or invalid.
3. `rate_limited_recall`, `tenant_rate_limited_recall`, or `recall_backpressure`
   Trigger: recall-side rate limit, quota, or inflight capacity is exhausted.
