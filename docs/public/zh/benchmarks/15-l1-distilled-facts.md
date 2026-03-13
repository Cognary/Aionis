---
title: "L1 Distilled Facts"
---

# L1 Distilled Facts

最后更新：`2026-03-13`

这页记录的是 `L1 distilled facts` 的第一版公开 benchmark 结果。

`L1` 是原始 memory event/evidence 之上的第一层压缩层。

问题很窄：

**`L1` 能不能在不丢 benchmark facts 的前提下，降低 planning 阶段的上下文负担？**

## 范围说明

这页比较的是：

1. `L0-only`
2. `L0 + L1`

覆盖的读取主线：

1. `/v1/memory/recall_text`
2. `/v1/memory/planning/context`
3. `/v1/memory/context/assemble`

语料：

1. code-style corpus
2. research-style corpus

## 公开结论

### `L1` 现在已经是公开正向结果

#### Code corpus

| Arm | Avg fact recall rate | Avg planning/context est tokens |
| --- | --- | --- |
| `L0-only` | `1.0` | `100.0` |
| `L0 + L1` | `1.0` | `45.333333` |

解释：

1. fact recall 持平
2. `planning/context` 估计 token 下降约 `54.7%`

#### Research corpus

| Arm | Avg fact recall rate | Avg planning/context est tokens |
| --- | --- | --- |
| `L0-only` | `0.555556` | `66.0` |
| `L0 + L1` | `0.555556` | `34.666667` |

解释：

1. fact recall 持平
2. `planning/context` 估计 token 下降约 `47.5%`

## 这页证明了什么

这页证明：

1. `L1` 相比纯 `L0` 原始事件检索，能够降低 planning 阶段的上下文负担
2. 当前 benchmark facts 可以在这个过程中被保住
3. Aionis 的第一层压缩已经有公开 benchmark 结果，不再只是内部假设

## 这页不证明什么

这页 **不**主张：

1. `L1` 一定会降低 `context_assemble` 的最终 payload
2. `L1` 能解决所有长上下文问题
3. `L2-L5` 会自动和 `L1` 一样是正收益

## 复现

Code corpus：

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:l1-distilled-facts-benchmark -- \
  --base-url http://127.0.0.1:3321 \
  --fixture-file /Users/lucio/Desktop/Aionis/src/jobs/fixtures/l1-distilled-facts-click-v1.json
```

Research corpus：

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:l1-distilled-facts-benchmark -- \
  --base-url http://127.0.0.1:3321 \
  --fixture-file /Users/lucio/Desktop/Aionis/src/jobs/fixtures/l1-distilled-facts-research-v1.json
```

## Artifact 路径

1. code corpus：
   `/Users/lucio/Desktop/Aionis/artifacts/benchmarks/l1-distilled-facts/20260313-205335/`
2. research corpus：
   `/Users/lucio/Desktop/Aionis/artifacts/benchmarks/l1-distilled-facts/20260313-205549/`

## 为什么这页重要

如果 `L1` 本身都不可靠，后面的压缩层就没有可信基础。

这页现在给出的就是第一条公开证据：

**Aionis 在第一层压缩上，已经能够让 planning context 更轻，同时不丢当前 benchmark 使用的事实。**

## 相关页面

1. [Aionis 证据总览](/public/zh/benchmarks/13-aionis-evidence-overview)
2. [Layer 1 能力矩阵](/public/zh/benchmarks/14-layer1-capability-matrix)
3. [L5 Serving-Side Compaction](/public/zh/benchmarks/12-l5-serving-compaction)
