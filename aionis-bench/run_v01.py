#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def now_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def run_suite(cmd: List[str], env: Dict[str, str]) -> int:
    p = subprocess.run(cmd, env=env, check=False)
    return int(p.returncode)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run AionisBench v0.1 (6 core cases)")
    parser.add_argument("--base-url", default=os.environ.get("AIONIS_BASE_URL", f"http://127.0.0.1:{os.environ.get('PORT', '3001')}"))
    parser.add_argument("--scope-prefix", default="aionisbench")
    parser.add_argument("--api-key", default=os.environ.get("API_KEY", os.environ.get("PERF_API_KEY", "")))
    parser.add_argument("--auth-bearer", default=os.environ.get("AUTH_BEARER", os.environ.get("PERF_AUTH_BEARER", "")))
    parser.add_argument("--admin-token", default=os.environ.get("ADMIN_TOKEN", ""))
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    parser.add_argument("--timeout-sec", type=int, default=20)
    parser.add_argument("--worker-once-cmd", default="npm run -s job:outbox-worker -- --once")
    parser.add_argument("--run-id", default=now_id())
    parser.add_argument("--out-dir", default="")
    parser.add_argument("--suites", default="gmb,eab,xmb,ob", help="comma-separated subset: gmb,eab,xmb,ob")
    parser.add_argument("--seed", default="aionisbench_v01")
    parser.add_argument("--allow-fail", action="store_true")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / ".env")

    out_dir = Path(args.out_dir) if args.out_dir else (root / "artifacts" / "aionisbench" / "runs" / args.run_id)
    raw_dir = out_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    suite_set = {x.strip() for x in args.suites.split(",") if x.strip()}
    valid = {"gmb", "eab", "xmb", "ob"}
    invalid = sorted(suite_set - valid)
    if invalid:
        raise SystemExit(f"invalid suites: {','.join(invalid)}")

    suite_specs = [
        ("gmb", root / "aionis-bench" / "harness" / "run_gmb.py", root / "aionis-bench" / "scenarios" / "gmb_small.jsonl"),
        ("eab", root / "aionis-bench" / "harness" / "run_eab.py", ""),
        ("xmb", root / "aionis-bench" / "harness" / "run_xmb.py", root / "aionis-bench" / "scenarios" / "xmb_rules.jsonl"),
        ("ob", root / "aionis-bench" / "harness" / "run_ob.py", ""),
    ]

    env = dict(os.environ)
    suites_out: List[Dict[str, Any]] = []
    suite_exit_codes: Dict[str, int] = {}
    for suite, script_path, scenario_path in suite_specs:
        if suite not in suite_set:
            continue
        out_file = raw_dir / f"{suite}.json"
        cmd = [
            "python3",
            str(script_path),
            "--base-url",
            args.base_url,
            "--scope-prefix",
            f"{args.scope_prefix}_{args.run_id}_{suite}",
            "--api-key",
            args.api_key,
            "--auth-bearer",
            args.auth_bearer,
            "--admin-token",
            args.admin_token,
            "--database-url",
            args.database_url,
            "--timeout-sec",
            str(args.timeout_sec),
            "--worker-once-cmd",
            args.worker_once_cmd,
            "--seed",
            args.seed,
            "--out-file",
            str(out_file),
        ]
        if scenario_path:
            cmd.extend(["--scenarios-file", str(scenario_path)])
        print(f"[aionisbench] running suite={suite} out={out_file}")
        ec = run_suite(cmd, env)
        suite_exit_codes[suite] = ec
        if out_file.exists():
            suites_out.append(read_json(out_file))
        else:
            suites_out.append(
                {
                    "suite": suite,
                    "ok": False,
                    "cases": [],
                    "error": f"missing suite output (exit_code={ec})",
                }
            )

    cases: List[Dict[str, Any]] = []
    for s in suites_out:
        for c in s.get("cases", []):
            cc = dict(c)
            cc["suite"] = s.get("suite")
            cases.append(cc)

    details = {
        "ok": all(bool(c.get("ok")) for c in cases) if cases else False,
        "run_id": args.run_id,
        "base_url": args.base_url,
        "scope_prefix": args.scope_prefix,
        "suites_requested": sorted(list(suite_set)),
        "suite_exit_codes": suite_exit_codes,
        "cases": cases,
        "suites": suites_out,
        "artifacts": {
            "out_dir": str(out_dir),
            "raw_dir": str(raw_dir),
            "details_json": str(out_dir / "details.json"),
            "summary_json": str(out_dir / "summary.json"),
            "report_md": str(out_dir / "report.md"),
        },
    }
    details_json = out_dir / "details.json"
    write_json(details_json, details)

    summarize_cmd = [
        "python3",
        str(root / "aionis-bench" / "metrics" / "summarize.py"),
        "--details-json",
        str(details_json),
        "--out-summary-json",
        str(out_dir / "summary.json"),
        "--out-report-md",
        str(out_dir / "report.md"),
    ]
    summarize_ec = run_suite(summarize_cmd, env)
    if summarize_ec != 0:
        raise SystemExit(summarize_ec)

    summary = read_json(out_dir / "summary.json")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.allow_fail:
        raise SystemExit(0)
    raise SystemExit(0 if summary.get("ok") else 1)


if __name__ == "__main__":
    main()
