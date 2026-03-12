# Aionis Lite: Why SQLite Is Enough For Replay But Should Not Be Compared To Server Recall

Last updated: `2026-03-11`  
Status: `internal analysis`

## 1. Executive Summary

This document answers two related questions:

1. Why SQLite is sufficient for the Lite edition's replay and execution-memory kernel.
2. Why SQLite Lite should not be benchmarked or positioned as a replacement for the Server edition's Postgres + pgvector recall path.

Short answer:

1. **Replay is primarily a transactional metadata and object-persistence problem.**
2. **SQLite is fully capable of handling Lite replay if Aionis extracts proper write and replay persistence boundaries.**
3. **The harder Lite problem is not replay. It is stage-1 recall and local vector search behavior.**
4. **Server recall and Lite recall solve different workload envelopes and should not be marketed as equivalent scale paths.**

The clean architecture conclusion is:

> SQLite is strong enough for Lite replay because replay depends on durable object semantics, not distributed vector infrastructure.

And the product conclusion is:

> Lite can preserve Aionis's differentiating replay capabilities without pretending to equal the Server edition's production recall profile.

## 2. Why Replay Is A Good Fit For SQLite

### 2.1 Replay Is Mostly A Transactional Object Problem

Aionis replay is built around a stable set of kernel objects:

1. replay runs
2. replay steps
3. playbooks
4. playbook versions
5. execution decisions
6. commit-linked provenance

From a storage perspective, these are not exotic objects.

They require:

1. transactional writes
2. stable application-generated ids
3. lookup by run id / playbook id / version
4. durable serialized metadata
5. relational consistency across commits, nodes, and derived replay artifacts

SQLite is good at exactly this class of problem.

### 2.2 Replay Does Not Require Distributed Search Infrastructure

Replay is not primarily bottlenecked by:

1. approximate nearest-neighbor vector search
2. multi-tenant query pressure
3. cross-node distributed worker coordination
4. high-ingest concurrent team traffic

Replay is primarily bottlenecked by:

1. persistence correctness
2. object lookup correctness
3. version resolution correctness
4. deterministic execution semantics
5. commit-chain compatibility

That is why SQLite is a strong fit for Lite replay.

### 2.3 SQLite Already Matches The Core Replay Requirements

For Lite replay, the required storage guarantees are:

1. single-file durability
2. ACID transactions
3. ordered writes
4. secondary indexes on run/playbook identifiers
5. recoverable local state

SQLite supports all of these.

There is nothing in Aionis replay semantics that inherently requires Postgres specifically.

What Aionis replay needs is:

1. a proper replay persistence interface
2. schema design for replay objects
3. stable commit and object semantics

That is an architectural extraction problem, not a database impossibility problem.

## 3. What Lite Replay Must Preserve

Lite is only valid if it keeps the core replay semantics.

According to the current implementation spec, Lite must keep:

1. `run_start`
2. `step_before`
3. `step_after`
4. `run_end`
5. `run_get`
6. `playbook compile`
7. `playbook get`
8. `playbook candidate`
9. `playbook run`
10. `playbook dispatch`

This matters because replay is not an optional nice-to-have in Aionis anymore.

It is one of the main reasons Aionis is different from:

1. plain vector memory products
2. retrieval-only agent memory layers
3. prompt stuffing systems

If Lite did not keep replay, it would lose one of Aionis's most important product distinctions.

## 4. Why SQLite Is Not The Real Problem For Lite Replay

### 4.1 The Current Limitation Is Architectural, Not Fundamental

Today, the current `embedded` path still hits hard limits in replay:

- replay read is still effectively Postgres-only
- replay compile is still effectively Postgres-only

The current code explicitly says this in the replay layer:

- `replay_read_not_supported_in_embedded`
- `replay_compile_not_supported_in_embedded`

This is important because it can create the wrong impression.

The wrong conclusion would be:

> replay needs Postgres, therefore Lite cannot have full replay

That is not the right conclusion.

The correct conclusion is:

> the current embedded runtime is not yet a first-class replay backend

That is an implementation-state limitation, not a proof that SQLite is insufficient.

### 4.2 What Actually Has To Be Extracted

To make replay work in Lite, Aionis needs:

1. replay persistence interfaces that are not raw `pg.PoolClient` shaped
2. playbook version lookup interfaces
3. run/step persistence interfaces
4. compile/get/dispatch reads that can be backed by SQLite

That means the work is:

1. storage abstraction
2. local schema design
3. contract parity validation

