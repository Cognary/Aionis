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

from aionis_sdk import (  # noqa: E402
    AionisApiError,
    AionisClient,
    is_backend_capability_unsupported_error,
    parse_backend_capability_error_details,
)


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


def main() -> int:
    port = os.getenv("PORT", "3001")
    scope = os.getenv("MEMORY_SCOPE", "default")
    base_url = (os.getenv("AIONIS_BASE_URL") or f"http://localhost:{port}").strip()
    admin_token = os.getenv("ADMIN_TOKEN") or None
    api_key = _infer_api_key_from_env()
    auth_bearer = os.getenv("AUTH_BEARER") or os.getenv("PERF_AUTH_BEARER") or None

    client = AionisClient(
        base_url=base_url,
        timeout_s=10.0,
        retry={"max_retries": 2, "base_delay_s": 0.2, "max_delay_s": 2.0, "jitter_ratio": 0.2},
        admin_token=admin_token,
        api_key=api_key,
        auth_bearer=auth_bearer,
    )

    stamp = int(time.time() * 1000)
    client_id = f"py_sdk_smoke_evt_{stamp}"

    try:
        write = client.write(
            {
                "scope": scope,
                "input_text": "python sdk smoke write",
                "auto_embed": False,
                "memory_lane": "shared",
                "nodes": [{"client_id": client_id, "type": "event", "text_summary": "python sdk smoke event"}],
                "edges": [],
            }
        )

        rules = client.rules_evaluate(
            {
                "scope": scope,
                "context": {"intent": "json", "provider": "minimax", "tool": {"name": "curl"}},
                "include_shadow": True,
                "limit": 50,
            }
        )

        tools = client.tools_select(
            {
                "scope": scope,
                "context": {"intent": "json", "provider": "minimax", "tool": {"name": "curl"}},
                "candidates": ["psql", "curl", "bash"],
                "strict": False,
                "include_shadow": False,
                "rules_limit": 50,
            }
        )

        health = client.health()
        capability_contract = client.get_capability_contract()
        health_data = health.get("data") if isinstance(health.get("data"), dict) else {}
        contract_from_health = (
            health_data.get("memory_store_capability_contract")
            if isinstance(health_data.get("memory_store_capability_contract"), dict)
            else {}
        )
        if capability_contract.get("data") != contract_from_health:
            raise RuntimeError("get_capability_contract does not match /health.memory_store_capability_contract")
        feature_caps = (
            health_data.get("memory_store_feature_capabilities")
            if isinstance(health_data.get("memory_store_feature_capabilities"), dict)
            else {}
        )

        pack_export = None
        packs_export_enabled = feature_caps.get("packs_export")
        if packs_export_enabled is False:
            try:
                client.pack_export(
                    {
                        "scope": scope,
                        "include_nodes": False,
                        "include_edges": False,
                        "include_commits": False,
                        "include_meta": False,
                        "max_rows": 1,
                    }
                )
                raise RuntimeError("pack_export must fail when packs_export capability is disabled")
            except Exception as err:
                if not is_backend_capability_unsupported_error(err):
                    raise
                details = parse_backend_capability_error_details(getattr(err, "details", None))
                if not isinstance(details, dict) or details.get("capability") != "packs_export":
                    raise RuntimeError("pack_export capability error details missing capability=packs_export")
                pack_export = {
                    "ok": True,
                    "status": getattr(err, "status", None),
                    "request_id": getattr(err, "request_id", None),
                    "capability_error": {
                        "capability": details.get("capability"),
                        "failure_mode": details.get("failure_mode"),
                        "degraded_mode": details.get("degraded_mode"),
                        "fallback_applied": details.get("fallback_applied"),
                    },
                }
        elif packs_export_enabled is True:
            pack_out = client.pack_export(
                {
                    "scope": scope,
                    "include_nodes": False,
                    "include_edges": False,
                    "include_commits": False,
                    "include_meta": False,
                    "max_rows": 1,
                }
            )
            manifest = pack_out.get("data", {}).get("manifest", {}) if isinstance(pack_out.get("data"), dict) else {}
            pack_export = {
                "ok": True,
                "status": pack_out.get("status"),
                "request_id": pack_out.get("request_id"),
                "manifest_sha256": manifest.get("sha256") if isinstance(manifest, dict) else None,
            }
        else:
            pack_export = {"ok": False, "reason": "packs_export capability missing in /health response"}

        recall_text = None
        try:
            recall = client.recall_text(
                {
                    "scope": scope,
                    "query_text": "memory graph",
                    "limit": 10,
                    "return_debug": False,
                    "include_embeddings": False,
                    "include_meta": False,
                    "include_slots": False,
                    "include_slots_preview": False,
                    "slots_preview_keys": 10,
                    "max_nodes": 30,
                    "max_edges": 60,
                    "ranked_limit": 100,
                    "neighborhood_hops": 2,
                    "min_edge_weight": 0,
                    "min_edge_confidence": 0,
                    "rules_include_shadow": False,
                    "rules_limit": 50,
                }
            )
            seeds = recall.get("data", {}).get("seeds", []) if isinstance(recall.get("data"), dict) else []
            recall_text = {
                "ok": True,
                "status": recall.get("status"),
                "request_id": recall.get("request_id"),
                "seeds": len(seeds) if isinstance(seeds, list) else 0,
            }
        except AionisApiError as err:
            if err.code == "no_embedding_provider":
                recall_text = {"ok": False, "reason": "recall_text skipped: no embedding provider configured"}
            else:
                raise

        out = {
            "ok": True,
            "base_url": base_url,
            "scope": scope,
            "calls": {
                "write": {
                    "status": write.get("status"),
                    "request_id": write.get("request_id"),
                    "commit_id": write.get("data", {}).get("commit_id") if isinstance(write.get("data"), dict) else None,
                    "node_id": (
                        write.get("data", {}).get("nodes", [{}])[0].get("id")
                        if isinstance(write.get("data"), dict) and isinstance(write.get("data", {}).get("nodes"), list)
                        else None
                    ),
                },
                "rules_evaluate": {
                    "status": rules.get("status"),
                    "request_id": rules.get("request_id"),
                    "considered": int(rules.get("data", {}).get("considered", 0)) if isinstance(rules.get("data"), dict) else 0,
                    "matched": int(rules.get("data", {}).get("matched", 0)) if isinstance(rules.get("data"), dict) else 0,
                },
                "tools_select": {
                    "status": tools.get("status"),
                    "request_id": tools.get("request_id"),
                    "selected": (
                        tools.get("data", {}).get("selection", {}).get("selected")
                        if isinstance(tools.get("data"), dict)
                        else None
                    ),
                },
                "health": {
                    "status": health.get("status"),
                    "request_id": health.get("request_id"),
                    "backend": health_data.get("memory_store_backend"),
                    "feature_capabilities": feature_caps,
                    "capability_contract_keys": sorted(contract_from_health.keys()),
                },
                "pack_export": pack_export,
                "recall_text": recall_text,
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
    except Exception as err:  # pragma: no cover - fallback
        out = {
            "ok": False,
            "error": err.__class__.__name__,
            "message": str(err),
        }
        print(json.dumps(out, indent=2, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
