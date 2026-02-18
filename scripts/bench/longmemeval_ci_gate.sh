#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="$(date -u +%Y%m%d_%H%M%S)"

BASE_URL="${AIONIS_BASE_URL:-http://localhost:${PORT:-3001}}"
MODEL="${LONGMEMEVAL_GATE_MODEL:-${MINIMAX_CHAT_MODEL:-MiniMax-M2.1}}"
ENDPOINT="${LONGMEMEVAL_GATE_ENDPOINT:-${MINIMAX_CHAT_ENDPOINT:-https://api.minimax.chat/v1/text/chatcompletion_v2}}"
LIMIT="${LONGMEMEVAL_GATE_LIMIT:-8}"
OFFSETS_CSV="${LONGMEMEVAL_GATE_OFFSETS:-0,180}"
MATRIX_JSON="${LONGMEMEVAL_GATE_MATRIX_JSON:-${ROOT_DIR}/scripts/bench/longmemeval_profiles_production.json}"
RECALL_RETRY_ON_EMPTY="${LONGMEMEVAL_GATE_RECALL_RETRY_ON_EMPTY:-2}"
RECALL_RETRY_SLEEP_MS="${LONGMEMEVAL_GATE_RECALL_RETRY_SLEEP_MS:-250}"
WORKER_RUNS_PER_TRIGGER="${LONGMEMEVAL_GATE_WORKER_RUNS_PER_TRIGGER:-1}"
OUT_ROOT="${LONGMEMEVAL_GATE_OUT_ROOT:-${ROOT_DIR}/artifacts/longmemeval/ci_gate/${RUN_ID}}"

mkdir -p "${OUT_ROOT}"

IFS=',' read -r -a OFFSETS <<< "${OFFSETS_CSV}"

for raw_offset in "${OFFSETS[@]}"; do
  offset="$(echo "${raw_offset}" | xargs)"
  [[ -z "${offset}" ]] && continue
  run_root="${OUT_ROOT}/offset_${offset}"
  mkdir -p "${run_root}"
  echo "[longmemeval-gate] running offset=${offset} limit=${LIMIT}"
  python3 "${ROOT_DIR}/scripts/bench/longmemeval_ab_matrix.py" \
    --base-url "${BASE_URL}" \
    --limit "${LIMIT}" \
    --offset "${offset}" \
    --matrix-json "${MATRIX_JSON}" \
    --out-root "${run_root}" \
    --minimax-model "${MODEL}" \
    --minimax-endpoint "${ENDPOINT}" \
    --worker-runs-per-trigger "${WORKER_RUNS_PER_TRIGGER}" \
    --recall-retry-on-empty "${RECALL_RETRY_ON_EMPTY}" \
    --recall-retry-sleep-ms "${RECALL_RETRY_SLEEP_MS}"
done

export LONGMEMEVAL_GATE_OUT_ROOT_RESOLVED="${OUT_ROOT}"
export LONGMEMEVAL_GATE_OFFSETS_RESOLVED="${OFFSETS_CSV}"

python3 - <<'PY'
from __future__ import annotations

import glob
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


out_root = Path(os.environ["LONGMEMEVAL_GATE_OUT_ROOT_RESOLVED"]).resolve()
offsets = [x.strip() for x in os.environ["LONGMEMEVAL_GATE_OFFSETS_RESOLVED"].split(",") if x.strip()]

thresholds = {
    "seed_nonzero_ratio_min": float(os.getenv("LONGMEMEVAL_GATE_MIN_SEED_NONZERO_RATIO", "0.9")),
    "offset0_strict_f1_min": float(os.getenv("LONGMEMEVAL_GATE_MIN_F1_STRICT_OFFSET0", "0.05")),
    "offset0_quality_f1_min": float(os.getenv("LONGMEMEVAL_GATE_MIN_F1_QUALITY_OFFSET0", "0.04")),
    "offset0_quality_recall_p95_max": float(os.getenv("LONGMEMEVAL_GATE_MAX_RECALL_P95_QUALITY_OFFSET0_MS", "250")),
    "offset180_strict_f1_min": float(os.getenv("LONGMEMEVAL_GATE_MIN_F1_STRICT_OFFSET180", "0.015")),
    "offset180_quality_f1_min": float(os.getenv("LONGMEMEVAL_GATE_MIN_F1_QUALITY_OFFSET180", "0.015")),
}

checks: list[dict] = []
offset_results: dict[str, dict] = {}
passed = True

