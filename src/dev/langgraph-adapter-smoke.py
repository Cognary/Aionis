#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PY_SDK_SRC = os.path.join(ROOT, "packages", "python-sdk", "src")
if PY_SDK_SRC not in sys.path:
    sys.path.insert(0, PY_SDK_SRC)

from aionis_sdk import AionisApiError, AionisClient  # noqa: E402


def _infer_api_key_from_env() -> str | None:
    direct = os.getenv("API_KEY") or os.getenv("PERF_API_KEY")
    if direct:
        return direct
    raw = os.getenv("MEMORY_API_KEYS_JSON")
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            for key in parsed.keys():
                if isinstance(key, str) and key.strip():
                    return key.strip()
    except Exception:
        return None
    return None


def _infer_agent_from_env() -> tuple[str, str]:
    explicit_agent = (os.getenv("AIONIS_AGENT_ID") or os.getenv("AGENT_ID") or "").strip()
    explicit_team = (os.getenv("AIONIS_TEAM_ID") or os.getenv("TEAM_ID") or "").strip()
    if explicit_agent and explicit_team:
        return explicit_agent, explicit_team

    raw = os.getenv("MEMORY_API_KEYS_JSON")
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and parsed:
                api_key = _infer_api_key_from_env()
                rec = parsed.get(api_key) if api_key and api_key in parsed else next(iter(parsed.values()))
                if isinstance(rec, dict):
                    agent = str(rec.get("agent_id") or "").strip()
                    team = str(rec.get("team_id") or "").strip()
                    if agent and team:
                        return agent, team
        except Exception:
            pass

    return "agent_a", "team_default"


def main() -> int:
    port = os.getenv("PORT", "3001")
    scope = os.getenv("MEMORY_SCOPE", "default")
    base_url = (os.getenv("AIONIS_BASE_URL") or f"http://localhost:{port}").strip()

    client = AionisClient(
        base_url=base_url,
        timeout_s=10.0,
        retry={"max_retries": 2, "base_delay_s": 0.2, "max_delay_s": 2.0, "jitter_ratio": 0.2},
        admin_token=os.getenv("ADMIN_TOKEN") or None,
        api_key=_infer_api_key_from_env(),
        auth_bearer=os.getenv("AUTH_BEARER") or os.getenv("PERF_AUTH_BEARER") or None,
    )

    stamp = int(time.time() * 1000)
    run_id = f"lg_run_{stamp}"
    node_client_id = f"lg_evt_{stamp}"
    query = "memory graph"
    agent_id, team_id = _infer_agent_from_env()
    context = {
        "intent": "json",
        "provider": "minimax",
        "tool": {"name": "curl"},
        "run": {"id": run_id},
        "agent": {"id": agent_id, "team_id": team_id},
    }

    try:
        recall_info: dict[str, object]
        try:
            recall = client.recall_text(
                {
                    "scope": scope,
                    "query_text": query,
                    "limit": 10,
                    "return_debug": False,
                    "include_meta": False,
                    "include_slots": False,
                    "include_slots_preview": False,
                    "max_nodes": 30,
                    "max_edges": 60,
                }
            )
            seeds = recall.get("data", {}).get("seeds", []) if isinstance(recall.get("data"), dict) else []
            recall_info = {"ok": True, "status": recall.get("status"), "seeds": len(seeds) if isinstance(seeds, list) else 0}
        except AionisApiError as err:
            if err.code == "no_embedding_provider":
                recall_info = {"ok": False, "reason": "no_embedding_provider"}
            else:
                raise

        select = client.tools_select(
            {
                "scope": scope,
                "context": context,
                "candidates": ["curl", "psql", "bash"],
                "strict": False,
                "include_shadow": True,
                "rules_limit": 50,
            }
        )
        selected = (
            select.get("data", {}).get("selection", {}).get("selected")
            if isinstance(select.get("data"), dict)
            else None
        )
        if not isinstance(selected, str) or not selected:
            selected = "curl"

        write = client.write(
            {
                "scope": scope,
                "input_text": "langgraph adapter smoke write",
                "auto_embed": False,
                "memory_lane": "shared",
                "nodes": [
                    {
                        "client_id": node_client_id,
                        "type": "event",
                        "text_summary": f"langgraph-style step selected tool={selected}",
                    }
                ],
                "edges": [],
            }
        )

        feedback = client.tools_feedback(
            {
                "scope": scope,
                "run_id": run_id,
                "outcome": "positive",
                "context": context,
                "candidates": ["curl", "psql", "bash"],
                "selected_tool": selected,
                "include_shadow": False,
                "rules_limit": 50,
                "target": "tool",
                "input_text": "langgraph adapter smoke feedback",
            }
        )

        out = {
            "ok": True,
            "project": "langgraph_style",
            "base_url": base_url,
            "scope": scope,
            "run_id": run_id,
            "selected_tool": selected,
            "steps": {
                "recall_text": recall_info,
                "tools_select": {"status": select.get("status"), "request_id": select.get("request_id")},
                "write": {"status": write.get("status"), "request_id": write.get("request_id")},
                "tools_feedback": {"status": feedback.get("status"), "request_id": feedback.get("request_id")},
            },
        }
        print(json.dumps(out, indent=2, ensure_ascii=False))
        return 0
    except AionisApiError as err:
        out = {
            "ok": False,
            "error": err.code,
            "message": str(err),
            "status": err.status,
            "request_id": err.request_id,
            "details": err.details,
            "issues": err.issues,
        }
        print(json.dumps(out, indent=2, ensure_ascii=False), file=sys.stderr)
        return 1
    except Exception as err:  # pragma: no cover
        out = {"ok": False, "error": err.__class__.__name__, "message": str(err)}
        print(json.dumps(out, indent=2, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
