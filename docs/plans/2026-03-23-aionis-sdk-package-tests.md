# Aionis SDK Package Tests

The SDK now has its own first package-level verification pass.

## What is covered

1. the v1 client exposes the intended nested surface
2. each module posts to the expected route
3. the HTTP transport preserves JSON request behavior and caller headers
4. failed responses become `AionisSdkHttpError`
5. the exported typed contracts are usable across the full v1 surface

## Why this matters

Before this step, SDK confidence mainly came from:

1. build success
2. examples
3. the runtime's own tests

That was useful, but not enough for package release work.

Now the SDK has a narrower verification layer that checks exactly the things a package consumer depends on, without re-running the whole runtime contract surface.
