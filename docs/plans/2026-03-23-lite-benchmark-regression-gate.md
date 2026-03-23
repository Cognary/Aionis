# Lite Benchmark Regression Gate

Status: implemented

## What changed

The Lite real benchmark now supports failing against a stored baseline.

Added CLI regression-gate switches:

1. `--fail-on-status-regression`
2. `--max-suite-score-drop`
3. `--max-scenario-score-drop`

## Behavior

When a baseline artifact is supplied, the benchmark can now fail if:

1. a scenario flips status
2. the suite score drops beyond the configured threshold
3. any scenario score drops beyond the configured threshold

## Validation flow

`scripts/lite-real-validation.sh` now accepts `--baseline-json` and passes benchmark regression-gate options through to the benchmark step.

This keeps the full validation flow isolated outside the repository while still making benchmark regressions enforceable.

## Result

The benchmark layer now serves two purposes:

1. repeatable product-value demonstration
2. enforceable regression gate against a prior benchmark artifact
