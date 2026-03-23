# Aionis SDK Demo Runtime Adapters Spec

## Goal

Insert a demo-specific runtime adapter layer under the demo route services so the service layer no longer directly invokes full runtime route entrypoints.

## Why

After the previous slice, the demo route stack had:

1. route bundle
2. demo-specific registrars
3. demo-specific implementations
4. demo-specific services
5. route dependency builders

But the service layer still directly called the full runtime route entrypoints using the dependency builders.

## Scope

1. add `sdk-demo-memory-runtime-adapters.ts`
2. move direct full runtime route invocation there
3. keep demo services focused on demo service intent

## Non-Goals

1. no runtime behavior changes
2. no SDK/public contract changes
3. no host/bootstrap changes
