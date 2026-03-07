---
title: Introducing Aionis Codex Local Profile
description: A productized local workflow for running Codex with Aionis Dev MCP, standalone Docker, and replayable coding sessions.
pubDate: 2026-03-07
category: Product
tags:
  - codex
  - mcp
  - replay
  - local-workflow
featured: true
---

Today we are releasing **Aionis Codex Local Profile**, the official local path for running Codex with Aionis.

This release matters because most local coding workflows are still hard to inspect after the fact. Developers may have shell history, test output, and a few ad hoc notes, but they usually do not have a clean execution chain for what the agent actually did.

Codex Local Profile closes that gap by combining three pieces into one supported workflow:

1. **Aionis Dev MCP** as the MCP tool surface for Codex.
2. **Aionis standalone Docker** as the local runtime.
3. **A tracked local launcher** that turns a coding session into a replayable run.

## What is new

The release adds a productized local path instead of expecting users to assemble one from low-level scripts.

The user-facing surface is intentionally small:

1. `codex-aionis` starts a tracked local Codex session.
2. `codex-aionis-doctor` verifies the local runtime, launcher, and replay loop.

Behind that small surface, the profile wires together:

1. a native Dev MCP that ships inside the Aionis standalone image
2. a host launcher that starts the MCP through Docker
3. a local wrapper that tracks `run_start`, command-step recording, and `run_end`
4. helper commands for local `build`, `test`, and `lint` replay steps

## Why we built it this way

The goal was not to create another generic MCP server and stop there.

We wanted the official local workflow to be:

1. easy to start on one machine
2. compatible with how people already use Codex locally
3. strict enough to preserve replayable provenance
4. governed enough to support learning signals without turning into an unchecked self-modifying loop

That is why Codex Local Profile is packaged as a local product workflow, not as an abstract set of APIs.

## What the local loop looks like

When a user launches Codex through `codex-aionis`, the session can flow through:

1. run start
2. planning context assembly
3. local command-step recording
4. run end
5. optional quality-gate and learn-from-run follow-up

This gives local development a durable trail instead of a one-off terminal transcript.

## What ships in the product surface

The profile now gives Codex users a supported path to:

1. connect to `aionis-dev` as a built-in MCP
2. run Aionis locally through standalone Docker
3. launch a tracked Codex session with one short command
4. verify the local setup with a doctor command before relying on it

For teams, that means the difference between "we have an MCP integration" and "we have a usable local execution workflow."

## Getting started

The shortest path is:

```bash
cd /path/to/Aionis
npm run -s mcp:aionis:dev:standalone:oneclick
npm run -s aionis:setup:codex
npm run -s aionis:install:codex-launcher
codex-aionis-doctor
```

Then launch Codex with:

```bash
codex-aionis \
  --root /path/to/workspace \
  --title "Fix a regression" \
  --goal "Diagnose and fix the issue without breaking MCP behavior." \
  --query "Investigate the regression and preserve the local replay loop." \
  -- codex
```

## Where to learn more

1. Read the [Codex Local Profile guide](https://doc.aionisos.com/guide/codex-local-profile).
2. Read the [Integrations guide](https://doc.aionisos.com/guide/integrations).
3. Read the [Quickstart](https://doc.aionisos.com/guide/quickstart) if you want the fastest end-to-end validation path before enabling the local Codex workflow.

This release is the start of a more opinionated local developer workflow in Aionis. The MCP is important, but the product value comes from the full local loop around it.
