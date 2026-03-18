---
title: "Aionis Doc 写作指南"
---

# Aionis Doc 写作指南

这页说明如何写出符合当前 compiler 和 CLI 的 Aionis Doc。

## 从最小子集开始

第一份文档建议按这个顺序写：

1. 一个 `@doc`
2. 一个 `@context`
3. 一个或多个 `@execute`
4. 一个 `@replay`

这已经足够走通 compile、handoff、publish、recover。

## 最小任务文档

```md
@doc {
  id: "demo-001"
  version: "1.0"
  kind: "task"
}

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

## 多步 Workflow 模式

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

这个模式的好处是：

1. 第一步把中间结果写到 `run.*`
2. 后续步骤从前一步输出继续读取
3. replay expectations 明确声明最终应该生成什么

## 写作规则

推荐实践：

1. 把 `@doc` 放在文件顶部
2. 字符串值统一使用引号
3. 文档级上下文输入优先放在 `ctx`
4. 中间执行输出优先放在 `run.*`
5. 面向用户或最终产出的输出优先放在 `out.*`
6. 继续保留 Markdown 的标题和段落，让人类能读懂

## 常见错误

### 缺少 `@doc`

每份有效文档都应包含一个 `@doc`。

### 重复 `@doc`

每个文件只能有一个 `@doc`。

### bare string literal

无效：

```text
mode: deterministic
```

有效：

```text
mode: "deterministic"
```

### fence 里的伪 directive

fenced code block 里的 directive 不会被解析。

下面只是示例文本，不是 live directive：

````md
```text
@doc {
  id: "not-live"
}
```
````

### 未解析 ref

如果 `input_ref` 指向了 compiler 无法解析的对象，你会拿到 `UNRESOLVED_REF`。

## 推荐 authoring loop

1. 写文档
2. 跑 `aionis doc compile`
3. 修 diagnostics
4. 跑 `aionis doc runtime-handoff`
5. 准备好后再跑 `aionis doc publish` 或 `aionis doc recover`

## 下一步阅读

1. [Aionis Doc 语法](/public/zh/reference/11-aionis-doc-syntax)
2. [Aionis Doc CLI 工作流](/public/zh/reference/13-aionis-doc-cli-workflow)
3. [Aionis Doc 示例](/public/zh/reference/15-aionis-doc-examples)
4. [Aionis Doc Diagnostics](/public/zh/reference/16-aionis-doc-diagnostics)
