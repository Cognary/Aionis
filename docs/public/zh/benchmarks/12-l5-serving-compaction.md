---
title: "L5 Serving-Side Compaction"
---

# L5 Serving-Side Compaction

最后更新：`2026-03-13`

这页披露的是 `L5` 的第一版公开 exploratory 结果。`L5` 指的是 serving-side compaction，不是新的存储派生层。

它改变的是：在 memory graph 已经选定之后，runtime 最终把什么样的上下文真正送给模型。

## 范围说明

这页覆盖的是：

1. 同一份已存储的 `L0 + L1 + L2 + L3` memory graph
2. 同一组 query 和 budget
3. 两种 serving policy：
   - `balanced_serving`
   - `aggressive_serving`

这页**不主张** `L5` 现在已经降低了 `context_est_tokens`。

## 当前可公开主张

### L5 当前可以在不丢 benchmark facts 的前提下压缩最终 served payload

语料：

1. `click` code-style corpus
2. `research` comparison corpus

| Corpus | Arm | Avg fact recall rate | Avg context est tokens | Avg context chars |
| --- | --- | --- | --- | --- |
| `click` | `balanced_serving` | `1.0` | `37.333333` | `902.666667` |
| `click` | `aggressive_serving` | `1.0` | `37.333333` | `454.0` |
| `research` | `balanced_serving` | `1.0` | `50.666667` | `955.333333` |
| `research` | `aggressive_serving` | `1.0` | `50.666667` | `506.666667` |

主要收益出现在 `context_assemble`：

| Corpus | Arm | `context_assemble` chars |
| --- | --- | --- |
| `click` | `balanced_serving` | `2260` |
| `click` | `aggressive_serving` | `914` |
| `research` | `balanced_serving` | `2260` |
| `research` | `aggressive_serving` | `914` |

解读：

1. `L5` 现在已经是可测的 serving-path 差异，不再只是设计概念。
2. 在当前 fixture 上，`aggressive` 没有丢掉 benchmark facts。
3. 当前可测收益是最终 served payload 更短，而不是 `context_est_tokens` 更低。

所以现在最准确的产品表述是：

> `L5` 当前是一个 served-payload reduction layer，还不是已证明的 token-estimate reduction layer。

## 如何复现

前置条件：

1. 本地 Aionis Lite endpoint 可通过 `http://127.0.0.1:3321` 访问
2. Node.js `22+`
3. 本仓库已包含 benchmark harness

运行 `click` 语料：

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:l5-serving-compaction-benchmark -- \
  --base-url http://127.0.0.1:3321 \
  --fixture-file /Users/lucio/Desktop/Aionis/src/jobs/fixtures/l5-serving-compaction-click-v1.json
```

运行 `research` 语料：

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:l5-serving-compaction-benchmark -- \
  --base-url http://127.0.0.1:3321 \
  --fixture-file /Users/lucio/Desktop/Aionis/src/jobs/fixtures/l5-serving-compaction-research-v1.json
```

## Artifact 路径

1. `click`：
   `/Users/lucio/Desktop/Aionis/artifacts/benchmarks/l5-serving-compaction/20260313-213543-click-v1/`
2. `research`：
   `/Users/lucio/Desktop/Aionis/artifacts/benchmarks/l5-serving-compaction/20260313-213543-research-v1/`

## 不该过度主张的内容

1. 这还不能证明 `L5` 已经降低了 `context_est_tokens`
2. 这还不能证明 `L5` 超过了“保住 benchmark facts”之外的 answer quality
3. 这也不是 provider 账单 token 下降的证据

## 相关页面

1. [Agent Handoff 与 Replay](/public/zh/benchmarks/07-agent-handoff-and-replay)
2. [真实 GitHub 仓库 Handoff A/B](/public/zh/benchmarks/10-real-repo-handoff-ab)
3. [真实 GitHub 仓库 Policy A/B](/public/zh/benchmarks/11-real-repo-policy-ab)
