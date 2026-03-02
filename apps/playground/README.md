# Aionis Playground

Interactive playground app for core memory and policy-loop APIs.

Highlights:

1. Scenario presets for fast end-to-end demos.
2. Step-flow runner with editable JSON workflow.
3. Runtime placeholder injection (`{{last.*}}`, `{{connection.*}}`).
4. Response diff viewer against previous same-operation run.

## Run

```bash
npm --prefix apps/playground install
npm --prefix apps/playground run dev
```

Default local target is `http://127.0.0.1:3001` and can be overridden in the UI.
