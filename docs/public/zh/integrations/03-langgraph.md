---
title: "LangGraph 集成"
---

# LangGraph 集成

Aionis 可作为 LangGraph 风格 Agent 流程中的记忆与策略基础设施。

## 推荐流程映射

1. 规划前：`recall_text` 或 `context/assemble`
2. 规划阶段：`rules/evaluate` 与 `tools/select`
3. 执行后：`write` 与 `tools/feedback`
4. 审计定位：通过 `decision_uri` 或 `commit_uri` 做 `resolve`

## 运行要求

1. LangGraph 运行环境可访问 Aionis API。
2. 鉴权凭据与当前 auth 模式一致。
3. 在编排节点内接入 SDK 或 HTTP 客户端。

## Smoke Test

```bash
set -a; source .env; set +a
bash examples/langgraph_adapter_smoke.sh
```

## 成功标准

1. 多步流程具备稳定的 `request_id` 关联。
2. 决策步骤可产出 `run_id` 与 `decision_id`。
3. 执行后写入可返回可解析的 `commit_uri`。

## 相关页面

1. [API 契约](/public/zh/api/01-api-contract)
2. [SDK 指南](/public/zh/reference/05-sdk)
3. [策略与执行闭环](/public/zh/policy-execution/00-policy-execution-loop)
