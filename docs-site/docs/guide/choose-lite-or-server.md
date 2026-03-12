---
title: Choose Lite or Server
description: Choose Lite for the fastest local path or Server for the self-hosted production path.
---

# Choose Lite or Server

Choose **Lite** if your first goal is to get Aionis running locally and prove the workflow quickly.

Choose **Server** if your first goal is to self-host Aionis for production-style workloads and operations.

## Choose Lite

Lite is the right path when you want:

1. a local single-user runtime
2. SQLite-backed memory and replay
3. the shortest path to `write -> recall -> replay`
4. Codex or MCP-based local workflows
5. public beta evaluation with low setup friction

Start here:

1. [Lite Public Beta](lite-public-beta)
2. [Quickstart](quickstart)
3. [Codex + Aionis](codex-local-profile)

## Choose Server

Server is the right path when you want:

1. a self-hosted production path
2. shared operational ownership
3. admin and automation surfaces
4. Postgres-backed deployment
5. production runbooks and go-live gates

Start here:

1. [Overview](overview)
2. [Quickstart](quickstart)
3. [Operations and Gates](operations-and-gates)
4. [Operations Overview](/operations/)

## Boundary Summary

| Area | Lite | Server |
| --- | --- | --- |
| Startup | local `start:lite` | service/self-hosted runtime |
| Storage | local SQLite-backed runtime | production-oriented runtime |
| `write / recall / replay` | supported | supported |
| `rules / tools / planning/context` | supported | supported |
| `/v1/admin/control/*` | server-only | supported |
| `/v1/automations/*` | server-only | supported |
| Posture | public beta | open-core production path |

## If You Are Still Not Sure

Use Lite if your first question is:

1. can this help my coding agent continue work across sessions?
2. can I try it locally in minutes?
3. can I connect it to Codex or MCP without building infrastructure first?

Use Server if your first question is:

1. how do I self-host this for a team or production workflow?
2. how do I operate it with stronger governance?
3. how do I use admin or automation surfaces?
