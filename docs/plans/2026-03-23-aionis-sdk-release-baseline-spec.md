# Aionis SDK Release Baseline Spec

## Goal

Add a first real release-baseline check for `@aionis/sdk` so SDK publish readiness is validated outside the repository, not inferred from local source imports.

## Requirements

1. Build the SDK package.
2. Run SDK package tests.
3. Pack the SDK from `packages/sdk`, not from the repository root.
4. Write tarball artifacts into an isolated temporary directory outside the repository.
5. Install the packed tarball into a clean temporary consumer workspace.
6. Run an import smoke check against the installed package.

## Non-Goals

1. Publish to npm.
2. Add runtime integration tests through the tarball consumer.
3. Add semantic-release or version automation.

## Acceptance

1. `npm run sdk:release:check` succeeds from the repository root.
2. The script writes an external summary artifact under `/tmp`.
3. The tarball install verifies the public SDK entrypoint and v1 module surface.
