# Aionis Lite Single-User Kernel Implementation Spec

Last updated: `2026-03-11`  
Status: `proposed`

Related design: [LITE_SINGLE_USER_KERNEL_DESIGN.md](/Users/lucio/Desktop/Aionis/docs/LITE_SINGLE_USER_KERNEL_DESIGN.md)

## Goal

Translate the Lite design direction into an executable implementation spec.

This document defines:

1. the minimum Lite capability contract
2. the local storage model
3. the route support matrix
4. the migration and compatibility rules
5. the test plan and release gates

This is intentionally not a marketing document.

## Lite Definition

Lite is a single-user, single-process, local-first Aionis runtime that preserves kernel semantics while removing server topology requirements.

Lite is valid only if all of the following remain true:

1. memory remains graph-shaped
2. writes remain commit-chain backed
3. context assembly remains bounded and layered
4. replay remains first-class
5. packs remain promotable to server edition

If any of these are removed, the result is not Lite. It is a different product.

## Lite Capability Contract

### Kernel-Required

These capabilities must ship in Lite v1.

| Capability | Required Surface | Compatibility Rule |
|---|---|---|
| Memory write | `POST /v1/memory/write` | write result semantics must remain stable |
| Recall | `POST /v1/memory/recall` | response shape remains compatible |
| Recall text | `POST /v1/memory/recall_text` | context budget semantics preserved |
| Planning context | `POST /v1/memory/planning/context` | rules/tools/context output remains compatible |
| Context assemble | `POST /v1/memory/context/assemble` | layered context contract preserved |
| Replay lifecycle | `run_start / step_before / step_after / run_end / run_get` | canonical run semantics preserved |
| Replay playbooks | `compile / get / candidate / run / dispatch` | deterministic replay remains available |
| Sessions/events | session create + event append/list | local execution trace continuity preserved |
| Packs | export / import | upgrade bridge to server preserved |
| Rules/tool loop | `rules/evaluate`, `tools/select`, `tools/feedback` | policy loop semantics preserved |

Notes:

1. `playbooks/dispatch` is required for Lite because deterministic replay is now part of Aionis's core cost/value story.
2. The contract is semantic, not schema-identical at storage level.

### Optional-If-Supported

These may exist in Lite if the local backend supports them cleanly, but they are not release blockers for Lite alpha.

| Capability | Surface | Lite v1 stance |
|---|---|---|
| Local sandbox execution | `/v1/memory/sandbox/*` with `local_process` only | optional |
| Write-time distillation | `/v1/memory/write` `distill` | preferred |
| Deterministic tool-result summaries | sandbox / replay / MCP consumer surfaces | preferred |
| Context optimization profiles | planning/context + context/assemble | preferred |

### Server-Only

Lite must explicitly reject these surfaces with a stable error, not partially emulate them.

| Capability | Surface Class | Lite behavior |
|---|---|---|
| Multi-tenant control plane | `/v1/admin/control/*` | `501 server_only_in_lite` |
| Tenant quota control | quota/profile tables and mutation APIs | `501 server_only_in_lite` |
| Ops dashboards and alerts | admin/ops routes | `501 server_only_in_lite` |
| Automation orchestration | `/v1/automations/*` | `501 server_only_in_lite` in phase 1 |
| Distributed async execution | remote workers / queue topology | unsupported |
| Remote sandbox executor | remote HTTP sandbox plane | unsupported |

## Route Support Matrix

Phase 1 classification:

| Route Group | Lite Support | Reason |
|---|---|---|
| `memory-write` | yes | kernel-required |
| `memory-recall` | yes | kernel-required |
| `memory-context-runtime` | yes | kernel-required |
| `memory-access` | partial | sessions/events/packs yes; server-only access surfaces no if any depend on control plane assumptions |
| `memory-replay-core` | yes | kernel-required |
| `memory-replay-governed` | partial | replay dispatch yes; repair/review only if local policy model remains coherent |
| `memory-feedback-tools` | yes | kernel-required |
| `memory-sandbox` | optional | local-process-only candidate |
| `admin-control-*` | no | server-only |
| `automations` | no in phase 1 | server-only |

## Local Storage Model

### System of Record

Lite SoR is SQLite, file-backed, transactional, single-node.

Required properties:

1. ACID transaction support for write batches
2. stable local file path
3. safe backup via file copy or export workflow
4. deterministic read/write behavior under single-process concurrency

### Why SQLite

SQLite is acceptable for Lite because it gives:

1. local portability
2. transactional semantics for commit-chain writes
3. simple installation
4. enough performance for single-user local workflows

### Explicit Non-Goal

Lite does not require vector-native SQL extensions in v1.

Stage-1 recall may use:

1. embedding blobs stored in SQLite
2. application-layer distance scan
3. bounded candidate set

Optional later upgrade:

1. sqlite-vss or another local extension
2. approximate search only after semantic parity is proven

## Lite Store Interfaces

The existing recall abstraction is not sufficient.

Lite requires first-class interfaces for both write and replay persistence.

### Required Write Persistence Interface

The kernel must persist through an abstract write interface that is not raw `pg.PoolClient` shaped.

