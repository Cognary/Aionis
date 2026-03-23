# Aionis SDK Demo Route Registrar Spec

## Goal

Make the public `sdk_demo` host accept only the narrowed demo route-args surface instead of still advertising the full runtime route-args type.

## Why

The previous slice narrowed:

1. demo host registration into its own file
2. demo route args into `RegisterSdkDemoRoutesArgs`

But the exported registrar still accepted `RegisterApplicationRoutesArgs`, which left the external type boundary wider than the real dependency set.

## Scope

1. change `registerSdkDemoRoutes(...)` to accept `RegisterSdkDemoRoutesArgs`
2. keep `buildSdkDemoRouteArgs(...)` as the adapter from full runtime args into demo args
3. preserve current runtime behavior

## Non-Goals

1. no route behavior changes
2. no service bundle changes
3. no public SDK contract changes
