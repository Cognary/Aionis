# Aionis Kernel Architecture Spec

## 状态

- 状态：Draft for adoption
- 适用范围：当前主仓库运行时实现
- 文档类型：工程边界规范

---

## 1. 目标

本规范用于正式收束 Aionis 当前已经存在的能力边界，回答以下工程问题：

1. 什么属于 Aionis Kernel。
2. 什么属于 Runtime Services。
3. 什么属于 Control / Extension Layer。
4. 各层之间允许什么依赖方向。
5. 哪些 API 和对象属于长期承诺，哪些只是当前实现细节。

这份文档不是市场叙事稿，也不是重构计划书。  
它的目标是给后续模块拆分、测试分层、发布边界和未来演进一个稳定锚点。

---

## 2. 规范结论

从当前仓库实现出发，Aionis 应正式定义为三层结构：

1. `Kernel`
2. `Runtime Services`
3. `Control & Extensions`

对应一句话定义：

> Aionis is a memory-centered runtime kernel for agents, surrounded by runtime services and governed extension surfaces.

中文对应：

> Aionis 是一个以 execution memory 为中心的 Agent 运行时内核，外侧由运行时服务层和治理扩展层包裹。

---

## 3. 分层定义

## 3.1 Kernel

Kernel 是 Aionis 的最小产品真相层。

它负责：

- 执行记忆建模
- 记忆写入与召回
- 上下文构造与预算压缩
- replay 记录、编译、复用
- 规则/工具策略闭环
- repair / review / replay learning 核心生命周期

Kernel 不负责：

- Ops 面板
- 通知通道
- 外部控制台
- 广义工作流产品界面
- 任意业务集成适配层

Kernel 的设计中心不是“流程编排”，而是：

- run
- step
- event
- evidence
- decision
- rule
- playbook
- context

这些对象构成 Aionis 的长期核心语义。

### 当前对应模块

- [src/memory/write.ts](../src/memory/write.ts)
- [src/memory/recall.ts](../src/memory/recall.ts)
- [src/memory/context.ts](../src/memory/context.ts)
- [src/memory/context-orchestrator.ts](../src/memory/context-orchestrator.ts)
- [src/memory/replay.ts](../src/memory/replay.ts)
- [src/memory/replay-learning.ts](../src/memory/replay-learning.ts)
- [src/memory/rules-evaluate.ts](../src/memory/rules-evaluate.ts)
- [src/memory/tools-select.ts](../src/memory/tools-select.ts)
- [src/memory/tools-decision.ts](../src/memory/tools-decision.ts)
- [src/memory/tools-run.ts](../src/memory/tools-run.ts)
- [src/memory/feedback.js](../src/memory/feedback.js)
- [src/memory/rules.js](../src/memory/rules.js)
- [src/memory/tools-feedback.js](../src/memory/tools-feedback.js)

## 3.2 Runtime Services

Runtime Services 是内核的宿主层。

它负责：

- 环境与配置装配
- store / db / embedder / executor 装配
- auth / quota / rate limit / inflight guard
- sandbox budget / budget resolver
- observability / telemetry bridge
- feature capability guard
- route registration host

Runtime Services 的职责是：

- 让 Kernel 可运行
- 让 Kernel 在多环境中可部署
- 让 Kernel 的行为被约束、被观测、被限流

Runtime Services 不应该承担：

- 业务语义本体
- 核心记忆对象定义
- replay 语义定义
- rule / tool / playbook 语义定义

### 当前对应模块

- [src/app/runtime-services.ts](../src/app/runtime-services.ts)
- [src/app/request-guards.ts](../src/app/request-guards.ts)
- [src/app/sandbox-budget.ts](../src/app/sandbox-budget.ts)
- [src/app/recall-policy.ts](../src/app/recall-policy.ts)
- [src/app/recall-observability.ts](../src/app/recall-observability.ts)
- [src/index.ts](../src/index.ts)

## 3.3 Control & Extensions

Control & Extensions 是建立在 Kernel 之上的治理和扩展面。

它负责：

- admin control
- alerts / delivery / incident publish
- automation orchestration
- ops-facing 管理入口
- playground / public integration surfaces

这一层的定位是：

- 利用 Kernel 资产
- 不重新定义 Kernel 语义
- 对 Kernel 能力做治理、发布、包装和扩展

### 当前对应模块

