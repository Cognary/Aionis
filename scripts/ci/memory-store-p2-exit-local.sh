#!/usr/bin/env bash
set -euo pipefail

echo "[p2-exit-local] lint"
npm run -s lint

echo "[p2-exit-local] ci probe unit tests"
npm run -s test:ci-probes

echo "[p2-exit-local] contract smoke"
npm run -s test:contract

echo "[p2-exit-local] ts sdk build + release checks"
npm run -s sdk:build
npm run -s sdk:release-check

echo "[p2-exit-local] python sdk compile + release checks"
npm run -s sdk:py:compile
npm run -s sdk:py:release-check

echo "[p2-exit-local] done"
echo "[p2-exit-local] next: verify remote workflows backend-parity-smoke / sdk-ci / core-production-gate are green."
