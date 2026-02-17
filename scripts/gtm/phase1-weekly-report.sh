#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need jq
need awk
need sort
need npm

LOOKBACK_DAYS="${LOOKBACK_DAYS:-7}"
REPORT_WEEK="${REPORT_WEEK:-$(date +%G-W%V)}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/gtm/weekly/${REPORT_WEEK}_${RUN_ID}}"
OWNER="${OWNER:-TBD}"
PHASE="${PHASE:-Phase 1}"
GATE_SUMMARY_ROOT="${GATE_SUMMARY_ROOT:-${ROOT_DIR}/artifacts/gtm/gate_a}"
REHEARSAL_SUMMARY_ROOT="${REHEARSAL_SUMMARY_ROOT:-${ROOT_DIR}/artifacts/gtm/phase1_rehearsal}"
REGRESSION_SUMMARY_ROOT="${REGRESSION_SUMMARY_ROOT:-${ROOT_DIR}/artifacts/regression}"

mkdir -p "${OUT_DIR}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

gate_find=(find "${GATE_SUMMARY_ROOT}" -type f -name summary.json)
rehearsal_find=(find "${REHEARSAL_SUMMARY_ROOT}" -type f -name summary.json)
regression_find=(find "${REGRESSION_SUMMARY_ROOT}" -type f -name summary.json)

if [[ "${LOOKBACK_DAYS}" =~ ^[0-9]+$ ]] && [[ "${LOOKBACK_DAYS}" -gt 0 ]]; then
  gate_find+=(-mtime "-${LOOKBACK_DAYS}")
  rehearsal_find+=(-mtime "-${LOOKBACK_DAYS}")
  regression_find+=(-mtime "-${LOOKBACK_DAYS}")
fi

gate_files=()
while IFS= read -r line; do
  [[ -n "${line}" ]] && gate_files+=("${line}")
done < <("${gate_find[@]}" | sort)

rehearsal_files=()
while IFS= read -r line; do
  [[ -n "${line}" ]] && rehearsal_files+=("${line}")
done < <("${rehearsal_find[@]}" | sort)

regression_files=()
while IFS= read -r line; do
  [[ -n "${line}" ]] && regression_files+=("${line}")
done < <("${regression_find[@]}" | sort)

gate_runs=0
gate_passed=0
killer_demo_ok_count=0
memory_recall_improved_count=0
cross_session_ok_count=0
docs_check_ok_count=0

>"${tmp_dir}/gate_duration_ms.txt"
>"${tmp_dir}/killer_demo_duration_ms.txt"
>"${tmp_dir}/failed_checks.txt"

for f in "${gate_files[@]}"; do
  gate_runs=$((gate_runs + 1))
  pass="$(jq -r '.gate.pass // false' "${f}")"
  [[ "${pass}" == "true" ]] && gate_passed=$((gate_passed + 1))

  kd_ok="$(jq -r '.checks.killer_demo_ok // false' "${f}")"
  [[ "${kd_ok}" == "true" ]] && killer_demo_ok_count=$((killer_demo_ok_count + 1))
  mr_ok="$(jq -r '.checks.memory_recall_improved // false' "${f}")"
  [[ "${mr_ok}" == "true" ]] && memory_recall_improved_count=$((memory_recall_improved_count + 1))
  cs_ok="$(jq -r '.checks.cross_session_recall_stable // false' "${f}")"
  [[ "${cs_ok}" == "true" ]] && cross_session_ok_count=$((cross_session_ok_count + 1))
  dc_ok="$(jq -r '.checks.docs_check_ok // false' "${f}")"
  [[ "${dc_ok}" == "true" ]] && docs_check_ok_count=$((docs_check_ok_count + 1))

  jq -r '.timings.gate_duration_ms // 0' "${f}" >> "${tmp_dir}/gate_duration_ms.txt"
  jq -r '.timings.killer_demo_duration_ms // 0' "${f}" >> "${tmp_dir}/killer_demo_duration_ms.txt"
  jq -r '.checks | to_entries[] | select(.value!=true) | .key' "${f}" >> "${tmp_dir}/failed_checks.txt" || true
done

regression_runs=0
regression_passed=0
for f in "${regression_files[@]}"; do
  regression_runs=$((regression_runs + 1))
  ok="$(jq -r '(.ok == true) and (.health_gate.ok == true)' "${f}")"
  [[ "${ok}" == "true" ]] && regression_passed=$((regression_passed + 1))
done

rehearsal_runs=0
rehearsal_pass_rate_sum=0
for f in "${rehearsal_files[@]}"; do
  rehearsal_runs=$((rehearsal_runs + 1))
  pr="$(jq -r '.pass_rate // 0' "${f}")"
  rehearsal_pass_rate_sum="$(awk -v a="${rehearsal_pass_rate_sum}" -v b="${pr}" 'BEGIN{printf "%.6f", a+b}')"
done

pct() {
  local num="$1"
  local den="$2"
  awk -v n="${num}" -v d="${den}" 'BEGIN{ if (d==0) print "0.00"; else printf "%.2f", (n*100)/d }'
}