- [src/control-plane.ts](../src/control-plane.ts)
- [src/memory/automation.js](../src/memory/automation.js)
- [src/routes/admin-control-alerts.ts](../src/routes/admin-control-alerts.ts)
- [src/routes/admin-control-config.ts](../src/routes/admin-control-config.ts)
- [src/routes/admin-control-dashboard.ts](../src/routes/admin-control-dashboard.ts)
- [src/routes/admin-control-entities.ts](../src/routes/admin-control-entities.ts)
- [src/routes/automations.ts](../src/routes/automations.ts)
- [apps/ops](../apps/ops)
- [apps/playground](../apps/playground)

---

## 4. 正式依赖方向

三层依赖方向必须固定为：

```text
Control & Extensions -> Runtime Services -> Kernel
```

但为了贴近当前实现，允许 Runtime Services 在装配时把外部依赖注入给 Kernel 入口。

更精确的规则是：

1. Kernel 不依赖 Control & Extensions。
2. Kernel 不知道 ops/playground/admin UI 的存在。
3. Runtime Services 可以依赖 Kernel，并向上暴露装配后的入口。
4. Control & Extensions 可以调用 Kernel 能力，也可以调用 Runtime Services 提供的宿主能力。
5. Control & Extensions 不应反向定义 Kernel 核心语义。

### 禁止的依赖

以下依赖应视为违规方向：

- `src/memory/*` 直接依赖 `apps/*`
- `src/memory/*` 直接依赖 `src/routes/*`
- `src/memory/*` 直接依赖 `src/control-plane.ts`
- `src/memory/*` 为了 admin/ops 需要而引入特化语义
- playground/ops 直接修改 kernel 对象模型

### 允许的注入

以下模式是允许的：

- Runtime Services 注入 store/db/embedder/sandboxExecutor
- Route registrar 注入 auth/quota/rate-limit helpers
- Control plane 调用 kernel object query / replay / write surfaces

---

## 5. Kernel 的正式职责

Kernel 只承诺以下五类事情。

## 5.1 Execution Memory

负责把执行过程变成稳定对象，而不是只保存文本。

长期对象包括：

- node
- edge
- commit
- event
- evidence
- rule
- decision
- run
- step
- playbook

## 5.2 Context Construction

负责把 recall 结果变成可控、可预算、可解释的上下文。

最小承诺包括：

- recall
- recall_text
- context budget
- compaction
- layered assembly
- citations / URI-based provenance

## 5.3 Execution Reuse

负责把成功执行沉淀为可复用资产，并允许 replay。

最小承诺包括：

- run record
- playbook compile
- playbook run
- promote
- repair
- review lifecycle integration

## 5.4 Policy Loop

负责把规则、工具决策和执行反馈纳入闭环。

最小承诺包括：

- rules evaluate
- tools select
- decision persistence
- run lifecycle lookup
- feedback writeback

## 5.5 Evolution Loop

负责通过 repair、review、learning projection 等机制让内核资产演进。

最小承诺包括：

- repair patch path
- review gate
- shadow validation hook
- replay learning projection
- rule/tool feedback incorporation

---

## 6. Runtime Services 的正式职责

Runtime Services 只承诺以下六类事情。

## 6.1 Environment Assembly

- env 读取
- runtime adapter 初始化
- feature flag / capability 初始化

## 6.2 Access Control

- auth
- admin token
- API key principal resolution
- request identity injection

## 6.3 Resource Governance

- rate limit
- quota
- inflight slot
- sandbox tenant/project budget

## 6.4 Runtime Adapters

- db
- store
- embedded runtime
- embedder
- sandbox executor

## 6.5 Observability

- request telemetry
- context assembly telemetry
- audit emission
- operational diagnostics

## 6.6 Route Hosting

- Fastify app creation
- registrar wiring
- capability exposure

---

## 7. Control & Extensions 的正式职责

这层只承诺以下四类事情。

## 7.1 Governance Surface

- admin control
- dashboards
- alerts
- incident publish

## 7.2 Automation Surface

- bounded automation DAG
- compensation and recovery
- automation telemetry
- automation review / approval entry

## 7.3 External Product Surface

- SDK-facing route surface
- playground
- ops console
- integration adapters

## 7.4 Product Packaging

- 对 kernel 能力做产品化暴露
- 不改变 kernel 基础对象语义

---

## 8. 核心对象的正式地位

以下对象应视为 Aionis Kernel Canonical Objects：

- `memory node`
- `memory edge`
- `memory commit`
- `context item`
- `context citation`
- `rule`
- `decision`
- `tool selection`
- `replay run`
- `replay step`
- `replay playbook`
- `automation run`

