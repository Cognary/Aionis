# Aionis SDK Demo Runtime Profile

This slice creates the first real technical bridge between the public-repo retention plan and a future smaller public repository.

## What changed

1. Added a dedicated `sdk_demo` runtime profile.
2. Split full route registration from a smaller SDK demo route subset.
3. Added Lite app commands for the demo profile.
4. Updated quickstart/examples to prefer the demo profile.

## Why it matters

Before this step, the public repository still defaulted to starting the full runtime route surface.

After this step, the public path can already prefer a lighter profile while deeper runtime implementation continues moving toward the private repository.

## Verified route surface

The demo profile was validated against:

1. `sdk:example:workflow`
2. `sdk:example:tools-feedback`
3. `sdk:example:context-assemble`
4. `sdk:example:introspect`

That means the SDK public story now has a smaller concrete runtime profile, not just a future plan.
