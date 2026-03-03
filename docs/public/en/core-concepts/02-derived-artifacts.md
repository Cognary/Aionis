---
title: "Derived Artifacts"
---

# Derived Artifacts

Aionis separates durable writes from derived processing.

## Derived Types

1. Embeddings
2. Topic clustering
3. Context compression
4. Consolidation/rewrite artifacts

## Reliability Model

1. Write-path durability does not wait on derived jobs.
2. Derived jobs run asynchronously and can be backfilled.
3. Recovery can replay from commit lineage.

## Related

1. [Architecture](/public/en/architecture/01-architecture)
2. [Operator Runbook](/public/en/operations/02-operator-runbook)
