---
title: Lite Public Beta
description: Run Aionis Lite as a local SQLite-backed public beta with clear boundaries and troubleshooting.
---

# Lite Public Beta

Aionis Lite is the fastest way to try Aionis today.

It gives you a local, SQLite-backed edition that preserves the core Aionis workflow:

1. write execution memory
2. recall it later
3. assemble context
4. replay what happened

## What Lite Is

Lite is:

1. local
2. single-user
3. SQLite-backed
4. the shortest path to testing Aionis with Codex or MCP

Lite is not:

1. Server parity
2. a production replacement for Server
3. the multi-user control plane

## Fastest Start

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
npm install
npm run build
npm run start:lite
```

Health should show Lite:

```bash
curl -fsS http://localhost:3001/health | jq '{ok,aionis_edition,memory_store_backend}'
```

Expected:

1. `aionis_edition = "lite"`
2. `memory_store_backend = "lite_sqlite"`

## What Lite Supports Today

Lite public beta supports the core Aionis runtime path:

1. `write`
2. `recall`
3. `recall_text`
4. `planning/context`
5. `context/assemble`
6. replay lifecycle and playbooks
7. sessions and packs
8. graph inspection
9. rules and tools loop

## What Stays Server-Only

These remain intentionally unavailable in Lite:

1. `/v1/admin/control/*`
2. `/v1/automations/*`

Treat `501 server_only_in_lite` as edition behavior, not as a runtime failure.

## Recommended Validation

Run the standard Lite validation path:

```bash
npm run -s lite:dogfood
```

That path checks:

1. startup
2. health
3. write
4. recall
5. context runtime
6. pack export/import
7. replay lifecycle

## Why Start with Lite

If you want to prove the value of Aionis quickly, Lite is the right first step:

1. less setup friction
2. easier local iteration
3. direct Codex and MCP experimentation
4. the fastest route to continuity, replay, and exact handoff recovery

## Next Reading

1. [Choose Lite or Server](choose-lite-or-server)
2. [Quickstart](quickstart)
3. [Codex + Aionis](codex-local-profile)
4. [Troubleshooting](troubleshooting)
