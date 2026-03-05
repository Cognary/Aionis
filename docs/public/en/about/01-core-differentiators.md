---
title: "Core Differentiators"
---

# Core Differentiators

This page summarizes the main external differentiators of Aionis.

## 1) Memory -> Policy -> Action -> Replay

Aionis connects memory retrieval with execution control through:

1. `rules/evaluate`
2. `tools/select`
3. `tools/decision`
4. `tools/run`
5. `tools/feedback`

This makes memory influence behavior, not only prompts.

## 2) Closed-Loop Learning with Guardrails

Aionis turns approved replay repairs into governed learning artifacts:

1. `replay/playbooks/repair/review` with `learning_projection`
2. projection outputs into rule/episode memory
3. next runs can consume projected policy/context

Edge-case controls are explicit:

1. `overlapping_rules_detected`
2. `duplicate_rule_fingerprint_skipped`
3. `episode_gc_policy_attached`
4. outbox retryable/fatal error class isolation

## 3) Verifiable and Replayable Decisions

Each execution flow can be traced with:

1. `request_id`
2. `run_id`
3. `decision_id`
4. `commit_uri`

## 4) Reliable Write Path with Async Derivation

Writes are durable even when embedding/topic derivation runs asynchronously, which keeps core ingestion stable under load.

## 5) Governed Adaptation

Rule changes and behavior adaptation are controlled by explicit lifecycle and gate checks before promotion.

## 6) Production Operations as Product Surface

Aionis includes first-class runbooks, release gates, and operations workflows for live systems.

## Evidence

1. [Differentiation Evidence](/public/en/benchmarks/03-differentiation-evidence)
2. [Benchmark Snapshot (Public)](/public/en/benchmarks/02-benchmark-snapshot-public)
3. [Production Core Gate](/public/en/operations/03-production-core-gate)

## Primary and Supplement Pages

1. Primary category page: [Overview](/public/en/overview/01-overview)
2. Executive brief: [Aionis One-Page](/public/en/about/02-aionis-onepage)
