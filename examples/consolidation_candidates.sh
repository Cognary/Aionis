#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

LIMIT="${1:-50}"

npm run -s job:consolidation-candidates -- --max-pairs "$LIMIT" \
| jq '{
  ok,
  scope,
  kind,
  thresholds,
  scanned,
  suggested,
  top3: (.suggestions | .[0:3] | map({
    pair_key,
    score,
    vector_similarity,
    lexical_similarity,
    canonical_id,
    duplicate_id
  }))
}'

