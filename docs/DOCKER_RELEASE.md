# Docker Release Runbook

Last updated: `2026-02-17`

## Scope

This runbook covers publishing the Aionis API image to GHCR.

- default image repo: `ghcr.io/<owner>/aionis-memory-graph`
- source Dockerfile: `/Users/lucio/Desktop/Aionis/Dockerfile`
- publish workflow: `/Users/lucio/Desktop/Aionis/.github/workflows/docker-publish.yml`

## Prerequisites

1. `npm run build` passes.
2. Gate/health checks are green for the target release.
3. You have push permission to GHCR package namespace.
4. For local publish, set:
   - `GHCR_USERNAME` (or `GITHUB_ACTOR`)
   - `GHCR_TOKEN` (or `GITHUB_TOKEN`)

## Local build + push

Dry-run local build (single platform, no push):

```bash
cd /Users/lucio/Desktop/Aionis
npm run docker:publish:ghcr:dry-run
```

Publish multi-arch image:

```bash
cd /Users/lucio/Desktop/Aionis
export GHCR_USERNAME=<your_github_user>
export GHCR_TOKEN=<your_ghcr_token>
IMAGE_REPO=ghcr.io/<owner>/aionis-memory-graph \
TAG=0.1.0 \
PLATFORMS=linux/amd64,linux/arm64 \
PUBLISH_LATEST=true \
npm run docker:publish:ghcr
```

## GitHub Actions publish

Trigger automatically by tag:

```bash
git tag docker-v0.1.0
git push origin docker-v0.1.0
```

Or manual `workflow_dispatch` in `Docker Publish` with:

1. `tag` (e.g. `0.1.0`)
2. `image_repo` (optional override)
3. `platforms` (default `linux/amd64,linux/arm64`)
4. `publish_latest`
5. `dry_run`

## Verification

```bash
docker pull ghcr.io/<owner>/aionis-memory-graph:0.1.0
docker run --rm -p 3001:3001 ghcr.io/<owner>/aionis-memory-graph:0.1.0
curl -fsS http://localhost:3001/health
```

## Rollback

1. Re-point deployment to previous known-good tag.
2. Keep immutable bad tag for audit; do not overwrite.
3. Publish fixed patch tag (e.g. `0.1.1`).
