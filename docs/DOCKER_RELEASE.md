---
title: "Docker Release Runbook"
---

# Docker Release Runbook

Last updated: `2026-02-18`

## Scope

This runbook covers publishing the Aionis API image to GHCR.

- default image repo (script fallback): `ghcr.io/<owner>/aionis`
- current production repo example: `ghcr.io/cognary/aionis`
- source Dockerfile: `/Users/lucio/Desktop/Aionis/Dockerfile`
- publish workflow: `/Users/lucio/Desktop/Aionis/.github/workflows/docker-publish.yml`

## Prerequisites

1. `npm run build` passes.
2. Gate/health checks are green for the target release.
3. You have push permission to GHCR package namespace.
4. For local publish, set:
   - `GHCR_USERNAME` (or `GITHUB_ACTOR`)
   - `GHCR_TOKEN` (or `GITHUB_TOKEN`)
5. For GitHub Actions publish (recommended for stable automation), set repository/org secrets:
   - `GHCR_USERNAME`
   - `GHCR_TOKEN` (`write:packages` scope)

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
IMAGE_REPO=ghcr.io/<owner>/aionis \
TAG=v0.1.4 \
PLATFORMS=linux/amd64,linux/arm64 \
PUBLISH_LATEST=true \
npm run docker:publish:ghcr
```

## GitHub Actions publish

Trigger automatically by tag:

```bash
git tag docker-v0.1.4
git push origin docker-v0.1.4
```

Or manual `workflow_dispatch` in `Docker Publish` with:

1. `tag` (e.g. `v0.1.4`)
2. `image_repo` (optional override)
3. `platforms` (default `linux/amd64,linux/arm64`)
4. `publish_latest`
5. `dry_run`

Credential behavior in workflow:

1. If `GHCR_USERNAME` + `GHCR_TOKEN` secrets exist, workflow uses them (recommended).
2. Otherwise it falls back to `${{ github.actor }}` + `${{ secrets.GITHUB_TOKEN }}`.
3. If fallback hits `403 Forbidden` on push, configure the GHCR secrets above.

## Verification

```bash
docker pull ghcr.io/cognary/aionis:v0.1.4
docker run --rm -p 3001:3001 ghcr.io/cognary/aionis:v0.1.4
curl -fsS http://localhost:3001/health
```

## Rollback

1. Re-point deployment to previous known-good tag.
2. Keep immutable bad tag for audit; do not overwrite.
3. Publish fixed patch tag (e.g. `v0.1.2`).
