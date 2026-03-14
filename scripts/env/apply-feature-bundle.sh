#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLES_DIR="${ROOT_DIR}/scripts/env/feature-bundles"
TARGET_ENV="${ROOT_DIR}/.env"
BEGIN_MARK="# >>> AIONIS FEATURE BUNDLE (managed) >>>"
END_MARK="# <<< AIONIS FEATURE BUNDLE (managed) <<<"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/env/apply-feature-bundle.sh <local_safe|experimental|team_shared|high_risk>
  bash scripts/env/apply-feature-bundle.sh --dry-run <local_safe|experimental|team_shared|high_risk>
  bash scripts/env/apply-feature-bundle.sh --backup <local_safe|experimental|team_shared|high_risk>
  bash scripts/env/apply-feature-bundle.sh list
  bash scripts/env/apply-feature-bundle.sh status
  bash scripts/env/apply-feature-bundle.sh status --verbose
  bash scripts/env/apply-feature-bundle.sh diff <local_safe|experimental|team_shared|high_risk>
  bash scripts/env/apply-feature-bundle.sh plan <local_safe|experimental|team_shared|high_risk>

Behavior:
  - Creates .env from .env.example when .env is missing.
  - Replaces only the managed feature bundle block in .env.
  - Leaves all other existing keys/secrets untouched.
EOF
}

emit_bundle_block() {
  local bundle="$1"
  local bundle_file="$2"
  echo "${BEGIN_MARK}"
  echo "# bundle=${bundle}"
  cat "${bundle_file}"
  echo "${END_MARK}"
}

create_backup() {
  if [[ ! -f "${TARGET_ENV}" ]]; then
    return 0
  fi

  local timestamp backup_path counter
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  backup_path="${TARGET_ENV}.bundle-backup.${timestamp}"
  counter=0
  while [[ -e "${backup_path}" ]]; do
    counter=$((counter + 1))
    backup_path="${TARGET_ENV}.bundle-backup.${timestamp}.${counter}"
  done
  cp "${TARGET_ENV}" "${backup_path}"
  printf '%s\n' "${backup_path}"
}

list_bundles() {
  find "${BUNDLES_DIR}" -maxdepth 1 -type f -name '*.env' -print \
    | sed 's#.*/##' \
    | sed 's#\.env$##' \
    | sort
}

extract_managed_lines() {
  if [[ ! -f "${TARGET_ENV}" ]]; then
    return 0
  fi
  awk -v begin="${BEGIN_MARK}" -v end="${END_MARK}" '
    $0 == begin { in_block = 1; next }
    $0 == end { in_block = 0; next }
    in_block != 1 { next }
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    { print }
  ' "${TARGET_ENV}"
}

extract_bundle_lines() {
  local bundle_file="$1"
  awk '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    { print }
  ' "${bundle_file}"
}

print_status() {
  local verbose="${1:-false}"
  if [[ ! -f "${TARGET_ENV}" ]]; then
    echo "target: ${TARGET_ENV}"
    echo "status: no .env file"
    return 0
  fi

  local current=""
  local managed_keys=""
  current="$(
    awk -v begin="${BEGIN_MARK}" -v end="${END_MARK}" '
      $0 == begin { in_block = 1; next }
      $0 == end { in_block = 0; next }
      in_block == 1 && $0 ~ /^# bundle=/ {
        sub(/^# bundle=/, "", $0);
        print $0;
        exit 0;
      }
    ' "${TARGET_ENV}"
  )"
  managed_keys="$(extract_managed_lines | awk '{ split($0, parts, "="); print parts[1]; }')"

  echo "target: ${TARGET_ENV}"
  if [[ -n "${current}" ]]; then
    echo "status: managed bundle block present"
    echo "bundle: ${current}"
    if [[ "${verbose}" == "true" ]]; then
      if [[ -n "${managed_keys}" ]]; then
        echo "managed keys:"
        while IFS= read -r key; do
          [[ -z "${key}" ]] && continue
          echo "  - ${key}"
        done <<< "${managed_keys}"
      else
        echo "managed keys: none"
      fi
    fi
  else
    echo "status: no managed feature bundle block"
  fi
}

