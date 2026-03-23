# Aionis SDK Demo Host Split Spec

## Goal

Move the `sdk_demo` route subset out of the full host registration module into its own module boundary.

## Requirements

1. `sdk_demo` route registration should live outside the full `http-host.ts`.
2. `sdk_demo` runtime entry should depend on the new demo host module directly.
3. Full runtime route registration behavior should remain unchanged.

## Non-Goals

1. Removing demo route dependencies from `src/`.
2. Changing SDK demo route behavior.
3. Changing full-runtime route behavior.
