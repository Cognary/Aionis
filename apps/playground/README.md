# Aionis Playground

Interactive playground app for core memory and policy-loop APIs.

Highlights:

1. Scenario presets for fast end-to-end demos.
2. Step-flow runner with editable JSON workflow.
3. Runtime placeholder injection (`{{last.*}}`, `{{connection.*}}`) including URI fields (`decision_uri`, `commit_uri`).
4. URI-first inspector with copy + one-click resolve (`POST /v1/memory/resolve`).
5. Response diff viewer against previous same-operation run.

## Run

```bash
npm --prefix apps/playground install
npm --prefix apps/playground run dev
```

Default memory target is `http://127.0.0.1:3001` and the default chat target is `https://api.openai.com/v1`.

Server-side egress guard:

- In non-production, loopback overrides such as `http://localhost:11434/v1` remain allowed for local development.
- In production, Playground only forwards to the configured default base URL or an exact URL listed in:
  - `PLAYGROUND_EXECUTE_ALLOWED_BASE_URLS` for `/api/playground/execute`
  - `PLAYGROUND_CHAT_ALLOWED_BASE_URLS` for `/api/playground/chat`
- Allowlist values can be either a comma-separated list or a JSON array of absolute `http(s)` base URLs.
- URLs with embedded credentials, query strings, or fragments are rejected.

Example:

```bash
PLAYGROUND_EXECUTE_ALLOWED_BASE_URLS='https://memory.example.com'
PLAYGROUND_CHAT_ALLOWED_BASE_URLS='["https://api.openai.com/v1","https://gateway.example.com/v1"]'
```
