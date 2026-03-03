---
title: "Playground"
---

# Playground

Aionis Playground is a visual API workbench for memory, context orchestration, and policy-loop testing.

## What You Can Validate

1. Write and recall behavior (`write`, `recall`, `recall_text`).
2. Layered context assembly (`context/assemble`).
3. Policy and tool routing flow (`rules/evaluate`, `tools/select`, `tools/decision`, `tools/feedback`).
4. URI-based replay checks (`resolve`).

## Run Locally

```bash
npm --prefix apps/playground install
npm run -s playground:dev
```

Build and serve:

```bash
npm run -s playground:build
npm run -s playground:start
```

Default API target: `http://127.0.0.1:3001`.

## First-Time Setup

Connection fields:

1. `base_url` (for example `https://api.aionisos.com`)
2. `tenant_id`
3. `scope`
4. one auth credential for memory routes:
   - `X-Api-Key`, or
   - `bearer token`

Admin routes require `x-admin-token`.

LLM panel fields (for chat generation):

1. `provider`
2. `base_url`
3. `model`
4. `api_key`

## Recommended Validation Flow

1. Open `LLM` tab and click `Test connection`.
2. In chat, enable recall injection and run a short conversation.
3. Execute `write` and then `recall_text` to confirm memory visibility.
4. Run one policy path: `rules/evaluate -> tools/select -> tools/decision -> tools/feedback`.
5. Use inspector IDs (`request_id`, `decision_id`, `run_id`) for replay checks.

## Common Errors

1. `400 invalid_request`: payload shape does not match the endpoint contract.
2. `401/403`: missing or invalid auth header.
3. Write is `400` but recall endpoints are `200`: write template is outdated or missing required fields.
4. Chat has no model output: LLM connection/model/API key is not valid.

## Security Notes

1. Playground stores runtime settings in browser local storage for convenience.
2. Do not use high-privilege production credentials in shared browsers.
3. Restrict Playground access in production environments.

## Related

1. [Build Memory Workflows](/public/en/guides/01-build-memory)
2. [API Reference](/public/en/api-reference/00-api-reference)
3. [MCP Integration](/public/en/integrations/01-mcp)
