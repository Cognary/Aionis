# Aionis SDK Package Tests Spec

Date: 2026-03-23

## Goal

Add package-level tests for `@aionis/sdk` so the SDK has its own verification layer instead of relying only on runtime tests and example smoke coverage.

## Scope

Initial coverage:

1. client surface shape
2. route/path mapping
3. default HTTP method and header behavior
4. SDK error wrapping
5. typed contract smoke coverage

## Non-goals

This test slice should not:

1. duplicate the Lite runtime route contract suite
2. spin up full runtime state unless needed
3. validate benchmark behavior

## Result

After this change, the SDK package can be checked with a direct package test command before publish work continues.
