#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need jq

MIN_PASS_RATE="${MIN_PASS_RATE:-0.8}"
MIN_EXECUTED="${MIN_EXECUTED:-3}"
SUMMARY_FILE="${SUMMARY_FILE:-}"

if [[ -z "${SUMMARY_FILE}" ]]; then
  SUMMARY_FILE="$(find "${ROOT_DIR}/artifacts/gtm/phase1_rehearsal" -mindepth 2 -maxdepth 2 -type f -name summary.json | sort | tail -n 1)"
fi

if [[ -z "${SUMMARY_FILE}" || ! -f "${SUMMARY_FILE}" ]]; then
  echo "No rehearsal summary found. Run: npm run gtm:phase1:rehearsal" >&2
  exit 2
fi

executed="$(jq -r '.executed // 0' "${SUMMARY_FILE}")"
pass_rate="$(jq -r '.pass_rate // 0' "${SUMMARY_FILE}")"

executed_ok=false
pass_rate_ok=false

if awk -v e="${executed}" -v m="${MIN_EXECUTED}" 'BEGIN{exit !(e>=m)}'; then
  executed_ok=true
fi
if awk -v p="${pass_rate}" -v m="${MIN_PASS_RATE}" 'BEGIN{exit !(p>=m)}'; then
  pass_rate_ok=true
fi

ok=false
if [[ "${executed_ok}" == "true" && "${pass_rate_ok}" == "true" ]]; then
  ok=true
fi

jq -n \
  --arg summary_file "${SUMMARY_FILE}" \
  --argjson min_executed "${MIN_EXECUTED}" \
  --argjson min_pass_rate "${MIN_PASS_RATE}" \
  --argjson executed "${executed}" \
  --arg pass_rate "${pass_rate}" \
  --argjson executed_ok "${executed_ok}" \
  --argjson pass_rate_ok "${pass_rate_ok}" \
  --argjson ok "${ok}" \
  '{
    ok: $ok,
    summary_file: $summary_file,
    threshold: {
      min_executed: $min_executed,
      min_pass_rate: $min_pass_rate
    },
    actual: {
      executed: $executed,
      pass_rate: ($pass_rate|tonumber)
    },
    checks: {
      executed_ok: $executed_ok,
      pass_rate_ok: $pass_rate_ok
    }
  }'

if [[ "${ok}" != "true" ]]; then
  exit 3
fi
