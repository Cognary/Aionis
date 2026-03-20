---
title: "Lite Execution-Memory Demo Walkthrough"
---

# Lite Execution-Memory Demo Walkthrough

这页用于在演示时快速说明 `Aionis Lite` 作为 execution-memory runtime 现在到底能展示什么。

它不是完整技术 contract。

它更像一份推荐的 demo 讲法。

如果你只需要演示前最后扫一眼的最短 checklist，直接看 [Lite Execution-Memory Demo Checklist](/public/zh/getting-started/10-lite-execution-memory-demo-checklist)。

## Demo 目标

一轮演示里最好把 3 件事讲清楚：

1. 稳定执行会变成可复用的 workflow memory
2. tool outcome 会变成可复用的 policy memory
3. runtime 已经直接暴露紧凑状态，而不是要求操作者自己重建

## Demo 故事线

最顺的故事线是：

1. 先跑一次或复用一次稳定执行
2. 展示 Lite 命中了 workflow anchor
3. 展示 Lite 可以按需建议 rehydration
4. 展示 tool feedback 会生成或强化 pattern
5. 展示后续 selector 会复用 trusted pattern

## 推荐的演示顺序

### Step 1. 先讲起点

先讲：

1. Lite 是本地 execution-memory runtime
2. 它不是单纯存 raw text 或 generic notes
3. 它的目标是记住稳定工作怎么做成

适合的一句话：

`Lite 记住的是可复用的执行结构，不只是零散 memory entry。`

### Step 2. 展示 Workflow Memory

展示：

1. 一个稳定的 replay 或 playbook 结果
2. `planning_context` 或 `context_assemble`
3. `planner_packet.sections.recommended_workflows`
4. `workflow_signals`

解释：

1. 稳定执行已经变成 workflow memory
2. runtime 可以直接把这个 workflow 暴露出来
3. workflow 的成熟度不需要再从原始 context 里自己推断

适合的一句话：

`稳定执行不再只是历史记录，而是变成了可复用的 workflow guidance。`

### Step 3. 展示 Optional Rehydration

展示：

1. 一个被召回的 workflow anchor
2. `planner_packet.sections.rehydration_candidates`
3. runtime hint 说明需要时才打开更深的 payload

解释：

1. Lite 不会默认把全部历史细节都展开
2. 它会先给你 compact anchor
3. 只有 runtime 真需要时，才会继续 rehydrate 细节

适合的一句话：

`Lite 先给 anchor，真正需要时再展开 payload。`

### Step 4. 展示 Policy Learning

展示：

1. 一条 tool feedback 路径
2. `planner_packet.sections.trusted_patterns`、`planner_packet.sections.candidate_patterns` 或 `planner_packet.sections.contested_patterns`
3. `pattern_signals`
4. `selection_summary.provenance_explanation`

解释：

1. tool outcome 不会被当成一次性事件
2. 重复成功的选择会变成 trusted pattern memory
3. 有争议或不稳定的 pattern 会保留可见，但不会被盲目复用

适合的一句话：

`Lite 不只是记住发生过什么，它还会学习哪些 tool pattern 值得信。`

### Step 5. 展示 Compact Runtime State

展示：

1. `planning_summary`
2. `execution_kernel.*_summary`
3. 如有需要，再展示 `POST /v1/memory/execution/introspect`

解释：

1. runtime 已经直接给出紧凑且对齐的 summary
2. operator 和 integrator 不需要再从 raw nodes 里自己重建状态
3. execution-memory 这条面已经足够产品化，可以直接观察

适合的一句话：

`runtime 已经直接暴露紧凑的 execution-memory state，而不是要求你自己重建。`

## 推荐展示的 Routes

最短且够强的一条 demo 路径通常只需要：

1. `POST /v1/memory/planning/context`
2. `POST /v1/memory/context/assemble`
3. `POST /v1/memory/tools/select`
4. `POST /v1/memory/tools/feedback`
5. `POST /v1/memory/execution/introspect`
6. 如有需要，再补 `POST /v1/memory/tools/rehydrate_payload`

## 演示时推荐的读取顺序

如果你只展示少量字段，推荐按这个顺序：

1. `planner_packet.sections.*`
2. `workflow_signals`
3. `pattern_signals`
4. `planning_summary.planner_explanation`
5. `execution_kernel.*_summary`

这是最干净的一条路径，因为它和当前 canonical 以及推荐集成模型是一致的。

## Demo 不建议围绕什么讲

不建议把演示中心放在：

1. `layered_context`，或者把它讲得像默认响应字段一样
2. raw node dump
3. 把遗留 packet mirrors 或 layered-context 内部结构当成长期 ownership layer 来讲

原因：

1. 这些面更噪
2. 会把 execution-memory 产品形态讲得不清楚
3. 会让 Lite 看起来更像 generic memory，而不是 execution-memory runtime
4. `layered_context` 现在属于显式 debug/operator 输出，不属于默认 slim planner/context 面

## 收尾一句话

如果你需要一句话作为 demo 结尾：

`Aionis Lite 是一个本地 execution-memory runtime：它会把稳定工作变成可复用 workflow memory，从反馈里学会可信 tool pattern，并且只在真正需要时再展开历史细节。`
