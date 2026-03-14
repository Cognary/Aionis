# 2026-03-13 Aionis Layer 1 Benchmark Plan

## Purpose

This document defines the first benchmark layer for Aionis itself.

The goal of Layer 1 is not to prove every long-chain production claim.
The goal is to establish a clean, public, reproducible evidence layer for the three capability surfaces that now define Aionis product value:

1. handoff
2. policy
3. replay

Layer 1 should answer one concrete question:

- Does Aionis materially improve agent execution behavior on real tasks when compared against a non-Aionis baseline?

The benchmark should avoid two traps:

1. proving only internal capability existence without a baseline
2. mixing runtime-specific instability with the Aionis product claim

Layer 1 is therefore a controlled capability A/B layer.

---

## Why Layer 1 Is Needed

Aionis now has multiple strong but separate evidence lines:

1. cross-runtime handoff recovery
2. real-repo handoff A/B
3. policy tool-selection benchmark
4. real-repo strict replay
5. guided replay repair smoke

These already show that the product has substance.

However, they are still distributed across multiple benchmark pages and different test harnesses. Without a unified Layer 1, external readers can still ask:

1. what is the minimum product proof for Aionis?
2. which claims are benchmark-grade versus capability smoke?
3. how do handoff, policy, and replay relate to one another?

Layer 1 exists to answer those questions with one benchmark matrix.

---

## Layer 1 Definition

Layer 1 is the controlled benchmark layer for Aionis.

It covers three capability families:

1. `Handoff A/B`
2. `Policy A/B`
3. `Replay A/B`

Every Layer 1 benchmark must satisfy the following:

1. use a fixed repository snapshot or fixed task environment
2. define a clear baseline that does not rely on Aionis
3. define a treatment that uses the Aionis surface under test
4. use deterministic or clearly bounded acceptance criteria
5. publish artifact paths and reproduction commands

Layer 1 should remain intentionally narrower than later system-level validation.
It is about clean evidence, not maximum realism.

---

## Layer 1 Capability Matrix

### 1. Handoff A/B

Question:

- Does Aionis preserve execution contract across boundaries better than a weak externalized handoff baseline?

Baseline:

- lossy `file_export`
- plain exported contract or partial note

Treatment:

- `aionis_handoff`
- `POST /v1/handoff/store`
- `POST /v1/handoff/recover`

Primary metrics:

1. success rate
2. focused file coverage
3. focused test-target coverage
4. handoff completeness
5. handoff store / recover latency

Current evidence already available:

1. cross-runtime handoff recovery: `33.33% -> 100%`
2. real GitHub repo handoff A/B on `pallets/click`: `0% -> 100%`

### 2. Policy A/B

Question:

- Does Aionis policy change tool routing on real tasks in a measurable and useful way?

Baseline:

- no policy or retrieval-only / first-candidate selection
- broad tool path such as `grep` or `pytest-all`

Treatment:

- `aionis_policy`
- `/v1/memory/rules/state`
- `/v1/memory/tools/select`
- `/v1/memory/tools/feedback`

Primary metrics:

1. success rate
2. expected tool selection rate
3. tool-switch count
4. broad-vs-focused tool path rate
5. rule write / activate / select latency

Current evidence already available:

1. XMB policy benchmark
2. real GitHub repo policy A/B on `pallets/click`: `0% -> 100%`

### 3. Replay A/B

Question:

- Does Aionis replay reduce repeated execution cost and preserve correctness on real workflows?

Baseline:

- rerun from scratch

Treatment:

- compile playbook
- replay1
- replay2

Primary metrics:

1. baseline success rate
2. compile success rate
3. replay1 success rate
4. replay2 success rate
5. baseline vs replay duration
6. compile tokens
7. replay tokens
8. verification pass rate

Current evidence already available:

1. real GitHub repo strict replay on `pallets/click`
2. `compile_success_rate = 100%`
3. `replay1_success_rate = 100%`
4. `replay2_success_rate = 100%`
5. strict replay `replay1/replay2 = 0 token`
6. guided replay smoke with non-zero repair token usage

---

## Recommended Public Layer 1 Table

Layer 1 should eventually publish one summary table like this:

