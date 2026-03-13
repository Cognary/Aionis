---
title: "基准测试"
---

# 基准测试

这一节是 Aionis 的公开证据层。

如果你想看的不是产品叙事，而是“凭什么这么说”，先从这里开始。

## 这组页面要证明什么

基准测试这一节主要回答 4 个问题：

1. Aionis 的延迟和失败率是否可预测
2. policy loop 是否真的带来可测的行为变化
3. context optimization 是否真的体现出成本感知行为
4. 团队是否可以自己复现实验，而不是只能相信文案

## 优先看这几页

1. [Benchmark 快照（公开版）](/public/zh/benchmarks/02-benchmark-snapshot-public)
2. [性能基线](/public/zh/benchmarks/05-performance-baseline)
3. [差异化证据](/public/zh/benchmarks/03-differentiation-evidence)
4. [AionisBench v0.1](/public/zh/benchmarks/06-aionis-bench-v01)
5. [Agent Handoff 与 Replay](/public/zh/benchmarks/07-agent-handoff-and-replay)
6. [Task Handoff 与 Recover 语义](/public/zh/benchmarks/08-task-handoff-and-recover)
7. [Policy 工具选择与反馈闭环](/public/zh/benchmarks/09-policy-tool-selection)
8. [真实 GitHub 仓库 Handoff A/B](/public/zh/benchmarks/10-real-repo-handoff-ab)
9. [治理周报](/public/zh/benchmarks/04-governance-weekly-report)

## 证据维度

1. 性能：已记录 profile 下的延迟和错误率
2. 可靠性：可复现实验与稳定输出
3. 可控性：policy loop 的可观测性和决策可追踪性
4. 可运维性：适合生产 gate 的证据包
5. 成本感知：context 和 replay 优化行为是否可测

## 可复现性

每一页 benchmark 都应该至少给出：

1. 范围说明
2. 环境参数
3. 可执行命令
4. artifact 路径
5. 结果解读方式

## 建议阅读顺序

1. 先看 [Benchmark 快照（公开版）](/public/zh/benchmarks/02-benchmark-snapshot-public)
2. 再看 [性能基线](/public/zh/benchmarks/05-performance-baseline)，了解怎么在本地复现
3. 最后看 [差异化证据](/public/zh/benchmarks/03-differentiation-evidence)，理解这些数据到底在证明什么
4. 再看 [Task Handoff 与 Recover 语义](/public/zh/benchmarks/08-task-handoff-and-recover)，理解非文件中心 handoff 的边界

## 下一步

1. [差异化证据](/public/zh/benchmarks/03-differentiation-evidence)
2. [性能基线](/public/zh/benchmarks/05-performance-baseline)
3. [Agent Handoff 与 Replay](/public/zh/benchmarks/07-agent-handoff-and-replay)
4. [Task Handoff 与 Recover 语义](/public/zh/benchmarks/08-task-handoff-and-recover)
5. [Policy 工具选择与反馈闭环](/public/zh/benchmarks/09-policy-tool-selection)
6. [真实 GitHub 仓库 Handoff A/B](/public/zh/benchmarks/10-real-repo-handoff-ab)
7. [运维与生产](/public/zh/operate-production/00-operate-production)
