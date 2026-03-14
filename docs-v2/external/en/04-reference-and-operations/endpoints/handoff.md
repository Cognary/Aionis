---
title: "Handoff Store And Recover"
description: "Reference for storing and recovering structured Aionis handoff artifacts, including prompt-safe and execution-ready views."
---

# Handoff Store And Recover

## What It Does

`handoff/store` turns continuity into a structured artifact.

`handoff/recover` gives the next runtime both a prompt-safe surface and an execution-ready surface.

This is one of the clearest places where Aionis is more than "store a summary."

## Verified Requests

Verified payloads:

1. `/fixtures/docs-v2-verified/handoff-store.json`
2. `/fixtures/docs-v2-verified/handoff-recover.json`

## Request Field Table

| Field | Endpoint | Required | What It Does |
| --- | --- | --- | --- |
| `tenant_id` | store + recover | no | Selects the tenant boundary. |
| `scope` | store + recover | no | Selects the memory scope used for continuity. |
| `anchor` | store + recover | yes | Stable lookup anchor for the handoff artifact. |
| `handoff_kind` | store + recover | yes | Declares the handoff category such as `task_handoff`. |
| `summary` | store | yes | Compact human-readable handoff summary. |
| `handoff_text` | store | yes | Full continuity text the next runtime should preserve. |
| `memory_lane` | store | no | Controls whether the handoff is `private` or `shared`. |
| `file_path`, `repo_root`, `symbol` | store + recover | no | Narrow handoff targeting to code locations when useful. |
| `consumer_agent_id`, `consumer_team_id` | recover | no | Applies visibility constraints during recovery. |

## Store Response Fields That Matter First

1. `commit_uri`
2. `handoff.id`
3. `handoff.anchor`
4. `handoff.handoff_text`
5. `handoff.memory_lane`

## Recover Response Fields That Matter First

1. `matched_nodes`
2. `handoff`
3. `prompt_safe_handoff`
4. `execution_ready_handoff`

## Verified Recover Response Shape

Verified against Lite on `2026-03-13`:

```json
{
  "tenant_id": "default",
  "scope": "docs_v2_verified",
  "handoff_kind": "task_handoff",
  "anchor": "docs_v2_handoff_001",
  "matched_nodes": 1,
  "handoff": {
    "summary": "Next agent should continue rollout and keep email follow-up.",
    "handoff_text": "Continue the rollout plan, keep email as the follow-up channel, and preserve the current run context."
  },
  "prompt_safe_handoff": {
    "anchor": "docs_v2_handoff_001",
    "handoff_kind": "task_handoff"
  },
  "execution_ready_handoff": {
    "anchor": "docs_v2_handoff_001",
    "handoff_kind": "task_handoff"
  }
}
```

## Response Field Table

| Field | Endpoint | What It Means | Why You Care |
| --- | --- | --- | --- |
| `commit_id` / `commit_uri` | store | Commit created for the handoff artifact. | Useful for continuity audit trails. |
| `handoff` | store + recover | Canonical handoff artifact view. | This is the main continuity object. |
| `handoff.anchor` | store + recover | Stable recovery anchor. | Persist this if you need future recovery. |
| `matched_nodes` | recover | Number of matched handoff candidates before best-match selection. | Useful when debugging recovery specificity. |
| `prompt_safe_handoff` | recover | Prompt-oriented recovery payload. | Best for plain prompt continuation. |
| `execution_ready_handoff` | recover | Structured recovery payload for runtime execution. | Best for agent systems that want explicit next actions and file targets. |

## Important Contract Note

Document `handoff/recover` as returning a single best matched handoff object with companion recovery surfaces, not as returning a loose list of results.

## Common Errors

1. `invalid_tenant_id` or `invalid_scope`
   Trigger: request tenancy fields are empty or invalid.
2. `invalid_request`
   Trigger: the store or recover payload does not match the endpoint schema.
3. `handoff_not_found`
   Trigger: recovery could not find a matching handoff artifact in the current scope.
4. `handoff_resolve_invalid`
   Trigger: handoff recovery found a candidate, but resolving it did not produce a node payload.
5. `rate_limited_write`, `tenant_rate_limited_write`, or `write_backpressure`
   Trigger: handoff store work hits write-side rate limit, quota, or inflight capacity.
6. `rate_limited_recall`, `tenant_rate_limited_recall`, or `recall_backpressure`
   Trigger: handoff recover work hits recall-side rate limit, quota, or inflight capacity.
