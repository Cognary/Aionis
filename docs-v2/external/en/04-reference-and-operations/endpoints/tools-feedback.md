---
title: "POST /v1/memory/tools/feedback"
description: "Reference for feeding execution outcome back into the Aionis policy loop, including zero-attribution and matched-rule paths."
---

# POST /v1/memory/tools/feedback

## What It Does

Feeds execution outcome back into the policy loop.

It can attribute feedback to matched rule sources, but it can also legitimately return that no rule attribution occurred.

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `run_id`
4. `decision_id` or `decision_uri`
5. `context`
6. `candidates`
7. `selected_tool`
8. `outcome`
9. `input_text`

## Verified Request

Verified assets:

1. `/fixtures/docs-v2-verified/tools-feedback.template.json`
2. `/fixtures/docs-v2-verified/tools-feedback-positive.json`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the memory scope to update. |
| `run_id` | no | Correlates feedback to a run when available. |
| `decision_id` or `decision_uri` | no | Links feedback to a persisted decision record. |
| `outcome` | yes | Declares whether the outcome was `positive`, `negative`, or `neutral`. |
| `context` | yes | Replays the context used for attribution. |
| `candidates[]` | yes | Candidate tools shown during selection. |
| `selected_tool` | yes | Tool actually selected or executed. |
| `target` | no | Controls whether attribution targets tool-related rules only or all sources. |
| `input_text` | conditional | Supplies lineage text for the feedback write. |

## Response Fields That Matter First

1. `ok`
2. `updated_rules`
3. `rule_node_ids`
4. `commit_id` or `commit_uri`
5. `note`

## Verified Response Shapes

Verified against Lite on `2026-03-13` for the zero-attribution path:

```json
{
  "ok": true,
  "scope": "docs_v2_verified",
  "tenant_id": "default",
  "updated_rules": 0,
  "rule_node_ids": [],
  "commit_id": null,
  "commit_hash": null,
  "note": "no matching rule sources for attribution"
}
```

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `ok` | Whether the feedback write succeeded. | Fast success signal. |
| `updated_rules` | Count of rule sources updated by feedback attribution. | Tells you whether learning actually happened. |
| `rule_node_ids[]` | Rule ids updated by the feedback. | Useful for audit and follow-up inspection. |
| `commit_id` | Commit created by the feedback write, if any. | Useful for audit lineage. |
| `commit_uri` | URI form of the feedback commit. | Useful for URI-first audit flows. |
| `decision_id` | Linked decision id, when available. | Important for lifecycle correlation. |
| `decision_link_mode` | How the decision linkage was established. | Useful when debugging attribution. |
| `note` | Explanatory note for zero-attribution cases. | Important because zero attribution can still be valid. |

Verified against Lite on `2026-03-13` for a matched-rule path:

```json
{
  "ok": true,
  "scope": "docs_v2_verified",
  "tenant_id": "default",
  "updated_rules": 1,
  "rule_node_ids": ["7d24b7b8-f47b-59b8-94bb-0464ed15a00e"],
  "commit_id": "6a7f28aa-09fd-55f3-8c2e-ba6bd1528601",
  "decision_id": "8fc0263a-48d6-4e91-9380-69e4c4ec7869",
  "decision_link_mode": "provided"
}
```

## Important Contract Note

Do not document this endpoint as always returning a non-zero update count.

Both paths are normal:

1. zero attribution when no matching rule sources can be linked
2. positive attribution when the feedback can be tied back to a persisted rule source

## Common Errors

1. `invalid_decision_uri_type`
   Trigger: `decision_uri` is not a `decision` URI.
2. `decision_uri_scope_mismatch` or `decision_uri_id_mismatch`
   Trigger: the decision URI conflicts with request tenancy or explicit `decision_id`.
3. `decision_not_found_in_scope`
   Trigger: the referenced decision cannot be found in the current scope.
4. `decision_selected_tool_mismatch`, `decision_candidates_mismatch`, or `decision_run_id_mismatch`
   Trigger: feedback does not match the stored decision being referenced.
