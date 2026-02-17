#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="${2:-}"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

PKG_JSON="packages/sdk/package.json"
CHANGELOG="packages/sdk/CHANGELOG.md"
MATRIX="docs/SDK_COMPATIBILITY_MATRIX.md"

version="$(jq -r '.version' "$PKG_JSON")"
if [[ -z "$version" || "$version" == "null" ]]; then
  echo "invalid sdk version in $PKG_JSON" >&2
  exit 1
fi

if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "sdk version must be semver x.y.z, got: $version" >&2
  exit 1
fi

minor_x="${version%.*}.x"

if [[ -n "$TAG" ]]; then
  expected_tag="sdk-v${version}"
  if [[ "$TAG" != "$expected_tag" ]]; then
    echo "tag/version mismatch: tag=$TAG expected=$expected_tag" >&2
    exit 1
  fi
fi

if ! rg -n "^## \\[$version\\]" "$CHANGELOG" >/dev/null; then
  echo "missing changelog entry for version $version in $CHANGELOG" >&2
  exit 1
fi

if ! rg -n "$minor_x|$version" "$MATRIX" >/dev/null; then
  echo "missing compatibility matrix entry for $minor_x or $version in $MATRIX" >&2
  exit 1
fi

echo "sdk-release-check: ok"
echo "version=$version"
if [[ -n "$TAG" ]]; then
  echo "tag=$TAG"
fi
