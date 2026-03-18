---
title: "Aionis Doc Authoring Guide"
---

# Aionis Doc Authoring Guide

This guide shows how to write Aionis Docs that match the current compiler and CLI.

## Start Small

For a first document, use this sequence:

1. add one `@doc`
2. add one `@context`
3. add one or more `@execute`
4. add one `@replay`

That gives you the smallest complete path from source to compile, handoff, publish, and recover.

## Minimal Task Document

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

## Multi-Step Workflow Pattern

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

This pattern is useful because:

1. the first step writes into `run.*`
2. later steps read from prior outputs
3. replay expectations declare what should exist at the end

## Authoring Rules

Recommended practice:

1. keep `@doc` at the top of the file
2. use quoted string values consistently
3. use `ctx` for document-level context inputs
4. use `run.*` for intermediate execution outputs
5. use `out.*` for user-facing or final outputs
6. keep prose headings and paragraphs around directives for human readability

## Common Mistakes

### Missing `@doc`

Every valid document should include one `@doc`.

### Duplicate `@doc`

Only one `@doc` is allowed per file.

### Bare string literals

Invalid:

```text
mode: deterministic
```

Valid:

```text
mode: "deterministic"
```

### Directive-like text inside fences

Directive parsing is disabled inside fenced code blocks.

This is documentation text, not a live directive:

````md
```text
@doc {
  id: "not-live"
}
```
````

### Unresolved refs

If an `input_ref` points to something the compiler cannot resolve, you should expect an `UNRESOLVED_REF` diagnostic.

## Recommended Authoring Loop

1. write the document
2. run `aionis doc compile`
3. fix diagnostics
4. run `aionis doc runtime-handoff`
5. when ready, run `aionis doc publish` or `aionis doc recover`

## Read Next

1. [Aionis Doc Syntax](/public/en/reference/11-aionis-doc-syntax)
2. [Aionis Doc CLI Workflow](/public/en/reference/13-aionis-doc-cli-workflow)
3. [Aionis Doc Examples](/public/en/reference/15-aionis-doc-examples)
4. [Aionis Doc Diagnostics](/public/en/reference/16-aionis-doc-diagnostics)
