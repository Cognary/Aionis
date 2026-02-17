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

has_match() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -n -- "$pattern" "$file" >/dev/null
  else
    grep -En -- "$pattern" "$file" >/dev/null
  fi
}

PKG_JSON="packages/sdk/package.json"
CHANGELOG="packages/sdk/CHANGELOG.md"
MATRIX="docs/SDK_COMPATIBILITY_MATRIX.md"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required." >&2
  exit 1
fi

version="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write((p&&p.version)||"");' "$PKG_JSON")"
if [[ -z "$version" ]]; then
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

if ! has_match "^## \\[$version\\]" "$CHANGELOG"; then
  echo "missing changelog entry for version $version in $CHANGELOG" >&2
  exit 1
fi

if ! has_match "$minor_x|$version" "$MATRIX"; then
  echo "missing compatibility matrix entry for $minor_x or $version in $MATRIX" >&2
  exit 1
fi

echo "sdk-release-check: ok"
echo "version=$version"
if [[ -n "$TAG" ]]; then
  echo "tag=$TAG"
fi
