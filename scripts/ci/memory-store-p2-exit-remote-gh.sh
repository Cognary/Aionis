#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need gh
need jq
need git

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

infer_repo_from_origin() {
  local remote_url
  remote_url="$(git remote get-url origin 2>/dev/null || true)"
  if [[ -z "${remote_url}" ]]; then
    return 1
  fi
  # Supports:
  # - https://github.com/OWNER/REPO.git
  # - git@github.com:OWNER/REPO.git
  local parsed
  parsed="$(echo "${remote_url}" | sed -E 's#^https?://github.com/([^/]+/[^/]+)(\.git)?$#\1#; s#^git@github.com:([^/]+/[^/]+)(\.git)?$#\1#')"
  if [[ "${parsed}" == "${remote_url}" ]]; then
    return 1
  fi
  echo "${parsed}"
}

normalize_repo() {
  local raw="$1"
  raw="${raw#https://github.com/}"
  raw="${raw#http://github.com/}"
  raw="${raw#git@github.com:}"
  raw="${raw#github.com/}"
  raw="${raw#/}"
  raw="${raw%.git}"
  echo "${raw}"
}

REPO="${REPO:-${GITHUB_REPOSITORY:-}}"
if [[ -z "${REPO}" ]]; then
  REPO="$(infer_repo_from_origin || true)"
fi
if [[ -z "${REPO}" ]]; then
  echo "failed to infer GitHub repo, set REPO=OWNER/REPO" >&2
  exit 1
fi

BRANCH="${BRANCH:-main}"
RUN_LIMIT="${RUN_LIMIT:-25}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-168}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/memory_store_p2_remote}"
OUT_FILE="${OUT_FILE:-${OUT_DIR}/p2_remote_summary.json}"
DRY_RUN="${DRY_RUN:-false}"

WORKFLOWS="${WORKFLOWS:-Backend Parity Smoke,SDK CI,Core Production Gate}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --run-limit) RUN_LIMIT="${2:-}"; shift 2 ;;
    --max-age-hours) MAX_AGE_HOURS="${2:-}"; shift 2 ;;
    --workflows) WORKFLOWS="${2:-}"; shift 2 ;;
    --out-file) OUT_FILE="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help)
      cat <<'USAGE'
Usage: scripts/ci/memory-store-p2-exit-remote-gh.sh [options]

Checks latest completed GitHub Actions runs for key P2 exit workflows.
Fails when any workflow is missing, non-success, or older than max age.

Options:
  --repo <owner/repo>            GitHub repo (default: infer from origin)
  --branch <branch>              Branch to inspect (default: main)
  --run-limit <n>                Max runs fetched per workflow (default: 25)
  --max-age-hours <n>            Max allowed age of latest completed run (default: 168)
  --workflows "<a,b,c>"          Comma-separated workflow names
  --out-file <path>              Summary JSON output path
  --dry-run                      Print resolved config only
USAGE
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

REPO="$(normalize_repo "${REPO}")"
if [[ ! "${REPO}" =~ ^[^/]+/[^/]+$ ]]; then
  echo "invalid repo format: ${REPO} (expected OWNER/REPO)" >&2
  exit 1
fi

mkdir -p "$(dirname "${OUT_FILE}")"
mkdir -p "${OUT_DIR}"

IFS=',' read -r -a workflow_names <<< "${WORKFLOWS}"

for i in "${!workflow_names[@]}"; do
  workflow_names[$i]="$(echo "${workflow_names[$i]}" | xargs)"
done

if [[ "${DRY_RUN}" == "true" ]]; then
  jq -n \
    --arg repo "${REPO}" \
    --arg branch "${BRANCH}" \
    --argjson run_limit "${RUN_LIMIT}" \
    --argjson max_age_hours "${MAX_AGE_HOURS}" \
    --arg workflows "${WORKFLOWS}" \
    '{
      dry_run: true,
      repo: $repo,
      branch: $branch,
      run_limit: $run_limit,
      max_age_hours: $max_age_hours,
      workflows: ($workflows | split(",") | map(gsub("^\\s+|\\s+$";"")) | map(select(length>0)))
    }'
  exit 0
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh auth is required. Run: gh auth login" >&2
  exit 1
