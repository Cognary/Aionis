# Aionis SDK Release Baseline

## What changed

Added a repository-level SDK release verification flow that:

1. builds `@aionis/sdk`
2. runs package-level SDK tests
3. packs the SDK from `packages/sdk`
4. installs the tarball into a clean temporary consumer
5. verifies the public SDK import surface

## Why it matters

Before this slice, SDK readiness was only validated through local source builds and in-repo examples. That was enough for development, but not enough for a real package release.

The new flow checks the release artifact itself and keeps all temporary install state outside the repository.

## Entry points

1. `npm run sdk:pack:dry-run`
2. `npm run sdk:release:check`

## External artifacts

The release-baseline flow writes its pack/install verification into `/tmp/aionis_sdk_release_baseline_*` unless an explicit `--workdir` is provided.
