#!/usr/bin/env bash
set -euo pipefail

cmd="$(basename "$0")"
cat >&2 <<MSG
[hosted_feature_moved] ${cmd}
This hosted script is maintained outside this repository.
Run it from your internal hosted operations repository with the required secrets/env.
MSG
exit 1
