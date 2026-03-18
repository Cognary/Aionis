---
title: "Aionis Doc"
---

# Aionis Doc

Aionis Doc is the executable-document format for Aionis.

It keeps Markdown as the human-readable layer, then adds line-leading directive blocks such as `@doc`, `@context`, `@execute`, and `@replay` so one file can be:

1. readable in a normal editor
2. parsed deterministically
3. compiled into IR and an execution graph
4. compiled into a runtime-neutral `execution_plan_v1`
5. executed through a minimal local runtime path
6. converted into a native runtime handoff
7. published and recovered through Aionis handoff memory

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
6. `execution_plan_v1` generation
7. minimal direct execution
8. runtime handoff generation
9. publish and recover flows through native handoff endpoints

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

Through the `@aionis/sdk` integrated CLI surface, the common path is:

1. `aionis doc compile`
2. `aionis doc execute`
3. `aionis doc runtime-handoff`
4. `aionis doc store-request`
5. `aionis doc publish`
6. `aionis doc recover`

That turns one `.aionis.md` file into:

1. compiler artifacts
2. a portable execution plan
3. a minimal local execution result
4. runtime continuity payloads
5. a stored handoff artifact
6. a recovered execution-ready handoff

## Standalone Package Surface

If you use the `@aionis/doc` package directly, the currently exposed commands are standalone binaries rather than `aionis doc ...` subcommands:

1. `compile-aionis-doc`
2. `execute-aionis-doc`
3. `build-aionis-doc-runtime-handoff`
4. `build-aionis-doc-handoff-store-request`
5. `publish-aionis-doc-handoff`
6. `recover-aionis-doc-handoff`

These two command surfaces describe the same workflow but through different entrypoints:

1. `aionis doc ...` belongs to the `@aionis/sdk` integrated CLI
2. the standalone binaries above belong to the `@aionis/doc` package itself

## Current Distribution Status

The more accurate product status today is:

1. `aionis doc ...` is already a public integrated capability in the main SDK CLI
2. `@aionis/doc` now has standalone package metadata, README, CHANGELOG, and `bin` entries
3. `@aionis/doc` now has a standalone release surface, although installability still depends on whether the corresponding version has actually been published to npm

The repository now includes the minimum standalone release path:

1. `aionis-doc:pack-dry-run`
2. `aionis-doc:publish:dry-run`
3. `aionis-doc:publish`
4. `aionis-doc:release-check`
5. `Aionis Doc CI` and `Aionis Doc Publish` GitHub workflows
6. repo-local release runbook: `docs/AIONIS_DOC_RELEASE.md`

## Read Next

1. [Aionis Doc Syntax](/public/en/reference/11-aionis-doc-syntax)
2. [Aionis Doc Authoring Guide](/public/en/reference/12-aionis-doc-authoring)
3. [Aionis Doc CLI Workflow](/public/en/reference/13-aionis-doc-cli-workflow)
4. [Aionis Doc Contracts](/public/en/reference/14-aionis-doc-contracts)
5. [Aionis Doc Examples](/public/en/reference/15-aionis-doc-examples)
6. [Aionis Doc Diagnostics](/public/en/reference/16-aionis-doc-diagnostics)
7. [Aionis Doc Roadmap](/public/en/reference/17-aionis-doc-roadmap)