ratio4() {
  local num="$1"
  local den="$2"
  awk -v n="${num}" -v d="${den}" 'BEGIN{ if (d==0) print "0.0000"; else printf "%.4f", n/d }'
}

gate_pass_rate="$(ratio4 "${gate_passed}" "${gate_runs}")"
gate_pass_rate_pct="$(pct "${gate_passed}" "${gate_runs}")"
demo_pass_rate_pct="$(pct "${killer_demo_ok_count}" "${gate_runs}")"
memory_recall_improved_pct="$(pct "${memory_recall_improved_count}" "${gate_runs}")"
cross_session_ok_pct="$(pct "${cross_session_ok_count}" "${gate_runs}")"
docs_check_ok_pct="$(pct "${docs_check_ok_count}" "${gate_runs}")"
regression_pass_rate_pct="$(pct "${regression_passed}" "${regression_runs}")"

avg_gate_duration_ms=0
if [[ -s "${tmp_dir}/gate_duration_ms.txt" ]]; then
  avg_gate_duration_ms="$(awk '{sum+=$1; n+=1} END{if(n>0) printf "%.0f", sum/n; else print 0}' "${tmp_dir}/gate_duration_ms.txt")"
fi

ttfv_p50_ms="n/a"
if [[ -s "${tmp_dir}/killer_demo_duration_ms.txt" ]]; then
  ttfv_p50_ms="$(sort -n "${tmp_dir}/killer_demo_duration_ms.txt" | awk '
    {a[NR]=$1}
    END{
      if (NR==0) { print "n/a"; exit }
      idx = int((NR+1)/2)
      if (idx < 1) idx = 1
      print a[idx]
    }'
  )"
fi

if [[ -s "${tmp_dir}/failed_checks.txt" ]]; then
  sort "${tmp_dir}/failed_checks.txt" | uniq -c | awk '{print "{\"check\":\""$2"\",\"count\":"$1"}"}' | jq -s 'sort_by(-.count)' > "${OUT_DIR}/failed_checks_summary.json"
else
  echo '[]' > "${OUT_DIR}/failed_checks_summary.json"
fi

latest_rehearsal_summary=""
if [[ "${#rehearsal_files[@]}" -gt 0 ]]; then
  latest_rehearsal_summary="${rehearsal_files[$((${#rehearsal_files[@]} - 1))]}"
fi

overall_status="green"
headline="Phase 1 gate trend is stable."
critical_blocker="none"
if awk -v p="${gate_pass_rate}" 'BEGIN{exit !(p < 0.8)}'; then
  overall_status="red"
  headline="Gate A pass rate below 80% in current window."
  critical_blocker="Gate A stability below target; prioritize script/env hardening."
elif awk -v p="${gate_pass_rate}" 'BEGIN{exit !(p < 1.0)}'; then
  overall_status="yellow"
  headline="Gate A partially passing; still below full target."
  critical_blocker="Residual flaky checks remain."
fi

started_at="$(date -u -v-"${LOOKBACK_DAYS}"d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")"
ended_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

