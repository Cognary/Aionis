---
title: "OpenClaw Integration"
---

# OpenClaw Integration

Aionis integrates with OpenClaw as a memory and policy backend through the OpenClaw plugin model.

## Recommended Integration

Use the published plugin:

1. `openclaw-aionis-memory` (npm package)
2. Install command:

```bash
openclaw plugins install openclaw-aionis-memory
```

3. Configure plugin with:
   `baseUrl`, `apiKey`, `tenantId`, `scopeMode`, `scopePrefix`, `autoRecall`, `autoCapture`

## Behavior

1. Auto-recall before each turn (`context/assemble`).
2. Auto-capture after successful turns (`write`).
3. Optional policy loop via `tools/select` and `tools/feedback`.

## Scope and Isolation Recommendation

1. Use fixed tenant for single-user setups (`tenant_id=default`).
2. Use one scope per project: `scope=clawbot:<project>`.
3. Persist `run_id` and returned `decision_id` between select and feedback.

## Health Check

```bash
openclaw aionis-memory selfcheck --scope clawbot:selfcheck
```

## Related

1. [Integrations Overview](/public/en/integrations/00-overview)
2. [API Contract](/public/en/api/01-api-contract)
3. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
