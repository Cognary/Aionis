#!/usr/bin/env python3
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Dict

from common import (
    alpha_token,
    base_case,
    build_headers,
    deterministic_embedding,
    finish_case,
    http_post_json,
    load_dotenv,
    now_utc,
    parse_common_args,
    unique_scope,
    write_json,
)


def _validate_debug_embeddings(resp: Dict[str, Any]) -> bool:
    dbg = (resp.get("debug") or {}) if isinstance(resp, dict) else {}
    rows = dbg.get("embeddings")
    if not isinstance(rows, list):
        return False
    if len(rows) > 5:
        return False
    for row in rows:
        if not isinstance(row, dict):
            return False
        if "sha256" not in row:
            return False
        preview = row.get("preview")
        if not isinstance(preview, list):
            return False
        if len(preview) > 16:
            return False
    return True


def case_debug_embedding_safety(args) -> Dict[str, Any]:
    case = base_case(
        "OB-002",
        "Debug embeddings safety gate: limit/auth/preview bounds",
        "Operability",
    )
    scope = unique_scope(args.scope_prefix, "ob2")
    api_headers = build_headers(args.api_key, args.auth_bearer)
    key = f"benchob{alpha_token(f'ob2:{time.time_ns()}', 10)}"

    write_payload = {
        "scope": scope,
        "input_text": "aionisbench ob safety setup",
        "memory_lane": "shared",
        "auto_embed": False,
        "nodes": [
            {
                "client_id": "evt_ob2",
                "type": "event",
                "text_summary": f"debug embed safety marker {key}",
                "embedding": deterministic_embedding(f"{key}:emb"),
                "embedding_model": "bench:det",
            }
        ],
    }
    s_w, _ = http_post_json(args.base_url, "/v1/memory/write", write_payload, api_headers, args.timeout_sec)

    # Hard limit check: debug embeddings mode requires limit <= 20.
    too_high_payload = {
        "scope": scope,
        "query_text": key,
        "limit": 25,
        "return_debug": True,
        "include_embeddings": True,
    }
    s_hi, r_hi = http_post_json(args.base_url, "/v1/memory/recall_text", too_high_payload, api_headers, args.timeout_sec)

    # Auth/preview check with legal limit.
    legal_payload = {
        "scope": scope,
        "query_text": key,
        "limit": 10,
        "return_debug": True,
        "include_embeddings": True,
    }
    s_no_admin, r_no_admin = http_post_json(args.base_url, "/v1/memory/recall_text", legal_payload, api_headers, args.timeout_sec)

    admin_configured = bool(args.admin_token.strip())
    with_admin_status = None
    with_admin_preview_ok = None
    auth_guard_ok = False

    if admin_configured:
        auth_guard_ok = s_no_admin == 400 and str(r_no_admin.get("error") or "") == "debug_embeddings_not_allowed"
        admin_headers = build_headers(args.api_key, args.auth_bearer, args.admin_token)
        s_with_admin, r_with_admin = http_post_json(args.base_url, "/v1/memory/recall_text", legal_payload, admin_headers, args.timeout_sec)
        with_admin_status = s_with_admin
        with_admin_preview_ok = _validate_debug_embeddings(r_with_admin) if s_with_admin == 200 else False
        # With valid admin token, high-limit should fail for limit guard (not auth guard).
        s_hi_admin, r_hi_admin = http_post_json(args.base_url, "/v1/memory/recall_text", too_high_payload, admin_headers, args.timeout_sec)
        limit_guard_ok = s_hi_admin == 400 and str(r_hi_admin.get("error") or "") == "debug_embeddings_limit_too_high"
        auth_guard_ok = auth_guard_ok and s_with_admin == 200 and bool(with_admin_preview_ok)
    else:
        # In non-prod loopback mode, debug embeddings may be allowed without ADMIN_TOKEN.
        # In prod or stricter envs, denial is also acceptable.
        if s_no_admin == 200:
            auth_guard_ok = _validate_debug_embeddings(r_no_admin)
        else:
            auth_guard_ok = True
        # Without admin token path, auth failure can precede limit guard; treat explicit auth block as acceptable.
        err_hi = str(r_hi.get("error") or "")
        limit_guard_ok = s_hi == 400 and err_hi in {"debug_embeddings_limit_too_high", "debug_embeddings_not_allowed"}

    ok = s_w == 200 and limit_guard_ok and auth_guard_ok
    metrics = {
        "scope": scope,
        "write_status": s_w,
        "limit_guard_status": s_hi,
        "limit_guard_error": r_hi.get("error") if isinstance(r_hi, dict) else None,
        "no_admin_status": s_no_admin,
        "admin_configured": admin_configured,
        "with_admin_status": with_admin_status,
        "with_admin_preview_ok": with_admin_preview_ok,
        "app_env": os.environ.get("APP_ENV", ""),
        "limit_guard_ok": limit_guard_ok,
        "auth_guard_ok": auth_guard_ok,
    }
    return finish_case(case, ok, metrics, [], None if ok else "debug safety contract assertion failed")


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env")
    args = parse_common_args("Run AionisBench Operability suite (v0.1)")

    started = now_utc()
    cases = [case_debug_embedding_safety(args)]
    suite_ok = all(bool(c.get("ok")) for c in cases)
    out = {
        "suite": "ob",
        "ok": suite_ok,
        "started_at_utc": started,
        "ended_at_utc": now_utc(),
        "cases": cases,
    }
    if args.out_file:
        write_json(Path(args.out_file), out)
    import json

    print(json.dumps(out, ensure_ascii=False, indent=2))
    raise SystemExit(0 if suite_ok else 1)


if __name__ == "__main__":
    main()
