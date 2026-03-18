---
title: "Aionis Doc Diagnostics"
---

# Aionis Doc Diagnostics

The Aionis Doc compiler emits structured diagnostics instead of silently accepting malformed documents.

## Why Diagnostics Matter

Diagnostics are the contract between authoring and execution.

They help you:

1. catch malformed directive payloads early
2. detect schema problems before handoff generation
3. spot unresolved refs and dependency mistakes
4. keep runtime continuity inputs stable

## Common Diagnostic Codes

### `INVALID_PAYLOAD`

Meaning:

The directive payload is missing, unbalanced, or not parseable as an object.

Typical causes:

1. missing `{`
2. missing closing `}`
3. malformed nested object or array

### `INVALID_SCHEMA`

Meaning:

The payload parsed, but it does not satisfy the current compiler expectations.

Typical causes:

1. `@doc.id` is empty
2. `@doc.version` is empty
3. `@execute` has no `module`, `tool`, or `agent`

### `MISSING_DOC`

Meaning:

The document has no `@doc` directive.

Fix:

Add exactly one `@doc` near the top of the file.

### `DUPLICATE_DOC`

Meaning:

The document contains more than one `@doc`.

Fix:

Keep one canonical `@doc` and remove the rest.

### `UNRESOLVED_REF`

Meaning:

An `input_ref` points to an invalid scope or a path that cannot be resolved.

Typical causes:

1. unknown scope such as `foo.value`
2. missing context fields such as `ctx.missing`
3. invalid ref syntax

### `UNKNOWN_DEPENDENCY`

Meaning:

A `depends_on` value does not match any prior execution node id or output ref.

Current severity:

1. warning

### `UNCLOSED_FENCE`

Meaning:

A fenced code block reaches end-of-file without a closing delimiter.

Current severity:

1. warning

## Recommended Fix Order

When multiple diagnostics appear, fix them in this order:

1. `INVALID_PAYLOAD`
2. `MISSING_DOC` or `DUPLICATE_DOC`
3. `INVALID_SCHEMA`
4. `UNRESOLVED_REF`
5. `UNKNOWN_DEPENDENCY`
6. `UNCLOSED_FENCE`

This order usually reduces cascading noise in later stages.

## Recommended Authoring Loop

```bash
npx @aionis/sdk@0.2.20 doc compile ./workflow.aionis.md --emit diagnostics
```

Then:

1. fix errors first
2. rerun compile
3. inspect graph output
4. only then move to publish or recover

## Related

1. [Aionis Doc Syntax](/public/en/reference/11-aionis-doc-syntax)
2. [Aionis Doc Examples](/public/en/reference/15-aionis-doc-examples)
3. [Aionis Doc CLI Workflow](/public/en/reference/13-aionis-doc-cli-workflow)
4. [Aionis Doc Roadmap](/public/en/reference/17-aionis-doc-roadmap)
