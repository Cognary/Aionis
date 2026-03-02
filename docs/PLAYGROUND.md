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

1. Connection settings in UI (`base_url`, `tenant_id`, `scope`, API key, bearer token, admin token).
2. Scenario presets (`Support Triage`, `Sales Follow-up`, `Personal Assistant`) to seed tenant/scope + payload defaults.
3. Per-operation payload editor with JSON templates and runtime variable injection (`\{\{last.decision_id\}\}`, `\{\{last.request_id\}\}`, `\{\{last.run_id\}\}`, `\{\{connection.*\}\}`).
4. Step Flow orchestrator with editable flow JSON and reusable flow presets (including closed-loop policy flow).
5. Per-step flow assertions (`expect_ok`, `require_decision_id`, `require_request_id`, `max_duration_ms`, `error_includes`) with optional stop-on-fail behavior.
6. Share link export (`?pg=...`) for reproducible, non-secret config handoff.
7. Request chain timeline with status, duration, and `request_id`.
8. Response inspector with structural diff against previous response of the same operation.
9. One-click session export to JSON for replay or issue reports.

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
