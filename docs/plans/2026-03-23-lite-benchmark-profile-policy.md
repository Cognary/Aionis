# Lite Benchmark Profile Policy

## What changed

Lite benchmark suite-profile comparison is no longer a flat drift report.

It now has an explicit policy layer:

1. hard drift
2. soft drift

## Why this matters

Some benchmark profile keys are part of the long-lived execution-memory contract:

1. stable workflow progression checkpoints
2. governed learning states
3. governed replay states
4. provider precedence behavior
5. slim-surface boundary guarantees
6. custom model-client replacement outcomes

Those should block isolated validation by default.

Other keys are still valuable, but they behave more like tuning signals than contract breaks.

## New behavior

Benchmark compare now emits:

1. all changed keys
2. hard changed keys
3. soft changed keys
4. policy version

And Lite validation now defaults to hard-profile gating instead of failing on every profile-key difference.

## Operator usage

Strict all-drift gate:

```bash
npx tsx scripts/lite-real-task-benchmark.ts \
  --baseline-json /tmp/lite-benchmark-baseline.json \
  --fail-on-profile-drift
```

Default contract-oriented hard gate:

```bash
npx tsx scripts/lite-real-task-benchmark.ts \
  --baseline-json /tmp/lite-benchmark-baseline.json \
  --fail-on-hard-profile-drift
```

And for isolated validation:

```bash
LITE_REAL_VALIDATION_PROFILE_DRIFT_GATE_MODE=hard \
bash scripts/lite-real-validation.sh --baseline-json /tmp/lite-benchmark-baseline.json
```
