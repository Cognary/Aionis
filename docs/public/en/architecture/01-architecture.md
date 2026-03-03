---
title: "Architecture"
---

# Architecture

Aionis architecture is production-first and audit-first.

## Main Paths

1. Write path: durable commit-chain writes
2. Async backfill: embedding/topic/derived jobs
3. Recall path: retrieval + graph expansion + ranking
4. Policy path: rules evaluation + tool decision surface

## Control Points

1. Budget control for context assembly
2. Lane visibility and tenant/scope isolation
3. Gate checks for production readiness
4. Replay and provenance inspection via URI model

## Related

1. [Context Orchestration](/public/en/context-orchestration/00-context-orchestration)
2. [Policy & Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
3. [Operate & Production](/public/en/operate-production/00-operate-production)
4. [Detailed Architecture Notes](/public/en/concepts/02-architecture)
