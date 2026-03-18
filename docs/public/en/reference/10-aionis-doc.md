---
title: "Aionis Doc"
---

# Aionis Doc

Aionis Doc is the executable-document format for Aionis.

It keeps Markdown as the human-readable layer, then adds line-leading directive blocks such as `@doc`, `@context`, `@execute`, and `@replay` so one file can be:

1. readable in a normal editor
2. parsed deterministically
3. compiled into IR and an execution graph
4. converted into a native runtime handoff
5. published and recovered through Aionis handoff memory

## What It Is

Aionis Doc is not a separate programming language and not a prompt template DSL.

It is a Markdown-compatible protocol layer for AI-native work:

1. prose stays readable for humans
2. directives carry machine-readable structure
3. refs connect context, execution outputs, and replay expectations
4. compiler diagnostics make malformed documents visible before runtime

Current v0.1 scope is intentionally small.

The current implementation supports:

1. scanning and parsing source files
2. AST and IR normalization
3. basic schema validation
4. scoped ref resolution
5. simple execution-graph construction
6. runtime handoff generation
7. publish and recover flows through native handoff endpoints

## Current Stable Authoring Subset

The most stable public subset today is:

1. `@doc`
2. `@context`
3. `@execute`
4. `@replay`

The compiler also normalizes `@plan`, `@decision`, `@evidence`, `@memory`, and `@state`, but the recommended public path starts with the smaller subset above.

## Minimal Example

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

## Main Workflow

With the official CLI surface, the common path is:

1. `aionis doc compile`
2. `aionis doc runtime-handoff`
3. `aionis doc store-request`
4. `aionis doc publish`
5. `aionis doc recover`

That turns one `.aionis.md` file into:

1. compiler artifacts
2. runtime continuity payloads
3. a stored handoff artifact
4. a recovered execution-ready handoff

## Read Next

1. [Aionis Doc Syntax](/public/en/reference/11-aionis-doc-syntax)
2. [Aionis Doc Authoring Guide](/public/en/reference/12-aionis-doc-authoring)
3. [Aionis Doc CLI Workflow](/public/en/reference/13-aionis-doc-cli-workflow)
4. [Aionis Doc Contracts](/public/en/reference/14-aionis-doc-contracts)
5. [Aionis Doc Examples](/public/en/reference/15-aionis-doc-examples)
6. [Aionis Doc Diagnostics](/public/en/reference/16-aionis-doc-diagnostics)
7. [Aionis Doc Roadmap](/public/en/reference/17-aionis-doc-roadmap)
