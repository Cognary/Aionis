---
title: "POST /v1/memory/rules/evaluate"
description: "Reference for evaluating persisted Aionis rules against runtime context and inspecting matched rules, summaries, and applied policy."
---

# POST /v1/memory/rules/evaluate

## What It Does

Evaluates persisted rules against one runtime context and returns both:

1. the full matched-rule payload
2. a compact `evaluation_summary`
3. the applied policy patch

This is the cleanest inspection surface for the policy loop before you call `tools/select`.

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `context`
4. `include_shadow`
5. `limit`

## Verified Request

Verified payload:

`/fixtures/docs-v2-verified/rules-evaluate.json`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the memory scope to evaluate. |
| `context` | yes | Runtime context object matched against persisted rules. |
| `include_shadow` | no | Includes `shadow` rules as a preview channel alongside active rules. |
| `limit` | no | Caps how many rules Aionis will scan for this evaluation. |

## Response Fields That Matter First

1. `evaluation_summary.selected_tool`
2. `evaluation_summary.allowed_tool_count`
3. `matched`
4. `active[0].rule_node_id`
5. `applied.policy.tool`
6. `applied.sources`

## Verified Response Shape

Verified against Lite on `2026-03-13`:

```json
{
  "scope": "docs_v2_verified",
  "tenant_id": "default",
  "matched": 1,
  "applied": {
    "policy": {
      "tool": {
        "allow": ["bash", "curl"],
        "deny": ["rm"],
        "prefer": ["bash"]
      }
    }
  },
  "evaluation_summary": {
    "summary_version": "rules_evaluation_summary_v1",
    "considered": 1,
    "matched": 1,
    "selected_tool": "bash",
    "allowed_tool_count": 2,
    "denied_tool_count": 1,
    "preferred_tool_count": 1
  }
}
```

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `considered` | Total rules scanned. | Tells you how much rule surface was evaluated. |
| `matched` | Total matched rules. | Fast top-line result for the evaluation. |
| `active[]` | Matched active rules. | Read this when you need the exact rule payloads. |
| `shadow[]` | Matched shadow rules. | Useful for previewing non-enforcing policy. |
| `applied.policy` | Effective merged policy patch. | This is the output most runtimes actually consume. |
| `applied.sources` | Source rule list for the merged policy. | Critical for attribution and later feedback. |
| `evaluation_summary` | Compact evaluation rollup. | Start here before reading the full payload. |

## Important Contract Note

Treat this as the summary-first policy inspection surface.

Use the same `context` shape here and in `tools/select`, so rule inspection and tool routing stay aligned.

## Common Errors

1. `invalid_tenant_id` or `invalid_scope`
   Trigger: request tenancy fields are empty or invalid.
2. `invalid_request`
   Trigger: the request body does not match the endpoint schema, such as missing `context`.
3. `rate_limited_recall`, `tenant_rate_limited_recall`, or `recall_backpressure`
   Trigger: recall-side rate limit, quota, or inflight capacity is exhausted.
