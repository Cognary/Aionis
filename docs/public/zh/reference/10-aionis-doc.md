---
title: "Aionis Doc"
---

# Aionis Doc

Aionis Doc 是 Aionis 的 executable-document 格式。

它保留 Markdown 作为人类可读层，再加上 `@doc`、`@context`、`@execute`、`@replay` 这类行首 directive，让同一个文件同时可以：

1. 被普通编辑器阅读
2. 被确定性解析
3. 被编译成 IR 和 execution graph
4. 被编译成 runtime-neutral 的 `execution_plan_v1`
5. 直接走最小本地执行路径
6. 被转换成 native runtime handoff
7. 通过 Aionis handoff memory 做 publish 和 recover

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
6. `execution_plan_v1` 生成
7. 最小 direct execution
8. runtime handoff 生成
9. 通过 native handoff endpoint 做 publish 和 recover

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

通过 `@aionis/sdk` 暴露的集成 CLI 下，最常见的路径是：

1. `aionis doc compile`
2. `aionis doc execute`
3. `aionis doc runtime-handoff`
4. `aionis doc store-request`
5. `aionis doc publish`
6. `aionis doc recover`

这会把一个 `.aionis.md` 文件推进成：

1. compiler artifacts
2. 可移植的 execution plan
3. 最小本地 execution result
4. runtime continuity payload
5. 存储后的 handoff artifact
6. recover 出来的 execution-ready handoff

## 独立包命令面

如果你直接使用 `@aionis/doc` 包本身，当前暴露的是独立二进制，而不是 `aionis doc ...` 子命令：

1. `compile-aionis-doc`
2. `execute-aionis-doc`
3. `build-aionis-doc-runtime-handoff`
4. `build-aionis-doc-handoff-store-request`
5. `publish-aionis-doc-handoff`
6. `recover-aionis-doc-handoff`

这两层命令面对应的是同一条工作流，但入口不同：

1. `aionis doc ...` 属于 `@aionis/sdk` 集成 CLI
2. 上面这组独立二进制属于 `@aionis/doc` 包本身

## 当前分发状态

当前更准确的产品状态是：

1. `aionis doc ...` 已经是主 SDK CLI 的公开集成能力
2. `@aionis/doc` 已经有独立包元数据、README、CHANGELOG 和 `bin` 暴露
3. `@aionis/doc` 现在已经有独立 release surface，但是否可安装取决于对应版本是否已经实际发布到 npm

当前仓库里已经对齐了独立发布最小闭环：

1. `aionis-doc:pack-dry-run`
2. `aionis-doc:publish:dry-run`
3. `aionis-doc:publish`
4. `aionis-doc:release-check`
5. `Aionis Doc CI` 和 `Aionis Doc Publish` GitHub workflow
6. 仓库内发布说明：`docs/AIONIS_DOC_RELEASE.md`

## 下一步阅读

1. [Aionis Doc 语法](/public/zh/reference/11-aionis-doc-syntax)
2. [Aionis Doc 写作指南](/public/zh/reference/12-aionis-doc-authoring)
3. [Aionis Doc CLI 工作流](/public/zh/reference/13-aionis-doc-cli-workflow)
4. [Aionis Doc 合同](/public/zh/reference/14-aionis-doc-contracts)
5. [Aionis Doc 示例](/public/zh/reference/15-aionis-doc-examples)
6. [Aionis Doc Diagnostics](/public/zh/reference/16-aionis-doc-diagnostics)
7. [Aionis Doc 路线图](/public/zh/reference/17-aionis-doc-roadmap)