| Capability | Repo / Task | Baseline | Treatment | Key Result |
| --- | --- | --- | --- | --- |
| Handoff | `pallets/click` | `file_export` | `aionis_handoff` | success `0% -> 100%` |
| Policy | `pallets/click` | no policy / broad tools | `aionis_policy` | success `0% -> 100%`, routing converges to `rg` / `pytest-focused` |
| Replay | `pallets/click` | rerun | compile + replay | replay faster than baseline, strict replay `0 token` |

This table is the simplest Layer 1 product proof.

---

## Scope Boundaries

Layer 1 should prove:

1. Aionis changes execution behavior relative to a real baseline
2. Aionis can preserve structured execution contract on real repositories
3. Aionis can change tool routing under explicit policy
4. Aionis can compile and replay real workflows

Layer 1 should not claim:

1. optimal behavior for all runtimes
2. global multi-agent superiority over framework-native internal state
3. production-grade reliability under all long-running conditions
4. all-up operator or governance maturity

Those belong to later layers.

---

## Benchmark Inputs

### Repository Strategy

Layer 1 should prefer:

1. real public GitHub repositories
2. pinned commits
3. deterministic setup steps
4. small but real task slices

Current default repository:

- `pallets/click`
- commit `cdab890e57a30a9f437b88ce9652f7bfce980c1f`

Why this is appropriate:

1. real open-source code
2. multiple focused file/test clusters
3. stable local install path
4. deterministic pytest targets

### Task Shape Requirements

Every Layer 1 task should include:

1. explicit target files or task scope
2. clear verification condition
3. bounded execution path
4. reproducible local environment

Avoid:

1. open-ended web research
2. unstable network dependencies
3. broad multi-hour workflows
4. benchmarks that depend on ambiguous human judgment

---

## Artifact Contract

Every Layer 1 benchmark page should publish:

1. benchmark scope
2. repo / commit
3. baseline definition
4. treatment definition
5. exact metrics
6. artifact paths
7. reproduction commands
8. interpretation boundary

Each run should emit at minimum:

1. `summary.json`
2. `cases.jsonl`
3. optional `manual-summary.json` when a human-corrected aggregation is required

---

## Pass Criteria For Layer 1

Layer 1 is ready for product-facing use when:

1. Handoff A/B is published with real-repo evidence
2. Policy A/B is published with real-repo evidence
3. Replay A/B is published with real-repo evidence
4. each page includes reproducibility commands and artifact paths
5. the benchmark index links all three pages
6. the README / docs home summarize the three claims consistently

A stronger Layer 1 state is reached when:

1. each capability has at least one real-repo public benchmark
2. each capability has at least one additional corroborating benchmark or smoke
3. no public claim depends on hidden internal harness state

---

## Current State Against This Plan

### Already complete

1. Handoff real-repo evidence exists
2. Policy real-repo evidence exists
3. Replay real-repo evidence exists
4. benchmark docs already exist for each capability
5. docs and README now surface these results publicly

### Still missing for a fully explicit Layer 1

1. a dedicated `Layer 1` overview page that unifies handoff, policy, and replay into one matrix
2. a single benchmark narrative that explains why these three capabilities together define Aionis
3. a pass/fail framing that distinguishes Layer 1 from later system-level validation

---

## Deliverables

### Immediate

1. create a dedicated Layer 1 overview page in the public benchmark docs
2. add a three-row public matrix for handoff, policy, and replay
3. link that page from benchmark index and docs landing pages

### Near-term

1. add one additional repo or task family to reduce `click` concentration risk
2. add a public note distinguishing strict replay and guided replay evidence
3. normalize metric names across benchmark pages

### Later layers

1. Layer 2: cross-session and cross-process continuation expansion
2. Layer 3: long-chain, multi-agent, noisier runtime validation

---

## Recommendation

Do not continue publishing handoff, policy, and replay as three unrelated proof threads.

Instead:

1. define them explicitly as `Aionis Layer 1`
2. publish them as the first benchmark layer for product proof
3. treat later, noisier experiments as Layer 2 and Layer 3

This keeps the product message rigorous:

- Layer 1 proves the core Aionis capability surfaces on real tasks.
- Later layers prove that those gains survive messier runtime conditions.

## Bottom Line

Aionis now has enough evidence to support a formal Layer 1 benchmark definition.

The right next move is not inventing a new capability benchmark.
The right next move is consolidating existing real-repo handoff, policy, and replay evidence into one explicit first-layer proof surface.
