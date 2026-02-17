#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need jq

RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/gtm/fix_export/${RUN_ID}}"
TASKS_JSON_FILE="${TASKS_JSON_FILE:-}"

JIRA_ISSUE_TYPE="${JIRA_ISSUE_TYPE:-Task}"
JIRA_LABELS="${JIRA_LABELS:-aionis,gtm,phase1}"
JIRA_PROJECT_KEY="${JIRA_PROJECT_KEY:-}"
JIRA_COMPONENTS="${JIRA_COMPONENTS:-}"
JIRA_EPIC_LINK="${JIRA_EPIC_LINK:-}"
JIRA_PROJECT_FIELD_NAME="${JIRA_PROJECT_FIELD_NAME:-Project Key}"
JIRA_COMPONENTS_FIELD_NAME="${JIRA_COMPONENTS_FIELD_NAME:-Components}"
JIRA_EPIC_FIELD_NAME="${JIRA_EPIC_FIELD_NAME:-Epic Link}"
LINEAR_STATE="${LINEAR_STATE:-Backlog}"
LINEAR_LABELS="${LINEAR_LABELS:-aionis,gtm,phase1}"
LINEAR_TEAM="${LINEAR_TEAM:-}"
LINEAR_PROJECT="${LINEAR_PROJECT:-}"
LINEAR_CYCLE="${LINEAR_CYCLE:-}"
LINEAR_TEAM_FIELD_NAME="${LINEAR_TEAM_FIELD_NAME:-Team}"
LINEAR_PROJECT_FIELD_NAME="${LINEAR_PROJECT_FIELD_NAME:-Project}"
LINEAR_CYCLE_FIELD_NAME="${LINEAR_CYCLE_FIELD_NAME:-Cycle}"
EXTERNAL_ID_PREFIX="${EXTERNAL_ID_PREFIX:-aionis-gtm-}"

mkdir -p "${OUT_DIR}"

if [[ -z "${TASKS_JSON_FILE}" ]]; then
  TASKS_JSON_FILE="$(find "${ROOT_DIR}/artifacts/gtm" -type f -name tasks.json | grep '/fix_plan/' | sort | tail -n 1 || true)"
fi

if [[ -z "${TASKS_JSON_FILE}" || ! -f "${TASKS_JSON_FILE}" ]]; then
  echo "missing tasks json. set TASKS_JSON_FILE or run: npm run gtm:phase1:fix-plan" >&2
  exit 2
fi

JIRA_CSV="${OUT_DIR}/jira_import.csv"
LINEAR_CSV="${OUT_DIR}/linear_import.csv"
JIRA_P0_CSV="${OUT_DIR}/jira_import_p0.csv"
JIRA_P1P2_CSV="${OUT_DIR}/jira_import_p1p2.csv"
LINEAR_P0_CSV="${OUT_DIR}/linear_import_p0.csv"
LINEAR_P1P2_CSV="${OUT_DIR}/linear_import_p1p2.csv"

TASKS_P0_JSON="${OUT_DIR}/tasks_p0.json"
TASKS_P1P2_JSON="${OUT_DIR}/tasks_p1p2.json"

jq '[.[] | select(.priority=="P0")]' "${TASKS_JSON_FILE}" > "${TASKS_P0_JSON}"
jq '[.[] | select(.priority!="P0")]' "${TASKS_JSON_FILE}" > "${TASKS_P1P2_JSON}"

render_jira_csv() {
  local input_json="$1"
  local output_csv="$2"
  jq -r \
    --arg issue_type "${JIRA_ISSUE_TYPE}" \
    --arg base_labels "${JIRA_LABELS}" \
    --arg jira_project_key "${JIRA_PROJECT_KEY}" \
    --arg jira_components "${JIRA_COMPONENTS}" \
    --arg jira_epic_link "${JIRA_EPIC_LINK}" \
    --arg jira_project_field_name "${JIRA_PROJECT_FIELD_NAME}" \
    --arg jira_components_field_name "${JIRA_COMPONENTS_FIELD_NAME}" \
    --arg jira_epic_field_name "${JIRA_EPIC_FIELD_NAME}" \
    --arg id_prefix "${EXTERNAL_ID_PREFIX}" \
    '
    (
      ["Summary","Description","Issue Type","Priority","Assignee","Due Date","Labels",$jira_project_field_name,$jira_components_field_name,$jira_epic_field_name,"External ID"]
      | @csv
    ),
    ( .[]
      | [
          .title,
          (
            "Why: " + .why + "\\n" +
            "Action: " + .action + "\\n" +
            "Acceptance: " + .acceptance + "\\n" +
            "Evidence: " + .evidence + "\\n" +
            "Source: " + .source
          ),
          $issue_type,
          (if .priority=="P0" then "Highest" elif .priority=="P1" then "High" elif .priority=="P2" then "Medium" else "Low" end),
          .owner,
          .due_date,
          ($base_labels + "," + (.priority | ascii_downcase)),
          $jira_project_key,
          $jira_components,
          $jira_epic_link,
          ($id_prefix + .id)
        ]
      | @csv
    )
    ' "${input_json}" > "${output_csv}"
}

