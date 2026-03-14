---
title: "LangGraph"
description: "Use Aionis with LangGraph-style runtimes to keep planner context bounded, tool choice inspectable, and execution reusable."
---

# LangGraph

LangGraph is a natural fit for Aionis because the planner-executor boundary is exactly where continuity gets lost.

## Practical Flow

The most useful integration order is:

1. before planning: `recall_text` or `planning/context`
2. before action: `rules/evaluate` and `tools/select`
3. after execution: `write` and `tools/feedback`
4. when reuse matters: replay routes

That sequence matches what Aionis already exposes in code.

## Smoke Path

The repository already ships a runnable smoke:

```bash
bash examples/langgraph_adapter_smoke.sh
```

That ultimately runs:

```bash
python3 src/dev/langgraph-adapter-smoke.py
```

This is the right kind of external example because it reflects a real integration path, not only a diagram.

## What To Watch For

In a LangGraph-style runtime, preserve these identifiers early:

1. `request_id`
2. `run_id`
3. `decision_id`
4. `commit_uri`

Those IDs are what make inspection and replay realistic later.

## The External Pitch

For LangGraph users, the message is:

1. keep planner context bounded
2. make tool choice inspectable
3. preserve reusable execution state across runs

That is much stronger than saying "Aionis adds memory to LangGraph."
