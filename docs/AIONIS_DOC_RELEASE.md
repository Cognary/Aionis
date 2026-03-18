---
title: "Aionis Doc Release Runbook"
---

# Aionis Doc Release Runbook

Last updated: `2026-03-18`

## Release prerequisites

1. Version updated in [package.json](/Users/lucio/Desktop/Aionis/packages/aionis-doc/package.json).
2. Matching changelog entry exists in [CHANGELOG.md](/Users/lucio/Desktop/Aionis/packages/aionis-doc/CHANGELOG.md).
3. Package documentation updated in [README.md](/Users/lucio/Desktop/Aionis/packages/aionis-doc/README.md).
4. Local checks pass:

```bash
npm run aionis-doc:build
npm run aionis-doc:test
npm run aionis-doc:cli:test
npm run aionis-doc:handoff:cli:test
npm run aionis-doc:store-request:cli:test
npm run aionis-doc:publish:cli:test
npm run aionis-doc:recover:cli:test
npm run aionis-doc:release-check
npm run aionis-doc:pack-dry-run
```

## CI workflows

1. `Aionis Doc CI` (`.github/workflows/aionis-doc-ci.yml`)
   - runs on Aionis Doc-related PR and push changes
   - validates build, tests, release-check, pack dry-run, and docs check
2. `Aionis Doc Publish` (`.github/workflows/aionis-doc-publish.yml`)
   - automatic publish on tag `doc-v*`
   - manual trigger with optional `dry_run`

## Publish path

1. Bump version in [package.json](/Users/lucio/Desktop/Aionis/packages/aionis-doc/package.json).
2. Update [CHANGELOG.md](/Users/lucio/Desktop/Aionis/packages/aionis-doc/CHANGELOG.md) and [README.md](/Users/lucio/Desktop/Aionis/packages/aionis-doc/README.md).
3. Commit and push.
4. Create release tag:

```bash
git tag doc-v<version>
git push origin doc-v<version>
```

5. GitHub Action `Aionis Doc Publish` will run release checks and publish to npm.

## Manual local publish flow

```bash
npm run aionis-doc:release-check
npm run aionis-doc:pack-dry-run
npm run aionis-doc:publish:dry-run
# publish
npm run aionis-doc:publish
```

## Manual workflow dry-run

Use `workflow_dispatch` on `Aionis Doc Publish` with:

1. `tag`: optional (`doc-v0.2.20`)
2. `dry_run`: `true`

## Secrets

Repository secret required:

1. `NPM_TOKEN`: npm automation token with publish rights for `@aionis/doc`

## Failure handling

If publish fails:

1. Check `aionis-doc:release-check` output first.
2. Re-run `npm run aionis-doc:pack-dry-run` locally.
3. Fix and retag using a new version. Do not reuse an already published version.
