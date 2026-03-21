# Aionis Codex CLI Integration Plan

**Goal:** Make Codex CLI the first serious open host path for Aionis by wiring Aionis into Codex lifecycle hooks, starting with automatic planning-context injection at `UserPromptSubmit`.

**Architecture:** Add a source-owned Codex hook bridge under `src/adapter/` that reads Codex `hooks.json` command input from stdin, maps supported hook events onto stable Aionis runtime calls, and returns valid Codex hook output JSON. Keep the first slice narrow: `SessionStart` and `Stop` are safe no-ops; `UserPromptSubmit` is the first meaningful product path.

**Tech Stack:** TypeScript, zod, existing Aionis HTTP client under `src/mcp/client.ts`, existing adapter docs, node:test.

### Task 1: Lock The Codex CLI Product Direction

Add a dedicated Codex CLI spec so this host path has a single source of truth.

- Create: `/Volumes/ziel/Aionisgo/docs/AIONIS_CODEX_CLI_SPEC.md`
- Create: `/Volumes/ziel/Aionisgo/docs/plans/2026-03-21-aionis-codex-cli.md`

**Step 1: Define the product shell**

Write down:

1. why Codex CLI is a better main host candidate than MCP-first Claude Code
2. why `UserPromptSubmit` is the first meaningful hook
3. why the first slice should not fake learning at `Stop`

**Step 2: Define the first runtime mapping**

Document:

1. `SessionStart -> no-op`
2. `UserPromptSubmit -> /v1/memory/planning/context`
3. `Stop -> no-op`

### Task 2: Add Codex Hook Contracts

Create a source-owned contract layer for the Codex hook request and response shapes we care about.

- Create: `/Volumes/ziel/Aionisgo/src/adapter/codex-cli-hook-contracts.ts`

**Step 1: Parse three hook inputs**

Add zod schemas for:

1. `SessionStart`
2. `UserPromptSubmit`
3. `Stop`

Use the Codex hook command fields actually needed in v1:

1. `session_id`
2. `turn_id`
3. `cwd`
4. `hook_event_name`
5. `model`
6. `permission_mode`
7. `prompt`
8. `last_assistant_message`

**Step 2: Add response builders**

Expose helper functions that build valid Codex hook outputs:

1. continue-only output
2. additional-context output for `UserPromptSubmit`

### Task 3: Implement The Codex Hook Bridge

Add a bridge class that translates Codex hook events into Aionis behavior.

- Create: `/Volumes/ziel/Aionisgo/src/adapter/codex-cli-hook-bridge.ts`

**Step 1: Implement `SessionStart`**

Return a safe no-op continue response.

**Step 2: Implement `UserPromptSubmit`**

Call:

1. `POST /v1/memory/planning/context`

Then build a compact additional-context block from:

1. recommended workflows
2. candidate workflows
3. trusted pattern count
4. contested pattern count
5. planner explanation

**Step 3: Implement `Stop`**

Return a safe no-op continue response in v1.

### Task 4: Add A Local Hook Entrypoint

Create a runnable command that Codex hooks can call.

- Create: `/Volumes/ziel/Aionisgo/src/adapter/aionis-codex-cli-hook.ts`
- Modify: `/Volumes/ziel/Aionisgo/package.json`

**Step 1: Read stdin once**

Parse one Codex hook request from stdin.

**Step 2: Dispatch by `hook_event_name`**

Map:

1. `SessionStart`
2. `UserPromptSubmit`
3. `Stop`

to the bridge methods.

**Step 3: Fail safe**

On bridge errors, emit a no-op continue response rather than blocking Codex.

### Task 5: Test The Bridge

Add both unit-level and entrypoint-level tests.

- Create: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-codex-cli-hook-bridge.test.ts`
- Create: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-codex-cli-hook-entry.test.ts`

**Step 1: Bridge tests**

Verify:

1. `SessionStart` performs no runtime call
2. `UserPromptSubmit` calls planning/context once
3. meaningful planning data becomes additional context
4. empty planning data stays quiet
5. `Stop` performs no runtime call

**Step 2: Entrypoint test**

Spawn the real command, pass hook JSON on stdin, and assert:

1. exit code is `0`
2. output JSON is valid
3. `UserPromptSubmit` contains additional context when runtime guidance exists

### Task 6: Surface The New Path

Expose the new host path in package scripts and README.

- Modify: `/Volumes/ziel/Aionisgo/README.md`
- Modify: `/Volumes/ziel/Aionisgo/package.json`

Add:

1. a script like `adapter:codex-hook`
2. links to the Codex CLI spec and plan

### Verification

Run:

```bash
npx tsx --test scripts/ci/aionis-codex-cli-hook-bridge.test.ts scripts/ci/aionis-codex-cli-hook-entry.test.ts
npx tsc --noEmit
npm run -s test:lite
```

### Done Looks Like

This slice is done when:

1. Codex hook JSON can be fed to a local Aionis hook command
2. `UserPromptSubmit` injects Aionis planning guidance automatically
3. no MCP choreography is required for that guidance path
4. the bridge stays safe and quiet when Aionis has nothing useful to say
