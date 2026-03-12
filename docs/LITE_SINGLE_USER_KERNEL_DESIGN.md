# Aionis Lite Single-User Kernel Design

Last updated: `2026-03-11`
Status: `proposed`

## Goal

Define a true local single-user Lite edition that preserves Aionis's product identity while removing the heavyweight deployment topology.

Lite must remain:

1. memory graph, not plain vector memory
2. commit-chain backed, not best-effort append-only notes
3. bounded context assembly, not raw retrieval dump
4. execution-memory aware, not retrieval-only
5. replay-capable at kernel level, not only enterprise server side

Lite must remove:

1. Docker as a requirement
2. external Postgres as a requirement
3. multi-tenant control-plane assumptions
4. enterprise governance surfaces from the default runtime path

## Product Split

### Aionis Lite

Target:

1. local machine
2. single user
3. single process
4. single local database file

Primary value:

1. local execution memory
2. local context assembly
3. local replay/playbook accumulation
4. exportable artifacts that can be promoted to server edition later

### Aionis Server

Target:

1. teams
2. production
3. governance-heavy deployment
4. multi-tenant operations

Primary value:

1. Postgres + pgvector scale path
2. control plane
3. enterprise governance
4. automation and operational surfaces

## Non-Negotiable Lite Capabilities

Lite must keep these APIs or equivalent kernel behaviors:

1. memory write
2. memory recall / recall_text
3. planning_context / context_assemble
4. replay run start / step before / step after / run end
5. replay playbook compile / get / candidate / run
6. sessions / events
7. packs export / import
8. rules evaluate / select / feedback

If Lite loses replay and commit-chain semantics, it is no longer recognizably Aionis.

## Server-Only Capabilities

These can stay server-only in phase 1 Lite:

1. multi-tenant control plane
2. control API key database resolver
3. tenant quota tables
4. admin dashboards and alerting routes
5. automation orchestration
6. distributed / async worker topology
7. HA and operational maintenance jobs
8. remote sandbox executor surfaces

## Storage Direction

Lite should not use the current embedded snapshot runtime as the primary official backend.

Reason:

1. the current `embedded` path is still postgres-delegated in store construction
2. the current write path commits to SQL first and mirrors into the embedded runtime
3. replay read / compile still assumes postgres-backed queries

Current evidence:

1. [memory-store.ts](/Users/lucio/Desktop/Aionis/src/store/memory-store.ts#L18)
2. [runtime-services.ts](/Users/lucio/Desktop/Aionis/src/app/runtime-services.ts#L129)
3. [memory-write.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-write.ts#L83)
4. [write.ts](/Users/lucio/Desktop/Aionis/src/memory/write.ts#L420)
5. [replay.ts](/Users/lucio/Desktop/Aionis/src/memory/replay.ts#L298)

### Recommended Lite Storage

Use a local file-backed transactional store.

Phase 1 recommendation:

1. SQLite as SoR
2. application-layer vector distance for recall stage 1
3. optional later vector extension, but not required for v1

Why:

1. no Docker
2. no external service
3. transactional semantics fit commit-chain and replay metadata
4. simple backup and portability
5. enough scale for single-user local workloads

## Architecture Principle

Do not define Lite by "missing features".

Define Lite by:

1. same kernel semantics
2. smaller topology
3. smaller concurrency expectations
4. fewer enterprise outer layers

## Refactor Strategy

### Phase A: Kernel Boundary Extraction

Extract a store abstraction around:

1. commits
2. nodes
3. edges
4. rule defs
5. execution decisions
6. replay runs / playbooks

The current code already abstracts recall reasonably well, but write and replay are still SQL-shaped.

### Phase B: Lite Store Backend

Implement a first-class Lite backend with:

1. local transactional commit insert
2. node / edge upsert semantics
3. rule state persistence
4. replay object persistence
5. execution decision persistence

### Phase C: Route Capability Split

Routes should declare one of:

1. `kernel_required`
2. `server_only`
3. `optional_if_supported`

Lite should refuse only `server_only` routes, not core kernel routes.

### Phase D: Packaging

Provide:

1. `npm run start:lite`
2. `.env.lite.example`
3. default local data directory
4. backup / restore / export workflow

## Data Compatibility

Lite artifacts must remain promotable to server edition.

Required compatibility:

1. node ids stable
2. edge ids stable
3. commit hash semantics preserved
4. playbook serialization preserved
5. pack export/import as upgrade bridge

This is more important than exact storage schema parity.

## Performance Positioning

Lite is optimized for:

1. local responsiveness
2. low operational cost
3. developer adoption

Lite is not optimized for:

1. high-ingest concurrent teams
2. large tenant fleets
3. distributed async governance workloads

## Explicit Anti-Goals

Do not ship these as the official Lite definition:

1. "just use the current snapshot runtime"
2. "just keep write/recall and cut replay"
3. "just emulate pgvector with a demo mode"
4. "just make standalone Docker smaller"

Those reduce weight, but they do not preserve Aionis's core advantage.

## First Implementation Slice

The first implementation slice should target:

1. single-user local SoR backend
2. write + recall + context assembly
3. replay run recording
4. playbook compile/get
5. packs export/import

This is the minimum slice that still feels like Aionis.

## Immediate Next Steps

1. split kernel routes from server-only routes
2. extract write commit-generation logic from postgres-specific persistence
3. extract replay persistence/query interface from raw SQL
4. design Lite local schema
5. add `start:lite` runner only after the above boundary is clear
