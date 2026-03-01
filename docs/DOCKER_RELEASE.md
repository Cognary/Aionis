---
title: "Docker Release Runbook"
---

# Docker Release Runbook

Last updated: `2026-02-28`

## Scope

This runbook covers two independent GHCR publish lanes:

1. Main API image
- tag format: `vX.Y.Z`
- moving tag: `latest`
- source Dockerfile: `Dockerfile`
- workflow: `.github/workflows/docker-publish.yml`

2. Standalone image
- tag format: `standalone-vX.Y.Z`
- moving tag: `standalone-latest`
- source Dockerfile: `Dockerfile.standalone`
- workflow: `.github/workflows/docker-standalone-publish.yml`

Default image repo: `ghcr.io/<owner>/aionis`
Production repo example: `ghcr.io/cognary/aionis`

## Prerequisites

1. `npm run build` passes.
2. Core gate/health checks are green for target release.
3. You have GHCR push permission.
4. For local publish, set credentials:
- `GHCR_USERNAME` (or `GITHUB_ACTOR`)
- `GHCR_TOKEN` (or `GITHUB_TOKEN`)
5. For Actions publish, set repository/org secrets:
- `GHCR_USERNAME`
- `GHCR_TOKEN` (`write:packages` scope)

## Local publish commands

Main image dry run:

```bash
npm run docker:publish:ghcr:dry-run
```

Standalone image dry run:

```bash
TAG=standalone-v0.2.1 npm run docker:publish:standalone:ghcr:dry-run
```

Main image push:

```bash
export GHCR_USERNAME=<your_github_user>
export GHCR_TOKEN=<your_ghcr_token>
IMAGE_REPO=ghcr.io/<owner>/aionis \
TAG=v0.2.1 \
PLATFORMS=linux/amd64,linux/arm64 \
PUBLISH_LATEST=true \
npm run docker:publish:ghcr
```

Standalone image push:

```bash
export GHCR_USERNAME=<your_github_user>
export GHCR_TOKEN=<your_ghcr_token>
IMAGE_REPO=ghcr.io/<owner>/aionis \
TAG=standalone-v0.2.1 \
PLATFORMS=linux/amd64,linux/arm64 \
PUBLISH_LATEST=true \
npm run docker:publish:standalone:ghcr
```

## GitHub Actions publish

Main lane auto trigger:

```bash
git tag docker-v0.2.1
git push origin docker-v0.2.1
```

Standalone lane auto trigger:

```bash
git tag standalone-v0.2.1
git push origin standalone-v0.2.1
```

You can also run each workflow via `workflow_dispatch`.

Credential behavior in both workflows:

1. Prefer `GHCR_USERNAME` + `GHCR_TOKEN` secrets.
2. Fallback to `$\\{\\{ github.actor \\}\\}` + `$\\{\\{ secrets.GITHUB_TOKEN \\}\\}`.
3. If fallback gets `403 Forbidden`, configure GHCR secrets explicitly.

## Verification

Main image:

```bash
docker pull ghcr.io/cognary/aionis:v0.2.1
docker pull ghcr.io/cognary/aionis:latest
docker manifest inspect ghcr.io/cognary/aionis:v0.2.1 | head
```

Standalone image:

```bash
docker pull ghcr.io/cognary/aionis:standalone-v0.2.1
docker pull ghcr.io/cognary/aionis:standalone-latest
docker manifest inspect ghcr.io/cognary/aionis:standalone-v0.2.1 | head
```

## Rollback

1. Re-point deployments to prior known-good immutable tag.
2. Keep bad tag for audit; do not overwrite immutable versions.
3. Publish patch version tag and move only floating tags (`latest` or `standalone-latest`).
