---
title: "POST /v1/memory/tools/decision"
description: "Reference for looking up persisted Aionis tool decisions by decision id, decision URI, or the latest run id."
---

# POST /v1/memory/tools/decision

## What It Does

Looks up a persisted decision by `decision_id`, `decision_uri`, or latest `run_id`.

This is the simplest audit lookup surface in the policy loop.

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. one of `decision_id`, `decision_uri`, or `run_id`

## Verified Request

Verified payload:

`/fixtures/docs-v2-verified/tools-decision.json`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the memory scope to inspect. |
| `decision_id` | conditional | Direct lookup by persisted decision id. |
| `decision_uri` | conditional | URI-form lookup for the same persisted decision. |
| `run_id` | conditional | Fallback lookup for the latest decision associated with a run. |

## Response Fields That Matter First

1. `lookup_mode`
2. `lifecycle_summary`
3. `decision.decision_id`
4. `decision.decision_uri`
5. `decision.selected_tool`

## Verified Response Shape

Verified against Lite on `2026-03-13`:

```json
{
  "scope": "docs_v2_verified",
  "tenant_id": "default",
  "lookup_mode": "decision_id",
  "lifecycle_summary": {
    "summary_version": "tools_lifecycle_summary_v1",
    "kind": "decision",
    "decision_id": "7d181392-a195-4dee-81dd-7c55ebabd4a2",
    "run_id": "docs_v2_verified_run_001",
    "selected_tool": "bash",
    "candidate_count": 3
  }
}
```

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `lookup_mode` | How the endpoint resolved the lookup. | Useful for audit and debugging. |
| `lifecycle_summary` | Compact decision rollup. | Start here for logs and UI summaries. |
| `decision.decision_id` | Durable decision identifier. | Primary key for later feedback and audit. |
| `decision.decision_uri` | URI form of the decision. | Useful for URI-first clients. |
| `decision.selected_tool` | Tool selected at decision time. | Main routing outcome. |
| `decision.candidates` | Candidate set seen by the selector. | Useful for reproducing selection. |
| `decision.policy_sha256` | Hash of effective policy at decision time. | Useful for policy drift analysis. |

## Important Contract Note

This is the fastest way to inspect a past tool decision without re-running selection.

## Common Errors

1. `invalid_decision_uri_type`
   Trigger: `decision_uri` is not a `decision` URI.
2. `decision_uri_scope_mismatch` or `decision_uri_id_mismatch`
   Trigger: the decision URI conflicts with request tenancy or explicit `decision_id`.
3. `decision_not_found_in_scope`
   Trigger: the requested `decision_id` does not exist in the current scope.
4. `decision_not_found_for_run`
   Trigger: the provided `run_id` has no persisted decision in the current scope.
5. `decision_run_id_mismatch`
   Trigger: the requested `decision_id` belongs to a different run than the supplied `run_id`.
