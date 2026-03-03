---
title: "决策与运行模型"
---

# 决策与运行模型

Aionis 通过类型化执行标识，使策略行为可审计、可回放。

## 核心标识

| ID | 含义 | 典型来源 |
| --- | --- | --- |
| `request_id` | 单次 API 请求关联 ID | 所有接口响应 |
| `run_id` | 一次多步执行链 ID | planner/runtime 调用侧 |
| `decision_id` | 单次策略/工具决策记录 ID | 决策接口 |
| `commit_id` | 一次记忆写入锚点 ID | 写入接口 |

## 溯源链

```mermaid
flowchart LR
  A["request_id"] --> B["run_id"]
  B --> C["decision_id"]
  C --> D["commit_uri"]
  D --> E["resolve + replay"]
```

## 价值

1. 回放：用同一上下文锚点重跑关键路径。
2. 治理：证明某次决策受哪些策略影响。
3. 运维：提升故障定位效率。
4. 合规：保留可追溯决策链路。

## 落地建议

1. 把 `request_id/run_id/decision_id/commit_uri` 作为必存观测字段。
2. 业务日志与监控管道同时持久化这些 ID。
3. 在运维面板中暴露这些 ID 以便快速钻取。
4. 事故分析优先用 `resolve`，避免直接查库拼链路。

## 就绪检查

1. 能否从用户问题定位到准确 `decision_id`？
2. 能否一键解析关联 commit 与记忆对象？
3. 能否对比同场景新旧 run 的输出差异？

## 相关页面

1. [策略与执行闭环](/public/zh/policy-execution/00-policy-execution-loop)
2. [URI 对象覆盖](/public/zh/reference/07-uri-expansion-plan)
3. [API 参考](/public/zh/api-reference/00-api-reference)
