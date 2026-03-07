---
title: "Codex Local Profile"
---

# Codex Local Profile

`Aionis Codex Local Profile` is the official local integration path for Codex users.

It combines:

1. `Aionis Dev MCP` as the MCP tool surface
2. standalone Docker as the local Aionis runtime
3. a tracked agent wrapper that records replay runs and steps

## Who It Is For

This profile is for users who want:

1. Codex to access Aionis memory, replay, planning, and learn-from-run capabilities
2. local coding tasks to flow through a tracked `run_start -> step record -> run_end` loop

## What Happens By Default

After you enable this profile, every task launched through `codex-aionis` goes through:

1. automatic replay run start
2. planning context at session start
3. replay step capture for local command steps
4. automatic run end recording

## 3-Minute Setup

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

For most users, there are only two commands:

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

The shortest checks are:

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
