#!/usr/bin/env bash
set -euo pipefail

cmd="$(basename "$0")"
cat >&2 <<MSG
[hosted_feature_moved] ${cmd}
This hosted script moved to private repository:
  https://github.com/Cognary/aionis-hosted
Run it from the private repo with hosted secrets/env.
MSG
exit 1
