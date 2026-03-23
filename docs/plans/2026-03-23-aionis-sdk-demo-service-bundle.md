# Aionis SDK Demo Service Bundle

This slice makes the public demo runtime boundary more concrete by turning the runtime service dependency into an explicit bundle.

## What changed

1. Added a shared runtime bootstrap service type.
2. Added a dedicated `sdk_demo` service selector.
3. Updated shared bootstrap to operate on the selected service bundle.

## Why it matters

Before this step, `sdk_demo` still implicitly depended on the full runtime service shape.

After this step, the demo profile points at a named service bundle boundary. That makes the next extraction step easier: replacing the underlying service factory with a smaller public demo implementation later.
