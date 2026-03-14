---
title: "Reference And Operations"
description: "Deep reference for API contract, verification status, common errors, operations, governance, and benchmarks."
---

# Reference And Operations

This is the deep layer.

It is not where new readers should start, but it is where serious users decide whether Aionis is credible enough for real adoption.

## Start Here If You Are Integrating This Week

The shortest serious path through this layer is:

1. [Verification Status](./verification-status.md) to separate `live-verified` from `code-backed`
2. [API Contract](./api-contract.md) to understand the product surface
3. [Common Errors](./common-errors.md) to understand failure semantics
4. [Endpoint Reference](./endpoints/index.md) to inspect the exact routes you plan to call

That order keeps the reader grounded in what is already proven versus what is simply present in the codebase.

## What Lives Here

### API Contract

Complete endpoint contracts, request and response shapes, auth, errors, and compatibility expectations.

See:

1. [API Contract](./api-contract.md)
2. [Common Errors](./common-errors.md)
3. [Endpoint Reference](./endpoints/index.md)

### Memory Layer Model

Advanced reference for the memory compression model, including the `L0-L5` layered view and how serving-time selection differs from storage-time derivation.

See:

1. [Memory Layers](./memory-layers.md)

### Production Operations

Deployment, HA, monitoring, runbooks, gates, drills, and failure handling.

See:

1. [Production Operations](./production-ops.md)

### Governance

Quota, auditability, policy lifecycle, review flow, and promotion rules.

See:

1. [Governance](./governance.md)

### Benchmarks And SLO

Public evidence, performance baselines, replay evidence, and operator-facing thresholds.

See:

1. [Benchmarks And SLO](./benchmarks-and-slo.md)

## Why This Layer Matters Externally

External users do not only need inspiration.

They also need confidence that:

1. the API surface is real
2. the product has operational shape
3. the governance story is deliberate
4. the performance claims are not hand-wavy

That is how adoption moves from curiosity to commitment.

## What Is Already Proven Here

This layer is intentionally mixed, but not ambiguous:

1. core memory, handoff, and policy routes already have `live-verified` documentation
2. replay reference is available and code-backed, without pretending every path is already live-verified
3. public benchmark and SLO pages only use evidence that is already disclosed externally

That is the right external posture for a product that wants adoption without overclaiming.

## Reading Path

1. [Verification Status](./verification-status.md)
2. [API Contract](./api-contract.md)
3. [Common Errors](./common-errors.md)
4. [Endpoint Reference](./endpoints/index.md)
5. [Production Operations](./production-ops.md)
6. [Governance](./governance.md)
7. [Benchmarks And SLO](./benchmarks-and-slo.md)
8. [Memory Layers](./memory-layers.md)
9. [Verified Test Data](./verified-test-data.md)
