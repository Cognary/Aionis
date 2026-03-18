---
title: "Aionis Doc Examples"
---

# Aionis Doc Examples

This page collects complete examples that match the current Aionis Doc compiler and CLI.

## Minimal Task

Use this when you want the smallest document that still supports compile, publish, and recover.

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

This pattern is good for:

1. single-step tasks
2. smoke tests
3. first-time authoring

## Multi-Step Workflow

Use this when one execution step depends on a prior output.

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

What this shows:

1. `ctx` carries document-level inputs
2. `run.*` carries intermediate outputs
3. `out.*` carries final outputs
4. `depends_on` adds an explicit sequence edge

## Compile Inspection Flow

Use this when you want to inspect the document before persistence.

```bash
npx @aionis/sdk@0.2.20 doc compile ./workflow.aionis.md --emit graph
```

Typical things to check:

1. `diagnostics` is empty
2. the expected `doc_id` is present
3. node labels match the intended `module` or `tool`
4. graph edges reflect your `input_ref` and `depends_on` choices

## Publish And Recover Flow

Use this when you want a full document-to-continuity roundtrip.

```bash
npx @aionis/sdk@0.2.20 doc publish ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
npx @aionis/sdk@0.2.20 doc recover ./workflow.aionis.md --base-url http://127.0.0.1:3001 --scope default
```

This path is useful when:

1. the document should become a recoverable handoff artifact
2. you want continuity payloads back through native runtime endpoints
3. you want a CLI-native workflow without building raw API payloads yourself

## Negative Example: Duplicate `@doc`

This is invalid:

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

Expected result:

1. compile continues
2. diagnostics includes `DUPLICATE_DOC`

## Negative Example: Unresolved Ref

This is invalid:

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

Expected result:

1. diagnostics includes `UNRESOLVED_REF`
2. you should add the missing context data or change the ref

## Read Next

1. [Aionis Doc Authoring Guide](/public/en/reference/12-aionis-doc-authoring)
2. [Aionis Doc CLI Workflow](/public/en/reference/13-aionis-doc-cli-workflow)
3. [Aionis Doc Diagnostics](/public/en/reference/16-aionis-doc-diagnostics)
