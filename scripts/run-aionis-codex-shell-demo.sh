#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${AIONIS_BASE_URL:-http://127.0.0.1:3011}"
SCOPE="${AIONIS_SCOPE:-codex-demo}"

cat "${ROOT_DIR}/examples/codex-cli-shell-run.json" \
  | AIONIS_BASE_URL="${BASE_URL}" AIONIS_SCOPE="${SCOPE}" npm --prefix "${ROOT_DIR}" run -s adapter:codex-shell
