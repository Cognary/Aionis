---
title: "构建记忆"
---

# 构建记忆

本页把用户任务映射到 Aionis 的核心记忆 API。

## 添加上下文（Adding Context）

目标：把新的记忆信号写入 Aionis。

1. `POST /v1/memory/write`
2. 会话优先写入：`create session / write event / list session events`
3. 事实来源（SoR）：`commit` + node/edge 血缘链
4. 可选 `distill`：在 write 前把原始文本蒸馏成结构化 `evidence/concept` 节点

建议阅读：

1. [5 分钟上手](/public/zh/getting-started/02-onboarding-5min)
2. [API 合约](/public/zh/api/01-api-contract)

## 组装上下文（Assembling Context）

目标：为 LLM 推理/生成提供可直接消费的上下文。

1. `POST /v1/memory/recall`
2. `POST /v1/memory/recall_text`
3. `POST /v1/memory/planning/context`（召回 + 策略路径）

建议阅读：

1. [API 合约](/public/zh/api/01-api-contract)
2. [Planner 上下文](/public/zh/reference/02-planner-context)

## 自定义上下文（Customizing Context）

目标：在质量、延迟、token 成本之间做可控取舍。

1. Recall 策略与 profile 参数
2. 上下文压缩（`context_token_budget`、`context_char_budget`、profile）
3. 规则感知召回（`rules_context`、`rules_limit`、shadow 可见性）

建议阅读：

1. [API 合约](/public/zh/api/01-api-contract)
2. [Recall Tail Latency Plan](/RECALL_TAIL_LATENCY_PLAN)
3. [Adaptive Compression Plan](/ADAPTIVE_COMPRESSION_PLAN)
4. [Context Orchestrator Plan](/CONTEXT_ORCHESTRATOR_PLAN)

## 图结构操作（Working with Graphs）

目标：直接操作图对象和关系。

1. 通过 URI/id/client_id 执行 `find`
2. 节点 + 边 + 提交（commit）模型
3. 按 tenant/scope 的图访问隔离

建议阅读：

1. [API 合约](/public/zh/api/01-api-contract)
2. [Aionis 一页说明](/public/zh/about/02-aionis-onepage)
