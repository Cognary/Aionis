# Lite Governance Provider Precedence Benchmark

Status: implemented

## What changed

Added `governance_provider_precedence_runtime_loop` to the real benchmark suite.

The scenario now proves, on live Lite runtime routes, that:

1. explicit workflow governance reviews override provider fallback on `/v1/memory/write`
2. explicit form-pattern governance reviews override provider fallback on `/v1/memory/tools/feedback`

## What the scenario checks

### Workflow

- provider is enabled
- explicit low-confidence `promote_memory` review is supplied
- runtime preserves the explicit review
- governance preview stays inadmissible
- runtime apply does not set a governed promotion override

### Tools

- provider is enabled
- explicit low-confidence `form_pattern` review is supplied
- runtime preserves the explicit review
- governance preview stays inadmissible
- runtime apply does not raise the pattern to stable/trusted

## Result

This closes the gap between:

1. generic precedence contract tests
2. real route/runtime benchmark validation

The benchmark suite now protects provider precedence at the actual product runtime surface, not just at the helper layer.
