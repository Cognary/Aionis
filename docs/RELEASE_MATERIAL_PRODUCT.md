---
title: "Release Material - Product"
---

# Release Material: Product Version (Application Teams)

## Problem

Application teams need memory that survives real traffic and supports policy-driven behavior, not a demo-only vector lookup that is hard to operate.

## Architecture Principles

1. `Audit-first`: every memory write is trackable and recoverable.
2. `Derived async`: background derivations do not block user-facing write flows.
3. `Memory -> Policy`: memory signals directly influence planner/tool decisions and can learn from feedback.

## Evidence

1. Stable API contract for `write` and `recall_text`.
2. SDK availability in TypeScript and Python for fast integration.
3. Operational runbooks, health gates, and consistency checks for release confidence.
4. Published container artifact for standard deployment path.

## Boundaries

1. Aionis is a memory kernel, not a full workflow orchestrator.
2. Retrieval quality still depends on prompt strategy and application-side eval loops.
3. Some enterprise governance workflows require staged rollout with platform teams.

## Next Step

1. Start with one production flow and lock KPI targets.
2. Enable policy/rule feedback loop for one high-value decision point.
3. Expand scope only after latency, quality, and ops metrics are stable for two release cycles.
