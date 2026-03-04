---
title: "OpenClaw Integration"
---

# OpenClaw Integration

Aionis integrates with OpenClaw as a memory and policy backend through the OpenClaw plugin model.

## Recommended Integration

Use the published plugin:

1. `@aionis/openclaw` (npm package)
2. Install command:

```bash
openclaw plugins install @aionis/openclaw
```

3. Bootstrap local setup:

```bash
openclaw aionis-memory bootstrap
```

4. Configure plugin with:
   `baseUrl`, `apiKey`, `tenantId`, `scopeMode`, `scopePrefix`, `preset`, `autoRecall`, `autoCapture`, `autoPolicyFeedback`

## Behavior

1. Auto-recall before each turn (`context/assemble`).
2. Auto-capture after successful turns (`write`).
3. Auto policy feedback after successful turns (`tools/feedback`), with loop signals in logs.

## Scope and Isolation Recommendation

1. Use fixed tenant for single-user setups (`tenant_id=default`).
2. Use `scopeMode=project` (recommended) to isolate memory per workspace/repo.
3. Persist `run_id` and returned `decision_id` between select and feedback.

## Health Check

```bash
openclaw aionis-memory selfcheck --scope clawbot:selfcheck
```

## Related

1. [Integrations Overview](/public/en/integrations/00-overview)
2. [API Contract](/public/en/api/01-api-contract)
3. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
