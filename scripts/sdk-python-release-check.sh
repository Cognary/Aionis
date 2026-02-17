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

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required." >&2
  exit 1
fi

has_match() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -n -- "$pattern" "$file" >/dev/null
  else
    grep -En -- "$pattern" "$file" >/dev/null
  fi
}

PKG_TOML="packages/python-sdk/pyproject.toml"
CHANGELOG="packages/python-sdk/CHANGELOG.md"
MATRIX="docs/SDK_COMPATIBILITY_MATRIX.md"

version="$(python3 - <<'PY'
import re
from pathlib import Path
text = Path("packages/python-sdk/pyproject.toml").read_text(encoding="utf-8")
m = re.search(r'^\s*version\s*=\s*"([^"]+)"\s*$', text, re.MULTILINE)
print(m.group(1) if m else "")
PY
)"

if [[ -z "$version" ]]; then
  echo "invalid sdk version in $PKG_TOML" >&2
  exit 1
fi

if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "python sdk version must be semver x.y.z, got: $version" >&2
  exit 1
fi

minor_x="${version%.*}.x"

if [[ -n "$TAG" ]]; then
  expected_tag="py-sdk-v${version}"
  if [[ "$TAG" != "$expected_tag" ]]; then
    echo "tag/version mismatch: tag=$TAG expected=$expected_tag" >&2
    exit 1
  fi
fi

if ! has_match "^## \\[$version\\]" "$CHANGELOG"; then
  echo "missing changelog entry for version $version in $CHANGELOG" >&2
  exit 1
fi

if ! has_match "python|aionis-sdk|$minor_x|$version" "$MATRIX"; then
  echo "missing compatibility matrix entry for python sdk $minor_x or $version in $MATRIX" >&2
  exit 1
fi

echo "sdk-python-release-check: ok"
echo "version=$version"
if [[ -n "$TAG" ]]; then
  echo "tag=$TAG"
fi
