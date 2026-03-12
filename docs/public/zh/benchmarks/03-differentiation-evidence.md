---
title: "差异化证据"
---

# 差异化证据

本页说明如何证明：Aionis 不是“更强一点的检索记忆”，而是更完整的执行记忆产品。

## 真正需要证明什么

如果要把 Aionis 讲成产品，而不是一个架构概念，公开证据至少要证明四件事：

1. 新会话可以继续任务，而不是重新开始
2. 成功执行可以 replay 和复用，而不只是被回忆
3. 运行过程是可审计、可治理的
4. 这种连续性会在真实任务里减少重复 token 成本

## 重要的证据类型

### 1. 连续性证据

最强的公开差异化，不应该先从 synthetic benchmark 开始，而应该先证明：

1. 一个会话把工作写下或交接
2. 另一个会话可以恢复并继续
3. 结果证明系统避免了 rediscovery

这也是为什么 Codex + MCP 这条路径很重要。

### 2. Replay 与复用证据

Aionis 还要证明成功执行会沉淀成：

1. replay run
2. playbook
3. 可治理的复用路径

如果它只能回忆文本，它就还太像 memory plugin。

### 3. 成本下降证据

token 下降重要，但应被解释为“连续性改善带来的结果”：

1. 少重新读
2. 少重新想
3. 少重新解释
4. 少把输出浪费在恢复任务状态上

### 4. 治理证据

Aionis 的另一个差异化，在于这些东西都能留下来：

1. 决策
2. feedback link
3. replay trace
4. review / promotion surface

## 公开阅读顺序

1. [Benchmark 快照（公开版）](/public/zh/benchmarks/02-benchmark-snapshot-public)
2. [性能基线](/public/zh/benchmarks/05-performance-baseline)
3. [策略与执行闭环](/public/zh/policy-execution/00-policy-execution-loop)
4. [Codex Local](/public/zh/integrations/05-codex-local)

## 这对产品叙事意味着什么

如果公开证据能证明：

1. 真实跨会话续做
2. replayable、可治理的执行复用
3. 可量化的成本下降

那 Aionis 就不只是“Agent 记忆系统”。

它是 Agent 的执行记忆。
