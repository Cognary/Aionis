---
title: "Aionis ANN Stage1 Profile Compare"
---

# Aionis ANN Stage1 Profile Compare

Date: `2026-03-11`  
Status: `wave_a_completed`

Related artifacts:

1. [/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_a_20260311_133648](/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_a_20260311_133648)
2. [/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_a_v2_20260311_134249](/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_a_v2_20260311_134249)
3. [/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_a_v3_20260311_134547](/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_a_v3_20260311_134547)
4. [/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_b_v1_20260311_134805](/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_b_v1_20260311_134805)
5. [/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_b_v2_20260311_135449](/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_b_v2_20260311_135449)

## Scope

This run isolates `recall_text` stage-1 ANN behavior on the existing seeded workload:

1. base URL: `http://localhost:3021`
2. scope: `perf_cost_wave_a`
3. tenant: `default`
4. query set:
   - `memory graph perf`
   - `prepare production deploy context`
5. samples per query per profile: `8`
6. compared profiles:
   - `legacy`
   - `strict_edges`
   - `quality_first`
   - `lite`

## Source Files

1. [/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_b_v2_20260311_135449/benchmark_10000.json](/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_b_v2_20260311_135449/benchmark_10000.json)
2. [/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_b_v2_20260311_135449/PERFORMANCE_REPORT_V1.md](/Users/lucio/Desktop/Aionis/artifacts/perf/ann_stage1_wave_b_v2_20260311_135449/PERFORMANCE_REPORT_V1.md)

## Key Results

### Aggregate View

The first aggregate-only run was directionally useful for stage timing, but it underreported seed counts because the ANN benchmark did not request `return_debug`.

That issue was fixed in the `v2` and `v3` artifacts.

The wider `wave_b_v1` run removed the earlier `429` distortion by using a lower recall concurrency and a paced sweep.

| Profile | Recall p95 | Stage1 ANN p95 | ANN seeds p95 | Result nodes mean |
|---|---:|---:|---:|---:|
| `legacy` | `533.48ms` | `159.90ms` | `30` | `50` |
| `strict_edges` | `486.71ms` | `121.21ms` | `24` | `60` |
| `quality_first` | `527.31ms` | `168.74ms` | `30` | `80` |
| `lite` | `465.77ms` | `108.10ms` | `12` | `24` |

The more extreme `wave_b_v2` run expanded the query set toward denser-edge and sparser-hit shapes. Its aggregate view shifted again:

| Profile | Recall p95 | Stage1 ANN p95 | ANN seeds p95 | Result nodes mean |
|---|---:|---:|---:|---:|
| `legacy` | `492.25ms` | `190.49ms` | `30` | `50` |
| `strict_edges` | `590.19ms` | `310.12ms` | `24` | `60` |
| `quality_first` | `510.20ms` | `198.08ms` | `30` | `80` |
| `lite` | `582.81ms` | `361.54ms` | `12` | `24` |

### Per-Query View (`v3`)

#### Query: `memory graph perf`

| Profile | Recall p95 | Stage1 ANN p95 | ANN seeds p95 | Result nodes mean |
|---|---:|---:|---:|---:|
| `legacy` | `698.82ms` | `304.06ms` | `30` | `50` |
| `strict_edges` | `648.47ms` | `277.75ms` | `24` | `60` |
| `quality_first` | `563.12ms` | `244.88ms` | `30` | `80` |
| `lite` | `1245.59ms` | `918.22ms` | `12` | `24` |

#### Query: `prepare production deploy context`

| Profile | Recall p95 | Stage1 ANN p95 | ANN seeds p95 | Result nodes mean |
|---|---:|---:|---:|---:|
| `legacy` | `533.83ms` | `130.70ms` | `30` | `50` |
| `strict_edges` | `656.53ms` | `223.15ms` | `24` | `60` |
| `quality_first` | `610.44ms` | `209.87ms` | `30` | `80` |
| `lite` | `617.60ms` | `234.13ms` | `12` | `24` |

## Interpretation

1. Seed-count observability is now confirmed working in the corrected ANN artifacts.
2. The clean `wave_b_v1` run shows that raw ANN latency can favor `lite`, but only by shrinking result breadth substantially.
3. `strict_edges` now looks like the strongest balanced candidate when both ANN p95 and result breadth are considered together.
4. `quality_first` still offers the broadest retrieval surface, but it does so with a higher ANN cost than `strict_edges` on the wider query set.
5. There is still no universal winner across all individual queries, so query-sensitive evaluation remains necessary.
6. The denser/sparser `wave_b_v2` run weakens the case for promoting `strict_edges` prematurely; it performed worst on aggregate ANN p95 in that slice.
7. `quality_first` handled one dense-edge and one sparse query best, `legacy` won two broader semantic/sparse queries, `lite` won three narrower queries, and `strict_edges` won one edge-heavy workflow query.
8. The practical conclusion is no longer "pick the best profile", but "separate floor profile, breadth profile, and balanced profile candidates, then measure against workload mix."

## Caveats

1. `wave_b_v1` removes the earlier `429` caveat, but the later `wave_b_v2` slice still saw a single `429` on `strict_edges`.
2. `lite` winning on raw ANN p95 should not be over-read as a default recommendation, because its recall breadth is much smaller.
3. `strict_edges` looking good in one wider slice should not be over-read either; the next extreme-query slice moved the aggregate ranking against it.
4. Current evidence is good enough to compare stage behavior by query and by breadth-latency tradeoff, but not yet good enough to lock a universal default profile.

## Recommended Next Step

1. keep per-query reporting enabled for every future ANN artifact
2. keep `lite` as the raw-latency floor reference, not the default recommendation
3. keep `quality_first` as the broad-recall reference
4. do not promote `strict_edges` to default yet; treat it as one candidate in the balanced bucket
5. the next ANN wave should explicitly classify queries into:
   - sparse-hit
   - broad semantic
   - dense-edge
   - workflow path
6. only after that classification should any recall default change be proposed
