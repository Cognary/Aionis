---
title: "Release Narrative Template"
---

# Release Narrative Template

Use this template in every release note, launch post, changelog summary, and partner update.

## 1) Problem

State the concrete production problem in one paragraph.

Example prompt:

`What breaks in real workloads without this release?`

## 2) Architecture Principles

Map the release to the three fixed pillars.

1. `Audit-first`
2. `Derived async`
3. `Memory -> Policy`

Example prompt:

`Which pillar(s) changed, and how does the design stay consistent with the kernel model?`

## 3) Evidence

Provide auditable proof, not claims.

1. Build/test gate outputs
2. Contract checks and consistency checks
3. Perf or regression reports with command and commit reference
4. Artifact versions: GitHub tag, Docker tag, npm, PyPI

Example prompt:

`Which commands were run, what passed, and where can others verify it?`

## 4) Boundaries

State what is intentionally not solved in this release.

1. Known limits
2. Deferred optimizations
3. Environment assumptions

Example prompt:

`What should operators not expect yet?`

## 5) Next Step

List the next concrete milestones with owner and trigger condition.

1. Immediate follow-up
2. Gate to enter next stage
3. Escalation signal if metric regresses

Example prompt:

`What is the next decision point and what evidence is required to pass it?`
