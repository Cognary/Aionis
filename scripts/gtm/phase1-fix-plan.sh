#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need jq
need node

RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OWNER="${OWNER:-TBD}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/gtm/fix_plan/${RUN_ID}}"
REVIEW_SUMMARY_FILE="${REVIEW_SUMMARY_FILE:-}"
MIN_GATE_RUNS="${MIN_GATE_RUNS:-3}"
TTFV_TARGET_MS="${TTFV_TARGET_MS:-1800000}"
INCLUDE_FAILED_CHECK_TASKS="${INCLUDE_FAILED_CHECK_TASKS:-true}"

mkdir -p "${OUT_DIR}"

if [[ -z "${REVIEW_SUMMARY_FILE}" ]]; then
  REVIEW_SUMMARY_FILE="$(find "${ROOT_DIR}/artifacts/gtm/review" -mindepth 2 -maxdepth 2 -type f -name summary.json | sort | tail -n 1 || true)"
fi

if [[ -z "${REVIEW_SUMMARY_FILE}" || ! -f "${REVIEW_SUMMARY_FILE}" ]]; then
  echo "missing review summary file. set REVIEW_SUMMARY_FILE or run: npm run gtm:phase1:review-pack" >&2
  exit 2
fi

go_no_go="$(jq -r '.status.go_no_go // false' "${REVIEW_SUMMARY_FILE}")"
gate_pass_rate="$(jq -r '.actual.gate_pass_rate // 0' "${REVIEW_SUMMARY_FILE}")"
gate_target="$(jq -r '.targets.gate_pass_rate // 0.8' "${REVIEW_SUMMARY_FILE}")"
ttfv_p50_ms="$(jq -r '.actual.ttfv_p50_ms // 0' "${REVIEW_SUMMARY_FILE}")"
ttfv_target_ms="$(jq -r '.targets.ttfv_p50_ms // 1800000' "${REVIEW_SUMMARY_FILE}")"
reason_count="$(jq -r '.status.go_no_go_reasons | length' "${REVIEW_SUMMARY_FILE}")"
kpi_snapshot="$(jq -r '.files.kpi_snapshot // ""' "${REVIEW_SUMMARY_FILE}")"

tasks_ndjson="${OUT_DIR}/tasks.ndjson"
: > "${tasks_ndjson}"

due_date() {
  local days="$1"
  node -e "const d=new Date(Date.now()+(${days}*24*60*60*1000));process.stdout.write(d.toISOString().slice(0,10));"
}

add_task() {
  local id="$1"
  local source="$2"
  local priority="$3"
  local title="$4"
  local why="$5"
  local action="$6"
  local acceptance="$7"
  local owner="$8"
  local due="$9"
  local evidence="${10}"

  jq -n \
    --arg id "${id}" \
    --arg source "${source}" \
    --arg priority "${priority}" \
    --arg title "${title}" \
    --arg why "${why}" \
    --arg action "${action}" \
    --arg acceptance "${acceptance}" \
    --arg owner "${owner}" \
    --arg due_date "${due}" \
    --arg evidence "${evidence}" \
    '{
      id: $id,
      source: $source,
      priority: $priority,
      title: $title,
      why: $why,
      action: $action,
      acceptance: $acceptance,
      owner: $owner,
      due_date: $due_date,
      status: "open",
      evidence: $evidence
    }' >> "${tasks_ndjson}"
}

