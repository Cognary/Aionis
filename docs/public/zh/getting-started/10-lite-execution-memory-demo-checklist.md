---
title: "Lite Execution-Memory Demo Checklist"
---

# Lite Execution-Memory Demo Checklist

这页用于演示前最后快速过一遍。

它是 execution-memory walkthrough 的最短 checklist 版本。

## Demo 目标

确保听众最后记住这三点：

1. Lite 会把稳定工作变成可复用 workflow memory
2. Lite 会从 feedback 里学会可复用的 tool pattern
3. Lite 会直接暴露紧凑的 execution-memory state

## 推荐的 Route 顺序

建议按这个顺序展示：

1. `POST /v1/memory/planning/context`
2. `POST /v1/memory/context/assemble`
3. `POST /v1/memory/tools/select`
4. `POST /v1/memory/tools/feedback`
5. `POST /v1/memory/execution/introspect`
6. 如有需要，再补 `POST /v1/memory/tools/rehydrate_payload`

## 推荐的字段顺序

如果你只展示少量字段，建议按这个顺序：

1. `planner_packet.sections.*`
2. `workflow_signals`
3. `pattern_signals`
4. `planning_summary.planner_explanation`
5. `execution_kernel.*_summary`

## Demo 顺序

### 1. 先讲定位

可以直接说：

`Lite 是一个本地 execution-memory runtime，不只是通用 memory API。`

### 2. 展示 Workflow Memory

展示：

1. `planner_packet.sections.recommended_workflows`
2. `workflow_signals`

可以直接说：

`稳定执行会变成可复用的 workflow guidance。`

### 3. 展示 Optional Rehydration

展示：

1. `planner_packet.sections.rehydration_candidates`
2. 如有需要，再演示 `rehydrate_payload`

可以直接说：

`Lite 先给 anchor，真正需要时再展开 payload 细节。`

### 4. 展示 Policy Learning

展示：

1. `planner_packet.sections.trusted_patterns`
2. `planner_packet.sections.candidate_patterns` 或 `planner_packet.sections.contested_patterns`
3. `selection_summary.provenance_explanation`

可以直接说：

`Lite 会学习哪些 tool pattern 值得信。`

### 5. 展示 Compact Runtime State

展示：

1. `planning_summary`
2. `execution_kernel.*_summary`
3. 如有需要，再补 `/v1/memory/execution/introspect`

可以直接说：

`runtime 已经直接暴露紧凑的 execution-memory state。`

## 不要把 Demo 中心放在

避免把演示中心放在：

1. 把 `layered_context` 讲得像默认 planner/context 响应的一部分
2. raw node dump
3. 把遗留 packet mirrors 或 layered-context 内部结构当成长期 ownership layer 来讲

## 收尾一句话

最后可以直接用这句：

`Aionis Lite 会把稳定工作变成可复用 workflow memory，从反馈里学会可信 tool pattern，并且只在 runtime 真正需要时再展开历史细节。`
