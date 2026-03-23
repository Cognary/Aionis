# Aionis SDK Demo Route Deps Spec

## Goal

Move per-route argument assembly out of the demo route bundle so the bundle only decides which demo routes to register.

## Why

After extracting the demo route bundle, `sdk-demo-memory-routes.ts` still owned all concrete route dependency assembly for:

1. memory write
2. memory access
3. memory context runtime
4. memory feedback tools
5. memory replay governed

That kept the bundle file larger and more coupled to the underlying route implementations than needed.

## Scope

1. add `sdk-demo-memory-route-deps.ts`
2. move each route arg assembly into dedicated builders
3. keep `sdk-demo-memory-routes.ts` as a thin registrar

## Non-Goals

1. no runtime behavior changes
2. no public SDK contract changes
3. no host/bootstrap changes
