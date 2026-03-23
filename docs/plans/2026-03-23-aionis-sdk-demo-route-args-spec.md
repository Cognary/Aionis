# Aionis SDK Demo Route Args Spec

## Goal

Reduce the `sdk_demo` runtime profile dependency on the full route-registration argument surface.

## Requirements

1. Define a narrower route-args type for the demo profile.
2. Add a mapper from full route args to demo route args.
3. Keep full runtime route registration unchanged.

## Non-Goals

1. Changing demo route behavior.
2. Removing remaining runtime service dependencies.
3. Rewriting route registration around a new shared abstraction layer.
