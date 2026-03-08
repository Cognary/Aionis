#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-http://127.0.0.1:3999}"
FAILURE_SCOPE="${FAILURE_SCOPE:-hosted_shadow_validator_failure_probe}"
API_KEY="${API_KEY:-${AIONIS_API_KEY:-dummy-dev-key}}"

output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

AIONIS_BASE_URL="$BASE_URL" \
AIONIS_API_KEY="$API_KEY" \
npm run -s job:hosted-automation-shadow-validator -- \
  --tenant-id default \
  --scope "$FAILURE_SCOPE" \
  --limit 1 \
  --interval-ms 250 \
  --max-runs 1 >"$output_file" 2>&1

cat "$output_file"

grep -q '"watch": true' "$output_file" || {
  echo 'expected hosted shadow validator to enter watch mode' >&2
  exit 1
}

grep -q '"ok": false' "$output_file" || {
  echo 'expected hosted shadow validator to emit a transient failure event' >&2
  exit 1
}

grep -q '"error": "fetch failed"' "$output_file" || {
  echo 'expected hosted shadow validator failure probe to surface fetch failure' >&2
  exit 1
}

echo
echo "ok: automation_hosted_shadow_validator_failure_probe completed"
