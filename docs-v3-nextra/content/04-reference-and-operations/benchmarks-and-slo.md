---
title: "Benchmarks And SLO"
description: "Review the public evidence, performance baselines, continuity results, and restraint rules behind Aionis external claims."
---

# Benchmarks And SLO

This page is the evidence layer for Aionis.

It is not trying to claim universal superiority. It is trying to show what the current repository and public disclosures can actually support.

## Public Evidence Categories

The current public benchmark set already supports four core claims:

1. baseline write and recall performance
2. policy-loop improvement on a documented scenario
3. continuity and handoff quality across runtime boundaries
4. replay reuse, including documented strict replay behavior

## Current Public Snapshot

The current public snapshot includes:

1. recall p95 `51.42 ms`
2. write p95 `182.5 ms`
3. `0%` recall failure rate in the disclosed profile
4. `0%` write failure rate in the disclosed profile
5. policy-loop scenario improvement from `0.50` to `1.00` success rate on `XMB-006`

## Policy Comparison Work In Progress

Other policy comparison experiments may continue internally.

That is normal.

The working rule here is:

1. use already published policy evidence
2. use live-verified API behavior from the repository
3. do not turn ongoing experiments into current public product claims

## Continuity and Replay Evidence

The strongest differentiation evidence is not raw latency.

It is continuity:

1. continuation A/B showed lower token usage on real continuation work
2. cross-runtime handoff recovery improved from `33.33%` to `100%`
3. strict replay on a real repository was documented at `0` model tokens after compile in the disclosed mode

That is why Aionis can credibly present itself as execution memory rather than just retrieval memory.

## What Aionis Does Not Need To Claim

The evidence is stronger when the limits are explicit.

Current non-claims include:

1. not a universal benchmark across all frameworks and hardware
2. not a claim that guided replay is zero-token
3. not a claim that in-memory state inside one runtime is the same problem Aionis is solving

This restraint makes the adoption story more believable, not weaker.

## SLO Posture

The current repository already includes an SLO mindset even where thresholds remain team-defined.

Examples:

1. starter recall and write p95 guidance in the benchmark docs
2. deployment and quality gates in `job:health-gate`
3. consolidation health SLO artifacts
4. replay determinism gates for deeper system guarantees

The important point is not one universal threshold.

It is that Aionis already has a path for generating release evidence and enforcing operational standards.

## How Serious Users Should Read This Layer

Use benchmarks in three passes:

1. first, validate your own basic write and recall profile
2. second, test continuity and handoff on your actual workflow
3. third, evaluate replay and governance evidence only where deterministic reuse matters

## Primary Code and Doc Grounding

1. `docs/public/en/benchmarks/02-benchmark-snapshot-public.md`
2. `docs/public/en/benchmarks/03-differentiation-evidence.md`
3. `docs/public/en/benchmarks/05-performance-baseline.md`
4. `docs/public/en/benchmarks/07-agent-handoff-and-replay.md`
5. `src/jobs/perf-benchmark.ts`
6. `src/jobs/perf-report.ts`
7. `src/jobs/consolidation-health-slo.ts`
8. `src/jobs/consolidation-replay-determinism.ts`
