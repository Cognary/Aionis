# Aionis SDK Demo Route Args

This slice tightens the `sdk_demo` boundary by moving it off the full route-args shape.

## What changed

1. Added a dedicated `RegisterSdkDemoRoutesArgs` type.
2. Added an explicit mapper from full runtime route args to demo route args.
3. Updated shared runtime bootstrap to accept a route-arg selector.

## Why it matters

Before this step, the demo runtime still consumed the same full route-arg surface as the full runtime.

After this step, the demo runtime explicitly asks for a smaller subset. That makes future extraction of a smaller public demo service bundle more straightforward.
