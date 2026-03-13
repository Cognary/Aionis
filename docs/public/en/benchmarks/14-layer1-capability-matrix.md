---
title: "Layer 1 Capability Matrix"
---

# Layer 1 Capability Matrix

Last updated: `2026-03-13`

Layer 1 is the controlled public benchmark layer for Aionis.

It answers one question:

**Does Aionis materially improve execution behavior on real tasks relative to a non-Aionis baseline?**

This page is intentionally narrower than system-wide production validation.

It only covers the three capability surfaces that currently define the public Aionis product proof:

1. handoff
2. policy
3. replay

## Scope

Layer 1 uses:

1. fixed repository snapshots
2. fixed task slices
3. explicit non-Aionis baselines
4. reproducible local commands
5. bounded acceptance checks

Current default repository:

1. `pallets/click`
2. commit `cdab890e57a30a9f437b88ce9652f7bfce980c1f`

## Layer 1 Matrix

| Capability | Repo / Task | Baseline | Treatment | Key Result | Source |
| --- | --- | --- | --- | --- | --- |
| Handoff | `pallets/click` real-repo contract continuation | `file_export` | `aionis_handoff` | success `0% -> 100%`; full repo/test scope preserved | [Real GitHub Repo Handoff A/B](/public/en/benchmarks/10-real-repo-handoff-ab) |
| Policy | `pallets/click` real-repo focused tool routing | no policy / broad tools (`grep`, `pytest-all`) | `aionis_policy` (`rg`, `pytest-focused`) | success `0% -> 100%`; tool routing converged to the focused path | [Real GitHub Repo Policy A/B](/public/en/benchmarks/11-real-repo-policy-ab) |
| Replay | `pallets/click` baseline rerun vs compile + replay | rerun from scratch | compile + `replay1` + `replay2` | strict replay stayed `100%` correct and ran at `0` model tokens | [Agent Handoff and Replay](/public/en/benchmarks/07-agent-handoff-and-replay) |

## What Layer 1 Proves

### 1. Handoff

Question:

- Can Aionis preserve an external execution contract better than a weak externalized baseline?

Current answer:

1. yes, on a real public GitHub repository
2. the observed gain is contract completeness, not latency leadership
3. the baseline failed because it lost multi-file and multi-test scope, not because the repository was invalid

### 2. Policy

Question:

- Can Aionis change tool routing in a measurable and useful way on a real repository?

Current answer:

1. yes, on `pallets/click`
2. the policy path converged on `rg` and `pytest-focused`
3. the non-policy path drifted onto broad tools and failed the bounded task

### 3. Replay

Question:

- Can Aionis compile and replay a real workflow while preserving correctness and reducing repeated execution cost?

Current answer:

1. yes, for the documented strict replay path
2. `compile_from_run` uses model tokens
3. `strict/local_process replay1` and `replay2` consumed `0` model tokens in the published setup
4. guided replay is a separate repair path and is not zero-token

## What Layer 1 Does Not Prove

Layer 1 does **not** claim:

1. global superiority over framework-native in-memory state inside a single runtime
2. optimal behavior for every agent runtime, provider, or hardware profile
3. production-grade long-horizon reliability under all operating conditions
4. that every Aionis optimization layer is already a public positive result

## Why This Matters

Layer 1 is the minimum benchmark-grade product proof for Aionis.

It shows that:

1. handoff changes continuation outcomes,
2. policy changes real tool routing,
3. replay changes repeated execution cost,
4. these claims are grounded in real tasks, not only internal smoke tests.

## Read Next

1. [Aionis Evidence Overview](/public/en/benchmarks/13-aionis-evidence-overview)
2. [Agent Handoff and Replay](/public/en/benchmarks/07-agent-handoff-and-replay)
3. [Real GitHub Repo Handoff A/B](/public/en/benchmarks/10-real-repo-handoff-ab)
4. [Real GitHub Repo Policy A/B](/public/en/benchmarks/11-real-repo-policy-ab)
5. [L5 Serving-Side Compaction](/public/en/benchmarks/12-l5-serving-compaction)