它们的演进规则应该是：

1. 尽量追加字段，不轻易改变语义。
2. 尽量保持 URI / provenance 兼容。
3. 管理层和扩展层应消费这些对象，而不是私自重新定义平行对象。

---

## 9. Kernel 对外承诺

如果未来要做版本边界，Kernel 应承诺以下稳定面：

1. Memory write / recall / resolve 语义
2. Context budget / compaction / layered assembly 语义
3. Replay run / playbook / repair 生命周期语义
4. Rule / tool policy loop 语义
5. Provenance / URI 扩展语义

下列内容不应视为 Kernel 稳定承诺：

- Admin dashboard 形态
- Playground product surface
- Ops console 页面结构
- 某个具体 alert channel 的管理 API 细节
- 某个 automation public beta 的包装方式

---

## 10. 当前代码基线下的模块落位

下面是当前代码基线下的推荐归位。

## 10.1 Kernel

- `src/memory/*`
- `src/store/recall-access.ts`
- `src/store/write-access.ts`
- `src/capability-contract.js` 对应的核心 capability 定义

## 10.2 Runtime Services

- `src/app/*`
- `src/index.ts`
- runtime adapter wiring

## 10.3 Control & Extensions

- `src/control-plane.ts`
- `src/routes/admin-*`
- `src/routes/automations.ts`
- `apps/ops/*`
- `apps/playground/*`

### 重要说明

`src/control-plane.ts` 当前位于 `src/` 根下，且和核心运行时联系很紧。  
从语义上看，它更接近治理控制层，而不是 kernel 本体。

后续如果继续收束架构，建议把它视为：

> governance/control extension layer 的核心后端模块

而不是 memory kernel 本体的一部分。

---

## 11. 设计原则

## 11.1 Kernel First

新增能力优先判断：

- 它是不是在定义新的执行资产语义？
- 它是不是在扩展 recall/context/replay/policy 这条核心链？

如果是，应先考虑进入 Kernel。

## 11.2 Governance Outside the Core Object Model

治理逻辑可以很强，但不应污染核心对象语义。

例如：

- alert route
- delivery metadata
- incident publish job

这些是治理对象，不应反向成为 memory kernel 的一等核心对象。

## 11.3 Product Surfaces Are Replaceable

ops / playground / dashboard / beta APIs 都应被视为可替换外层，而不是定义内核本体。

## 11.4 Replay Is a Kernel Primitive

replay 不是插件，而是核心语义。  
如果没有 replay，Aionis 退化为增强版 memory system。

## 11.5 Context Budget Is a Kernel Primitive

context compaction 和 layered assembly 不是 UI feature，而是 Kernel 的一部分。  
因为它直接决定 execution memory 如何进入模型上下文。

---

## 12. 非目标

本规范明确排除以下目标：

1. 把 Aionis 定义成通用多 Agent OS
2. 把 Aionis 定义成通用工作流平台
3. 把所有外部集成都收进 Kernel
4. 因为“内核化”而强行重写现有模块
5. 因为“分层”而引入大量抽象空壳

这份规范追求的是：

- 边界清晰
- 依赖方向清晰
- 术语稳定
- 后续重构有锚点

不是抽象游戏。

---

## 13. 采纳后的工程动作

如果正式采纳这份规范，建议按以下顺序推进。

## 13.1 先做命名收束

- 在内部文档和 PR 描述里统一使用：
  - `Kernel`
  - `Runtime Services`
  - `Control & Extensions`

## 13.2 再做目录收束

优先继续完成路由与宿主层拆分，让 `index.ts` 只保留：

- app bootstrap
- registrar wiring
- 少量仍未迁出的核心宿主 helper

## 13.3 最后做测试分层

测试按三层组织：

1. Kernel correctness tests
2. Runtime host / adapter tests
3. Control / governance / surface tests

---

## 14. 最终判断

我的正式建议是：

> 应该把 Aionis 当前已经存在的能力，正式收束为一个清晰的内核架构。

原因不是概念包装，而是工程现实：

- 现在能力已经足够丰富，不收束会持续边界漂移。
- 当前已经有清晰的内核雏形，继续放任会让代码结构和产品叙事同时发散。
- 内核化之后，后续拆分、测试、发布、治理都会更容易形成长期稳定面。

因此，建议从现在开始，正式采用如下表达：

> Aionis = Kernel + Runtime Services + Control & Extensions

这是当前阶段最准确、最稳健、也最有工程价值的架构收束方式。
