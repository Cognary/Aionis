#!/usr/bin/env bash
set -euo pipefail

tests=()
while IFS= read -r test_path; do
  tests+=("${test_path}")
done < <(find scripts/ci -maxdepth 1 -name '*.test.mjs' ! -name 'lite-*.test.mjs' | sort)

npx tsx --test "${tests[@]}"
