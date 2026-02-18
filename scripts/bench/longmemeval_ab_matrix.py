#!/usr/bin/env python3
"""
Run A/B matrix experiments for LongMemEval on top of longmemeval_aionis_minimax.py.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def default_matrix() -> List[Dict[str, Any]]:
    return [
        {
            "name": "baseline",
            "recall_limit": 20,
            "recall_hops": 2,
            "recall_max_nodes": 50,
            "recall_max_edges": 100,
            "recall_ranked_limit": 100,
            "recall_min_edge_weight": 0.0,
            "recall_min_edge_confidence": 0.0,
            "prompt_style": "extractive",
        },
        {
            "name": "latency_first",
            "recall_limit": 12,
            "recall_hops": 1,
            "recall_max_nodes": 30,
            "recall_max_edges": 60,
            "recall_ranked_limit": 60,
            "recall_min_edge_weight": 0.1,
            "recall_min_edge_confidence": 0.1,
            "prompt_style": "extractive",
        },
        {
            "name": "quality_first",
            "recall_limit": 30,
            "recall_hops": 2,
            "recall_max_nodes": 80,
            "recall_max_edges": 100,
            "recall_ranked_limit": 180,
            "recall_min_edge_weight": 0.05,
            "recall_min_edge_confidence": 0.05,
            "prompt_style": "extractive",
        },
        {
            "name": "strict_edges",
            "recall_limit": 24,
            "recall_hops": 2,
            "recall_max_nodes": 60,
            "recall_max_edges": 80,
            "recall_ranked_limit": 140,
            "recall_min_edge_weight": 0.2,
            "recall_min_edge_confidence": 0.2,
            "prompt_style": "extractive",
        },
    ]


def to_flag(k: str) -> str:
    return "--" + k.replace("_", "-")


def load_details_stats(details_path: Path) -> Dict[str, float]:
    if not details_path.exists():
        return {"seed_avg": 0.0, "seed_nonzero_ratio": 0.0}
    rows = json.loads(details_path.read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not rows:
        return {"seed_avg": 0.0, "seed_nonzero_ratio": 0.0}
    seeds = []
    for row in rows:
        if not isinstance(row, dict) or not row.get("ok"):
            continue
        seeds.append(float(row.get("seeds", 0.0)))
    if not seeds:
        return {"seed_avg": 0.0, "seed_nonzero_ratio": 0.0}
    nonzero = sum(1 for x in seeds if x > 0)
    return {
        "seed_avg": sum(seeds) / len(seeds),
        "seed_nonzero_ratio": nonzero / len(seeds),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run LongMemEval A/B matrix for Aionis recall tuning")
    parser.add_argument("--runner", default="scripts/bench/longmemeval_aionis_minimax.py")
    parser.add_argument("--matrix-json", default="", help="Path to matrix config json list")
    parser.add_argument("--out-root", default="", help="Output root (default artifacts/longmemeval/matrix/<run_id>)")
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--dataset", default="")
    parser.add_argument("--dataset-url", default="")
    parser.add_argument("--scope-prefix", default="longmemeval_ab")
    parser.add_argument("--session-max-chars", type=int, default=3000)
    parser.add_argument("--context-max-chars", type=int, default=12000)
    parser.add_argument("--base-url", default="")
    parser.add_argument("--http-timeout", type=int, default=60)
    parser.add_argument("--worker-once-cmd", default="node dist/jobs/outbox-worker.js --once")
    parser.add_argument("--worker-every", type=int, default=1)
    parser.add_argument("--worker-runs-per-trigger", type=int, default=1)
    parser.add_argument("--recall-retry-on-empty", type=int, default=2)
    parser.add_argument("--recall-retry-sleep-ms", type=int, default=250)
    parser.add_argument("--minimax-model", default="MiniMax-M2.1")
    parser.add_argument("--minimax-endpoint", default="")
    parser.add_argument("--minimax-base-url", default="")
    parser.add_argument("--minimax-max-tokens", type=int, default=128)
    parser.add_argument("--minimax-temperature", type=float, default=0.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[2]
    runner = (root / args.runner).resolve()
    if not runner.exists():
        print(f"runner missing: {runner}", file=sys.stderr)
        return 1

    if args.matrix_json:
        matrix_path = Path(args.matrix_json).resolve()
        matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
        if not isinstance(matrix, list) or not matrix:
            print("matrix-json must be a non-empty json list", file=sys.stderr)
            return 1
    else:
        matrix = default_matrix()

    run_id = now_utc()
    out_root = Path(args.out_root).resolve() if args.out_root else (root / f"artifacts/longmemeval/matrix/{run_id}")
    out_root.mkdir(parents=True, exist_ok=True)

    rows: List[Dict[str, Any]] = []
    for idx, cfg in enumerate(matrix, start=1):
        if not isinstance(cfg, dict):
            continue
        name = str(cfg.get("name", f"cfg_{idx}"))
        out_dir = out_root / name
        out_dir.mkdir(parents=True, exist_ok=True)

        cmd = [
            sys.executable,
            str(runner),
            "--limit",
            str(args.limit),
            "--offset",
            str(args.offset),
            "--scope-prefix",
            f"{args.scope_prefix}_{name}",
            "--session-max-chars",
            str(args.session_max_chars),
            "--context-max-chars",
            str(args.context_max_chars),
            "--http-timeout",
            str(args.http_timeout),
            "--worker-every",
            str(args.worker_every),
            "--worker-runs-per-trigger",
            str(args.worker_runs_per_trigger),
            "--recall-retry-on-empty",
            str(args.recall_retry_on_empty),
            "--recall-retry-sleep-ms",
            str(args.recall_retry_sleep_ms),
            "--minimax-model",
            args.minimax_model,
            "--minimax-max-tokens",
            str(args.minimax_max_tokens),
            "--minimax-temperature",
            str(args.minimax_temperature),
            "--out-dir",
            str(out_dir),
        ]
        if args.dataset:
            cmd.extend(["--dataset", args.dataset])
        if args.dataset_url:
            cmd.extend(["--dataset-url", args.dataset_url])
        if args.base_url:
            cmd.extend(["--base-url", args.base_url])
        if args.worker_once_cmd == "":
            cmd.extend(["--worker-once-cmd", ""])
        elif args.worker_once_cmd:
            cmd.extend(["--worker-once-cmd", args.worker_once_cmd])
        if args.minimax_endpoint:
            cmd.extend(["--minimax-endpoint", args.minimax_endpoint])
        if args.minimax_base_url:
            cmd.extend(["--minimax-base-url", args.minimax_base_url])

        for key in [
            "recall_limit",
            "recall_hops",
            "recall_max_nodes",
            "recall_max_edges",
            "recall_ranked_limit",
            "recall_min_edge_weight",
            "recall_min_edge_confidence",
            "prompt_style",
        ]:
            if key in cfg:
                cmd.extend([to_flag(key), str(cfg[key])])
        if cfg.get("recall_return_debug") is True:
            cmd.append("--recall-return-debug")

        cmd_txt = " ".join(subprocess.list2cmdline([c]) for c in cmd)
        print(f"\n[{idx}/{len(matrix)}] running {name}")
        print(cmd_txt)
        if args.dry_run:
            rows.append({"name": name, "ok": True, "dry_run": True, "config": cfg})
            continue

        proc = subprocess.run(cmd, cwd=str(root), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        (out_dir / "run.log").write_text(proc.stdout, encoding="utf-8")
        summary_file = out_dir / "summary.json"
        details_file = out_dir / "details.json"
        if proc.returncode != 0:
            rows.append(
                {
                    "name": name,
                    "ok": False,
                    "return_code": proc.returncode,
                    "config": cfg,
                    "log": str((out_dir / "run.log").resolve()),
                }
            )
            print(f"  -> failed (rc={proc.returncode})")
            continue
        if not summary_file.exists():
            rows.append({"name": name, "ok": False, "return_code": 0, "config": cfg, "error": "summary.json missing"})
            print("  -> failed (summary missing)")
            continue
        summary = json.loads(summary_file.read_text(encoding="utf-8"))
        seed_stats = load_details_stats(details_file)
        result = {
            "name": name,
            "ok": True,
            "config": cfg,
            "summary_json": str(summary_file.resolve()),
            "details_json": str(details_file.resolve()),
            "run_log": str((out_dir / "run.log").resolve()),
            "rows_ok": summary.get("rows_ok"),
            "rows_failed": summary.get("rows_failed"),
            "exact_match_avg": ((summary.get("metrics") or {}).get("exact_match_avg")),
            "token_f1_avg": ((summary.get("metrics") or {}).get("token_f1_avg")),
            "recall_ms_avg": ((summary.get("latency_ms_avg") or {}).get("recall")),
            "recall_ms_p50": ((summary.get("latency_ms_p50") or {}).get("recall")),
            "recall_ms_p95": ((summary.get("latency_ms_p95") or {}).get("recall")),
            "llm_ms_avg": ((summary.get("latency_ms_avg") or {}).get("llm")),
            "seed_avg": seed_stats["seed_avg"],
            "seed_nonzero_ratio": seed_stats["seed_nonzero_ratio"],
        }
        rows.append(result)
        print(
            "  -> ok "
            f"EM={result['exact_match_avg']:.4f} "
            f"F1={result['token_f1_avg']:.4f} "
            f"recall_p95={result['recall_ms_p95']:.1f}ms "
            f"seed_nz={result['seed_nonzero_ratio']:.2f}"
        )

    ok_rows = [r for r in rows if r.get("ok")]
    ranking = sorted(ok_rows, key=lambda r: (-(r.get("token_f1_avg") or 0.0), r.get("recall_ms_p95") or 10**9))
    summary = {
        "ok": True,
        "run_id": run_id,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "rows_total": len(rows),
        "rows_ok": len(ok_rows),
        "rows_failed": len(rows) - len(ok_rows),
        "best_by_f1": ranking[0] if ranking else None,
        "results": rows,
        "artifacts": {
            "compare_json": str((out_root / "compare.json").resolve()),
            "compare_md": str((out_root / "compare.md").resolve()),
        },
    }

    compare_json = out_root / "compare.json"
    compare_md = out_root / "compare.md"
    compare_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    md_lines = [
        "# LongMemEval A/B Matrix",
        "",
        f"- run_id: `{run_id}`",
        f"- timestamp_utc: `{summary['timestamp_utc']}`",
        f"- rows_ok: `{summary['rows_ok']}` / `{summary['rows_total']}`",
        "",
        "| config | ok | rows_ok | EM | F1 | recall_avg_ms | recall_p95_ms | seed_nonzero_ratio |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for r in rows:
        md_lines.append(
            "| {name} | {ok} | {rows_ok} | {em:.4f} | {f1:.4f} | {ravg:.1f} | {rp95:.1f} | {seed:.2f} |".format(
                name=r.get("name", "-"),
                ok="Y" if r.get("ok") else "N",
                rows_ok=r.get("rows_ok", 0),
                em=float(r.get("exact_match_avg") or 0.0),
                f1=float(r.get("token_f1_avg") or 0.0),
                ravg=float(r.get("recall_ms_avg") or 0.0),
                rp95=float(r.get("recall_ms_p95") or 0.0),
                seed=float(r.get("seed_nonzero_ratio") or 0.0),
            )
        )
    if ranking:
        md_lines.extend(
            [
                "",
                "## Best (F1-first)",
                "",
                f"- config: `{ranking[0].get('name')}`",
                f"- F1: `{float(ranking[0].get('token_f1_avg') or 0.0):.4f}`",
                f"- EM: `{float(ranking[0].get('exact_match_avg') or 0.0):.4f}`",
                f"- recall_p95_ms: `{float(ranking[0].get('recall_ms_p95') or 0.0):.1f}`",
            ]
        )
    compare_md.write_text("\n".join(md_lines) + "\n", encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
