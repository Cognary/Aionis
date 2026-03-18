---
title: "Aionis Doc"
---

# Aionis Doc

Aionis Doc 是 Aionis 的 executable-document 格式。

它保留 Markdown 作为人类可读层，再加上 `@doc`、`@context`、`@execute`、`@replay` 这类行首 directive，让同一个文件同时可以：

1. 被普通编辑器阅读
2. 被确定性解析
3. 被编译成 IR 和 execution graph
4. 被转换成 native runtime handoff
5. 通过 Aionis handoff memory 做 publish 和 recover

## 它是什么

Aionis Doc 不是一门独立编程语言，也不是 prompt 模板 DSL。

它本质上是 Aionis 面向 AI-native 工作的协议层：

1. prose 保持对人类可读
2. directive 提供机器可读结构
3. refs 把 context、execution outputs 和 replay expectations 串起来
4. compiler diagnostics 在 runtime 前暴露坏文档

当前 v0.1 的范围是刻意收敛的。

当前实现已经支持：

1. source 扫描与解析
2. AST 和 IR 归一化
3. 基础 schema 校验
4. scoped ref 解析
5. 简单 execution graph 构建
6. runtime handoff 生成
7. 通过 native handoff endpoint 做 publish 和 recover

## 当前稳定 authoring 子集

目前最稳定的公开子集是：

1. `@doc`
2. `@context`
3. `@execute`
4. `@replay`

编译器当前也会归一化 `@plan`、`@decision`、`@evidence`、`@memory`、`@state`，但公开路径建议先围绕上面这组最小子集使用。

## 最小例子

```md
@doc {
  id: "demo-001"
  version: "1.0"
  kind: "task"
}

# Goal
Compile a minimal Aionis document.

@context {
  objective: "Say hello"
}

@execute {
  module: "demo.hello.v1"
  input_ref: "ctx"
  output_ref: "out.message"
}

@replay {
  executable: true
  mode: "assisted"
  expected_outputs: ["out.message"]
}
```

## 主工作流

官方 CLI 下最常见的路径是：

1. `aionis doc compile`
2. `aionis doc runtime-handoff`
3. `aionis doc store-request`
4. `aionis doc publish`
5. `aionis doc recover`

这会把一个 `.aionis.md` 文件推进成：

1. compiler artifacts
2. runtime continuity payload
3. 存储后的 handoff artifact
4. recover 出来的 execution-ready handoff

## 下一步阅读

1. [Aionis Doc 语法](/public/zh/reference/11-aionis-doc-syntax)
2. [Aionis Doc 写作指南](/public/zh/reference/12-aionis-doc-authoring)
3. [Aionis Doc CLI 工作流](/public/zh/reference/13-aionis-doc-cli-workflow)
4. [Aionis Doc 合同](/public/zh/reference/14-aionis-doc-contracts)
5. [Aionis Doc 示例](/public/zh/reference/15-aionis-doc-examples)
6. [Aionis Doc Diagnostics](/public/zh/reference/16-aionis-doc-diagnostics)
7. [Aionis Doc 路线图](/public/zh/reference/17-aionis-doc-roadmap)