jq -n \
  --arg report_week "${REPORT_WEEK}" \
  --arg out_dir "${OUT_DIR}" \
  --arg phase "${PHASE}" \
  --arg owner "${OWNER}" \
  --arg gate_summary_root "${GATE_SUMMARY_ROOT}" \
  --arg rehearsal_summary_root "${REHEARSAL_SUMMARY_ROOT}" \
  --arg regression_summary_root "${REGRESSION_SUMMARY_ROOT}" \
  --arg started_at "${started_at}" \
  --arg ended_at "${ended_at}" \
  --arg overall_status "${overall_status}" \
  --arg headline "${headline}" \
  --arg critical_blocker "${critical_blocker}" \
  --arg gate_pass_rate "${gate_pass_rate}" \
  --argjson gate_pass_rate_pct "${gate_pass_rate_pct}" \
  --argjson gate_runs "${gate_runs}" \
  --argjson gate_passed "${gate_passed}" \
  --argjson demo_pass_rate_pct "${demo_pass_rate_pct}" \
  --argjson memory_recall_improved_pct "${memory_recall_improved_pct}" \
  --argjson cross_session_ok_pct "${cross_session_ok_pct}" \
  --argjson docs_check_ok_pct "${docs_check_ok_pct}" \
  --arg ttfv_p50_ms "${ttfv_p50_ms}" \
  --argjson avg_gate_duration_ms "${avg_gate_duration_ms}" \
  --argjson regression_runs "${regression_runs}" \
  --argjson regression_passed "${regression_passed}" \
  --argjson regression_pass_rate_pct "${regression_pass_rate_pct}" \
  --argjson rehearsal_runs "${rehearsal_runs}" \
  --argjson rehearsal_pass_rate_avg "$(awk -v s="${rehearsal_pass_rate_sum}" -v n="${rehearsal_runs}" 'BEGIN{ if (n==0) print 0; else printf "%.4f", s/n }')" \
  --arg latest_rehearsal_summary "${latest_rehearsal_summary}" \
  --slurpfile failed_checks "${OUT_DIR}/failed_checks_summary.json" \
  '{
    ok: true,
    report_week: $report_week,
    out_dir: $out_dir,
    phase: $phase,
    owner: $owner,
    source: {
      gate_summary_root: $gate_summary_root,
      rehearsal_summary_root: $rehearsal_summary_root,
      regression_summary_root: $regression_summary_root
    },
    window: {started_at: $started_at, ended_at: $ended_at},
    executive: {overall_status: $overall_status, headline: $headline, critical_blocker: $critical_blocker},
    activation: {
      ttfv_p50_ms: (if $ttfv_p50_ms=="n/a" then null else ($ttfv_p50_ms|tonumber) end),
      first_run_success_rate_pct: $gate_pass_rate_pct,
      demo_pass_rate_pct: $demo_pass_rate_pct
    },
    reliability: {
      gate_avg_duration_ms: $avg_gate_duration_ms,
      memory_recall_improved_pct: $memory_recall_improved_pct,
      cross_session_recall_stable_pct: $cross_session_ok_pct
    },
    delivery: {
      gate_runs: $gate_runs,
      gate_passed: $gate_passed,
      gate_pass_rate: ($gate_pass_rate|tonumber),
      docs_check_ok_pct: $docs_check_ok_pct,
      regression_runs: $regression_runs,
      regression_passed: $regression_passed,
      regression_pass_rate_pct: $regression_pass_rate_pct
    },
    rehearsal: {
      runs: $rehearsal_runs,
      avg_pass_rate: $rehearsal_pass_rate_avg,
      latest_summary: (if ($latest_rehearsal_summary|length)>0 then $latest_rehearsal_summary else null end)
    },
    failed_checks: ($failed_checks[0] // [])
  }' > "${OUT_DIR}/summary.json"

summary_json="${OUT_DIR}/summary.json"

cat > "${OUT_DIR}/WEEKLY_STATUS.md" <<EOF
# GTM Weekly Status

## Header

1. Week: \`${REPORT_WEEK}\`
2. Reporting window: \`${started_at} -> ${ended_at}\`
3. Owner: \`${OWNER}\`
4. Phase: \`${PHASE}\`

## 1) Executive Summary

1. Overall status: \`${overall_status}\`
2. This week's headline: ${headline}
3. Critical blocker (if any): ${critical_blocker}

## 2) KPI Snapshot

1. Activation
   1. TTFV P50: ${ttfv_p50_ms} ms
   2. First-run success rate: ${gate_pass_rate_pct}%
   3. Demo pass rate: ${demo_pass_rate_pct}%
2. Reliability
   1. write p95: n/a (Phase 1 gate scope)
   2. recall_text p95: n/a (Phase 1 gate scope)
   3. 5xx error rate: n/a (Phase 1 gate scope)
3. Delivery
   1. Gate pass/fail: ${gate_passed}/${gate_runs}
   2. Regression pass rate: ${regression_passed}/${regression_runs} (${regression_pass_rate_pct}%)
   3. Docs/contract drift findings: docs-check ok ${docs_check_ok_pct}%
4. Commercial
   1. New ICP leads: n/a
   2. PoC in progress: n/a
   3. PoC->paid signals: n/a

## 3) Completed This Week

1. Gate A automation pipeline running with JSON evidence.
   1. Evidence: \`${summary_json}\`
   2. Impact: weekly pass/fail and failure hotspots are now trackable.
2. Rehearsal capability for repeated Gate A validation.
   1. Evidence: \`${latest_rehearsal_summary:-n/a}\`
   2. Impact: measurable confidence before formal Gate A review.

## 4) In Progress

1. Phase 1 stability hardening.
   1. Owner: ${OWNER}
   2. ETA: end of current week
   3. Current risk: gate failures if local API/worker/env not ready

## 5) Risks and Decisions

1. Risk: Gate pass rate below target.
   1. Severity: $( [[ "${overall_status}" == "red" ]] && echo "high" || echo "medium" )
   2. Mitigation: run rehearsal with \`ITERATIONS>=3\`, prioritize top failed checks.
   3. Decision needed: whether to block next phase on 100% pass.

## 6) Next Week Plan

1. Raise Gate A pass rate to target.
2. Reduce top failed check frequency.
3. Prepare Gate A formal review evidence.

## 7) Evidence Links

1. Regression summary: latest under \`/Users/lucio/Desktop/Aionis/artifacts/regression\`
2. Preflight summary: latest under \`/Users/lucio/Desktop/Aionis/artifacts/preflight\`
3. Performance report: latest under \`/Users/lucio/Desktop/Aionis/artifacts/regression/*/perf/PERFORMANCE_REPORT_V1.md\`
4. Gate checklist summary: \`${summary_json}\`

EOF

jq . "${OUT_DIR}/summary.json"
echo "done: ${OUT_DIR}/WEEKLY_STATUS.md"
