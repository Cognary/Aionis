---
title: "Aionis One-Page"
---

# Aionis One-Page

## What Aionis Is

Aionis is a memory-centered, cost-aware runtime kernel for agents and AI products that need:

1. durable cross-session memory
2. structured context assembly
3. replayable execution
4. policy-aware routing and auditable runtime state

## Product Shape

### Lite

Local, single-user, SQLite-backed edition for evaluation, agent workflows, and public beta use.

### Server

Self-hosted production path for teams that need the full open-core runtime surface.

### Cloud

Managed control-plane direction built outside the public open-core tree.

## Why It Matters

Aionis is valuable when a new agent session should not have to start from zero.

It changes the runtime from:

1. read everything again
2. reconstruct context again
3. re-decide execution again

to:

1. recover project memory
2. assemble only the context you need
3. reuse execution artifacts and handoffs

## Evidence

These are not only narrative claims:

1. Aionis already exposes public benchmark material for runtime and optimization behavior. Start with [Benchmarks](/public/en/benchmarks/05-performance-baseline).
2. Lite is not documented as an idea only. Its public beta boundary, operator notes, and troubleshooting path are already published.
3. The project has already validated continuity, replay, and cost-saving behavior through internal dogfood and A/B experiments, and public docs are being reorganized around those measured behaviors instead of pure narrative claims.

## Core Runtime Loop

```mermaid
flowchart LR
  A["Write Memory"] --> B["Recall And Assemble Context"]
  B --> C["Apply Policy And Select Tools"]
  C --> D["Execute And Record Replay"]
  D --> E["Recover Handoff Or Reuse Playbook"]
  E --> A
```

## Best Entry Points

1. [Get Started](/public/en/getting-started/01-get-started)
2. [Choose Lite vs Server](/public/en/getting-started/07-choose-lite-vs-server)
3. [Integrations Overview](/public/en/integrations/00-overview)
4. [Operate and Production](/public/en/operate-production/00-operate-production)
