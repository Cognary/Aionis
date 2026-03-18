---
title: "Aionis Doc 示例"
---

# Aionis Doc 示例

这页收集了一组和当前 Aionis Doc compiler、CLI 对齐的完整示例。

## 最小任务文档

适合用在你想写一份最小但可 compile、publish、recover 的文档时。

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

这个模式适合：

1. 单步任务
2. smoke test
3. 第一次 authoring

## 多步 Workflow

适合用在一个执行步骤依赖前一步输出的场景。

```md
@doc {
  id: "workflow-001"
  version: "1.0"
  kind: "workflow"
}

@context {
  product: "EVA"
  audience: ["founders", "operators"]
}

@execute {
  module: "research.claims.v1"
  input_ref: "ctx"
  output_ref: "run.claims"
}

@execute {
  module: "copy.hero.v1"
  input_ref: "run.claims"
  output_ref: "out.hero"
  depends_on: ["run.claims"]
}

@replay {
  executable: true
  mode: "deterministic"
  expected_outputs: ["out.hero"]
}
```

这个例子说明了：

1. `ctx` 承载文档级输入
2. `run.*` 承载中间结果
3. `out.*` 承载最终产出
4. `depends_on` 会增加显式 sequence edge

## Compile 检查流

适合用在你想持久化之前先检查文档结构时。

```bash
npx @aionis/sdk@0.2.20 doc compile ./workflow.aionis.md --emit graph
```

一般重点检查：

1. `diagnostics` 为空
2. `doc_id` 正确
3. node label 和预期的 `module` / `tool` 一致
4. graph edges 和你的 `input_ref`、`depends_on` 一致

## Publish And Recover 流

适合用在你想跑完整 document-to-continuity roundtrip 时。

```bash
npx @aionis/sdk@0.2.20 doc publish ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
npx @aionis/sdk@0.2.20 doc recover ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
```

这条路径适合：

1. 文档需要成为可恢复 handoff artifact
2. 你要通过 native runtime endpoints 拿回 continuity payload
3. 你不想自己手拼原始 API payload

## 反例：重复 `@doc`

这是无效的：

```md
@doc {
  id: "one"
  version: "1.0"
}

@doc {
  id: "two"
  version: "1.0"
}
```

预期结果：

1. compile 会继续
2. diagnostics 里会有 `DUPLICATE_DOC`

## 反例：未解析 ref

这是无效的：

```md
@doc {
  id: "bad-ref"
  version: "1.0"
}

@execute {
  module: "demo.hello.v1"
  input_ref: "ctx.missing"
  output_ref: "out.message"
}
```

预期结果：

1. diagnostics 里会有 `UNRESOLVED_REF`
2. 你需要补上缺失的 context 字段，或者改 ref

## 下一步阅读

1. [Aionis Doc 写作指南](/public/zh/reference/12-aionis-doc-authoring)
2. [Aionis Doc CLI 工作流](/public/zh/reference/13-aionis-doc-cli-workflow)
3. [Aionis Doc Diagnostics](/public/zh/reference/16-aionis-doc-diagnostics)
