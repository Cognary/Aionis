---
title: "核心概念"
---

# 核心概念

这一节解释 Aionis 的运行时模型，前提是你已经知道自己要走哪条产品路径。

如果你还需要先看产品定位，先读：

1. [总览](/public/zh/overview/01-overview)
2. [快速开始](/public/zh/getting-started/01-get-started)
3. [选择 Lite 还是 Server](/public/zh/getting-started/07-choose-lite-vs-server)

## 心智模型

Aionis 的运行时行为可以通过四个概念来理解：

1. 可验证记忆状态。
2. 异步派生处理。
3. 租户/作用域隔离。
4. 决策级执行溯源。

```mermaid
flowchart TD
  A["可验证记忆图"] --> B["派生产物"]
  A --> C["租户与作用域隔离"]
  A --> D["决策与运行模型"]
  B --> E["上下文编排"]
  C --> E
  D --> F["策略与执行闭环"]
  E --> F
```

## 推荐阅读顺序

1. [可验证记忆图](/public/zh/core-concepts/01-verifiable-memory-graph)
2. [派生产物](/public/zh/core-concepts/02-derived-artifacts)
3. [租户与作用域隔离](/public/zh/core-concepts/03-scope-and-tenant)
4. [决策与运行模型](/public/zh/core-concepts/04-decision-and-run-model)

这四个概念解释了为什么 Aionis 能：

1. 在跨会话场景下保留项目记忆
2. 装配有预算约束的 planner 上下文
3. 把 decision 和 run 当成一等对象追踪
4. 在后续恢复或 replay 执行

## 关键术语

1. `commit`：不可变写入锚点。
2. `decision`：与执行关联的策略决策。
3. `run`：一次多步执行链。
4. `scope`：租户内逻辑分区。
5. `context layer`：拼装上下文中的类型化层。

## 下一步

1. [架构](/public/zh/architecture/01-architecture)
2. [上下文编排](/public/zh/context-orchestration/00-context-orchestration)
3. [策略与执行闭环](/public/zh/policy-execution/00-policy-execution-loop)
