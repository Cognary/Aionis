# Aionis Codex CLI Guide

## Summary

This is the first real Aionis host path that does not depend on MCP prompt choreography.

Current Codex integration now has two layers:

1. `adapter:codex-hook`
   - prompt-stage planning guidance
2. `adapter:codex-shell`
   - command-backed `select -> execute -> feedback -> finalize`

If you want to actually use Aionis with a Codex-style host today, the shell path is the practical one.

## Product Shape

The current shape is:

1. Codex acts as the agent host
2. Aionis acts as the execution-memory layer
3. tools still do the real work

That means:

1. Codex keeps the user/task loop
2. Aionis shapes execution with planning, tool ordering, feedback, and finalization
3. repeated runs can accumulate into workflow and pattern memory

## What Exists Right Now

The current Codex path already has:

1. prompt hook bridge
2. shell bridge
3. host integration bus
4. capability registry
5. command-backed entrypoint

The current shell entrypoint lives at:

1. [aionis-codex-cli-shell.ts](/Volumes/ziel/Aionisgo/src/adapter/aionis-codex-cli-shell.ts)

## Startup

Start Aionis first:

```bash
PORT=3011 npm run start:lite
```

Then run the Codex shell bridge:

```bash
AIONIS_BASE_URL=http://127.0.0.1:3011 AIONIS_SCOPE=codex-demo npm run -s adapter:codex-shell
```

## Minimal End-To-End Flow

One Codex-style shell request currently runs:

1. `tool_selection_requested`
2. local command execution
3. `tool_executed`
4. `task_terminal`
5. optional `introspect`

This is already enough to produce:

1. tool ordering
2. feedback recording
3. task finalization
4. visible learning in introspection

## Example Request

A reusable request example now lives at:

1. [examples/codex-cli-shell-run.json](/Volumes/ziel/Aionisgo/examples/codex-cli-shell-run.json)

You can run it directly:

```bash
cat examples/codex-cli-shell-run.json | AIONIS_BASE_URL=http://127.0.0.1:3011 AIONIS_SCOPE=codex-demo npm run -s adapter:codex-shell
```

Or use the helper script:

```bash
AIONIS_BASE_URL=http://127.0.0.1:3011 AIONIS_SCOPE=codex-demo npm run -s adapter:codex-shell:demo
```

## Response Shape

The shell bridge returns:

1. `selection`
2. `execution`
3. `feedback`
4. `finalization`
5. `introspection`

The response is deliberately structured so a host can consume it without digging through raw runtime payloads.

## Current Limits

This is still the first practical host path, not the end state.

Current limits:

1. one command-backed step per request
2. no direct Codex internal shell interception yet
3. no rich file-edit lifecycle yet
4. no full product packaging layer yet

So the real state is:

1. Codex host baseline: present
2. Codex shell learning loop: present
3. deep native Codex integration: not yet done

## Recommended Usage Right Now

Use the Codex path like this:

1. start Aionis locally
2. run the shell bridge for command-backed tasks
3. inspect the resulting learning state
4. repeat similar runs to grow trusted patterns

This is the current practical product path while deeper host wiring is still being built.

## Related Docs

1. [AIONIS_CODEX_CLI_SPEC.md](/Volumes/ziel/Aionisgo/docs/AIONIS_CODEX_CLI_SPEC.md)
2. [AIONIS_HOST_INTEGRATION_ARCHITECTURE.md](/Volumes/ziel/Aionisgo/docs/AIONIS_HOST_INTEGRATION_ARCHITECTURE.md)
3. [AIONIS_EXECUTION_ADAPTER_GUIDE.md](/Volumes/ziel/Aionisgo/docs/AIONIS_EXECUTION_ADAPTER_GUIDE.md)
4. [2026-03-21-aionis-codex-cli.md](/Volumes/ziel/Aionisgo/docs/plans/2026-03-21-aionis-codex-cli.md)
