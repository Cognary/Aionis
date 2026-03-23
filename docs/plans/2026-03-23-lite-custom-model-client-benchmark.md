# Lite Custom Model-Client Benchmark

Status: implemented

## What changed

Added `custom_model_client_runtime_loop` to the real benchmark suite.

This scenario now proves that a custom `modelClientFactory` replacement can be injected and honored by live Lite runtime wiring on:

1. workflow promotion
2. tools feedback
3. replay repair review

## Runtime wiring

The benchmark required a narrow internal extension:

1. memory write route registration now accepts optional governance runtime provider builder options
2. tools feedback route registration now accepts the same optional override
3. replay runtime option builders now accept the same optional override

These are internal-only replacement points.
They do not expand public route contracts.

## Result

The benchmark now protects not only provider fallback and precedence, but also the real replacement path for internal model-client wiring across live runtime flows.
