---
title: "Core Differentiators"
---

# Core Differentiators

These are the primary Aionis differentiators to communicate and validate in market-facing materials.

## 1) Memory -> Policy -> Action Loop

Aionis extends beyond retrieval by linking:

1. `rules/evaluate`
2. `tools/select`
3. `tools/feedback`
4. `tools/decision`

This turns memory into executable behavior with policy control.

## 2) Auditable and Replayable Decisions

Each decision can be traced with `decision_id`, `run_id`, and policy/source references.  
This supports post-incident review, governance, and deterministic replay checks.

## 3) Derived-Async Reliability

Core write path is separated from derived processing (embedding/topic jobs).  
Write reliability does not depend on upstream embedding latency.

## 4) Governed Adaptation

Feedback can adapt rule behavior, but under explicit policy and operational gates.  
This is a bounded, reviewable adaptation loop rather than black-box drift.

## 5) Production-Grade Operations

Aionis includes runbooks, release gates, and ops diagnostics as first-class capabilities.

## Evidence Links

1. [Differentiation Evidence](/public/en/benchmarks/03-differentiation-evidence)
2. [Benchmark Snapshot (Public)](/public/en/benchmarks/02-benchmark-snapshot-public)
3. [Execution Loop Gate](/EXECUTION_LOOP_GATE)
4. [Policy Adaptation Gate](/POLICY_ADAPTATION_GATE)
5. [Production Core Gate](/public/en/operations/03-production-core-gate)
