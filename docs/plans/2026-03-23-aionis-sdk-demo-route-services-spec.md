# Aionis SDK Demo Route Services Spec

## Goal

Add a demo-specific service layer under the demo route implementations so implementations no longer combine service wiring and implementation intent in one module.

## Why

After the previous slice, the demo route stack had:

1. route bundle
2. demo-specific registrars
3. demo-specific implementations
4. route dependency builders

But the implementation layer still directly called the full runtime route entrypoints using the dependency builders.

## Scope

1. add `sdk-demo-memory-route-services.ts`
2. move the direct service wiring there
3. keep demo implementations focused on demo operation intent

## Non-Goals

1. no runtime behavior changes
2. no SDK/public contract changes
3. no host/bootstrap changes