print_diff() {
  local bundle="$1"
  local bundle_file="${BUNDLES_DIR}/${bundle}.env"
  local current_tmp target_tmp current_keys_tmp target_keys_tmp
  local added_keys_tmp changed_keys_tmp removed_keys_tmp
  local key current_value target_value

  current_tmp="$(mktemp)"
  target_tmp="$(mktemp)"
  current_keys_tmp="$(mktemp)"
  target_keys_tmp="$(mktemp)"
  added_keys_tmp="$(mktemp)"
  changed_keys_tmp="$(mktemp)"
  removed_keys_tmp="$(mktemp)"

  extract_managed_lines > "${current_tmp}"
  extract_bundle_lines "${bundle_file}" > "${target_tmp}"

  awk -F= 'NF > 0 { print $1 }' "${current_tmp}" | sort > "${current_keys_tmp}"
  awk -F= 'NF > 0 { print $1 }' "${target_tmp}" | sort > "${target_keys_tmp}"
  comm -23 "${target_keys_tmp}" "${current_keys_tmp}" > "${added_keys_tmp}"
  comm -13 "${target_keys_tmp}" "${current_keys_tmp}" > "${removed_keys_tmp}"
  : > "${changed_keys_tmp}"
  while IFS= read -r key; do
    [[ -z "${key}" ]] && continue
    current_value="$(awk -F= -v target_key="${key}" '$1 == target_key { sub(/^[^=]*=/, "", $0); print; exit 0 }' "${current_tmp}")"
    target_value="$(awk -F= -v target_key="${key}" '$1 == target_key { sub(/^[^=]*=/, "", $0); print; exit 0 }' "${target_tmp}")"
    if [[ "${current_value}" != "${target_value}" ]]; then
      printf '%s\n' "${key}" >> "${changed_keys_tmp}"
    fi
  done < <(comm -12 "${target_keys_tmp}" "${current_keys_tmp}")

  echo "target: ${TARGET_ENV}"
  echo "bundle: ${bundle}"
  echo "current managed bundle block: $(if [[ -s "${current_tmp}" ]]; then echo present; else echo absent; fi)"
  echo
  echo "added:"
  if [[ ! -s "${added_keys_tmp}" ]]; then
    echo "  (none)"
  else
    while IFS= read -r key; do
      [[ -z "${key}" ]] && continue
      awk -F= -v target_key="${key}" '$1 == target_key { print "  - " $0; exit 0 }' "${target_tmp}"
    done < "${added_keys_tmp}"
  fi

  echo
  echo "changed:"
  if [[ ! -s "${changed_keys_tmp}" ]]; then
    echo "  (none)"
  else
    while IFS= read -r key; do
      [[ -z "${key}" ]] && continue
      current_value="$(awk -F= -v target_key="${key}" '$1 == target_key { sub(/^[^=]*=/, "", $0); print; exit 0 }' "${current_tmp}")"
      target_value="$(awk -F= -v target_key="${key}" '$1 == target_key { sub(/^[^=]*=/, "", $0); print; exit 0 }' "${target_tmp}")"
      echo "  - ${key}"
      echo "    current: ${current_value}"
      echo "    target:  ${target_value}"
    done < "${changed_keys_tmp}"
  fi

  echo
  echo "removed:"
  if [[ ! -s "${removed_keys_tmp}" ]]; then
    echo "  (none)"
  else
    while IFS= read -r key; do
      [[ -z "${key}" ]] && continue
      awk -F= -v target_key="${key}" '$1 == target_key { print "  - " $0; exit 0 }' "${current_tmp}"
    done < "${removed_keys_tmp}"
  fi

  rm -f \
    "${current_tmp}" \
    "${target_tmp}" \
    "${current_keys_tmp}" \
    "${target_keys_tmp}" \
    "${added_keys_tmp}" \
    "${changed_keys_tmp}" \
    "${removed_keys_tmp}"
}

print_dry_run() {
  local bundle="$1"
  local bundle_file="$2"
  local backup="${3:-false}"
  echo "mode: dry-run"
  echo "bundle: ${bundle}"
  echo "target: ${TARGET_ENV}"
  echo "would create .env from .env.example: $(if [[ -f "${TARGET_ENV}" ]]; then echo no; else echo yes; fi)"
  if [[ "${backup}" == "true" ]]; then
    echo "would back up existing .env before apply: $(if [[ -f "${TARGET_ENV}" ]]; then echo yes; else echo no; fi)"
  fi
  echo "managed block preview:"
  emit_bundle_block "${bundle}" "${bundle_file}"
}

