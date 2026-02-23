import json
import os
from typing import Any, Dict, Tuple

import gradio as gr
import requests


BASE_URL = os.getenv("AIONIS_INTERNAL_BASE_URL", "http://127.0.0.1:3001").rstrip("/")
DEFAULT_SCOPE = os.getenv("MEMORY_SCOPE", "demo")
DEFAULT_TENANT = os.getenv("MEMORY_TENANT_ID", "default")
TIMEOUT = float(os.getenv("AIONIS_HTTP_TIMEOUT_SEC", "20"))


def _pretty(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True)


def _post(path: str, payload: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    url = f"{BASE_URL}{path}"
    try:
        resp = requests.post(url, json=payload, timeout=TIMEOUT)
        body = resp.json() if resp.content else {}
        ok = 200 <= resp.status_code < 300
        return ok, {"status": resp.status_code, "url": url, "body": body}
    except Exception as exc:
        return False, {"status": 0, "url": url, "error": str(exc)}


def check_health() -> str:
    url = f"{BASE_URL}/health"
    try:
        resp = requests.get(url, timeout=TIMEOUT)
        body = resp.json() if resp.content else {}
        return _pretty({"status": resp.status_code, "url": url, "body": body})
    except Exception as exc:
        return _pretty({"status": 0, "url": url, "error": str(exc)})


def write_memory(tenant_id: str, scope: str, input_text: str, auto_embed: bool) -> str:
    payload = {
        "tenant_id": tenant_id.strip() or DEFAULT_TENANT,
        "scope": scope.strip() or DEFAULT_SCOPE,
        "input_text": input_text.strip(),
        "auto_embed": bool(auto_embed),
    }
    ok, data = _post("/v1/memory/write", payload)
    data["ok"] = ok
    return _pretty(data)


def recall_text(tenant_id: str, scope: str, query_text: str, limit: int, context_token_budget: int, profile: str) -> str:
    payload: Dict[str, Any] = {
        "tenant_id": tenant_id.strip() or DEFAULT_TENANT,
        "scope": scope.strip() or DEFAULT_SCOPE,
        "query_text": query_text.strip(),
        "limit": int(limit),
    }
    if context_token_budget > 0:
        payload["context_token_budget"] = int(context_token_budget)
    if profile.strip():
        payload["context_compaction_profile"] = profile.strip()

    ok, data = _post("/v1/memory/recall_text", payload)
    data["ok"] = ok
    return _pretty(data)


with gr.Blocks(title="Aionis Demo Panel") as demo:
    gr.Markdown(
        """
# Aionis Demo Panel

This panel talks to the internal Aionis API inside this Space.
"""
    )
    gr.Markdown(f"**API Base URL:** `{BASE_URL}`")

    with gr.Tab("Health"):
        health_btn = gr.Button("Check /health", variant="primary")
        health_out = gr.Code(label="Health Response", language="json")
        health_btn.click(fn=check_health, outputs=health_out)

    with gr.Tab("Write"):
        w_tenant = gr.Textbox(label="tenant_id", value=DEFAULT_TENANT)
        w_scope = gr.Textbox(label="scope", value=DEFAULT_SCOPE)
        w_text = gr.Textbox(label="input_text", lines=4, value="Aionis HF demo memory entry.")
        w_embed = gr.Checkbox(label="auto_embed", value=True)
        write_btn = gr.Button("Write Memory", variant="primary")
        write_out = gr.Code(label="Write Response", language="json")
        write_btn.click(fn=write_memory, inputs=[w_tenant, w_scope, w_text, w_embed], outputs=write_out)

    with gr.Tab("Recall"):
        r_tenant = gr.Textbox(label="tenant_id", value=DEFAULT_TENANT)
        r_scope = gr.Textbox(label="scope", value=DEFAULT_SCOPE)
        r_query = gr.Textbox(label="query_text", lines=3, value="What memory do you have about the HF demo?")
        r_limit = gr.Slider(label="limit", minimum=1, maximum=30, step=1, value=10)
        r_budget = gr.Slider(label="context_token_budget (0 disables)", minimum=0, maximum=4096, step=64, value=0)
        r_profile = gr.Dropdown(
            label="context_compaction_profile",
            choices=["", "balanced", "aggressive"],
            value="",
            info="Optional. Leave empty for server default.",
        )
        recall_btn = gr.Button("Recall Text", variant="primary")
        recall_out = gr.Code(label="Recall Response", language="json")
        recall_btn.click(
            fn=recall_text,
            inputs=[r_tenant, r_scope, r_query, r_limit, r_budget, r_profile],
            outputs=recall_out,
        )


if __name__ == "__main__":
    demo.launch(
        server_name=os.getenv("GRADIO_SERVER_NAME", "0.0.0.0"),
        server_port=int(os.getenv("GRADIO_SERVER_PORT", "7860")),
        show_api=False,
    )
