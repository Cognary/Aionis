# Aionis SDK Demo Service Bundle Spec

## Goal

Make the `sdk_demo` runtime profile depend on an explicit runtime service bundle boundary instead of the raw full-runtime service return shape.

## Requirements

1. Define a reusable runtime bootstrap service type.
2. Add a dedicated demo service selector.
3. Update shared runtime bootstrap to accept a service selector.

## Non-Goals

1. Removing demo dependencies from the full service factory yet.
2. Changing runtime behavior.
3. Introducing a new service construction implementation.
