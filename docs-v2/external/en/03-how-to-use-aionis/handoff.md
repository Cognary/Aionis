---
title: "Handoff Guide"
description: "Use Aionis handoff APIs to store and recover structured continuity artifacts across sessions and runtimes."
---

# Handoff

Handoff is where Aionis becomes obviously more than a retrieval layer.

Most systems treat handoff as text.

Aionis treats handoff as a structured continuity artifact.

## What Is Live In Code Today

The handoff surface is implemented as:

1. `POST /v1/handoff/store`
2. `POST /v1/handoff/recover`

The current request model supports:

1. `patch_handoff`
2. `review_handoff`
3. `task_handoff`

The current recover path returns more than one view:

1. the full artifact
2. a prompt-safe handoff view
3. an execution-ready handoff view

That matters because the same handoff should not always be consumed the same way.

## Why This Matters

If you only store a summary, the next runtime still has to reinterpret what happened.

If you store a structured handoff, the next runtime can inherit:

1. anchor
2. summary
3. exact handoff text
4. risk
5. acceptance checks
6. target files
7. next action

That is a much stronger continuation surface.

## Minimal Store Request

For `task_handoff`, the shortest useful payload is:

```json
{
  "tenant_id": "default",
  "scope": "default",
  "anchor": "handoff_001",
  "handoff_kind": "task_handoff",
  "summary": "Write and recall are validated",
  "handoff_text": "Next step is integrating replay into the same workflow.",
  "memory_lane": "shared"
}
```

For `patch_handoff` and `review_handoff`, `file_path` is required by the actual schema.

## Recover Behavior

`handoff/recover` is not a fuzzy storytelling route.

It is designed to recover the latest matching artifact under:

1. anchor
2. kind
3. optional repo and file narrowing
4. lane visibility

That is why it is useful across fresh sessions and across runtimes.

## Best First Use Cases

Start handoff with one of these:

1. planner to executor transition
2. session end to next session start
3. human review back into agent follow-up

These are the boundary points where people feel the product value immediately.

## Important Boundaries

Handoff does not mean:

1. every runtime already consumes execution-ready handoff perfectly
2. handoff always lowers total tokens in every setup
3. handoff replaces deeper runtime integration

What it does mean is that Aionis preserves execution contracts across boundaries better than lossy summaries, and that is already supported by public evidence.

## What To Read Next

1. [Replay](./replay.md)
2. [Policy](./policy.md)