Minimum operations:

1. insert commit
2. upsert nodes
3. upsert edges
4. lookup node scopes by ids
5. append session events
6. read/write rule defs
7. import/export pack rows

### Required Replay Persistence Interface

Minimum operations:

1. persist replay run node
2. persist replay step node and edges
3. find run by `run_id`
4. persist playbook node/version metadata
5. read playbook by `playbook_id` and version
6. list/resolve playbook status and matcher metadata
7. persist replay learning side effects where required

### Required Read/Recall Interface

Minimum operations:

1. stage-1 candidate scan
2. neighborhood expansion
3. node/edge materialization
4. citations and commit URI lookup
5. debug embeddings only if backend declares support

## Local Schema Requirements

This spec does not require schema parity with Postgres table names.

It does require semantic parity for kernel objects.

### Canonical Lite Objects

Lite must persist these canonical object classes:

1. commits
2. nodes
3. edges
4. session topics
5. session events
6. rule definitions and rule state
7. tool decision lineage if required by current contracts
8. replay runs
9. replay steps
10. playbooks and versions
11. pack import/export staging metadata if needed

### Schema Design Rules

1. stable object ids remain application-generated, not storage-generated
2. commit hash algorithm remains unchanged
3. pack serialization remains unchanged
4. playbook slots/metadata serialization remains compatible
5. no Lite-specific id scheme

## Recall and Embedding Strategy

### Phase 1

Use application-layer recall stage 1:

1. store embedding vectors as serialized numeric arrays
2. compute distance in process
3. apply strict caps on candidate counts
4. reuse the current bounded neighborhood logic after candidate selection

### Constraints

Lite v1 target is not "large local corpora".

It is acceptable to declare a practical envelope such as:

1. low-to-mid six-figure node counts are out of scope for alpha
2. Lite is optimized for developer memory graphs, not org-scale archives

The exact envelope should be validated empirically before beta.

## Compatibility Rules

### Upward Compatibility

Lite data must be promotable to server.

Required invariants:

1. node ids stable
2. edge ids stable
3. commit ids and commit hash semantics stable
4. replay run ids stable
5. playbook serialization stable
6. pack schema stable

### Allowed Differences

The following may differ:

1. storage table layout
2. local indexes
3. local embedding storage representation
4. local transaction implementation details

### Forbidden Differences

The following may not differ:

1. URI semantics
2. replay object meaning
3. pack payload meaning
4. write commit-chain semantics

## Packaging Spec

Lite packaging must come after kernel/store boundaries are real.

Required artifacts:

1. `npm run start:lite`
2. `.env.lite.example`
3. default local data directory
4. backup command or documented backup workflow
5. import/export workflow for migration

Recommended defaults:

1. local scope defaulted to a single-user namespace
2. single local data root under user home or workspace-specific config
3. local auth disabled by default unless explicitly enabled

## Error Semantics

When Lite cannot support a route, it must fail explicitly and consistently.

Required behavior:

1. HTTP `501`
2. error code `server_only_in_lite`
3. details include route group or capability name

This is better than partial emulation or hidden no-op behavior.

## Test Plan

### Kernel Contract Tests

The current kernel contract suite must run against Lite backend for all `kernel-required` surfaces.

Minimum coverage:

1. write prepare/apply path
2. recall and recall_text
3. planning/context and context/assemble
4. rules evaluate / tools select / tools feedback
5. session visibility and session event append/list
6. replay lifecycle
7. playbook compile / get / candidate / run / dispatch
8. pack export / import

### Compatibility Tests

Must add:

1. Lite export -> Server import
2. Server export -> Lite import
3. playbook compile in Lite -> run/dispatch in Server
4. node/edge/commit URI stability checks across both editions

### Performance Tests

Must add at least one Lite benchmark slice:

1. local write latency
2. local recall latency
3. local context assemble latency
4. replay compile and dispatch latency

### Route Support Tests

Must verify:

1. `kernel-required` routes work
2. `server-only` routes fail with stable `501`
3. optional routes declare support clearly

## Release Gates

### Lite Alpha

Lite alpha is shippable only if all are true:

1. all `kernel-required` contract tests pass on Lite backend
2. pack compatibility tests pass
3. route support matrix is enforced by machine-checked tests
4. no Docker or external Postgres is required for basic local startup
5. deterministic replay dispatch works in Lite

### Lite Beta

Lite beta requires:

1. stable backup/restore workflow
2. practical local performance characterization
3. basic migration guidance from Lite to Server
4. one complete onboarding path from fresh install to replay-capable local kernel

## Recommended Execution Order

1. extract write persistence boundary
2. extract replay persistence/query boundary
3. define route support classification in code
4. implement SQLite Lite store
5. run kernel contract suite on Lite store
6. add pack compatibility tests
7. only then add `start:lite` packaging

## Open Decisions

These decisions should be resolved before implementation starts:

1. whether Lite v1 includes local sandbox route support
2. whether repair/review stays kernel-required or optional in Lite alpha
3. whether rule defs/tool feedback persist in the same SQLite file or in split logical namespaces
4. what practical node-count envelope Lite alpha will officially support
