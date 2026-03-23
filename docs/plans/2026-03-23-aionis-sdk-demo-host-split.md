# Aionis SDK Demo Host Split

This slice makes the public demo runtime boundary more concrete by moving the `sdk_demo` route registrar out of the full host module.

## What changed

1. Added a dedicated demo host module.
2. Moved `registerSdkDemoRoutes(...)` into that module.
3. Kept the full runtime host module focused on the full route surface.

## Why it matters

The public repository cannot shrink cleanly if the demo profile still lives as an incidental branch inside the full host registration file.

This split makes the demo profile a clearer code boundary and gives later extraction work a smaller target.
