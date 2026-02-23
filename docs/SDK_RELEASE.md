---
title: "SDK Release Runbook"
---

# SDK Release Runbook

Last updated: `2026-02-22`

## Release prerequisites

1. TypeScript SDK version updated in `packages/sdk/package.json`.
2. Python SDK version updated in `packages/python-sdk/pyproject.toml`.
3. Matching changelog entries exist in:
   - `packages/sdk/CHANGELOG.md`
   - `packages/python-sdk/CHANGELOG.md`
4. Compatibility matrix updated in `docs/SDK_COMPATIBILITY_MATRIX.md`.
5. Local checks pass:

```bash
npm run sdk:build
npm run sdk:release-check
npm run sdk:pack-dry-run
npm run sdk:py:compile
npm run sdk:py:release-check
npm run sdk:smoke
npm run sdk:tools-feedback-smoke
npm run sdk:py:smoke
```

## CI workflows

1. `SDK CI` (`.github/workflows/sdk-ci.yml`)
   - runs on SDK-related PR/push changes
   - validates build/release-check/pack/docs
2. `SDK Publish` (`.github/workflows/sdk-publish.yml`) - TypeScript package
   - automatic publish on tag `sdk-v*`
   - manual trigger with optional `dry_run`
3. `Python SDK Publish` (`.github/workflows/sdk-py-publish.yml`) - Python package
   - automatic publish on tag `py-sdk-v*`
   - manual trigger with optional `dry_run`

## Publish path (recommended)

1. Bump version in `packages/sdk/package.json`.
2. Ensure changelog + matrix updated.
3. Commit and push.
4. Create TypeScript release tag:

```bash
git tag sdk-v<version>
git push origin sdk-v<version>
```

5. GitHub Action `SDK Publish` will run release checks and publish to npm.

## Python tag check

Python SDK release-check supports optional tag validation:

```bash
npm run sdk:py:release-check -- --tag py-sdk-v<version>
```

Python SDK build/publish local flow:

```bash
npm run sdk:py:build-dist
npm run sdk:py:publish:dry-run
# publish
npm run sdk:py:publish
```

## Manual dry-run via workflow

Use `workflow_dispatch` on `SDK Publish` with:

1. `tag`: optional (`sdk-v0.1.5`)
2. `dry_run`: `true`

## Secrets

Repository secret required:

1. `NPM_TOKEN`: npm automation token with publish rights for `@aionis/sdk`.
2. `PYPI_API_TOKEN`: PyPI token for publishing `aionis-sdk`.

## Failure handling

If publish job fails:

1. Check `sdk:release-check` output first (version/tag/changelog/matrix mismatch).
2. Re-run `npm run sdk:pack-dry-run` locally.
3. Fix and retag using a new version (do not reuse an already published version).
