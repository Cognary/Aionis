#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
node scripts/ci/sandbox-api-probes.mjs
