---
title: "核心差异化"
---

# 核心差异化

本页总结 Aionis 面向外部用户的核心差异化能力。

## 1) Memory -> Policy -> Action -> Replay

Aionis 把记忆召回与执行策略联通：

1. `rules/evaluate`
2. `tools/select`
3. `tools/decision`
4. `tools/run`
5. `tools/feedback`

## 2) 闭环学习与防护机制

Aionis 支持把回放修复转成可治理学习结果：

1. `replay/playbooks/repair/review` + `learning_projection`
2. 输出规则/情景记忆并作用于后续运行

Edge Cases 防护：

1. `overlapping_rules_detected`
2. `duplicate_rule_fingerprint_skipped`
3. `episode_gc_policy_attached`
4. Outbox `retryable/fatal` 错误分类隔离

## 3) 可验证且可回放的决策链

执行链路可通过以下字段追踪：

1. `request_id`
2. `run_id`
3. `decision_id`
4. `commit_uri`

## 4) 写入稳定，派生异步

写入在 embedding/topic 等派生任务异步运行时仍保持稳定，不被阻塞。

## 5) 可治理的策略演化

策略变更受 lifecycle 与 gate 约束，不以黑盒方式漂移。

## 6) 生产运维能力内建

Aionis 把 runbook、发布门禁、运维流程作为一等产品能力提供。

## 证据与延伸

1. [差异化证据](/public/zh/benchmarks/03-differentiation-evidence)
2. [公开 Benchmark 快照](/public/zh/benchmarks/02-benchmark-snapshot-public)
3. [Production Core Gate](/public/zh/operations/03-production-core-gate)
4. [英文完整版](../../en/about/01-core-differentiators.md)
