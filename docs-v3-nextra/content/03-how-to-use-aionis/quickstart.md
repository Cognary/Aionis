---
title: "Quickstart"
description: "Run Lite or Server, write one memory, recall it, and recover one handoff in the shortest useful Aionis evaluation path."
---

# Quickstart

This quickstart is built for first success, not for exhaustive setup coverage.

## Path A: Lite In Minutes

Use Lite if your goal is to validate Aionis locally with the lowest setup friction.

Use a fresh scope for docs-style validation so you do not mix your result with existing local data.

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
npm install
npm run build
npm run start:lite
```

Health:

```bash
curl -fsS http://localhost:3001/health | jq '{ok,aionis_edition,memory_store_backend}'
```

Expected shape:

1. `ok = true`
2. `aionis_edition = "lite"`
3. `memory_store_backend = "lite_sqlite"`

Write one memory item:

```bash
curl -sS http://localhost:3001/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"docs_v2_quickstart",
    "input_text":"Customer prefers email follow-up",
    "memory_lane":"shared",
    "nodes":[{"type":"event","memory_lane":"shared","text_summary":"Customer prefers email follow-up"}]
  }' | jq '{scope,tenant_id,commit_id,commit_uri,nodes}'
```

Recall it:

```bash
curl -sS http://localhost:3001/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"docs_v2_quickstart",
    "query_text":"preferred follow-up channel",
    "limit":5
  }' | jq '{scope,tenant_id,context}'
```

Store one exact handoff:

```bash
curl -sS http://localhost:3001/v1/handoff/store \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"docs_v2_quickstart",
    "anchor":"quickstart_patch_001",
    "handoff_kind":"task_handoff",
    "summary":"Lite quickstart validated",
    "handoff_text":"Write and recall worked. Next step is testing replay integration.",
    "memory_lane":"shared"
  }' | jq '{scope,tenant_id,commit_uri,handoff}'
```

Recover it:

```bash
curl -sS http://localhost:3001/v1/handoff/recover \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"docs_v2_quickstart",
    "anchor":"quickstart_patch_001",
    "handoff_kind":"task_handoff"
  }' | jq '{scope,tenant_id,matched_nodes,handoff,execution_ready_handoff}'
```

## Path B: Server For Self-Hosted Teams

Use Server if your goal is production ownership, team workflows, or server-only surfaces.

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
make stack-up
curl -fsS http://localhost:3001/health | jq
```

Then run the same `write -> recall_text` loop against your Server endpoint.

## What Counts As First Success

You are done when:

1. health is green
2. write returns a `commit_id` and `commit_uri`
3. recall returns usable context
4. handoff recover returns a matched handoff artifact

At that point, Aionis is no longer abstract. You have continuity, not just setup.

## Where To Go Next

1. Add replay for reusable execution
2. Add policy for governed action selection
3. Plug Aionis into your actual runtime through Codex, LangGraph, or MCP
