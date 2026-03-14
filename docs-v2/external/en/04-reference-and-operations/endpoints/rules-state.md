---
title: "POST /v1/memory/rules/state"
description: "Reference for moving Aionis rule nodes through draft, shadow, active, and disabled lifecycle states."
---

# POST /v1/memory/rules/state

## What It Does

Moves one persisted rule node between lifecycle states such as:

1. `draft`
2. `shadow`
3. `active`
4. `disabled`

This is the shortest state-transition surface for governed policy rollout.

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `rule_node_id`
4. `state`
5. `input_text` or `input_sha256`

## Verified Request

Verified payload:

`/fixtures/docs-v2-verified/rules-state.json`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the memory scope containing the rule. |
| `rule_node_id` | yes | Identifies the rule node whose execution state should change. |
| `state` | yes | Target state: `draft`, `shadow`, `active`, or `disabled`. |
| `actor` | no | Records who initiated the state transition. |
| `input_text` | conditional | Supplies human-readable lineage for the transition. |
| `input_sha256` | conditional | Supplies precomputed lineage hash instead of raw input text. |

## Response Fields That Matter First

1. `tenant_id`
2. `scope`
3. `commit_id`
4. `commit_hash`

## Verified Response Shape

Verified against Lite on `2026-03-13`:

```json
{
  "tenant_id": "default",
  "scope": "docs_v2_verified",
  "commit_id": "e2556291-9ec9-5ddf-8b1b-90a843a3625e",
  "commit_hash": "72d94976c6b33bb72f643030aacb751296d1608c55adec4880900169c6f2016b"
}
```

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `tenant_id` | Tenant boundary used for the update. | Useful for audit logs. |
| `scope` | Scope used for the update. | Useful for audit logs and debugging. |
| `commit_id` | Commit created for the state transition. | Persist this if you audit governance changes. |
| `commit_hash` | Stable hash of the state-change commit. | Useful for dedupe and forensic review. |

## Important Contract Note

This endpoint only changes rule state for an existing rule node in the same `(tenant_id, scope)` boundary.

When moving a rule into `shadow` or `active`, Aionis validates that the stored rule definition is execution-safe before accepting the transition.

## Common Errors

1. `rule_not_found_in_scope`
   Trigger: `rule_node_id` does not exist in the current request scope.
2. `invalid_private_rule_owner`
   Trigger: a private rule has no owner metadata but is being promoted into an execution-relevant state.
3. `invalid_rule_if_json` or `invalid_rule_exceptions_json`
   Trigger: the stored rule body is not structurally valid for execution.
4. `invalid_rule_then_json`
   Trigger: the stored `then` patch does not match the allowed policy schema.
5. `invalid_rule_scope_target`
   Trigger: an agent-scoped or team-scoped rule is missing its target binding.
