#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need docker

IMAGE_REPO="${IMAGE_REPO:-}"
TAG="${TAG:-}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUBLISH_LATEST="${PUBLISH_LATEST:-false}"
DRY_RUN=false
NO_LOGIN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      IMAGE_REPO="${2:-}"
      shift 2
      ;;
    --tag)
      TAG="${2:-}"
      shift 2
      ;;
    --platforms)
      PLATFORMS="${2:-}"
      shift 2
      ;;
    --latest)
      PUBLISH_LATEST=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --no-login)
      NO_LOGIN=true
      shift
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${IMAGE_REPO}" ]]; then
  if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    IMAGE_REPO="ghcr.io/${GITHUB_REPOSITORY,,}"
  else
    echo "IMAGE_REPO is required (example: ghcr.io/<owner>/aionis)." >&2
    exit 1
  fi
fi

if [[ -z "${TAG}" ]]; then
  if git describe --tags --exact-match >/dev/null 2>&1; then
    TAG="$(git describe --tags --exact-match)"
    TAG="${TAG#docker-v}"
  else
    TAG="$(git rev-parse --short HEAD)"
  fi
fi

if [[ "${NO_LOGIN}" != "true" ]]; then
  token="${GHCR_TOKEN:-${GITHUB_TOKEN:-}}"
  user="${GHCR_USERNAME:-${GITHUB_ACTOR:-}}"
  if [[ -n "${token}" && -n "${user}" ]]; then
    echo "${token}" | docker login ghcr.io -u "${user}" --password-stdin >/dev/null
  else
    echo "skip login: GHCR_TOKEN/GITHUB_TOKEN or GHCR_USERNAME/GITHUB_ACTOR not set"
  fi
fi

has_buildx=false
if docker buildx version >/dev/null 2>&1; then
  has_buildx=true
fi

if [[ "${has_buildx}" == "true" ]]; then
  # Avoid hard dependency on --use for older Docker Desktop builds.
  if ! docker buildx inspect >/dev/null 2>&1; then
    docker buildx create >/dev/null 2>&1 || true
  fi
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  if [[ "${has_buildx}" == "true" ]]; then
    dry_platform="${PLATFORMS%%,*}"
    echo "dry-run build (buildx): ${IMAGE_REPO}:${TAG} platform=${dry_platform}"
    docker buildx build \
      --platform "${dry_platform}" \
      -t "${IMAGE_REPO}:${TAG}" \
      --load \
      .
  else
    echo "dry-run build (classic docker): ${IMAGE_REPO}:${TAG}"
    docker build -t "${IMAGE_REPO}:${TAG}" .
  fi
else
  tags=(-t "${IMAGE_REPO}:${TAG}")
  if [[ "${PUBLISH_LATEST}" == "true" ]]; then
    tags+=(-t "${IMAGE_REPO}:latest")
  fi
  if [[ "${has_buildx}" == "true" ]]; then
    echo "publish image (buildx): ${IMAGE_REPO}:${TAG} platforms=${PLATFORMS} latest=${PUBLISH_LATEST}"
    docker buildx build \
      --platform "${PLATFORMS}" \
      "${tags[@]}" \
      --push \
      .
  else
    single_platform="${PLATFORMS%%,*}"
    echo "publish image (classic docker): ${IMAGE_REPO}:${TAG} platform=${single_platform} latest=${PUBLISH_LATEST}"
    echo "warning: docker buildx unavailable; publishing single-arch image only (${single_platform})."
    docker build "${tags[@]}" .
    docker push "${IMAGE_REPO}:${TAG}"
    if [[ "${PUBLISH_LATEST}" == "true" ]]; then
      docker push "${IMAGE_REPO}:latest"
    fi
  fi
fi

echo "docker-publish-ghcr: ok image=${IMAGE_REPO}:${TAG}"
