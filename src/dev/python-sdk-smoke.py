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
        effective_tenant = write.get("data", {}).get("tenant_id") if isinstance(write.get("data"), dict) else None
        if not isinstance(effective_tenant, str) or not effective_tenant.strip():
            effective_tenant = "default"

        pack_export = None
        exported_pack_for_import = None
        exported_manifest_sha_for_import = None
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
            exported_pack_for_import = pack_out.get("data", {}).get("pack") if isinstance(pack_out.get("data"), dict) else None
            exported_manifest_sha_for_import = manifest.get("sha256") if isinstance(manifest, dict) else None
            pack_export = {
                "ok": True,
                "status": pack_out.get("status"),
                "request_id": pack_out.get("request_id"),
                "manifest_sha256": exported_manifest_sha_for_import,
            }
        else:
            pack_export = {"ok": False, "reason": "packs_export capability missing in /health response"}

        sessions_graph = None
        sessions_enabled = feature_caps.get("sessions_graph")
        if sessions_enabled is False:
            try:
                client.create_session(
                    {
                        "scope": scope,
                        "actor": "py_sdk_smoke",
                        "session_id": f"py_sdk_smoke_session_{stamp}",
                        "input_text": "python sdk smoke session should fail when disabled",
                        "auto_embed": False,
                    }
                )
                raise RuntimeError("create_session must fail when sessions_graph capability is disabled")
            except Exception as err:
                if not is_backend_capability_unsupported_error(err):
                    raise
                details = parse_backend_capability_error_details(getattr(err, "details", None))
                if not isinstance(details, dict) or details.get("capability") != "sessions_graph":
                    raise RuntimeError("create_session capability error details missing capability=sessions_graph")
                sessions_graph = {
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
        elif sessions_enabled is True:
            session_id = f"py_sdk_smoke_session_{stamp}"
            created = client.create_session(
                {
                    "scope": scope,
                    "actor": "py_sdk_smoke",
                    "session_id": session_id,
                    "title": "python sdk smoke session",
                    "input_text": "python sdk smoke create session",
                    "auto_embed": False,
                }
            )
            event = client.write_event(
                {
                    "scope": scope,
                    "actor": "py_sdk_smoke",
                    "session_id": session_id,
                    "event_id": f"py_sdk_smoke_event_{stamp}",
                    "input_text": "python sdk smoke session event",
                    "auto_embed": False,
                }
            )
            events = client.list_session_events(
                session_id,
                {
                    "scope": scope,
                    "include_meta": False,
                    "include_slots": False,
                    "include_slots_preview": False,
                    "limit": 20,
                    "offset": 0,
                },
            )
            events_list = events.get("data", {}).get("events", []) if isinstance(events.get("data"), dict) else []
            sessions_graph = {
                "ok": True,
                "create_status": created.get("status"),
                "create_request_id": created.get("request_id"),
                "write_event_status": event.get("status"),
                "write_event_request_id": event.get("request_id"),
                "list_status": events.get("status"),
                "list_request_id": events.get("request_id"),
                "session_id": session_id,
                "event_id": event.get("data", {}).get("event_id") if isinstance(event.get("data"), dict) else None,
                "events_returned": len(events_list) if isinstance(events_list, list) else 0,
            }
        else:
            sessions_graph = {"ok": False, "reason": "sessions_graph capability missing in /health response"}

        pack_import = None
        packs_import_enabled = feature_caps.get("packs_import")
        if packs_import_enabled is False:
            try:
                client.pack_import(
                    {
                        "scope": scope,
                        "actor": "py_sdk_smoke",
                        "verify_only": True,
                        "auto_embed": False,
                        "pack": {
                            "version": "aionis_pack_v1",
                            "tenant_id": effective_tenant,
                            "scope": scope,
                            "nodes": [],
                            "edges": [],
                            "commits": [],
                        },
                    }
                )
                raise RuntimeError("pack_import must fail when packs_import capability is disabled")
            except Exception as err:
                if not is_backend_capability_unsupported_error(err):
                    raise
                details = parse_backend_capability_error_details(getattr(err, "details", None))
                if not isinstance(details, dict) or details.get("capability") != "packs_import":
                    raise RuntimeError("pack_import capability error details missing capability=packs_import")
                pack_import = {
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
        elif packs_import_enabled is True:
            payload = {
                "scope": scope,
                "actor": "py_sdk_smoke",
                "verify_only": True,
                "auto_embed": False,
                "pack": (
                    exported_pack_for_import
                    if isinstance(exported_pack_for_import, dict)
                    else {
                        "version": "aionis_pack_v1",
                        "tenant_id": effective_tenant,
                        "scope": scope,
                        "nodes": [],
                        "edges": [],
                        "commits": [],
                    }
                ),
            }
            if isinstance(exported_manifest_sha_for_import, str) and exported_manifest_sha_for_import:
                payload["manifest_sha256"] = exported_manifest_sha_for_import
            imported = client.pack_import(payload)
            imported_data = imported.get("data") if isinstance(imported.get("data"), dict) else {}
            planned = imported_data.get("planned") if isinstance(imported_data, dict) else {}
            pack_import = {
                "ok": True,
                "status": imported.get("status"),
                "request_id": imported.get("request_id"),
                "verified": bool(isinstance(imported_data, dict) and imported_data.get("verified") is True),
                "imported": bool(isinstance(imported_data, dict) and imported_data.get("imported") is True),
                "planned_nodes": planned.get("nodes") if isinstance(planned, dict) else None,
            }
        else:
            pack_import = {"ok": False, "reason": "packs_import capability missing in /health response"}

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
                "sessions_graph": sessions_graph,
                "pack_import": pack_import,
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
