---
title: "Aionis Doc Syntax"
---

# Aionis Doc Syntax

This page describes the current parser-compatible syntax for Aionis Doc v0.1.

## Source Model

An Aionis Doc file is ordinary Markdown plus directive blocks.

Directive recognition rules:

1. the first non-space character on a line must be `@`
2. a directive identifier must follow
3. the directive must carry a balanced object payload
4. the directive must be outside fenced code blocks

Inside fenced code blocks, directive-like text is ignored by the parser.

## Directive Form

```text
@name {
  key: "value"
}
```

Valid identifier examples:

1. `@doc`
2. `@context`
3. `@execute`
4. `@brand.voice`
5. `@agent-handoff`

Recommended identifier regex:

```text
^[A-Za-z][A-Za-z0-9_.-]*$
```

## Payload Grammar

Payloads use a relaxed object notation.

Supported value types:

1. string
2. number
3. boolean
4. null
5. object
6. array

### Strings

Both quote styles are allowed:

```text
"hello"
'hello'
```

Quoted strings are strongly preferred for all non-key literals.

Bare string literals are not supported.
For example, this is invalid:

```text
mode: deterministic
```

This is valid:

```text
mode: "deterministic"
```

### Objects

Rules:

1. keys may be unquoted identifiers or quoted strings
2. key-value pairs use `:`
3. fields may be separated by commas or newlines
4. comments inside payloads are not part of v0.1

Example:

```text
{
  id: "demo-001"
  version: "1.0"
  kind: "task"
}
```

### Arrays

Arrays use `[]`, and items are comma-separated.

Example:

```text
expected_outputs: ["out.hero", "out.summary"]
```

## Stable Directives

### `@doc`

Required:

1. `id`
2. `version`

Recommended:

1. `kind`
2. `title`
3. `status`
4. `tags`

Only one `@doc` is valid per document.

### `@context`

Typical fields:

1. `objective`
2. `audience`
3. `constraints`

### `@execute`

At least one of these should be present:

1. `module`
2. `tool`
3. `agent`

Common fields:

1. `input`
2. `input_ref`
3. `output_ref`
4. `depends_on`
5. `deterministic`

### `@replay`

Common fields:

1. `executable`
2. `mode`
3. `workflow_id`
4. `expected_outputs`

Supported replay modes:

1. `deterministic`
2. `assisted`
3. `advisory`

## Additional Parsed Directives

The current compiler also normalizes:

1. `@plan`
2. `@decision`
3. `@evidence`
4. `@memory`
5. `@state`

These are available in IR, but the smallest public compatibility promise still centers on `@doc`, `@context`, `@execute`, and `@replay`.

## Ref Model

Current scoped refs:

1. `doc.*`
2. `ctx.*`
3. `run.*`
4. `out.*`
5. `mem.*`

Examples:

```text
input_ref: "ctx"
output_ref: "run.claims"
input_ref: "run.claims"
output_ref: "out.hero"
```

## Diagnostics

Common diagnostic classes:

1. `INVALID_PAYLOAD`
2. `INVALID_SCHEMA`
3. `MISSING_DOC`
4. `DUPLICATE_DOC`
5. `UNRESOLVED_REF`
6. `UNKNOWN_DEPENDENCY`
7. `UNCLOSED_FENCE`

Malformed documents are expected to surface structured diagnostics instead of failing silently.
