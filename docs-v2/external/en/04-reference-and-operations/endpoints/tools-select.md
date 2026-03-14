---
title: "POST /v1/memory/tools/select"
description: "Reference for evaluating candidate tools against Aionis policy and persisting a durable decision record."
---

# POST /v1/memory/tools/select

## What It Does

Evaluates the provided candidate tools against current policy and persists a decision record.

This is one of the clearest execution-memory surfaces in Aionis because it emits a durable decision object.

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `run_id`
4. `context`
5. `candidates`
6. `strict`

## Verified Request

Verified payload:

`/fixtures/docs-v2-verified/tools-select.json`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the memory scope to use for policy lookup. |
| `run_id` | no | Correlates the persisted decision with one runtime run. |
| `context` | yes | Runtime context evaluated against tool policy. |
| `candidates[]` | yes | Tool names offered by the caller's runtime. |
| `include_shadow` | no | Includes shadow rules as a preview channel. |
| `rules_limit` | no | Caps rule scanning during selection. |
| `strict` | no | Fails or constrains fallback behavior when policy eliminates the candidate set. |

## Response Fields That Matter First

1. `selection_summary`
2. `decision.decision_id`
3. `decision.decision_uri`
4. `decision.run_id`
5. `selection.selected`

## Verified Response Shape

Verified against Lite on `2026-03-13`:

```json
{
  "scope": "docs_v2_verified",
  "tenant_id": "default",
  "selection_summary": {
    "summary_version": "tools_selection_summary_v1",
    "selected_tool": "bash",
    "candidate_count": 3,
    "matched_rules": 0,
    "fallback_applied": false
  },
  "decision": {
    "decision_id": "7d181392-a195-4dee-81dd-7c55ebabd4a2",
    "decision_uri": "aionis://default/docs_v2_verified/decision/7d181392-a195-4dee-81dd-7c55ebabd4a2",
    "run_id": "docs_v2_verified_run_001",
    "selected_tool": "bash"
  }
}
```

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `selection_summary` | Compact selection rollup. | Start here for logging and UI inspection. |
| `selection` | Full ordered tool decision. | Use this when you need the actual routing result. |
| `rules` | Rule evaluation and policy context used by the selector. | Useful for debugging policy behavior. |
| `decision.decision_id` | Durable decision identifier. | Persist this for audit and later feedback. |
| `decision.decision_uri` | URI form of the decision. | Useful for URI-first integrations. |
| `decision.run_id` | Run correlation id stored on the decision. | Important for lifecycle lookup with `tools/run`. |
| `decision.policy_sha256` | Hash of effective policy at decision time. | Useful for audit and drift detection. |

## Important Contract Note

Even when zero rules match, this endpoint can still produce a valid persisted decision. That is why `decision_id` is a first-class external field.

## Common Errors

1. `invalid_tenant_id` or `invalid_scope`
   Trigger: request tenancy fields are empty or invalid.
2. `invalid_request`
   Trigger: the request body does not match the endpoint schema, such as missing `context` or empty `candidates`.
3. `rate_limited_recall`, `tenant_rate_limited_recall`, or `recall_backpressure`
   Trigger: recall-side rate limit, quota, or inflight capacity is exhausted.
4. strict allowlist conflicts
   Trigger: when `strict=true`, a policy-filtered candidate set can become unrunnable even though the endpoint contract is otherwise valid.
   Note: this is a behavior boundary surfaced by the tool-selection flow, not a generic transport error.
