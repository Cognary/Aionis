# Aionis SDK Demo Dependency Audit Spec

## Goal

Add an executable audit for the public `sdk_demo` stack so public shrink decisions can be made from an explicit dependency inventory instead of manual inspection.

## Why

The `sdk_demo` route stack is now layered, but public shrink still needs a clear answer to:

1. which imports are already demo-owned
2. which imports are acceptable shared boundaries
3. which imports still reach into deeper runtime implementation

Without an audit, shrink decisions stay heuristic.

## Scope

1. add `scripts/sdk-demo-dependency-audit.ts`
2. add root script `npm run sdk-demo:audit`
3. classify imports into:
   1. `demo_owned`
   2. `shared_boundary`
   3. `residual_runtime`

## Non-Goals

1. no runtime behavior changes
2. no public SDK contract changes
3. no automatic deletion of runtime code
