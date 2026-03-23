# Aionis SDK Demo Memory Replay Governed

This slice is the third direct public shrink implementation against a residual runtime target.

Instead of keeping the full `memory-replay-governed` route in the public demo path, `sdk_demo` now uses a demo-only replay route that serves just:

1. replay repair review

That matches the current SDK replay demo surface and removes unnecessary public dependence on replay run and dispatch endpoints.
