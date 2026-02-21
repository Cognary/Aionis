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
PUBLISH_LATEST="${PUBLISH_LATEST:-true}"
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
    --no-latest)
      PUBLISH_LATEST=false
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
  else
    TAG="standalone-v0.0.0-$(git rev-parse --short HEAD)"
  fi
fi

if [[ "${TAG}" =~ ^v[0-9] ]]; then
  TAG="standalone-${TAG}"
fi
if [[ "${TAG}" =~ ^standalone-[0-9] ]]; then
  TAG="standalone-v${TAG#standalone-}"
fi
if [[ ! "${TAG}" =~ ^standalone-v[0-9] ]]; then
  echo "standalone tag must match standalone-vX.Y.Z (got: ${TAG})" >&2
  exit 1
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
  if ! docker buildx inspect >/dev/null 2>&1; then
    docker buildx create >/dev/null 2>&1 || true
  fi
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  if [[ "${has_buildx}" == "true" ]]; then
    dry_platform="${PLATFORMS%%,*}"
    echo "dry-run standalone build (buildx): ${IMAGE_REPO}:${TAG} platform=${dry_platform}"
    docker buildx build \
      --file Dockerfile.standalone \
      --platform "${dry_platform}" \
      -t "${IMAGE_REPO}:${TAG}" \
      --load \
      .
  else
    echo "dry-run standalone build (classic docker): ${IMAGE_REPO}:${TAG}"
    docker build -f Dockerfile.standalone -t "${IMAGE_REPO}:${TAG}" .
  fi
else
  tags=(-t "${IMAGE_REPO}:${TAG}")
  if [[ "${PUBLISH_LATEST}" == "true" ]]; then
    tags+=(-t "${IMAGE_REPO}:standalone-latest")
  fi

  if [[ "${has_buildx}" == "true" ]]; then
    echo "publish standalone image (buildx): ${IMAGE_REPO}:${TAG} platforms=${PLATFORMS} latest=${PUBLISH_LATEST}"
    docker buildx build \
      --file Dockerfile.standalone \
      --platform "${PLATFORMS}" \
      "${tags[@]}" \
      --push \
      .
  else
    single_platform="${PLATFORMS%%,*}"
    echo "publish standalone image (classic docker): ${IMAGE_REPO}:${TAG} platform=${single_platform} latest=${PUBLISH_LATEST}"
    echo "warning: docker buildx unavailable; publishing single-arch image only (${single_platform})."
    docker build -f Dockerfile.standalone "${tags[@]}" .
    docker push "${IMAGE_REPO}:${TAG}"
    if [[ "${PUBLISH_LATEST}" == "true" ]]; then
      docker push "${IMAGE_REPO}:standalone-latest"
    fi
  fi
fi

echo "docker-publish-standalone-ghcr: ok image=${IMAGE_REPO}:${TAG}"
