# Aionis SDK Demo Memory Feedback Tools

This slice is the second direct public shrink implementation against a residual runtime target.

Instead of keeping the full `memory-feedback-tools` route in the public demo path, `sdk_demo` now uses a demo-only feedback route that serves just:

1. tools selection
2. tools feedback

That matches the current SDK demo surface and removes unnecessary public dependence on broader rule, run, and pattern-management endpoints.
