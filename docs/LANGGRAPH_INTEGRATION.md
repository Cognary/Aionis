# LangGraph Integration (Adapter Pattern)

This document provides a minimal integration pattern for LangGraph-style agent flows with Aionis.

## Flow Mapping

1. `recall_text` before planning (retrieve compact context).
2. `tools/select` during planning (apply active/shadow rules).
3. execute tool / agent step.
4. `write` + `tools/feedback` after step completion (persist outcome).

## Runtime Requirements

1. Aionis API reachable (`AIONIS_BASE_URL` or `http://localhost:${PORT}`).
2. If auth is enabled:
   - `API_KEY` (or `PERF_API_KEY`) for `MEMORY_AUTH_MODE=api_key`.
   - `AUTH_BEARER` (or `PERF_AUTH_BEARER`) for `MEMORY_AUTH_MODE=jwt`.
3. Python runtime with local SDK source available in this repo.

## Smoke Command

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
bash examples/langgraph_adapter_smoke.sh
```

Expected output (JSON):

1. `ok: true`
2. `project: "langgraph_style"`
3. `steps.recall_text` / `steps.tools_select` / `steps.write` / `steps.tools_feedback` present

## Reference Script

1. `/Users/lucio/Desktop/Aionis/examples/langgraph_adapter_smoke.sh`
2. `/Users/lucio/Desktop/Aionis/src/dev/langgraph-adapter-smoke.py`
