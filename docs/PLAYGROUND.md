---
title: "Playground"
---

# Playground

`apps/playground` is an interactive API lab for Aionis core memory + policy-loop routes.

## Scope

The playground focuses on these routes:

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall`
3. `POST /v1/memory/recall_text`
4. `POST /v1/memory/rules/evaluate`
5. `POST /v1/memory/tools/select`
6. `POST /v1/memory/tools/feedback`
7. `POST /v1/memory/tools/decision`

## Included capabilities

1. Three-pane console layout: left navigation/history, center chat + inspector, right run settings.
2. Full bilingual UI (`EN` / `中文`) with language preference persistence in local storage.
3. LLM settings panel (`provider`, `base_url`, `model`, `api_key`, `temperature`, `max_tokens`, `system_prompt`) with local persistence.
4. Built-in chat session manager (new/delete/switch/rename/clear) and multi-turn chat thread.
5. Optional `recall_text` context injection before each chat turn.
6. Optional auto-write of chat turns into memory (`write` route) for fast self-learning simulation.
7. LLM one-click connection test from settings tab.
8. Destructive actions (`delete session`, `clear chat`, `clear history`) include confirmation prompts.
9. Runtime preferences (scenario/operation/flow + non-secret connection fields + chat toggles) persist across reloads.
10. Connection settings in UI (`base_url`, `tenant_id`, `scope`, API key, bearer token, admin token).
11. Scenario presets (`Support Triage`, `Sales Follow-up`, `Personal Assistant`) to seed tenant/scope + payload defaults.
12. Per-operation payload editor with JSON templates and runtime variable injection (`\{\{last.decision_id\}\}`, `\{\{last.request_id\}\}`, `\{\{last.run_id\}\}`, `\{\{connection.*\}\}`).
13. Step Flow orchestrator with editable flow JSON and reusable flow presets (including closed-loop policy flow).
14. Per-step flow assertions (`expect_ok`, `require_decision_id`, `require_request_id`, `max_duration_ms`, `error_includes`) with optional stop-on-fail behavior.
15. Latest flow report panel plus one-click export as JSON/Markdown.
16. Share link export (`?pg=...`), request chain filters, response diff inspector, and session export.

## Run locally

```bash
npm --prefix apps/playground install
npm run -s playground:dev
```

Build/start:

```bash
npm run -s playground:build
npm run -s playground:start
```

Default local API target is `http://127.0.0.1:3001` and can be changed from the UI.

## Notes

1. The playground forwards requests through its own server route (`/api/playground/execute`) to avoid browser CORS blocking during local debugging.
2. Credentials are runtime form values, not committed configuration.
3. Keep playground access internal when testing with production credentials.
