# Aionis SDK Demo Route Registrars Spec

## Goal

Insert a demo-specific registrar layer between the public demo route bundle and the full runtime route registrars.

## Why

After extracting:

1. the demo route bundle
2. per-route dependency builders

the bundle still directly imported the full runtime route registrars. That kept the public demo bundle tied to deeper route implementation entrypoints.

## Scope

1. add `sdk-demo-memory-route-registrars.ts`
2. move direct calls to full route registrars there
3. keep `sdk-demo-memory-routes.ts` focused on demo route ordering only

## Non-Goals

1. no runtime behavior changes
2. no SDK/public contract changes
3. no bootstrap or host changes
