---
title: "Policy Tool Selection and Feedback Loop"
---

# Policy Tool Selection and Feedback Loop

This page documents the current public evidence for Aionis policy:

1. an ACTIVE rule can change tool choice,
2. a SHADOW rule remains non-enforcing,
3. the policy loop is measurably stronger than retrieval-only selection,
4. decision and feedback traces are readable end to end.

## What This Benchmark Proves

This benchmark is not about generic recall.

It is about whether Aionis policy can:

1. activate a rule,
2. change tool routing,
3. keep shadow rules visible without enforcing them,
4. link later feedback back to the decision path.

## Environment

1. Aionis Lite
2. local SQLite write store
3. XMB benchmark harness
4. tool-selection and policy-feedback routes:
   - `/v1/memory/rules/state`
   - `/v1/memory/tools/select`
   - `/v1/memory/tools/decision`
   - `/v1/memory/tools/feedback`

## Evidence

### XMB-005: ACTIVE rule changes tool choice

Observed result:

1. rule write: `200`
2. ACTIVE state update: `200`
3. SHADOW state update: `200`
4. tool select: `200`
5. selected tool: `curl`
6. denied tools: `bash`
7. shadow-selected tool: `bash`
8. explain fields present: `true`

Interpretation:

1. ACTIVE policy successfully changed the selected tool from the conflicting alternative to `curl`.
2. SHADOW policy stayed visible but non-enforcing.
3. The system preserved explainability fields instead of returning only a final choice.

### XMB-006: policy loop vs retrieval-only heuristic

Episodes: `20`

Baseline:

1. method: `retrieval_only_first_candidate`
2. success rate: `0.5`
3. success count: `10`
4. selection switches: `19`
5. unique selected tools: `2`
6. second-step curl success rate: `0.0`
7. decision trace rate: `0.0`

Policy loop:

1. method: `rules_tools_select_feedback`
2. success rate: `1.0`
3. success count: `20`
4. selection switches: `0`
5. unique selected tools: `1`
6. second-step curl success rate: `1.0`
7. source rule coverage: `1.0`
8. explain coverage: `1.0`
9. feedback link coverage: `1.0`
10. feedback status coverage: `1.0`
11. decision id coverage: `1.0`
12. decision readback coverage: `1.0`

Delta:

1. success rate gain: `+0.5`
2. selection switch reduction: `19`
3. curl second-step success gain: `+1.0`

Interpretation:

1. retrieval-only selection remained unstable and flipped across episodes.
2. policy-driven selection converged on the expected tool.
3. the closed loop from rule activation to decision trace to feedback attribution is observable.

## Why This Matters

This is the evidence that Aionis policy is not only recall or summarization.

It directly affects:

1. tool routing,
2. behavioral stability,
3. controllability,
4. post-run feedback attribution.

That is the minimum bar for claiming a real policy loop.

## Reproduce

Start Lite:

```bash
cd /Users/lucio/Desktop/Aionis

PORT=3331 \
AIONIS_MODE=local \
MEMORY_AUTH_MODE=off \
TENANT_QUOTA_ENABLED=false \
RATE_LIMIT_BYPASS_LOOPBACK=true \
LITE_WRITE_SQLITE_PATH=/tmp/aionis-policy-xmb-3331/write.sqlite \
LITE_REPLAY_SQLITE_PATH=/tmp/aionis-policy-xmb-3331/replay.sqlite \
bash scripts/start-lite.sh
```

Run the policy benchmark:

```bash
python3 /Users/lucio/Desktop/Aionis/aionis-bench/harness/run_xmb.py \
  --base-url http://127.0.0.1:3331 \
  --scope-prefix policybench \
  --out-file /tmp/aionis-policy-xmb-3331/xmb.json
```

Inspect the result:

```bash
cat /tmp/aionis-policy-xmb-3331/xmb.json
```

## Result Boundary

This benchmark proves:

1. Lite rule activation works,
2. tool selection changes under ACTIVE policy,
3. SHADOW stays non-enforcing,
4. policy feedback and decision readback are linked.

It does not prove:

1. global policy optimality for all agents,
2. token reduction,
3. replay performance.

Those belong to separate benchmark pages.
