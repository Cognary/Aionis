# Aionis Runtime Bootstrap Shared Spec

## Goal

Reduce duplicated runtime bootstrap code between the full Lite runtime and the `sdk_demo` runtime profile.

## Requirements

1. Keep the same runtime behavior for both entrypoints.
2. Move common bootstrap wiring into a shared helper.
3. Preserve route-level selection as the main difference between full and demo runtime modes.

## Non-Goals

1. Changing route behavior.
2. Changing runtime services.
3. Removing deep runtime dependencies from the public repository yet.
