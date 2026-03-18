# Aionis Doc v0.1 Implementation Plan

**Goal:** Turn the current Aionis Doc spec into a minimal, testable compiler package that can parse directive blocks, normalize them into IR, validate obvious schema issues, resolve basic refs, and build a simple execution graph.

**Scope:** This phase is intentionally narrow. It does not attempt to implement full Markdown parsing, full JSON Schema validation, editor tooling, runtime execution, memory writeback, or rich policy enforcement. It should only prove that the format can move from author-facing text into deterministic compiler artifacts.

**v0.1 Deliverables**

- `packages/aionis-doc` TypeScript package
- line-aware scanner with source locations
- parser for headings, paragraphs, fenced code blocks, and line-leading directives
- relaxed payload parser for the Aionis object subset used in the spec examples
- AST to IR normalization for `@doc`, `@context`, `@plan`, `@execute`, `@decision`, `@evidence`, `@replay`, `@memory`, and `@state`
- lightweight validation diagnostics
- basic ref resolution for `doc.*`, `ctx.*`, `run.*`, `out.*`, and `mem.*`
- execution graph builder for `@execute` nodes and explicit data dependencies
- fixtures and a focused compiler smoke test

**Non-Goals**

- full CommonMark compliance
- YAML payload parsing
- namespaced directive plugins
- round-trip editing
- runtime scheduling or tool execution
- automatic evidence attachment

**Design Decisions**

- Directives are recognized only at line start outside fenced code blocks.
- Payloads use a small relaxed object grammar: quoted strings, JSON-like numbers, booleans, null, arrays, nested objects, unquoted keys, and optional commas between object fields.
- Object fields may be newline-delimited without commas because the current Aionis spec examples use that style.
- The compiler preserves malformed directives as AST nodes with diagnostics instead of aborting the whole file.
- Graph construction is conservative. A dependency edge is created only when an `input_ref` matches a previously declared `output_ref`, or when `depends_on` explicitly names a prior node or output ref.

**Acceptance Criteria**

1. Valid minimal and workflow fixtures compile into AST, IR, and graph objects without error diagnostics.
2. A malformed payload fixture produces an `INVALID_PAYLOAD` diagnostic without crashing compilation.
3. A fenced example fixture does not parse example directives inside the code fence as live directives.
4. An unresolved ref fixture produces an `UNRESOLVED_REF` diagnostic.
5. A duplicate `@doc` fixture produces a duplicate-doc diagnostic while still returning the first `@doc` in IR.

**Immediate Follow-Up After v0.1**

- freeze the normative payload grammar in the main spec
- add schema-driven directive validation
- define evidence attachment targets
- define module version pinning and side-effect rules for deterministic replay
