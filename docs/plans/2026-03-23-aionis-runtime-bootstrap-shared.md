# Aionis Runtime Bootstrap Shared

This slice removes the duplicated runtime bootstrap chain between the full Lite runtime and the `sdk_demo` profile.

## What changed

1. Added a shared runtime bootstrap entry helper.
2. Moved common service/guard/bootstrap assembly into one place.
3. Kept the route registrar as the only moving part between:
   - full runtime
   - SDK demo runtime

## Why it matters

The public-repo shrink work now needs to keep pulling the demo/runtime path away from the full runtime path.

That work gets much safer once the shared startup path is centralized and the route selection becomes the explicit variable.