if [[ "${reason_count}" -gt 0 ]]; then
  while IFS= read -r reason; do
    case "${reason}" in
      gate_pass_rate_below_target)
        add_task \
          "reason_gate_pass_rate" \
          "reason:${reason}" \
          "P0" \
          "Stabilize Gate A pass rate to target" \
          "Gate pass rate (${gate_pass_rate}) is below target (${gate_target})." \
          "Fix the top failed checks, then run >= ${MIN_GATE_RUNS} rehearsal iterations and verify the trend." \
          "Latest rehearsal summary shows pass_rate >= ${gate_target} with no critical blocker." \
          "${OWNER}" \
          "$(due_date 3)" \
          "npm run gtm:phase1:rehearsal && npm run gtm:phase1:threshold-check"
        ;;
      insufficient_gate_runs)
        add_task \
          "reason_insufficient_runs" \
          "reason:${reason}" \
          "P1" \
          "Increase rehearsal sample size" \
          "Gate run count is too low for release confidence." \
          "Run additional rehearsals until sample size requirement is met and keep evidence artifacts." \
          "At least ${MIN_GATE_RUNS} successful/attempted runs are present in rehearsal summary." \
          "${OWNER}" \
          "$(due_date 5)" \
          "ITERATIONS=${MIN_GATE_RUNS} npm run gtm:phase1:rehearsal"
        ;;
      missing_ttfv_signal)
        add_task \
          "reason_missing_ttfv_signal" \
          "reason:${reason}" \
          "P0" \
          "Repair TTFV instrumentation" \
          "TTFV signal is missing, so activation quality cannot be trusted." \
          "Ensure killer demo timing is emitted and persisted in Gate A summary/value dashboard." \
          "Review pack contains non-zero ttfv_p50_ms and no missing_ttfv_signal reason." \
          "${OWNER}" \
          "$(due_date 2)" \
          "npm run gtm:phase1:gatea && npm run gtm:phase1:review-pack"
        ;;
      ttfv_p50_above_target)
        add_task \
          "reason_ttfv_high" \
          "reason:${reason}" \
          "P0" \
          "Reduce onboarding/first-value latency" \
          "TTFV P50 (${ttfv_p50_ms}ms) is above target (${ttfv_target_ms}ms)." \
          "Profile onboarding path, remove blocking steps, and improve baseline data/demo readiness." \
          "Review pack shows ttfv_p50_ms <= ${TTFV_TARGET_MS}." \
          "${OWNER}" \
          "$(due_date 7)" \
          "npm run gtm:phase1:gatea && npm run gtm:phase1:kpi-export"
        ;;
      *)
        add_task \
          "reason_${reason}" \
          "reason:${reason}" \
          "P2" \
          "Investigate blocker: ${reason}" \
          "A non-standard go/no-go reason was reported." \
          "Root-cause this reason and convert it into a measurable mitigation." \
          "Reason is either cleared or replaced by a concrete tracked metric." \
          "${OWNER}" \
          "$(due_date 7)" \
          "npm run gtm:phase1:review-pack"
        ;;
    esac
  done < <(jq -r '.status.go_no_go_reasons[]?' "${REVIEW_SUMMARY_FILE}")
fi

if [[ "${INCLUDE_FAILED_CHECK_TASKS}" == "true" && -n "${kpi_snapshot}" && -f "${kpi_snapshot}" ]]; then
  while IFS= read -r row; do
    check_name="$(echo "${row}" | jq -r '.check')"
    check_count="$(echo "${row}" | jq -r '.count')"
    slug="$(echo "${check_name}" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '_' | sed -E 's/^_+|_+$//g' | cut -c1-40)"

    priority="P1"
    case "${check_name}" in
      api_healthy|outbox_worker_running|write_smoke_200|recall_smoke_non_500)
        priority="P0"
        ;;
      *)
        priority="P1"
        ;;
    esac

    add_task \
      "check_${slug}" \
      "failed_check:${check_name}" \
      "${priority}" \
      "Fix recurring failed check: ${check_name}" \
      "Check ${check_name} failed ${check_count} times in recent gate history." \
      "Create a deterministic fix and add regression coverage for this check." \
      "Next 3 gate runs show zero failures for ${check_name}." \
      "${OWNER}" \
      "$(due_date 7)" \
      "npm run gtm:phase1:gatea"
  done < <(jq -c '.failed_checks_top[]?' "${kpi_snapshot}")
fi

if [[ ! -s "${tasks_ndjson}" ]]; then
  add_task \
    "maintenance_monitor" \
    "default:maintenance" \
    "P2" \
    "Maintain Gate A quality trend" \
    "No blocking reason detected, keep observability and trend checks active." \
    "Run weekly GTM review and keep KPI/weekly artifacts up to date." \
    "Weekly report generated and reviewed by owner." \
    "${OWNER}" \
    "$(due_date 7)" \
    "npm run gtm:phase1:weekly-report"
