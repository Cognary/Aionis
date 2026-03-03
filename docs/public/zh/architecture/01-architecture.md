---
title: "架构"
---

# 架构

Aionis 架构围绕三点设计：可靠性、可回放、可控执行。

## 系统组件

| 组件 | 作用 |
| --- | --- |
| API 服务 | 提供 memory/context/policy/resolve 路由 |
| Memory Store | 持久化图对象与提交链路 |
| 派生 Worker | 异步执行 embedding/topic/compression |
| 控制任务 | 一致性、质量、发布门禁检查 |
| 运维工具 | 监控、回放、门禁操作 |

## 请求路径

### 写入路径

1. 请求进入 `POST /v1/memory/write`。
2. 节点/边写入并关联 commit。
3. 响应返回 `commit_id`、`commit_uri`。
4. 如启用派生能力，异步任务进入队列。

### 召回与上下文路径

1. 召回阶段先找候选记忆。
2. 排序与图扩展得到有限候选集合。
3. `context/assemble` 在预算内做分层拼装。
4. 返回可追踪的对象引用。

### 策略路径

1. 运行态上下文进入 `rules/evaluate`。
2. `tools/select` 应用策略约束。
3. `tools/decision` 持久化决策。
4. `tools/feedback` 写入结果反馈。

## 控制点

1. 隔离：`tenant/scope` 与可见性边界。
2. 预算：分层预算与条目上限。
3. 可靠性：门禁与一致性检查。
4. 回放：基于 URI 的 `resolve` 工作流。

## 部署形态

1. Standalone：本地开发与冒烟。
2. Service：生产基线。
3. HA：多副本高可用与韧性演练。

## 从这里开始

1. [构建记忆工作流](/public/zh/guides/01-build-memory)
2. [上下文编排](/public/zh/context-orchestration/00-context-orchestration)
3. [策略与执行闭环](/public/zh/policy-execution/00-policy-execution-loop)

## 下一步

1. [运维与生产](/public/zh/operate-production/00-operate-production)
2. [架构深度说明（补充）](/public/zh/concepts/02-architecture)
