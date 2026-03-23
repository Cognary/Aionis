# Aionis SDK Demo Route Args Adapter Spec

## Goal

Move the full-runtime to demo-runtime route-args adapter out of the demo host registrar so the host module only depends on the demo route contract.

## Why

The previous slice narrowed the demo registrar to `RegisterSdkDemoRoutesArgs`, but the same host file still owned:

1. the demo registrar
2. the full-to-demo adapter
3. the dependency on the full host route-args type

That still mixed public demo boundary code with full runtime adapter code.

## Scope

1. create a dedicated `http-host-sdk-demo-args.ts`
2. move `RegisterSdkDemoRoutesArgs` there
3. move `buildSdkDemoRouteArgs(...)` there
4. keep the demo host registrar only focused on demo registration

## Non-Goals

1. no route behavior changes
2. no runtime bootstrap changes
3. no SDK contract changes
