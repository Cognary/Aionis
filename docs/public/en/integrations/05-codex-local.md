---
title: "Codex Local Profile"
---

# Codex Local Profile

`Aionis Codex Local Profile` is the official local integration path for Codex users.

There are currently two useful local modes.

## Mode A: Pure Lite + Dev MCP

Best for:

1. project-scoped local memory and replay
2. low-friction testing with SQLite-backed Lite
3. users who want Codex CLI sessions to opt into Aionis explicitly

This mode combines:

1. `start:lite` as the local runtime
2. `aionis-dev-mcp` as the MCP surface
3. project-scoped launchers such as `codex-aionis-project`

Start with:

```bash
npm run build
npm run start:lite
```

Then launch a project-scoped Codex session:

```bash
codex-aionis-project -C /path/to/project
```

What this gives you:

1. Lite-backed memory and replay
2. project-derived `scope`
3. explicit opt-in instead of global Codex attachment

## Mode B: Tracked Standalone Profile

Best for:

1. teams that want the full tracked wrapper path
2. local coding tasks that should automatically record replay runs and steps
3. users who want the older standalone Docker profile

This mode combines:

1. `Aionis Dev MCP` as the MCP tool surface
2. standalone Docker as the local Aionis runtime
3. a tracked agent wrapper that records replay runs and steps

## Who Should Use Which Mode

1. Choose **Pure Lite + Dev MCP** if you want the simplest local path and project-scoped sessions.
2. Choose **Tracked Standalone Profile** if you want the full wrapper-driven replay lifecycle around Codex tasks.

## What Happens By Default

After you enable this profile, every task launched through `codex-aionis` goes through:

1. automatic replay run start
2. planning context at session start
3. replay step capture for local command steps
4. automatic run end recording

## Tracked Standalone Setup

1. Start standalone:

```bash
cd /path/to/Aionis
npm run -s mcp:aionis:dev:standalone:oneclick
```

2. Configure Codex and install the host launcher:

```bash
npm run -s aionis:setup:codex
npm run -s aionis:install:codex-launcher
```

3. Run the doctor:

```bash
npm run -s aionis:doctor:codex
```

Then launch Codex with:

```bash
codex-aionis \
  --root /path/to/Aionis \
  --title "Your task title" \
  --goal "Your concrete goal" \
  --query "Your natural language task description" \
  -- codex
```

## What Users Need To Remember

For most standalone users, there are only two commands:

1. `codex-aionis` to start a tracked Codex session
2. `codex-aionis-doctor` to verify the local runtime, launcher, and replay loop

## Command Steps

Inside a live session, these helpers can record common local command steps:

```bash
AIONIS_RUN_ID=<run-id> \
AIONIS_SESSION_ROOT=/path/to/Aionis \
bash /path/to/Aionis/scripts/aionis-build
```

Also available:

1. `bash /path/to/Aionis/scripts/aionis-test`
2. `bash /path/to/Aionis/scripts/aionis-lint`

## Troubleshooting

If `codex-aionis` does not behave as expected, check these first:

1. the standalone container is actually running
2. `codex-aionis-doctor` passes
3. Codex has loaded the `aionis-dev` MCP entry

The shortest standalone checks are:

```bash
codex-aionis-doctor
codex mcp list
```

## Low-Level Entrypoints

The lower-level commands are still available for advanced integration and debugging:

1. `npm run -s aionis:codex`
2. `npm run -s aionis:setup:codex`
3. `npm run -s aionis:doctor:codex`
4. `npm run -s devloop:session`

## Related

1. [MCP Integration](/public/en/integrations/01-mcp)
2. [Get Started](/public/en/getting-started/01-get-started)
3. [Lite Operator Notes](/public/en/getting-started/04-lite-operator-notes)
