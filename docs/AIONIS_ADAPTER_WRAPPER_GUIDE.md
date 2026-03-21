# Aionis Adapter Wrapper Guide

## Summary

The Aionis adapter wrapper is the first local command-backed execution path above the sidecar.

Use it when:

1. your client can run command-style steps
2. you want one local entrypoint instead of calling adapter methods directly
3. you want to drive Aionis without prompt choreography

## Product Position

The current adapter stack is:

1. adapter contracts and state
2. sidecar event surface
3. wrapper execution entrypoint

That means:

1. adapter = normalized execution logic
2. sidecar = local event boundary
3. wrapper = first practical command-backed task runner

Thin MCP still remains useful for:

1. fallback compatibility
2. introspection
3. debugging and demos

## What The Wrapper Does

The wrapper currently runs one task loop:

1. `task_started`
2. `tool_selection_requested`
3. one command-backed `tool_executed`
4. one terminal outcome
5. optional introspection

The current entrypoint lives at:

1. [aionis-adapter-wrapper.ts](/Volumes/ziel/Aionisgo/src/adapter/aionis-adapter-wrapper.ts)

It reads one JSON request from stdin and writes one JSON response to stdout.

## Startup

Start the runtime first:

```bash
PORT=3011 npm run start:lite
```

Then run the wrapper entrypoint:

```bash
AIONIS_BASE_URL=http://127.0.0.1:3011 AIONIS_SCOPE=default npm run -s adapter:wrapper
```

## Minimal Request Shape

```json
{
  "task": {
    "task_id": "task-1",
    "query_text": "repair export failure in node tests",
    "context": {
      "task_kind": "repair_export"
    },
    "tool_candidates": ["bash", "test"]
  },
  "step": {
    "step_id": "step-1",
    "selected_tool": "bash",
    "command": "npm",
    "args": ["test"],
    "cwd": "/Users/lucio/Desktop/aionis-mcp-demo-2",
    "candidates": ["bash", "test"],
    "context": {
      "task_kind": "repair_export"
    },
    "note": "run project test command"
  },
  "finalization": {
    "outcome": "completed",
    "note": "task completed after command-backed loop"
  },
  "introspect": {
    "limit": 5
  }
}
```

## Example Usage

```bash
cat <<'JSON' | AIONIS_BASE_URL=http://127.0.0.1:3011 AIONIS_SCOPE=default npm run -s adapter:wrapper
{
  "task": {
    "task_id": "task-1",
    "query_text": "repair export failure in node tests",
    "context": { "task_kind": "repair_export" },
    "tool_candidates": ["bash", "test"]
  },
  "step": {
    "step_id": "step-1",
    "selected_tool": "bash",
    "command": "npm",
    "args": ["test"],
    "cwd": "/Users/lucio/Desktop/aionis-mcp-demo-2",
    "candidates": ["bash", "test"],
    "context": { "task_kind": "repair_export" },
    "note": "run project tests"
  },
  "finalization": {
    "outcome": "completed",
    "note": "task completed"
  },
  "introspect": {
    "limit": 5
  }
}
JSON
```

## Response Shape

The wrapper returns:

1. `planning`
2. `selection`
3. `execution`
4. `feedback`
5. `finalization`
6. `introspection` when requested

This is intentionally aligned with the current adapter and sidecar stack rather than inventing a second result model.

## Current Limits

The current wrapper is still narrow:

1. one command-backed step per request
2. no rich editor hook integration
3. no always-on client process yet
4. no final packaging layer for non-developer users

So the current state is:

1. wrapper baseline: present
2. wrapper CLI entrypoint: present
3. richer multi-step wrapper productization: not yet done

## Recommended Next Step

The next practical move is:

1. build a small local wrapper helper around a real client workflow
2. keep command-backed execution as the first default path
3. use thin MCP only as fallback and inspection

## Related Docs

1. [AIONIS_EXECUTION_ADAPTER_GUIDE.md](/Volumes/ziel/Aionisgo/docs/AIONIS_EXECUTION_ADAPTER_GUIDE.md)
2. [AIONIS_ADAPTER_SIDECAR_GUIDE.md](/Volumes/ziel/Aionisgo/docs/AIONIS_ADAPTER_SIDECAR_GUIDE.md)
3. [AIONIS_ADAPTER_WRAPPER_SPEC.md](/Volumes/ziel/Aionisgo/docs/AIONIS_ADAPTER_WRAPPER_SPEC.md)
4. [2026-03-21-aionis-adapter-wrapper.md](/Volumes/ziel/Aionisgo/docs/plans/2026-03-21-aionis-adapter-wrapper.md)
