#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, obj: Any) -> None:
    ensure_parent(path)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    out: List[Dict[str, Any]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        out.append(json.loads(line))
    return out


def stable_hash(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def unique_scope(prefix: str, suffix: str) -> str:
    stamp = int(time.time() * 1000)
    return f"{prefix}_{suffix}_{stamp}"


def build_headers(api_key: str, bearer: str, admin_token: str = "") -> Dict[str, str]:
    headers: Dict[str, str] = {}
    if api_key:
        headers["X-Api-Key"] = api_key
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    if admin_token:
        headers["X-Admin-Token"] = admin_token
    return headers


def http_post_json(
    base_url: str,
    path: str,
    payload: Dict[str, Any],
    headers: Dict[str, str],
    timeout: int,
) -> Tuple[int, Dict[str, Any]]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(f"{base_url}{path}", data=body, method="POST")
    req.add_header("content-type", "application/json")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            status = int(resp.getcode() or 0)
            try:
                obj = json.loads(raw)
            except Exception:
                obj = {"raw": raw}
            return status, obj
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            obj = json.loads(raw)
        except Exception:
            obj = {"error": "http_error", "raw": raw[:3000]}
        return int(e.code), obj
    except Exception as e:
        return 0, {"error": "transport_error", "message": str(e)}


def count_target_hits(resp: Dict[str, Any], needle: str) -> int:
    n = needle.strip()
    if not n:
        return 0
    nodes = ((resp.get("subgraph") or {}).get("nodes")) or []
    hits = 0
    for node in nodes:
        title = str(node.get("title") or "")
        summary = str(node.get("text_summary") or "")
        if n in title or n in summary:
            hits += 1
    return hits


def deterministic_embedding(seed: str, dim: int = 1536) -> List[float]:
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    out: List[float] = []
    for i in range(dim):
        b = digest[i % len(digest)]
        # map to [0,1], keep 6 decimals for compact JSON
        out.append(round(b / 255.0, 6))
    return out


def alpha_token(seed: str, n: int = 12) -> str:
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    chars: List[str] = []
    for i in range(max(4, n)):
        b = digest[i % len(digest)]
        chars.append(chr(ord("a") + (b % 26)))
    return "".join(chars[:n])


def run_worker_once(cmd: str, timeout_sec: int = 90) -> Tuple[bool, str]:
    if not cmd.strip():
        return True, "skipped"
    try:
        out = subprocess.run(
            cmd,
            shell=True,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout_sec,
        )
        return True, (out.stdout or "").strip()[-2000:]
    except subprocess.TimeoutExpired:
        return False, "timeout"
    except subprocess.CalledProcessError as e:
        return False, (e.stdout or "").strip()[-2000:]


def psql_available() -> bool:
    return shutil.which("psql") is not None


def psql_count(database_url: str, query: str) -> Optional[int]:
    if not database_url or not psql_available():
        return None
    try:
        out = subprocess.run(
            ["psql", database_url, "-At", "-v", "ON_ERROR_STOP=1", "-c", query],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
        )
        v = (out.stdout or "").strip().splitlines()
        if not v:
            return None
        return int(v[-1].strip())
    except Exception:
        return None


def base_case(case_id: str, name: str, pillar: str) -> Dict[str, Any]:
    return {
        "case_id": case_id,
        "name": name,
        "pillar": pillar,
        "started_at_utc": now_utc(),
        "ended_at_utc": None,
        "ok": False,
        "metrics": {},
        "notes": [],
        "artifacts": {},
        "error": None,
    }


def finish_case(case: Dict[str, Any], ok: bool, metrics: Dict[str, Any], notes: List[str], error: str | None = None) -> Dict[str, Any]:
    case["ok"] = bool(ok)
    case["metrics"] = metrics
    case["notes"] = notes
    case["error"] = error
    case["ended_at_utc"] = now_utc()
    return case


def parse_common_args(description: str) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--base-url", default=os.environ.get("AIONIS_BASE_URL", f"http://127.0.0.1:{os.environ.get('PORT', '3001')}"))
    parser.add_argument("--scope-prefix", default="aionisbench")
    parser.add_argument("--api-key", default=os.environ.get("API_KEY", os.environ.get("PERF_API_KEY", "")))
    parser.add_argument("--auth-bearer", default=os.environ.get("AUTH_BEARER", os.environ.get("PERF_AUTH_BEARER", "")))
    parser.add_argument("--admin-token", default=os.environ.get("ADMIN_TOKEN", ""))
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    parser.add_argument("--timeout-sec", type=int, default=20)
    parser.add_argument("--worker-once-cmd", default="npm run -s job:outbox-worker -- --once")
    parser.add_argument("--out-file", default="")
    parser.add_argument("--seed", default="aionisbench_v01")
    parser.add_argument("--scenarios-file", default="")
    return parser.parse_args()
