# Aionis Doc v0.1 RFC Draft

**Status:** Draft  
**Scope:** Authoring format, parser surface, IR normalization, basic ref resolution, simple execution graph construction

## 1. Purpose

Aionis Doc is a Markdown-compatible authoring format for AI-native work. It combines human-readable prose with machine-readable directive blocks so that one file can represent context, intent, execution steps, outputs, evidence, and replay metadata.

v0.1 is intentionally small. It defines a deterministic authoring surface and compiler contract. It does not define a full runtime, plugin ecosystem, or editor integration.

## 2. Design Goals

- Human-readable in plain text editors
- Deterministically parseable without model inference
- Executable when explicit execution directives are present
- Replay-aware through explicit replay metadata
- Compatible with Git diffs and line-based review

## 3. Surface Model

An Aionis Doc source file is ordinary Markdown plus line-leading directives.

- Markdown remains the main narrative and navigation layer.
- Directives are recognized only at line start outside fenced code blocks.
- Directive payloads use object notation and are normalized into canonical JSON-like values.

## 4. Core Syntax

### 4.1 Directive Form

```text
@name {
  key: "value"
}
```

### 4.2 Directive Recognition Rules

A parser recognizes a directive only when all of the following are true:

- the first non-space character on a line is `@`
- a valid directive identifier follows
- an object payload begins on the same line or after whitespace/newline continuation
- the directive is not inside a fenced code block

### 4.3 Directive Identifier Grammar

Allowed examples:

- `@doc`
- `@context`
- `@execute`
- `@brand.voice`
- `@policy.compliance`
- `@agent-handoff`

Recommended identifier regex:

```text
^[A-Za-z][A-Za-z0-9_.-]*$
```

## 5. Payload Grammar

v0.1 payloads are a relaxed object notation with the following value categories:

- string
- number
- boolean
- null
- object
- array

### 5.1 Strings

- double-quoted strings are allowed
- single-quoted strings are allowed
- quoted strings are strongly preferred for all non-key literals

### 5.2 Object Fields

- keys may be unquoted identifiers or quoted strings
- key-value pairs use `:`
- object fields may be separated by commas or newlines
- trailing commas are out of scope for v0.1 unless the parser normalizes them deterministically

### 5.3 Arrays

- arrays use `[]`
- array items are comma-separated

### 5.4 Comments

Comments inside directive payloads are not part of v0.1. Comments should remain in Markdown prose outside directives.

## 6. Core Directives

### 6.1 `@doc`

Required fields:

- `id`
- `version`

Recommended fields:

- `kind`
- `title`
- `status`
- `tags`

Only one `@doc` directive is valid per document.

### 6.2 `@context`

Carries grounded working context such as:

- `objective`
- `audience`
- `constraints`
- `inputs`
- `references`

### 6.3 `@plan`

Carries planner-facing decomposition such as:

- `steps`
- `checkpoints`
- `success_criteria`
- `fallbacks`

### 6.4 `@execute`

Defines an execution step. At least one of the following should be present:

- `module`
- `tool`
- `agent`

Common fields:

- `input`
- `input_ref`
- `output_ref`
- `depends_on`
- `deterministic`

### 6.5 `@decision`

Captures a selected choice and rationale.

### 6.6 `@evidence`

Captures supporting sources and confidence metadata. v0.1 supports evidence payloads but does not yet standardize target attachment ids.

### 6.7 `@replay`

Defines replay metadata such as:

- `executable`
- `mode`
- `workflow_id`
- `expected_outputs`

Supported replay modes:

- `deterministic`
- `assisted`
- `advisory`

### 6.8 `@memory`

Optional memory writeback hints.

### 6.9 `@state`

Optional runtime state metadata.

## 7. Ref Model

v0.1 supports scoped refs:

- `doc.*`
- `ctx.*`
- `run.*`
- `out.*`
- `mem.*`

Rules:

- refs must use an explicit scope prefix
- invalid scope prefixes are compiler errors
- `ctx.*` and `doc.*` should be validated against known normalized values when possible
- unresolved refs are preserved in IR and surfaced as diagnostics

## 8. Parsing Rules

The compiler pipeline for v0.1 is:

1. Scan source and track line/column offsets.
2. Parse Markdown blocks and directives.
3. Parse directive payloads.
4. Build AST.
5. Normalize AST into IR.
6. Validate basic directive schema.
7. Resolve refs.
8. Build a simple execution graph.

## 9. AST and IR Requirements

Every parsed node should carry source locations:

```json
{
  "start": { "line": 10, "column": 1, "offset": 183 },
  "end": { "line": 16, "column": 2, "offset": 341 }
}
```

The normalized IR should minimally expose:

- `doc`
- `context`
- `plans`
- `executions`
- `decisions`
- `evidence`
- `replay`
- `memory`
- `state`
- `diagnostics`

## 10. Execution Graph

v0.1 graph construction is conservative.

- each `@execute` becomes an `execute_node`
- a `data_dependency` edge is created when an `input_ref` matches a prior `output_ref`
- a `sequence_dependency` edge may be created from `depends_on`
- no runtime execution is performed by the compiler

## 11. Diagnostics

The compiler should prefer structured diagnostics over hard failure.

Suggested initial classes:

- `INVALID_PAYLOAD`
- `INVALID_SCHEMA`
- `MISSING_DOC`
- `DUPLICATE_DOC`
- `UNRESOLVED_REF`
- `UNKNOWN_DEPENDENCY`
- `UNCLOSED_FENCE`

Malformed directives should remain in the AST with raw text preserved when possible.

## 12. Non-Goals For v0.1

- full CommonMark compliance
- YAML payload execution semantics
- comment syntax inside payload objects
- evidence target standardization
- runtime scheduling
- side-effect policy enforcement
- editor protocol features

## 13. Minimal Valid Example

```text
@doc {
  id: "demo-001"
  version: "1.0"
  kind: "task"
}

@context {
  objective: "Create a minimal executable doc"
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

## 14. Immediate Next Steps

- freeze the payload grammar as normative
- define evidence attachment targets
- require module version pinning for deterministic replay
- add schema-driven validation beyond the current minimal checks
- add editor-facing diagnostics and fixture expansion
