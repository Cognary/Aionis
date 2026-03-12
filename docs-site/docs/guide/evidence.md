---
title: Evidence
description: See the public evidence behind continuity, token reduction, replay, and Lite public beta readiness.
---

# Evidence

Aionis should not be adopted on narrative alone. This page summarizes the public evidence behind the current product claims.

## What the evidence is meant to prove

The key claims behind Aionis are:

1. agents can continue work across sessions instead of restarting from zero
2. continuation reduces repeated token cost
3. replay and exact handoff recovery are practical, not theoretical
4. Lite is a real local product path, not a concept demo

## Continuity and token evidence

In a larger-project continuation test on the open-source `pallets/click` repository:

1. output tokens were reduced by about **77%**
2. total tokens were reduced by about **33%**
3. the second session resumed work from stored execution memory and handoff recovery instead of rebuilding context from scratch

What this proves:

1. Aionis is not only a storage layer
2. it changes the cost of cross-session continuation
3. the product value is continuity first, with token reduction as one consequence

## Replay and exact recovery evidence

The current public workflow already demonstrates:

1. replay lifecycle recording
2. replay run inspection
3. playbook compilation and retrieval
4. exact handoff recovery for continuation-sensitive workflows

This matters because teams need more than “memory recall.” They need:

1. a reusable execution path
2. inspectable evidence
3. a reliable way to resume work after interruption

## Lite public beta evidence

Lite is currently positioned as the fastest path to trying Aionis locally.

That claim is backed by:

1. a real `start:lite` path
2. repository alpha and beta gates
3. repeatable `lite:dogfood`
4. support for the core local workflow:
   - write
   - recall
   - recall_text
   - planning/context
   - context/assemble
   - replay lifecycle
   - packs
   - rules and tools loop

Lite is still not presented as:

1. Server parity
2. a production replacement for Server
3. a multi-user control plane

## What this does not prove

These results do **not** mean:

1. every task will save the same number of tokens
2. Lite is the default production deployment
3. Aionis replaces governance, operations, or architecture work by itself

The evidence supports a narrower claim:

1. Aionis improves execution continuity
2. continuity can materially reduce repeated agent cost
3. the local product path is real and usable today

## Recommended reading

1. [Lite Public Beta](lite-public-beta)
2. [Choose Lite or Server](choose-lite-or-server)
3. [Codex Local Profile](codex-local-profile)
4. [Overview](overview)