fi

TASKS_JSON="${OUT_DIR}/tasks.json"

jq -s '
  unique_by(.id)
  | sort_by(
      (if .priority=="P0" then 0 elif .priority=="P1" then 1 elif .priority=="P2" then 2 else 3 end),
      .source,
      .id
    )
' "${tasks_ndjson}" > "${TASKS_JSON}"

priority_p0="$(jq '[.[] | select(.priority=="P0")] | length' "${TASKS_JSON}")"
priority_p1="$(jq '[.[] | select(.priority=="P1")] | length' "${TASKS_JSON}")"
priority_p2="$(jq '[.[] | select(.priority=="P2")] | length' "${TASKS_JSON}")"

go_no_go_reason_md="${OUT_DIR}/go_no_go_reasons.md"
if [[ "${reason_count}" -gt 0 ]]; then
  jq -r '.status.go_no_go_reasons[] | "- " + .' "${REVIEW_SUMMARY_FILE}" > "${go_no_go_reason_md}"
else
  echo "- none" > "${go_no_go_reason_md}"
fi

FIX_MD="${OUT_DIR}/FIX_TASKS.md"
{
  echo "# GTM Phase 1 Fix Tasks"
  echo
  echo "Generated at: \`$(date -u +"%Y-%m-%dT%H:%M:%SZ")\`"
  echo "Source review summary: \`${REVIEW_SUMMARY_FILE}\`"
  echo "Owner: \`${OWNER}\`"
  echo
  echo "## Status Snapshot"
  echo
  echo "1. Go/No-Go: \`${go_no_go}\`"
  echo "2. Gate pass rate: \`${gate_pass_rate}\` (target \`${gate_target}\`)"
  echo "3. TTFV P50 (ms): \`${ttfv_p50_ms}\` (target \`${ttfv_target_ms}\`)"
  echo
  echo "## Go/No-Go Reasons"
  cat "${go_no_go_reason_md}"
  echo
  echo "## Prioritized Backlog"
  echo
  echo "| Priority | Task ID | Title | Owner | Due | Status |"
  echo "| --- | --- | --- | --- | --- | --- |"
  jq -r '.[] | "| " + .priority + " | `" + .id + "` | " + .title + " | " + .owner + " | " + .due_date + " | " + .status + " |"' "${TASKS_JSON}"
  echo
  echo "## Task Details"
  echo
  jq -r '.[] | "### [" + .priority + "] " + .title + " (`" + .id + "`)\n\n- Source: `" + .source + "`\n- Why: " + .why + "\n- Action: " + .action + "\n- Acceptance: " + .acceptance + "\n- Evidence Command: `" + .evidence + "`\n"' "${TASKS_JSON}"
} > "${FIX_MD}"

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg review_summary "${REVIEW_SUMMARY_FILE}" \
  --arg fix_md "${FIX_MD}" \
  --arg tasks_json "${TASKS_JSON}" \
  --argjson go_no_go "${go_no_go}" \
  --argjson task_count "$(jq 'length' "${TASKS_JSON}")" \
  --argjson p0 "${priority_p0}" \
  --argjson p1 "${priority_p1}" \
  --argjson p2 "${priority_p2}" \
  --slurpfile tasks "${TASKS_JSON}" \
  '{
    ok: true,
    run_id: $run_id,
    out_dir: $out_dir,
    review_summary: $review_summary,
    go_no_go: $go_no_go,
    files: {
      fix_tasks_markdown: $fix_md,
      tasks_json: $tasks_json
    },
    counts: {
      total: $task_count,
      p0: $p0,
      p1: $p1,
      p2: $p2
    },
    tasks: ($tasks[0] // [])
  }' | tee "${OUT_DIR}/summary.json"

rm -f "${tasks_ndjson}" "${go_no_go_reason_md}"

echo "done: ${OUT_DIR}/summary.json"