print_plan() {
  local bundle="$1"
  local bundle_file="$2"
  echo "== Current status =="
  print_status "true"
  echo
  echo "== Diff to target bundle =="
  print_diff "${bundle}"
  echo
  echo "== Managed block preview =="
  print_dry_run "${bundle}" "${bundle_file}"
}

COMMAND="${1:-}"
shift || true
if [[ "${COMMAND}" == "-h" || "${COMMAND}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "${COMMAND}" ]]; then
  usage
  exit 1
fi

BUNDLE=""
DRY_RUN="false"
BACKUP="false"
while [[ "${COMMAND}" == "--dry-run" || "${COMMAND}" == "-n" || "${COMMAND}" == "--backup" || "${COMMAND}" == "-b" ]]; do
  if [[ "${COMMAND}" == "--dry-run" || "${COMMAND}" == "-n" ]]; then
    DRY_RUN="true"
  else
    BACKUP="true"
  fi
  COMMAND="${1:-}"
  shift || true
done

if [[ -z "${COMMAND}" ]]; then
  usage
  exit 1
fi

case "${COMMAND}" in
  list)
    list_bundles
    exit 0
    ;;
  status)
    VERBOSE="false"
    if [[ "${1:-}" == "--verbose" || "${1:-}" == "-v" ]]; then
      VERBOSE="true"
      shift || true
    fi
    if [[ $# -gt 0 ]]; then
      echo "unexpected arguments for status: $*" >&2
      exit 1
    fi
    print_status "${VERBOSE}"
    exit 0
    ;;
  diff)
    if [[ $# -lt 1 ]]; then
      echo "missing bundle for diff" >&2
      usage
      exit 1
    fi
    BUNDLE="${1}"
    shift || true
    if [[ $# -gt 0 ]]; then
      echo "unexpected arguments for diff: $*" >&2
      exit 1
    fi
    ;;
  plan)
    if [[ $# -lt 1 ]]; then
      echo "missing bundle for plan" >&2
      usage
      exit 1
    fi
    BUNDLE="${1}"
    shift || true
    if [[ $# -gt 0 ]]; then
      echo "unexpected arguments for plan: $*" >&2
      exit 1
    fi
    ;;
  *)
    BUNDLE="${COMMAND}"
    ;;
esac

if [[ "${COMMAND}" != "diff" && "${COMMAND}" != "plan" && $# -gt 0 ]]; then
  while [[ $# -gt 0 ]]; do
    case "${1}" in
      --dry-run|-n)
        DRY_RUN="true"
        ;;
      --backup|-b)
        BACKUP="true"
        ;;
      *)
        echo "unexpected arguments for bundle apply: $*" >&2
        exit 1
        ;;
    esac
    shift || true
  done
fi

BUNDLE_FILE="${BUNDLES_DIR}/${BUNDLE}.env"
if [[ ! -f "${BUNDLE_FILE}" ]]; then
  echo "unknown bundle: ${BUNDLE} (expected local_safe|experimental|team_shared|high_risk)" >&2
  exit 1
fi

if [[ "${COMMAND}" == "diff" ]]; then
  print_diff "${BUNDLE}"
  exit 0
fi

if [[ "${COMMAND}" == "plan" ]]; then
  print_plan "${BUNDLE}" "${BUNDLE_FILE}"
  exit 0
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  print_dry_run "${BUNDLE}" "${BUNDLE_FILE}" "${BACKUP}"
  exit 0
fi

BACKUP_PATH=""
if [[ "${BACKUP}" == "true" ]]; then
  BACKUP_PATH="$(create_backup)"
fi

if [[ ! -f "${TARGET_ENV}" ]]; then
  cp "${ROOT_DIR}/.env.example" "${TARGET_ENV}"
fi

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
  emit_bundle_block "${BUNDLE}" "${BUNDLE_FILE}"
} >> "${TARGET_ENV}"

echo "applied feature bundle: ${BUNDLE}"
echo "target: ${TARGET_ENV}"
if [[ "${BACKUP}" == "true" ]]; then
  if [[ -n "${BACKUP_PATH}" ]]; then
    echo "backup: ${BACKUP_PATH}"
  else
    echo "backup: skipped (no existing .env)"
  fi
fi
echo "managed keys:"
awk '
  /^[[:space:]]*#/ { next }
  /^[[:space:]]*$/ { next }
  {
    split($0, parts, "=");
    print "  - " parts[1];
  }
' "${BUNDLE_FILE}"
