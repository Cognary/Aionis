---
title: "Lite Execution-Memory Beta Narrative"
---

# Lite Execution-Memory Beta Narrative

这页用于对外、简洁地解释 `Aionis Lite` 现在到底是什么。

它不是完整 contract，也不是完整 capability matrix。

它更像一份可直接用于发布说明、landing 文案或 demo 开场的简版叙事。

如果你需要按步骤讲的 demo 脚本，可以直接看 [Lite Execution-Memory Demo Walkthrough](/public/zh/getting-started/09-lite-execution-memory-demo-walkthrough)。

## 一句话定位

Aionis Lite 是一个面向 execution memory 的单用户本地运行时。

它已经不只是一个通用 memory API。

它当前真正的产品中心是：

1. 记住稳定工作是怎么做成的
2. 暴露可复用的 workflow guidance
3. 复用经过验证的 tool-selection pattern
4. 只在需要时再展开历史细节

## 两条命名主链

### Anchor-Guided Rehydration Loop

`stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`

它在实际系统里的意思是：

1. 成功且稳定的执行会变成可复用的 workflow memory
2. recall 可以直接命中这些 workflow anchors
3. runtime 可以建议更深的 payload 展开，但不会默认强制展开

### Execution Policy Learning Loop

`feedback -> pattern -> recall -> selector reuse`

它在实际系统里的意思是：

1. tool outcome 会变成受治理的 pattern memory
2. trusted pattern 可以影响未来选择
3. 显式 operator/rule preference 仍然高于历史 pattern preference

## Lite 现在真正不同的地方

Lite 现在已经按 execution-memory-first 的方式组织读取面：

1. `planner_packet.sections.*` 是 canonical collection surface
2. `workflow_signals` 和 `pattern_signals` 暴露紧凑的 maturity / trust state
3. `planning_summary`、`assembly_summary`、`execution_kernel` 暴露紧凑且对齐的 summary

这意味着集成方不需要再从 raw nodes 或 layered context 里自己重建 workflow、pattern、rehydration 语义。

## 推荐的集成模型

对新集成来说，推荐这样读：

1. workflow、pattern、rehydration 的完整集合从 `planner_packet.sections.*` 读取
2. signal state 从 `workflow_signals` 和 `pattern_signals` 读取
3. 紧凑 explanation 从 `planning_summary` 或 `assembly_summary` 读取
4. 紧凑 runtime state 从 `execution_kernel.*_summary` 读取

当前 `v1` 里 top-level packet arrays 仍然存在，但它们更适合作为 convenience mirrors 看待，而不是长期 ownership layer。

## Lite Public Beta 最适合什么

Lite beta 目前最适合：

1. 单个开发者
2. 本地 agent runtime 实验
3. IDE 和 MCP 集成
4. replay/playbook 与 execution-memory 原型验证
5. 不想从 Docker + Postgres 起步的 Aionis 评估

## Lite Public Beta 不是什么

Lite public beta 不是：

1. Server 替代品
2. 多用户治理平面
3. 对完整 Server parity 的承诺
4. 默认生产部署形态

## 最后一行总结

Aionis Lite 是一个本地 execution-memory runtime：它能记住稳定 workflow、复用可信 tool pattern，并且只在真正需要时再展开历史细节。
