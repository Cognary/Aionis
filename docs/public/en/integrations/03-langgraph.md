---
title: "LangGraph Integration"
---

# LangGraph Integration

Aionis integrates into LangGraph-style agent flows as memory and policy infrastructure.

## Recommended Flow Mapping

1. Before planning: `recall_text` or `context/assemble`
2. During planning: `rules/evaluate` and `tools/select`
3. After execution: `write` and `tools/feedback`
4. For audits: `resolve` by `decision_uri` or `commit_uri`

## Runtime Requirements

1. Aionis API reachable from your graph runtime.
2. Auth credentials aligned with selected auth mode.
3. SDK or HTTP client integration in your orchestrator node.

## Smoke Test

```bash
set -a; source .env; set +a
bash examples/langgraph_adapter_smoke.sh
```

## Success Criteria

1. Multi-step flow returns stable `request_id` correlation.
2. Decision steps emit `run_id` and `decision_id`.
3. Post-step writes emit resolvable `commit_uri` values.

## Related

1. [API Contract](/public/en/api/01-api-contract)
2. [SDK Guide](/public/en/reference/05-sdk)
3. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
