#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROFILES_DIR="${ROOT_DIR}/scripts/env/abstraction-profiles"
TARGET_ENV="${ROOT_DIR}/.env"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/env/apply-abstraction-policy-profile.sh <conservative|balanced|aggressive>

Behavior:
  - Creates .env from .env.example when .env is missing.
  - Replaces only the managed abstraction policy block in .env.
  - Leaves all other existing keys/secrets untouched.
EOF
}

PROFILE="${1:-}"
if [[ "${PROFILE}" == "-h" || "${PROFILE}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "${PROFILE}" ]]; then
  usage
  exit 1
fi

PROFILE_FILE="${PROFILES_DIR}/${PROFILE}.env"
if [[ ! -f "${PROFILE_FILE}" ]]; then
  echo "unknown profile: ${PROFILE} (expected conservative|balanced|aggressive)" >&2
  exit 1
fi

if [[ ! -f "${TARGET_ENV}" ]]; then
  cp "${ROOT_DIR}/.env.example" "${TARGET_ENV}"
fi

BEGIN_MARK="# >>> AIONIS ABSTRACTION POLICY PROFILE (managed) >>>"
END_MARK="# <<< AIONIS ABSTRACTION POLICY PROFILE (managed) <<<"

tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT

awk -v begin="${BEGIN_MARK}" -v end="${END_MARK}" '
  $0 == begin { skip = 1; next }
  $0 == end { skip = 0; next }
  skip != 1 { print }
' "${TARGET_ENV}" > "${tmp}"

cat "${tmp}" > "${TARGET_ENV}"

{
  echo
  echo "${BEGIN_MARK}"
  echo "# profile=${PROFILE}"
  cat "${PROFILE_FILE}"
  echo "${END_MARK}"
} >> "${TARGET_ENV}"

echo "applied abstraction policy profile: ${PROFILE}"
echo "target: ${TARGET_ENV}"
echo "managed keys:"
awk '
  /^[[:space:]]*#/ { next }
  /^[[:space:]]*$/ { next }
  {
    split($0, parts, "=");
    print "  - " parts[1];
  }
' "${PROFILE_FILE}"
