#!/bin/zsh
set -euo pipefail

cd /Users/lucio/Desktop/Aionis

# Ensure env vars are available to the process (launchd does not load shell rc files).
set -a
source .env
set +a

if [[ ! -f dist/index.js ]]; then
  npm run -s build
fi

exec node dist/index.js

