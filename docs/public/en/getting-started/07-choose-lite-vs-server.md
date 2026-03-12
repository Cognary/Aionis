---
title: "Choose Lite vs Server"
---

# Choose Lite vs Server

Choose Lite if you want the fastest local path.

Choose Server if you want the self-hosted production path.

## Choose Lite

Lite is the right path when you want:

1. single-user local runtime
2. SQLite-backed memory and replay
3. no Docker or external Postgres
4. Codex or MCP-based local workflows
5. evaluation and controlled beta use

Start here:

1. [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
2. [Lite Operator Notes](/public/en/getting-started/04-lite-operator-notes)
3. [Lite Public Beta Boundary](/public/en/getting-started/05-lite-public-beta-boundary)
4. [Lite Troubleshooting and Feedback](/public/en/getting-started/06-lite-troubleshooting-and-feedback)

## Choose Server

Server is the right path when you want:

1. self-hosted production runtime
2. team ownership and operational discipline
3. full server surfaces including admin/control and automation beta
4. Docker/Postgres deployment model
5. production gates and runbooks

Start here:

1. [Get Started](/public/en/getting-started/01-get-started)
2. [Operate and Production](/public/en/operate-production/00-operate-production)
3. [Production Core Gate](/public/en/operations/03-production-core-gate)
4. [Production Go-Live Gate](/public/en/operations/04-prod-go-live-gate)

## Boundary Summary

| Area | Lite | Server |
| --- | --- | --- |
| Startup | local `start:lite` | service/self-hosted runtime |
| Storage | local SQLite-backed runtime | Postgres-oriented runtime |
| `write / recall / replay` | supported | supported |
| `rules / tools / planning/context` | supported | supported |
| `/v1/admin/control/*` | server-only | supported |
| `/v1/automations/*` | server-only | supported |
| Posture | controlled public beta | open-core production path |

## If You Are Still Not Sure

Use Lite if your first goal is:

1. prove the workflow locally
2. integrate with Codex or MCP
3. validate continuity, replay, and memory behavior

Use Server if your first goal is:

1. run shared or production workloads
2. operate with stronger governance
3. use admin/control or automation surfaces

## Related

1. [Overview](/public/en/overview/01-overview)
2. [API Reference](/public/en/api-reference/00-api-reference)
3. [Codex Local Profile](/public/en/integrations/05-codex-local)
