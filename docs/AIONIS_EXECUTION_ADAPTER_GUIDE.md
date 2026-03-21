# Aionis Execution Adapter Guide

## Summary

The Aionis execution adapter is now the preferred long-term integration direction.

Use it when you want Aionis to participate in the execution loop automatically rather than depending on explicit MCP tool-calling habits.

The current adapter baseline already covers:

1. task start
2. pre-tool selection
3. execution-evidence capture
4. task-boundary finalization
5. introspection through the runtime

## When To Use The Adapter

Choose the adapter path when your client can observe or hook into real execution events.

Typical examples:

1. coding agents with tool lifecycle hooks
2. IDE agents that know when a task starts and ends
3. local runtimes that can observe `bash`, `edit`, and `test`
4. clients that want Aionis to work automatically without prompt choreography

Choose thin MCP instead when:

1. the client only supports MCP tool-calling
2. you need fast compatibility with MCP-native ecosystems
3. you mainly want introspection or debugging

## Product Model

The desired product split is:

1. adapter = main execution path
2. thin MCP = compatibility and observation layer

That means the adapter should own the normal task loop, while thin MCP remains available for:

1. inspection
2. demos
3. builder integration
4. fallback compatibility

## Current Adapter Baseline

The current source-owned baseline lives in:

1. [aionis-adapter.ts](/Volumes/ziel/Aionisgo/src/adapter/aionis-adapter.ts)
2. [claude-code-bridge.ts](/Volumes/ziel/Aionisgo/src/adapter/claude-code-bridge.ts)
3. [claude-code-harness.ts](/Volumes/ziel/Aionisgo/src/adapter/claude-code-harness.ts)
4. [contracts.ts](/Volumes/ziel/Aionisgo/src/adapter/contracts.ts)
5. [session-state.ts](/Volumes/ziel/Aionisgo/src/adapter/session-state.ts)

It is currently a baseline, not a finished end-user packaging surface.

What it already does:

1. normalizes task-start events into planning-context requests
2. normalizes pre-tool events into tool-selection requests
3. records high-confidence step outcomes conservatively
4. finalizes task outcomes once without repeated confirmation loops
5. supports a local Claude Code style harness for end-to-end loop validation

## The Main Execution Path

The intended runtime flow is:

1. `task_started`
2. `tool_selection_requested`
3. `tool_executed`
4. `task_completed` or `task_blocked`
5. optional introspection

In practice this means:

1. call planning once at task start
2. call tool selection before concrete tool use
3. only record step evidence at high-confidence boundaries
4. finalize the task once at completion or blockage
5. inspect learned state only when useful

## Minimal Migration From Thin MCP

If you already use thin MCP, the migration path is:

1. keep thin MCP for introspection and fallback compatibility
2. move task-start planning into adapter hooks
3. move pre-tool selection into adapter hooks
4. move terminal feedback into adapter finalization
5. stop depending on conversational confirmation loops as the mainline

The migration does not require replacing Aionis runtime routes.
The adapter should reuse the current stable route contracts.

## What The Adapter Avoids

The adapter should not:

1. add a second persistence layer
2. fork Aionis trust logic
3. create a parallel memory model
4. turn into a second control plane

It should only:

1. normalize client events
2. preserve execution evidence
3. forward those events into existing Aionis runtime contracts

## Current Gaps

The current baseline still needs:

1. real client wiring by default
2. packaging guidance for a concrete client distribution path
3. productized onboarding for adapter-enabled clients

So the current state is:

1. adapter contract: present
2. adapter baseline implementation: present
3. local harness: present
4. real default client integration: not yet done

## Recommended Near-Term Path

If you are integrating Aionis today, the recommended order is:

1. use the adapter path if your client can observe execution hooks
2. keep thin MCP available for inspection and fallback compatibility
3. use the local harness and sidecar tests as the first integration reference

## Sidecar Path

The next practical wiring layer is the local adapter sidecar.

Use it when:

1. the client can emit lifecycle events
2. you want a real local process boundary
3. you want to reduce dependence on prompt choreography before a deeper native integration exists

See:

1. [AIONIS_ADAPTER_SIDECAR_SPEC.md](/Volumes/ziel/Aionisgo/docs/AIONIS_ADAPTER_SIDECAR_SPEC.md)
2. [AIONIS_ADAPTER_SIDECAR_GUIDE.md](/Volumes/ziel/Aionisgo/docs/AIONIS_ADAPTER_SIDECAR_GUIDE.md)

## Wrapper Path

The next practical execution layer above the sidecar is the local adapter wrapper.

Use it when:

1. your client can run command-backed steps
2. you want one local entrypoint instead of directly calling adapter methods
3. you want a first usable adapter-first path before richer native client hooks exist

See:

1. [AIONIS_ADAPTER_WRAPPER_SPEC.md](/Volumes/ziel/Aionisgo/docs/AIONIS_ADAPTER_WRAPPER_SPEC.md)
2. [AIONIS_ADAPTER_WRAPPER_GUIDE.md](/Volumes/ziel/Aionisgo/docs/AIONIS_ADAPTER_WRAPPER_GUIDE.md)

## Related Documents

1. [AIONIS_ADAPTER_DIRECTION.md](/Volumes/ziel/Aionisgo/docs/AIONIS_ADAPTER_DIRECTION.md)
2. [AIONIS_EXECUTION_ADAPTER_SPEC.md](/Volumes/ziel/Aionisgo/docs/AIONIS_EXECUTION_ADAPTER_SPEC.md)
3. [2026-03-21-aionis-execution-adapter.md](/Volumes/ziel/Aionisgo/docs/plans/2026-03-21-aionis-execution-adapter.md)
4. [AIONIS_THIN_MCP_GUIDE.md](/Volumes/ziel/Aionisgo/docs/AIONIS_THIN_MCP_GUIDE.md)
5. [AIONIS_ADAPTER_SIDECAR_SPEC.md](/Volumes/ziel/Aionisgo/docs/AIONIS_ADAPTER_SIDECAR_SPEC.md)
6. [AIONIS_ADAPTER_SIDECAR_GUIDE.md](/Volumes/ziel/Aionisgo/docs/AIONIS_ADAPTER_SIDECAR_GUIDE.md)
7. [AIONIS_ADAPTER_WRAPPER_SPEC.md](/Volumes/ziel/Aionisgo/docs/AIONIS_ADAPTER_WRAPPER_SPEC.md)
8. [AIONIS_ADAPTER_WRAPPER_GUIDE.md](/Volumes/ziel/Aionisgo/docs/AIONIS_ADAPTER_WRAPPER_GUIDE.md)
