---
title: "Codex"
description: "Use Aionis with Codex local workflows to preserve project-scoped continuity and replay-aware execution."
---

# Codex

Codex is one of the fastest ways to feel Aionis value in practice.

## The Simplest Working Path

The cleanest local path is:

1. run Lite
2. use Dev MCP
3. launch a project-scoped Codex session

The repository already provides a scope-aware launcher:

```bash
cd /path/to/project
bash /path/to/Aionis/scripts/codex-aionis-project.sh --print
```

That launcher derives `AIONIS_SCOPE` from the project directory name unless you override it.

## Why This Path Works Well

It keeps the initial setup lightweight while still giving you:

1. project-scoped continuity
2. replay-capable local workflows
3. explicit opt-in instead of hidden global attachment

## Tracked Wrapper Path

If you want Aionis to wrap an agent command and record run lifecycle automatically, the repository already ships:

```bash
bash /path/to/Aionis/scripts/run_agent_with_aionis.sh \
  --root /path/to/project \
  --title "Investigate failing test" \
  --goal "Fix the regression without breaking existing behavior" \
  --query "Diagnose and fix the regression" \
  -- codex
```

This path opens and closes the replay session around the agent command.

## Product Value In Codex Terms

For Codex users, the pitch is not "Aionis is a memory backend."

It is:

1. stop making every fresh session rediscover the same repo state
2. keep project continuity scoped and explicit
3. gain replay-aware local workflow capture when you want it

## Why Start Here

Codex is one of the shortest paths from "interesting idea" to "I can feel this working."
