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

PKG_JSON="packages/aionis-doc/package.json"
README_FILE="packages/aionis-doc/README.md"
CHANGELOG_FILE="packages/aionis-doc/CHANGELOG.md"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required." >&2
  exit 1
fi

version="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write((p&&p.version)||"");' "$PKG_JSON")"
if [[ -z "$version" ]]; then
  echo "invalid aionis doc version in $PKG_JSON" >&2
  exit 1
fi

if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "aionis doc version must be semver x.y.z, got: $version" >&2
  exit 1
fi

if [[ -n "$TAG" ]]; then
  expected_tag="doc-v${version}"
  if [[ "$TAG" != "$expected_tag" ]]; then
    echo "tag/version mismatch: tag=$TAG expected=$expected_tag" >&2
    exit 1
  fi
fi

for required_file in "$README_FILE" "$CHANGELOG_FILE"; do
  if [[ ! -f "$required_file" ]]; then
    echo "missing required release file: $required_file" >&2
    exit 1
  fi
done

if ! has_match "^## \\[$version\\]" "$CHANGELOG_FILE"; then
  echo "missing changelog entry for version $version in $CHANGELOG_FILE" >&2
  exit 1
fi

if ! has_match "@aionis/doc" "$README_FILE"; then
  echo "missing package name reference in $README_FILE" >&2
  exit 1
fi

if ! has_match "npm i @aionis/doc@$version|npm install @aionis/doc@$version" "$README_FILE"; then
  echo "missing install example for version $version in $README_FILE" >&2
  exit 1
fi

node <<'EOF'
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("packages/aionis-doc/package.json", "utf8"));

const requiredBins = [
  "compile-aionis-doc",
  "execute-aionis-doc",
  "build-aionis-doc-runtime-handoff",
  "build-aionis-doc-handoff-store-request",
  "publish-aionis-doc-handoff",
  "recover-aionis-doc-handoff",
];

if (pkg.publishConfig?.access !== "public") {
  throw new Error("packages/aionis-doc/package.json must set publishConfig.access=public");
}

for (const file of ["dist", "README.md", "CHANGELOG.md"]) {
  if (!Array.isArray(pkg.files) || !pkg.files.includes(file)) {
    throw new Error(`packages/aionis-doc/package.json must include '${file}' in files`);
  }
}

for (const binName of requiredBins) {
  if (!pkg.bin || typeof pkg.bin[binName] !== "string" || pkg.bin[binName].length === 0) {
    throw new Error(`packages/aionis-doc/package.json missing bin entry for ${binName}`);
  }
}
EOF

echo "aionis-doc-release-check: ok"
echo "version=$version"
if [[ -n "$TAG" ]]; then
  echo "tag=$TAG"
fi
