---
title: "API Contract"
description: "Understand the Aionis external contract through endpoint groups, durable identifiers, edition boundaries, and typed failures."
---

# API Contract

This page is the external contract view of Aionis.

It is written for developers who need to know whether the product surface is stable enough to integrate, log, and operate.

## Contract Principles

The current repository already shows four contract choices that matter externally:

1. request and response DTOs are explicit and typed
2. responses are bounded by default instead of returning unlimited debug payloads
3. replay and policy flows expose durable identifiers such as `request_id`, `run_id`, `decision_id`, and `commit_uri`
4. capability differences are surfaced deliberately instead of hidden behind vague runtime errors

## Core Endpoint Groups

The public surface is easiest to understand in five groups:

1. memory: `write`, `recall`, `recall_text`, `find`, `resolve`
2. context: `planning/context`, `context/assemble`
3. handoff: `handoff/store`, `handoff/recover`
4. policy: `rules/evaluate`, `tools/select`, `tools/decision`, `tools/run`, `tools/feedback`
5. replay: run lifecycle plus replay playbooks such as `compile_from_run`, `run`, `repair`, `repair/review`, and `dispatch`

## Identity, Isolation, and Auth

The isolation boundary is `(tenant_id, scope)`.

That matters because Aionis is not designed as a single global memory bucket.

Current contract surfaces support:

1. `tenant_id` in request body or header
2. scoped execution and retrieval
3. API key and bearer-token auth modes
4. owner-sensitive visibility for private-lane memory

## The IDs You Should Actually Persist

If you only keep one set of tracing fields, keep these:

1. `request_id`
2. `tenant_id`
3. `scope`
4. `run_id`
5. `decision_id` or `decision_uri`
6. `commit_id` or `commit_uri`

These are the fields that let you move from "something happened" to "show me the exact decision or write that caused it."

## Summary-First Contract

One practical strength of the current API is that several surfaces now return compact summaries before you need to inspect the full payload.

Examples:

1. `planning/context` returns `planning_summary`
2. `context/assemble` returns `assembly_summary`
3. `tools/select` returns `selection_summary`
4. `tools/decision` returns `lifecycle_summary`

That is useful externally because most clients want fast inspection and safe logging before deep payload parsing.

## Capability and Edition Boundaries

The contract is intentionally explicit when a capability or edition boundary is hit.

For example:

1. Lite declares a route matrix in `/health`
2. server-only control-plane routes return typed `501` behavior in Lite
3. capability-gated features expose bounded fallback signals instead of silent behavior changes

## Error Semantics

The external contract is not just request and response DTOs.

It also includes:

1. typed `400` failures for malformed requests and contract misuse
2. typed `404` failures for scope/object lookup misses
3. typed `429` failures for rate limit and quota boundaries
4. typed `501` failures for edition and capability boundaries

See:

1. [Common Errors](./common-errors)

## Integration Checklist

Before calling your integration production-ready, you should validate:

1. `write -> recall_text -> resolve`
2. `planning/context` or `context/assemble` for your actual runtime
3. one persisted `tools/select -> tools/decision` path
4. one handoff path if your work crosses sessions or runtimes
5. one replay path if your workflow has deterministic reuse potential

## Accuracy Status

This reference now separates:

1. `live-verified` endpoint pages
2. `code-backed` but not yet live-verified pages
3. public benchmark-backed claims

See:

1. [Endpoint Reference](./endpoints)
2. [Common Errors](./common-errors)
3. [Verified Test Data](./verified-test-data)
4. [Verification Status](./verification-status)

## Primary Code Grounding

This page is grounded in:

1. `src/memory/schemas.ts`
2. `src/routes/memory-write.ts`
3. `src/routes/memory-recall.ts`
4. `src/routes/memory-context-runtime.ts`
5. `src/routes/handoff.ts`
6. `src/routes/memory-feedback-tools.ts`
7. `src/routes/memory-replay-core.ts`
8. `src/routes/memory-replay-governed.ts`
9. `src/host/http-host.ts`