The work is not:

1. inventing a new replay model
2. degrading replay to a toy mode
3. removing deterministic replay dispatch

## 5. Why Recall Is The Harder Lite Problem

### 5.1 Server Recall Depends On A Different Performance Shape

Server recall today is built around:

1. Postgres
2. pgvector
3. ANN-oriented stage-1 candidate search
4. bounded graph expansion after candidate selection

That is a very different problem from replay metadata storage.

The Server recall path is optimized for:

1. faster vector retrieval
2. larger corpora
3. better production query behavior
4. governance-aware runtime at team scale

SQLite is not being asked to replace all of that one-for-one in Lite v1.

### 5.2 Lite Recall Is A Local-Envelope Problem

The Lite spec already points in the right direction:

1. store embedding vectors as serialized arrays
2. run distance scan in process
3. cap candidate counts aggressively
4. reuse the existing bounded neighborhood expansion logic

This is reasonable because Lite is not supposed to target:

1. org-scale archives
2. large tenant fleets
3. production recall throughput
4. high-ingest concurrent teams

Lite is supposed to target:

1. developer-local graphs
2. single-user memory graphs
3. local experimentation
4. low-ops usage

So the recall question is not:

> Can SQLite equal pgvector for production recall?

It is:

> Can Lite provide acceptable local recall semantics and acceptable responsiveness inside a smaller workload envelope?

That is a very different and much more realistic standard.

### 5.3 Why Recall Needs More Caution Than Replay

Replay mostly needs:

1. transactional persistence
2. identifier lookup
3. version resolution
4. deterministic state handling

Recall needs:

1. vector storage
2. candidate scoring
3. bounded search cost
4. query-latency discipline
5. practical recall-quality tradeoffs

That is why recall is the place where Lite has to be more careful.

Replay is mostly about semantic correctness.
Recall is about semantic correctness plus performance envelope.

## 6. What SQLite Can Realistically Support In Lite

SQLite can realistically support all of the following in Lite:

1. commit-chain persistence
2. node and edge persistence
3. session and event lineage
4. replay runs and steps
5. playbooks and versions
6. pack export/import
7. rule definitions
8. execution decision lineage
9. tool feedback lineage

And SQLite can also support Lite recall if Aionis is disciplined about:

1. corpus size targets
2. candidate limits
3. local-only expectations
4. non-goals for alpha

That is the correct way to think about SQLite in Lite:

- **strong enough for kernel object persistence**
- **acceptable for local recall with constrained targets**
- **not the same thing as the Server production recall path**

## 7. What Should Not Be Claimed

Lite should not claim:

1. parity with Server recall scale
2. pgvector-equivalent production retrieval
3. org-scale memory graph performance
4. governance-heavy production operations

If Lite makes those claims, it will be judged against the wrong standard.

The right claims are:

1. same kernel semantics
2. local replay and execution memory
3. local-first low-friction deployment
4. export and promotion compatibility

That is enough to make Lite compelling.

## 8. The Correct Product Positioning

The right positioning is:

### Aionis Server

Server is the production and team-grade edition.

It keeps:

1. Postgres
2. pgvector
3. control plane
4. governance and ops surfaces
5. production recall path

### Aionis Lite

Lite is the single-user, local-first edition.

It keeps:

1. the same kernel identity
2. replay
3. commit-chain
4. packs
5. bounded context assembly

But it uses:

1. SQLite SoR
2. local recall strategy
3. much smaller operational assumptions

This is the healthy split.

## 9. Architectural Recommendation

The architectural recommendation is:

1. do not weaken replay for Lite
2. do not define Lite around the current embedded runtime
3. extract replay persistence as a first-class backend boundary
4. let SQLite own replay and kernel persistence in Lite
5. treat recall performance as the main Lite engineering risk, not replay support

In other words:

> If Lite has to choose where to be conservative, it should be conservative in recall performance claims, not in replay feature scope.

That preserves Aionis's identity while keeping the technical plan realistic.

## 10. Bottom-Line Answer

Yes, Lite should keep full replay and the rest of Aionis's differentiating execution-memory behavior.

And yes, SQLite is sufficient for that part of the system.

What SQLite should not be forced to prove is that it can be a drop-in replacement for:

1. Postgres
2. pgvector
3. Server-scale recall behavior

So the bottom-line split is:

- **Replay in Lite: yes, and SQLite is enough**
- **Server-grade recall equivalence in Lite: no, that is the wrong target**

That is the correct technical and product answer.
