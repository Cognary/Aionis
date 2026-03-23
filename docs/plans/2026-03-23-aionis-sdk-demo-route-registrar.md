# Aionis SDK Demo Route Registrar

This slice completes the route registration boundary for the public `sdk_demo` profile.

Before this change:

1. `sdk_demo` already had its own host module
2. `sdk_demo` already had its own narrowed route args type
3. but `registerSdkDemoRoutes(...)` still accepted the full `RegisterApplicationRoutesArgs`

After this change:

1. the demo registrar accepts `RegisterSdkDemoRoutesArgs` directly
2. the full-to-demo adaptation remains isolated in `buildSdkDemoRouteArgs(...)`
3. the exported demo host surface now matches the actual dependency set

This matters because public shrink work becomes easier when each outward-facing demo entrypoint only consumes the minimum explicit shape it actually needs.
