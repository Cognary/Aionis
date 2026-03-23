# Aionis SDK Demo Memory Access

This slice is the first direct public shrink implementation against a residual runtime target.

Instead of keeping the full `memory-access` route in the public demo path, `sdk_demo` now uses a demo-only access route that serves just:

1. execution introspection
2. anchor payload rehydration

That matches the current SDK demo surface and removes unnecessary public dependence on sessions, packs, find, and resolve functionality.
