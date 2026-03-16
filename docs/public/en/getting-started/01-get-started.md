---
title: "Get Started"
---

# Get Started

Use this page to choose the fastest working path into Aionis.

## What Success Looks Like

In your first session, you should be able to do one of these:

1. Start Lite locally and complete one `write -> recall_text` loop.
2. Point an app or agent to Aionis and complete one `write -> recall_text -> planning/context` loop.
3. Identify whether your path is Lite, self-hosted Server, or later Cloud.

## Pick Your Path

### Path A: Local Lite

Best for:

1. single-user local evaluation
2. Codex or MCP workflows
3. testing continuity, replay, and context assembly with low setup friction

Start here:

1. [Choose Lite vs Server](/public/en/getting-started/07-choose-lite-vs-server)
2. [5-Minute Onboarding](/public/en/getting-started/02-onboarding-5min)
3. [Lite Operator Notes](/public/en/getting-started/04-lite-operator-notes)
4. [Lite Public Beta Boundary](/public/en/getting-started/05-lite-public-beta-boundary)
5. [Lite Troubleshooting and Feedback](/public/en/getting-started/06-lite-troubleshooting-and-feedback)
6. [3-Minute Lite Setup Without a Local Repo](/public/en/getting-started/09-no-local-repo-lite)

### Path B: Integrate Aionis Into Agents

Best for:

1. API and SDK integration
2. Codex / MCP integration
3. teams validating memory, replay, and policy loops in a real runtime

Start here:

1. [Build Memory Workflows](/public/en/guides/01-build-memory)
2. [API Reference](/public/en/api-reference/00-api-reference)
3. [SDK Guide](/public/en/reference/05-sdk)
4. [Python SDK + Aionis CLI](/public/en/getting-started/08-python-sdk-with-cli)
5. [Integrations Overview](/public/en/integrations/00-overview)
6. [Codex Local](/public/en/integrations/05-codex-local)
7. [3-Minute Lite Setup Without a Local Repo](/public/en/getting-started/09-no-local-repo-lite)

### Path C: Self-Hosted Server

Best for:

1. production self-hosting
2. teams that need full Server topology
3. operating Aionis beyond local Lite boundaries

Start here:

1. [Choose Lite vs Server](/public/en/getting-started/07-choose-lite-vs-server)
2. [Operate and Production](/public/en/operate-production/00-operate-production)
3. [Operator Runbook](/public/en/operations/02-operator-runbook)
4. [Production Core Gate](/public/en/operations/03-production-core-gate)
5. [Standalone to HA Runbook](/public/en/operations/06-standalone-to-ha-runbook)

## Minimal Runtime Checklist

No matter which path you choose, confirm these early:

1. `/health` returns `ok`
2. your embedding provider is configured
3. one `write` request returns a `request_id`
4. one `recall_text` request returns recallable seeds or context
5. if you are using Lite, `/health.aionis_edition = "lite"` and `/health.memory_store_backend = "lite_sqlite"`

## Read This Next

After your first successful loop, continue with:

1. [Docs Navigation Map](/public/en/overview/02-docs-navigation)
2. [Role-Based Reading Paths](/public/en/overview/03-role-based-paths)
3. [Architecture](/public/en/architecture/01-architecture)
4. [Context Orchestration](/public/en/context-orchestration/00-context-orchestration)