fi

checks_json="[]"
overall_ok=true

for workflow in "${workflow_names[@]}"; do
  if [[ -z "${workflow}" ]]; then
    continue
  fi
  run_json="$(gh run list \
    -R "${REPO}" \
    --workflow "${workflow}" \
    --branch "${BRANCH}" \
    --limit "${RUN_LIMIT}" \
    --json databaseId,workflowName,status,conclusion,headBranch,headSha,createdAt,updatedAt,url)"

  latest_completed="$(echo "${run_json}" | jq 'map(select(.status == "completed")) | .[0] // null')"
  if [[ "${latest_completed}" == "null" ]]; then
    overall_ok=false
    checks_json="$(echo "${checks_json}" | jq --arg wf "${workflow}" '. + [{
      workflow: $wf,
      ok: false,
      reason: "no_completed_run_found"
    }]')"
    continue
  fi

  run_id="$(echo "${latest_completed}" | jq -r '.databaseId')"
  conclusion="$(echo "${latest_completed}" | jq -r '.conclusion // "unknown"')"
  created_at="$(echo "${latest_completed}" | jq -r '.createdAt')"
  run_url="$(echo "${latest_completed}" | jq -r '.url // empty')"
  if [[ -z "${run_url}" || "${run_url}" == "null" ]]; then
    run_url="https://github.com/${REPO}/actions/runs/${run_id}"
  fi
  age_hours="$(echo "${latest_completed}" | jq -r '((now - (.createdAt | fromdateiso8601)) / 3600)')"

  is_success=false
  is_fresh=false
  if [[ "${conclusion}" == "success" ]]; then
    is_success=true
  fi
  if awk "BEGIN { exit !(${age_hours} <= ${MAX_AGE_HOURS}) }"; then
    is_fresh=true
  fi

  check_ok=false
  reason="ok"
  if [[ "${is_success}" != "true" ]]; then
    reason="latest_completed_not_success"
  elif [[ "${is_fresh}" != "true" ]]; then
    reason="latest_completed_run_too_old"
  else
    check_ok=true
  fi

  if [[ "${check_ok}" != "true" ]]; then
    overall_ok=false
  fi

  checks_json="$(echo "${checks_json}" | jq \
    --arg wf "${workflow}" \
    --argjson ok "${check_ok}" \
    --arg reason "${reason}" \
    --arg conclusion "${conclusion}" \
    --arg created_at "${created_at}" \
    --arg run_url "${run_url}" \
    --arg run_id "${run_id}" \
    --argjson age_hours "${age_hours}" \
    '. + [{
      workflow: $wf,
      ok: $ok,
      reason: $reason,
      latest_completed: {
        run_id: ($run_id | tonumber),
        conclusion: $conclusion,
        created_at: $created_at,
        age_hours: $age_hours,
        url: $run_url
      }
    }]')"
done

jq -n \
  --arg repo "${REPO}" \
  --arg branch "${BRANCH}" \
  --argjson run_limit "${RUN_LIMIT}" \
  --argjson max_age_hours "${MAX_AGE_HOURS}" \
  --arg checked_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --argjson ok "${overall_ok}" \
  --argjson checks "${checks_json}" \
  '{
    ok: $ok,
    repo: $repo,
    branch: $branch,
    run_limit: $run_limit,
    max_age_hours: $max_age_hours,
    checked_at: $checked_at,
    checks: $checks
  }' > "${OUT_FILE}"

cat "${OUT_FILE}"

if [[ "${overall_ok}" != "true" ]]; then
  echo "memory-store p2 remote gate failed (see ${OUT_FILE})" >&2
  exit 1
fi

echo "memory-store p2 remote gate passed"
