---
title: "Aionis Doc Diagnostics"
---

# Aionis Doc Diagnostics

Aionis Doc compiler 会产出结构化 diagnostics，而不是静默接受坏文档。

## 为什么 diagnostics 很重要

diagnostics 是 authoring 和 execution 之间的合同层。

它们可以帮助你：

1. 及早发现坏掉的 directive payload
2. 在 handoff generation 前发现 schema 问题
3. 找出 unresolved refs 和 dependency 错误
4. 保持 runtime continuity 输入稳定

## 常见 diagnostic codes

### `INVALID_PAYLOAD`

含义：

directive payload 缺失、括号不平衡，或者无法解析成 object。

典型原因：

1. 缺少 `{`
2. 缺少结尾 `}`
3. 嵌套 object 或 array 写坏了

### `INVALID_SCHEMA`

含义：

payload 本身解析成功了，但不满足当前 compiler 的结构要求。

典型原因：

1. `@doc.id` 为空
2. `@doc.version` 为空
3. `@execute` 没有 `module`、`tool`、`agent`

### `MISSING_DOC`

含义：

整份文档没有 `@doc`。

修法：

在文件顶部附近加且只加一个 `@doc`。

### `DUPLICATE_DOC`

含义：

文档里有多个 `@doc`。

修法：

保留一个 canonical `@doc`，删掉其余的。

### `UNRESOLVED_REF`

含义：

某个 `input_ref` 指向了无效 scope，或者指向了无法解析的路径。

典型原因：

1. scope 不存在，比如 `foo.value`
2. context 字段缺失，比如 `ctx.missing`
3. ref 语法本身不合法

### `UNKNOWN_DEPENDENCY`

含义：

某个 `depends_on` 没有命中任何先前 execution node id 或 output ref。

当前 severity：

1. warning

### `UNCLOSED_FENCE`

含义：

某个 fenced code block 到文件结尾都没有闭合。

当前 severity：

1. warning

## 推荐修复顺序

当你一次看到多个 diagnostics，建议按这个顺序修：

1. `INVALID_PAYLOAD`
2. `MISSING_DOC` 或 `DUPLICATE_DOC`
3. `INVALID_SCHEMA`
4. `UNRESOLVED_REF`
5. `UNKNOWN_DEPENDENCY`
6. `UNCLOSED_FENCE`

这样通常能减少后续阶段的级联噪音。

## 推荐 authoring loop

```bash
npx @aionis/sdk@0.2.20 doc compile ./workflow.aionis.md --emit diagnostics
```

然后：

1. 先修 errors
2. 再跑 compile
3. 再检查 graph 输出
4. 之后再进入 publish 或 recover

## 相关文档

1. [Aionis Doc 语法](/public/zh/reference/11-aionis-doc-syntax)
2. [Aionis Doc 示例](/public/zh/reference/15-aionis-doc-examples)
3. [Aionis Doc CLI 工作流](/public/zh/reference/13-aionis-doc-cli-workflow)
4. [Aionis Doc 路线图](/public/zh/reference/17-aionis-doc-roadmap)
