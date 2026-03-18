---
title: "Aionis Doc 语法"
---

# Aionis Doc 语法

这一页描述的是当前 parser 真实兼容的 Aionis Doc v0.1 语法。

## Source Model

Aionis Doc 文件 = 普通 Markdown + directive blocks。

directive 识别规则：

1. 一行里第一个非空白字符必须是 `@`
2. 后面必须跟有效 directive identifier
3. directive 必须带平衡的对象 payload
4. directive 必须出现在 fenced code block 之外

在 fenced code block 里，看起来像 directive 的文本会被 parser 忽略。

## Directive 形式

```text
@name {
  key: "value"
}
```

有效 identifier 例子：

1. `@doc`
2. `@context`
3. `@execute`
4. `@brand.voice`
5. `@agent-handoff`

推荐 identifier regex：

```text
^[A-Za-z][A-Za-z0-9_.-]*$
```

## Payload Grammar

payload 使用 relaxed object notation。

支持的值类型：

1. string
2. number
3. boolean
4. null
5. object
6. array

### Strings

两种引号都允许：

```text
"hello"
'hello'
```

所有非 key 字面量都强烈建议使用引号。

bare string literal 不支持。  
例如下面这种是无效的：

```text
mode: deterministic
```

下面这种才是有效的：

```text
mode: "deterministic"
```

### Objects

规则：

1. key 可以是不带引号的 identifier，也可以是带引号字符串
2. key-value 用 `:`
3. field 可以用逗号或换行分隔
4. payload 内注释不属于 v0.1

例子：

```text
{
  id: "demo-001"
  version: "1.0"
  kind: "task"
}
```

### Arrays

数组使用 `[]`，元素之间用逗号分隔。

例子：

```text
expected_outputs: ["out.hero", "out.summary"]
```

## 稳定 Directive

### `@doc`

必填：

1. `id`
2. `version`

推荐：

1. `kind`
2. `title`
3. `status`
4. `tags`

每个文档只能有一个 `@doc`。

### `@context`

常见字段：

1. `objective`
2. `audience`
3. `constraints`

### `@execute`

以下字段里至少应有一个：

1. `module`
2. `tool`
3. `agent`

常见字段：

1. `input`
2. `input_ref`
3. `output_ref`
4. `depends_on`
5. `deterministic`

### `@replay`

常见字段：

1. `executable`
2. `mode`
3. `workflow_id`
4. `expected_outputs`

支持的 replay mode：

1. `deterministic`
2. `assisted`
3. `advisory`

## 额外会被解析的 Directive

当前 compiler 也会归一化：

1. `@plan`
2. `@decision`
3. `@evidence`
4. `@memory`
5. `@state`

这些在 IR 里可见，但当前最小公开兼容承诺仍然围绕 `@doc`、`@context`、`@execute`、`@replay`。

## Ref Model

当前支持的 scoped refs：

1. `doc.*`
2. `ctx.*`
3. `run.*`
4. `out.*`
5. `mem.*`

例子：

```text
input_ref: "ctx"
output_ref: "run.claims"
input_ref: "run.claims"
output_ref: "out.hero"
```

## Diagnostics

常见诊断类型：

1. `INVALID_PAYLOAD`
2. `INVALID_SCHEMA`
3. `MISSING_DOC`
4. `DUPLICATE_DOC`
5. `UNRESOLVED_REF`
6. `UNKNOWN_DEPENDENCY`
7. `UNCLOSED_FENCE`

坏文档应当返回结构化 diagnostics，而不是静默失败。
