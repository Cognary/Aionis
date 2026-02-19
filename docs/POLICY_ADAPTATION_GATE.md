---
title: "Policy Adaptation Gate"
---

# Policy Adaptation Gate

Last updated: `2026-02-19`

## Purpose

Phase C guardrail for rule lifecycle operations:

1. Produce reproducible `shadow -> active` suggestions.
2. Produce reproducible `active -> disabled` suggestions.
3. Add objective gate checks for urgent disable pressure.
4. Carry canary recommendation and rollback payloads per suggestion.

This job is read-only. It does not change rule state.

## Command

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:policy-adaptation-gate -- --scope default
```

Strict warning mode:

```bash
npm run -s job:policy-adaptation-gate -- --scope default --strict-warnings
```

## Key Options

1. `--window-hours <n>`: feedback window (default `168`)
2. `--limit <n>`: number of shadow+active rules scanned (default `200`)
3. Promote thresholds:
- `--min-promote-positives <n>` (default `10`)
- `--min-promote-distinct-runs <n>` (default `3`)
- `--max-promote-neg-ratio <ratio>` (default `0.1`)
- `--min-promote-score <n>` (default `min_promote_positives - 1`)
- `--min-promote-confidence <ratio>` (default `0.55`)
4. Disable thresholds:
- `--min-disable-negatives <n>` (default `5`)
- `--min-disable-neg-ratio <ratio>` (default `0.6`)
- `--min-disable-confidence <ratio>` (default `0.6`)
- `--stale-active-hours <n>` (default `336`)
5. Canary + gate thresholds:
- `--canary-min-feedback <n>` (default `20`)
- `--urgent-disable-confidence <ratio>` (default `0.85`)
- `--max-urgent-disable-candidates <n>` (default `0`, error)
- `--max-canary-disable-candidates <n>` (default `3`, warning)

## Output

JSON output includes:

1. `checks[]` gate checks
2. `summary` with pass/fail and candidate counts
3. `suggestions.promote_to_active[]`
4. `suggestions.disable_active[]`

Each suggestion includes:

1. `confidence`
2. `risk_score` + `risk_level`
3. `canary_recommended`
4. `apply` payload
5. `rollback` payload

## Health Gate Integration

Run policy adaptation gate from health-gate:

```bash
npm run -s job:health-gate -- \
  --strict-warnings \
  --consistency-check-set scope \
  --run-policy-adaptation-gate
```

Forward custom thresholds:

```bash
npm run -s job:health-gate -- \
  --run-policy-adaptation-gate \
  --policy-adaptation-arg --window-hours \
  --policy-adaptation-arg 72 \
  --policy-adaptation-arg --max-canary-disable-candidates \
  --policy-adaptation-arg 1
```
