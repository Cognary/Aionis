# Aionis SDK Demo Route Implementations Spec

## Goal

Add a demo-specific implementation layer under the demo route registrars so registrars no longer call the full route entrypoints directly.

## Why

After the previous slice, the demo route stack had:

1. route bundle
2. demo-specific route registrars
3. route dependency builders

But the registrars still imported and called the full runtime route implementations directly.

## Scope

1. add `sdk-demo-memory-route-implementations.ts`
2. move direct calls to full route registrars there
3. keep demo registrars focused on demo route intent and ordering

## Non-Goals

1. no runtime behavior changes
2. no SDK/public contract changes
3. no host/bootstrap changes