for off in offsets:
    compare_candidates = sorted(glob.glob(str(out_root / f"offset_{off}" / "**" / "compare.json"), recursive=True))
    if not compare_candidates:
        checks.append({"check": f"offset_{off}_compare_exists", "ok": False, "actual": None})
        passed = False
        continue
    compare_path = Path(compare_candidates[-1]).resolve()
    payload = json.loads(compare_path.read_text(encoding="utf-8"))
    rows = payload.get("results") or []
    by_name = {str(r.get("name")): r for r in rows if isinstance(r, dict)}
    strict = by_name.get("strict_edges")
    quality = by_name.get("quality_first")

    offset_results[off] = {
        "compare_json": str(compare_path),
        "strict_edges": strict,
        "quality_first": quality,
    }

    for profile_name in ("strict_edges", "quality_first"):
        row = by_name.get(profile_name)
        ok = row is not None and int(row.get("rows_failed") or 0) == 0
        checks.append(
            {
                "check": f"offset_{off}_{profile_name}_rows_failed",
                "ok": ok,
                "actual": None if row is None else int(row.get("rows_failed") or 0),
                "expected": 0,
            }
        )
        if not ok:
            passed = False

    for profile_name in ("strict_edges", "quality_first"):
        row = by_name.get(profile_name)
        ratio = float((row or {}).get("seed_nonzero_ratio") or 0.0)
        ok = ratio >= thresholds["seed_nonzero_ratio_min"]
        checks.append(
            {
                "check": f"offset_{off}_{profile_name}_seed_nonzero_ratio_min",
                "ok": ok,
                "actual": ratio,
                "expected_min": thresholds["seed_nonzero_ratio_min"],
            }
        )
        if not ok:
            passed = False

    if strict is not None and quality is not None:
        strict_f1 = float(strict.get("token_f1_avg") or 0.0)
        quality_f1 = float(quality.get("token_f1_avg") or 0.0)
        quality_p95 = float(quality.get("recall_ms_p95") or 0.0)

        if off == "0":
            ok_strict = strict_f1 >= thresholds["offset0_strict_f1_min"]
            checks.append(
                {
                    "check": "offset_0_strict_f1_min",
                    "ok": ok_strict,
                    "actual": strict_f1,
                    "expected_min": thresholds["offset0_strict_f1_min"],
                }
            )
            if not ok_strict:
                passed = False

            ok_quality_f1 = quality_f1 >= thresholds["offset0_quality_f1_min"]
            checks.append(
                {
                    "check": "offset_0_quality_f1_min",
                    "ok": ok_quality_f1,
                    "actual": quality_f1,
                    "expected_min": thresholds["offset0_quality_f1_min"],
                }
            )
            if not ok_quality_f1:
                passed = False

            ok_quality_p95 = quality_p95 <= thresholds["offset0_quality_recall_p95_max"]
            checks.append(
                {
                    "check": "offset_0_quality_recall_p95_max",
                    "ok": ok_quality_p95,
                    "actual": quality_p95,
                    "expected_max": thresholds["offset0_quality_recall_p95_max"],
                }
            )
            if not ok_quality_p95:
                passed = False
        elif off == "180":
            ok_strict = strict_f1 >= thresholds["offset180_strict_f1_min"]
            checks.append(
                {
                    "check": "offset_180_strict_f1_min",
                    "ok": ok_strict,
                    "actual": strict_f1,
                    "expected_min": thresholds["offset180_strict_f1_min"],
                }
            )
            if not ok_strict:
                passed = False

            ok_quality_f1 = quality_f1 >= thresholds["offset180_quality_f1_min"]
            checks.append(
                {
                    "check": "offset_180_quality_f1_min",
                    "ok": ok_quality_f1,
                    "actual": quality_f1,
                    "expected_min": thresholds["offset180_quality_f1_min"],
                }
            )
            if not ok_quality_f1:
                passed = False

summary = {
    "ok": passed,
    "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    "offsets": offsets,
    "thresholds": thresholds,
    "checks": checks,
    "results": offset_results,
}

json_path = out_root / "gate_summary.json"
md_path = out_root / "gate_summary.md"
json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

lines = [
    "# LongMemEval CI Gate Summary",
    "",
    f"- status: {'PASS' if passed else 'FAIL'}",
    f"- timestamp_utc: `{summary['timestamp_utc']}`",
    f"- offsets: `{','.join(offsets)}`",
    "",
    "| check | ok | actual | expected |",
    "|---|---:|---:|---:|",
]
for c in checks:
    expected = c.get("expected")
    if expected is None and c.get("expected_min") is not None:
        expected = f">={c.get('expected_min')}"
    if expected is None and c.get("expected_max") is not None:
        expected = f"<={c.get('expected_max')}"
    lines.append(
        f"| {c.get('check')} | {'Y' if c.get('ok') else 'N'} | {c.get('actual')} | {expected} |"
    )
md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

print(json.dumps(summary, ensure_ascii=False, indent=2))
print(f"[longmemeval-gate] summary_json={json_path}")
print(f"[longmemeval-gate] summary_md={md_path}")
if not passed:
    sys.exit(1)
PY
