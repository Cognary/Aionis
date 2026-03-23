# Aionis SDK Demo Route Bundle Spec

## Goal

Move the `sdk_demo` route implementation bundle out of the demo host file so the host only composes demo-only route modules.

## Why

The previous slices narrowed:

1. demo route args
2. demo service bundle
3. demo registrar surface
4. full-to-demo route arg adaptation

But `http-host-sdk-demo.ts` still directly imported and wired all route implementation modules.

## Scope

1. create a dedicated `sdk-demo-memory-routes.ts`
2. move demo memory route registration there
3. keep `http-host-sdk-demo.ts` focused on profile composition

## Non-Goals

1. no route behavior changes
2. no SDK contract changes
3. no runtime bootstrap changes