render_linear_csv() {
  local input_json="$1"
  local output_csv="$2"
  jq -r \
    --arg state "${LINEAR_STATE}" \
    --arg base_labels "${LINEAR_LABELS}" \
    --arg linear_team "${LINEAR_TEAM}" \
    --arg linear_project "${LINEAR_PROJECT}" \
    --arg linear_cycle "${LINEAR_CYCLE}" \
    --arg linear_team_field_name "${LINEAR_TEAM_FIELD_NAME}" \
    --arg linear_project_field_name "${LINEAR_PROJECT_FIELD_NAME}" \
    --arg linear_cycle_field_name "${LINEAR_CYCLE_FIELD_NAME}" \
    --arg id_prefix "${EXTERNAL_ID_PREFIX}" \
    '
    (
      ["Title","Description","Priority","Assignee","Due Date","Labels","State",$linear_team_field_name,$linear_project_field_name,$linear_cycle_field_name,"Identifier"]
      | @csv
    ),
    ( .[]
      | [
          .title,
          (
            "Why: " + .why + "\\n" +
            "Action: " + .action + "\\n" +
            "Acceptance: " + .acceptance + "\\n" +
            "Evidence: " + .evidence + "\\n" +
            "Source: " + .source
          ),
          (if .priority=="P0" then "Urgent" elif .priority=="P1" then "High" elif .priority=="P2" then "Medium" else "Low" end),
          .owner,
          .due_date,
          ($base_labels + "," + (.priority | ascii_downcase)),
          $state,
          $linear_team,
          $linear_project,
          $linear_cycle,
          ($id_prefix + .id)
        ]
      | @csv
    )
    ' "${input_json}" > "${output_csv}"
}

render_jira_csv "${TASKS_JSON_FILE}" "${JIRA_CSV}"
render_linear_csv "${TASKS_JSON_FILE}" "${LINEAR_CSV}"
render_jira_csv "${TASKS_P0_JSON}" "${JIRA_P0_CSV}"
render_jira_csv "${TASKS_P1P2_JSON}" "${JIRA_P1P2_CSV}"
render_linear_csv "${TASKS_P0_JSON}" "${LINEAR_P0_CSV}"
render_linear_csv "${TASKS_P1P2_JSON}" "${LINEAR_P1P2_CSV}"

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg tasks_json "${TASKS_JSON_FILE}" \
  --arg jira_csv "${JIRA_CSV}" \
  --arg linear_csv "${LINEAR_CSV}" \
  --arg jira_p0_csv "${JIRA_P0_CSV}" \
  --arg jira_p1p2_csv "${JIRA_P1P2_CSV}" \
  --arg linear_p0_csv "${LINEAR_P0_CSV}" \
  --arg linear_p1p2_csv "${LINEAR_P1P2_CSV}" \
  --arg jira_issue_type "${JIRA_ISSUE_TYPE}" \
  --arg jira_project_key "${JIRA_PROJECT_KEY}" \
  --arg jira_components "${JIRA_COMPONENTS}" \
  --arg jira_epic_link "${JIRA_EPIC_LINK}" \
  --arg jira_project_field_name "${JIRA_PROJECT_FIELD_NAME}" \
  --arg jira_components_field_name "${JIRA_COMPONENTS_FIELD_NAME}" \
  --arg jira_epic_field_name "${JIRA_EPIC_FIELD_NAME}" \
  --arg linear_state "${LINEAR_STATE}" \
  --arg linear_team "${LINEAR_TEAM}" \
  --arg linear_project "${LINEAR_PROJECT}" \
  --arg linear_cycle "${LINEAR_CYCLE}" \
  --arg linear_team_field_name "${LINEAR_TEAM_FIELD_NAME}" \
  --arg linear_project_field_name "${LINEAR_PROJECT_FIELD_NAME}" \
  --arg linear_cycle_field_name "${LINEAR_CYCLE_FIELD_NAME}" \
  --arg external_id_prefix "${EXTERNAL_ID_PREFIX}" \
  --argjson count "$(jq 'length' "${TASKS_JSON_FILE}")" \
  --argjson p0 "$(jq '[.[] | select(.priority=="P0")] | length' "${TASKS_JSON_FILE}")" \
  --argjson p1 "$(jq '[.[] | select(.priority=="P1")] | length' "${TASKS_JSON_FILE}")" \
  --argjson p2 "$(jq '[.[] | select(.priority=="P2")] | length' "${TASKS_JSON_FILE}")" \
  --argjson p1p2 "$(jq '[.[] | select(.priority!="P0")] | length' "${TASKS_JSON_FILE}")" \
  '{
    ok: true,
    run_id: $run_id,
    out_dir: $out_dir,
    source_tasks_json: $tasks_json,
    files: {
      jira_import_csv: $jira_csv,
      linear_import_csv: $linear_csv,
      jira_import_p0_csv: $jira_p0_csv,
      jira_import_p1p2_csv: $jira_p1p2_csv,
      linear_import_p0_csv: $linear_p0_csv,
      linear_import_p1p2_csv: $linear_p1p2_csv
    },
    mapping: {
      jira: {
        issue_type: $jira_issue_type,
        project_key: $jira_project_key,
        components: $jira_components,
        epic_link: $jira_epic_link,
        project_field_name: $jira_project_field_name,
        components_field_name: $jira_components_field_name,
        epic_field_name: $jira_epic_field_name
      },
      linear: {
        state: $linear_state,
        team: $linear_team,
        project: $linear_project,
        cycle: $linear_cycle,
        team_field_name: $linear_team_field_name,
        project_field_name: $linear_project_field_name,
        cycle_field_name: $linear_cycle_field_name
      },
      external_id_prefix: $external_id_prefix
    },
    counts: {
      total: $count,
      p0: $p0,
      p1: $p1,
      p2: $p2,
      p1p2: $p1p2
    }
  }' | tee "${OUT_DIR}/summary.json"

rm -f "${TASKS_P0_JSON}" "${TASKS_P1P2_JSON}"

echo "done: ${OUT_DIR}/summary.json"
