---
title: "Aionis Doc 路线图"
---

# Aionis Doc 路线图

这页描述的是 Aionis Doc 作为产品协议层的演进方向。

它是能力路线图，不是固定发布时间承诺。

## 当前公开边界

现在 Aionis Doc 已经支持：

1. source parsing 和 directive normalization
2. AST、IR、execution graph 编译
3. 版本化 compile contracts
4. runtime handoff generation
5. handoff store request generation
6. 通过原生 handoff endpoints 的 publish / recover
7. 通过 `aionis doc ...` 暴露到官方 CLI

这意味着 Aionis Doc 已经是一条可用的 executable-document workflow surface。

它还没做到的部分：

1. 还不能直接从文档本身启动完整 runtime execution
2. 还没有把最初理想化 spec 的全部表面都做成稳定承诺
3. 还没有为未来每一类 directive 都冻结完整外部 schema

## 为什么这层重要

Aionis Doc 连接的是：

1. 人类可读的工作文档
2. compiler 可见的结构
3. runtime continuity payloads
4. handoff memory persistence
5. recoverable execution state

所以即使 direct doc-driven execution 还没落地，它对 Aionis 也已经很重要。

## 近期重点

### 1. 更稳的 Authoring 体验

重点：

1. 收紧 payload 和 refs 的语法保证
2. 让 diagnostics 更具体、更容易修
3. 刻意保持稳定公开子集足够小

预期结果：

1. authoring 错误率下降
2. parser / runtime 的解释偏差减少

### 2. 更完整的 Runtime Continuity

重点：

1. 强化围绕 execution state 的 continuity shaping
2. 让 publish / recover 路径更容易运营化
3. 降低 compile outputs 和 runtime inputs 之间的阻抗

预期结果：

1. 更容易接进真实 Aionis workflow
2. handoff continuity recovery 更可靠

### 3. 更完整的示例和集成指南

重点：

1. 增加更多 end-to-end 示例
2. 讲清楚 runtime integration patterns
3. 补强 contracts 和 diagnostics 的公开说明

预期结果：

1. 新 author 的上手时间缩短
2. 常见路径不再需要自己拼 raw API

## 中期重点

### 1. Direct Doc-Driven Execution

重点：

1. 把 recovered continuity 真正桥进 execution / resume 路径
2. 从 document source 到 execution-ready boundary 更清晰
3. 让 document-driven workflow 成为 runtime 叙事的一部分

### 2. 更强的可复现控制

重点：

1. 更好的 module / version pinning 语义
2. 更清楚的 executable document replay expectations
3. 更强的 deterministic / advisory mode 边界

### 3. 更丰富的 Evidence 和 Decision Linking

重点：

1. 把 evidence attachment 语义讲清楚
2. 提高对 decisions、outputs、sections 的 targetability
3. 让 document-derived provenance 更容易被下游消费

## 长期方向

长期看，Aionis Doc 应该成为一层协议，让 Aionis 可以把一份文件同时当成：

1. 可读的工作工件
2. compiler 输入
3. continuity carrier
4. 可恢复的 execution record
5. provenance 和 evidence envelope

这是方向，不代表每类 directive 都会以同样速度进入稳定承诺。

## 给现在就要接入的团队的建议

如果你现在就要接 Aionis Doc：

1. 先从 `@doc`、`@context`、`@execute`、`@replay` 开始
2. 任何 publish 前先跑 `aionis doc compile`
3. 把 diagnostics 当成 authoring contract 的一部分
4. 先落地 publish / recover，再追 direct execution

## 相关文档

1. [Aionis Doc](/public/zh/reference/10-aionis-doc)
2. [Aionis Doc CLI 工作流](/public/zh/reference/13-aionis-doc-cli-workflow)
3. [Aionis Doc 合同](/public/zh/reference/14-aionis-doc-contracts)
4. [路线图](/public/zh/roadmap/00-roadmap)
