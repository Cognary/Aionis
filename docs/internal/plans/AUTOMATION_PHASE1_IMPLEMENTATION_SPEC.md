---
title: "Automation Phase 1 Implementation Spec"
---

# Automation Phase 1 Implementation Spec

Status: `proposed` (`2026-03-06`)  
Owner: Aionis Core  
Depends on:

1. `/Users/lucio/Desktop/Aionis/docs/PLAYBOOK_MARKETPLACE_AUTOMATION_DAG_PLAN.md`
2. existing replay lifecycle in `src/memory/replay.ts`

## 1. Goal

Implement the smallest useful automation layer on top of replay playbooks without turning Aionis into a general workflow engine.

Phase 1 must deliver:

1. persisted automation definitions
2. persisted automation runs and node runs
3. `run`, `get`, `cancel`, and `resume` APIs
4. a thin scheduler that executes ready `playbook` nodes by invoking existing replay playbook run logic
5. layered run and node state contract

Phase 1 must not deliver:

1. general event triggers
2. cron scheduling
3. broad parallel scheduling
4. marketplace publishing
5. visual editor
6. advanced compensation execution

## 2. Scope

### 2.1 In Scope

1. node kinds:
   - `playbook`
   - `approval`
   - `condition`
   - `artifact_gate`
2. endpoint set:
   - `POST /v1/automations/create`
   - `POST /v1/automations/get`
   - `POST /v1/automations/run`
   - `POST /v1/automations/runs/get`
   - `POST /v1/automations/runs/cancel`
   - `POST /v1/automations/runs/resume`
3. sequential DAG scheduling by dependency readiness
4. layered status fields:
   - `lifecycle_state`
   - `pause_reason`
   - `terminal_outcome`
   - `status_summary`

### 2.2 Out of Scope

1. compensation execution engine
2. repair approval or rejection actions at automation API level
3. package install and marketplace APIs
4. DAG parallelism across independent branches
5. tenant-level automation policy DSL

## 3. File Touch Plan

Expected file changes for implementation:

1. `migrations/0035_automation_phase1.sql`
2. `src/memory/schemas.ts`
3. `src/memory/automation.ts`
4. `src/index.ts`
5. `src/sdk/types.ts`
6. `src/sdk/client.ts`
7. `packages/sdk/src/types.ts`
8. `packages/sdk/src/client.ts`
9. `docs/public/en/api-reference/00-api-reference.md` or successor docs path

Phase 1 should add a new module instead of overloading `src/memory/replay.ts`.

## 4. Storage Design

## 4.1 Migration File

Create:

1. `migrations/0035_automation_phase1.sql`

Migration contents:

1. create `automation_defs`
2. create `automation_versions`
3. create `automation_runs`
4. create `automation_run_nodes`
5. add indexes
6. add updated-at triggers where needed

Use the repo's standard migration style:

1. `BEGIN`
2. `CREATE TABLE IF NOT EXISTS`
3. `CREATE INDEX IF NOT EXISTS`
4. `COMMIT`

## 4.2 Tables

### `automation_defs`

Purpose:

1. identity and latest mutable metadata for each automation

Columns:

1. `tenant_id TEXT NOT NULL`
2. `scope TEXT NOT NULL`
3. `automation_id TEXT NOT NULL`
4. `name TEXT NOT NULL`
5. `status TEXT NOT NULL CHECK (status IN ('draft','shadow','active','disabled'))`
6. `latest_version INTEGER NOT NULL CHECK (latest_version > 0)`
7. `input_contract_json JSONB NOT NULL DEFAULT '{}'::jsonb`
8. `output_contract_json JSONB NOT NULL DEFAULT '{}'::jsonb`
9. `metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb`
10. `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
11. `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
12. primary key `(tenant_id, scope, automation_id)`

Indexes:

1. `(tenant_id, scope, updated_at DESC)`
2. `(tenant_id, scope, status, updated_at DESC)`

### `automation_versions`

Purpose:

1. immutable versioned graph definitions

Columns:

1. `tenant_id TEXT NOT NULL`
2. `scope TEXT NOT NULL`
3. `automation_id TEXT NOT NULL`
4. `version INTEGER NOT NULL CHECK (version > 0)`
5. `status TEXT NOT NULL CHECK (status IN ('draft','shadow','active','disabled'))`
6. `graph_json JSONB NOT NULL`
7. `compile_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb`
8. `metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb`
9. `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
10. primary key `(tenant_id, scope, automation_id, version)`

Indexes:

1. `(tenant_id, scope, automation_id, version DESC)`
2. `(tenant_id, scope, status, created_at DESC)`

### `automation_runs`

Purpose:

1. one automation execution instance

Columns:

1. `run_id UUID PRIMARY KEY`
2. `tenant_id TEXT NOT NULL`
3. `scope TEXT NOT NULL`
4. `automation_id TEXT NOT NULL`
5. `automation_version INTEGER NOT NULL`
6. `requested_by TEXT NULL`
7. `lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('queued','running','paused','compensating','terminal'))`
8. `pause_reason TEXT NULL CHECK (pause_reason IS NULL OR pause_reason IN ('approval_required','repair_required','dependency_wait','operator_pause'))`
9. `terminal_outcome TEXT NULL CHECK (terminal_outcome IS NULL OR terminal_outcome IN ('succeeded','failed','cancelled','failed_compensated','cancelled_compensated'))`
10. `status_summary TEXT NOT NULL`
11. `root_cause_code TEXT NULL`
12. `root_cause_node_id TEXT NULL`
13. `root_cause_message TEXT NULL`
14. `params_json JSONB NOT NULL DEFAULT '{}'::jsonb`
15. `context_json JSONB NOT NULL DEFAULT '{}'::jsonb`
16. `summary_json JSONB NOT NULL DEFAULT '{}'::jsonb`
17. `output_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb`
18. `compensation_attempted BOOLEAN NOT NULL DEFAULT false`
19. `compensation_status TEXT NOT NULL CHECK (compensation_status IN ('not_needed','pending','running','succeeded','failed')) DEFAULT 'not_needed'`
20. `compensation_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb`
21. `started_at TIMESTAMPTZ NULL`
22. `paused_at TIMESTAMPTZ NULL`
23. `ended_at TIMESTAMPTZ NULL`
24. `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
25. `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Indexes:

1. `(tenant_id, scope, created_at DESC)`
2. `(tenant_id, scope, automation_id, created_at DESC)`
3. `(tenant_id, scope, lifecycle_state, created_at DESC)`

### `automation_run_nodes`

Purpose:

1. node execution state and replay linkage per automation run

Columns:

1. `run_id UUID NOT NULL`
2. `node_id TEXT NOT NULL`
3. `attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0)`
4. `node_kind TEXT NOT NULL CHECK (node_kind IN ('playbook','approval','condition','artifact_gate'))`
5. `lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('pending','ready','running','paused','retrying','compensating','terminal'))`
6. `pause_reason TEXT NULL CHECK (pause_reason IS NULL OR pause_reason IN ('approval_required','repair_required'))`
7. `terminal_outcome TEXT NULL CHECK (terminal_outcome IS NULL OR terminal_outcome IN ('succeeded','failed','rejected','skipped','compensated'))`
8. `status_summary TEXT NOT NULL`
9. `depends_on_json JSONB NOT NULL DEFAULT '[]'::jsonb`
10. `blocking_node_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb`
11. `error_code TEXT NULL`
12. `error_message TEXT NULL`
13. `playbook_id TEXT NULL`
14. `playbook_version INTEGER NULL`
15. `playbook_run_id UUID NULL`
16. `approval_id TEXT NULL`
17. `input_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb`
18. `output_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb`
19. `artifact_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb`
20. `compensation_mode TEXT NOT NULL DEFAULT 'none' CHECK (compensation_mode IN ('none','best_effort','required'))`
21. `compensation_ref_json JSONB NOT NULL DEFAULT '{}'::jsonb`
22. `compensation_run_id UUID NULL`
23. `compensation_status TEXT NOT NULL DEFAULT 'not_needed' CHECK (compensation_status IN ('not_needed','pending','running','succeeded','failed'))`
24. `started_at TIMESTAMPTZ NULL`
25. `paused_at TIMESTAMPTZ NULL`
26. `ended_at TIMESTAMPTZ NULL`
27. `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
28. `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
29. primary key `(run_id, node_id, attempt)`

Indexes:

1. `(run_id, lifecycle_state)`
2. `(run_id, node_id)`
3. `(playbook_run_id)`

## 4.3 Database Invariants

Enforce in app logic first; add DB constraints only where cheap and safe.

Required invariants:

1. `pause_reason IS NULL` unless lifecycle is paused
2. `terminal_outcome IS NULL` unless lifecycle is terminal
3. terminal runs must have `ended_at`
4. terminal nodes must have `ended_at`
5. downstream nodes start as `pending`
6. only dependency-free nodes may transition to `ready`

## 5. Schema Contracts

All automation request schemas should live in `src/memory/schemas.ts`.

## 5.1 Zod Enums

Add:

1. `AutomationDefStatus = z.enum(["draft","shadow","active","disabled"])`
2. `AutomationRunLifecycleState = z.enum(["queued","running","paused","compensating","terminal"])`
3. `AutomationRunPauseReason = z.enum(["approval_required","repair_required","dependency_wait","operator_pause"])`
4. `AutomationRunTerminalOutcome = z.enum(["succeeded","failed","cancelled","failed_compensated","cancelled_compensated"])`
5. `AutomationNodeKind = z.enum(["playbook","approval","condition","artifact_gate"])`
6. `AutomationNodeLifecycleState = z.enum(["pending","ready","running","paused","retrying","compensating","terminal"])`
7. `AutomationNodePauseReason = z.enum(["approval_required","repair_required"])`
8. `AutomationNodeTerminalOutcome = z.enum(["succeeded","failed","rejected","skipped","compensated"])`

## 5.2 Request DTOs

Add:

1. `AutomationCreateRequest`
2. `AutomationGetRequest`
3. `AutomationRunRequest`
4. `AutomationRunGetRequest`
5. `AutomationRunCancelRequest`
6. `AutomationRunResumeRequest`

Recommended shapes:

### `AutomationCreateRequest`

```ts
z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  automation_id: z.string().min(1),
  name: z.string().min(1),
  status: AutomationDefStatus.default("draft"),
  graph: z.object({
    nodes: z.array(z.any()).min(1).max(200),
    edges: z.array(z.any()).max(500),
  }),
  input_contract: z.record(z.any()).optional(),
  output_contract: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
})
```

### `AutomationRunRequest`

```ts
z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  automation_id: z.string().min(1),
  version: z.number().int().positive().optional(),
  params: z.record(z.any()).optional(),
  options: z.object({
    allow_local_exec: z.boolean().default(false),
    record_run: z.boolean().default(true),
    stop_on_failure: z.boolean().default(true),
  }).optional(),
})
```

### `AutomationRunGetRequest`

```ts
z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: z.string().uuid(),
  include_nodes: z.boolean().default(true),
})
```

### `AutomationRunCancelRequest`

```ts
z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: z.string().uuid(),
  reason: z.string().min(1).max(1000).optional(),
})
```

### `AutomationRunResumeRequest`

```ts
z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: z.string().uuid(),
  reason: z.string().min(1).max(1000).optional(),
})
```

## 6. Module Design

Create:

1. `src/memory/automation.ts`

Initial exported functions:

1. `automationCreate(...)`
2. `automationGet(...)`
3. `automationRun(...)`
4. `automationRunGet(...)`
5. `automationRunCancel(...)`
6. `automationRunResume(...)`

Internal helpers:

1. `parseAutomationGraph(...)`
2. `validateAutomationGraph(...)`
3. `loadAutomationVersion(...)`
4. `createAutomationRunRows(...)`
5. `advanceAutomationRun(...)`
6. `scheduleReadyNodes(...)`
7. `runPlaybookNode(...)`
8. `runApprovalNode(...)`
9. `runConditionNode(...)`
10. `runArtifactGateNode(...)`
11. `deriveAutomationRunSummary(...)`
12. `deriveStatusSummary(...)`

## 7. Endpoint Wiring

Add in `src/index.ts`:

1. route permission map entries
2. new `app.post(...)` handlers
3. rate-limit class selection
4. tenant quota enforcement
5. inflight gate usage

Recommended rate-limit mapping:

1. `create`: `write`
2. `get`: `recall`
3. `run`: `write`
4. `runs/get`: `recall`
5. `runs/cancel`: `write`
6. `runs/resume`: `write`

Recommended endpoints:

1. `POST /v1/automations/create`
2. `POST /v1/automations/get`
3. `POST /v1/automations/run`
4. `POST /v1/automations/runs/get`
5. `POST /v1/automations/runs/cancel`
6. `POST /v1/automations/runs/resume`

## 8. Execution Semantics

## 8.1 Scheduler Rule

Phase 1 scheduler is synchronous and thin.

Algorithm:

1. create run row in `queued`
2. materialize node rows from graph
3. mark dependency-free nodes `ready`
4. set run `running`
5. execute one ready node at a time in topological order
6. after each node, recompute downstream readiness
7. stop when:
   - no ready nodes remain and run is terminal
   - a node pauses
   - a node fails and `stop_on_failure=true`

## 8.2 Playbook Node Execution

For node kind `playbook`:

1. resolve node inputs from:
   - `$params.*`
   - `$nodes.<node_id>.outputs.*`
2. call existing replay function or endpoint-equivalent service path
3. store linked `playbook_run_id`
4. map replay result to automation node state

Replay result mapping:

1. replay simulate success -> node terminal `succeeded`
2. replay strict success -> node terminal `succeeded`
3. replay strict failure -> node terminal `failed`
4. replay guided repair pending -> node paused `repair_required`
5. replay guided partial without pause is not allowed as a silent success; map to failed or paused based on replay response contract

## 8.3 Non-Playbook Nodes

`approval` node:

1. default result is `paused` with `approval_required`
2. `resume` moves it to terminal `succeeded`

`condition` node:

1. evaluate deterministic expression against params and prior outputs
2. terminal `succeeded` if true
3. terminal `skipped` or `failed` if false, depending on node policy

`artifact_gate` node:

1. verify required artifact fields or URIs exist
2. terminal `succeeded` if satisfied
3. terminal `failed` otherwise

## 8.4 Run Outcome Rules

Run outcome resolution:

1. all reachable nodes terminal and successful/skipped -> run terminal `succeeded`
2. any node paused -> run `paused`
3. cancel request on running or paused run -> run terminal `cancelled`
4. any node failed with no pause and stop-on-failure -> run terminal `failed`
5. if future compensation is added, this table can extend without changing Phase 1 contracts

## 9. API Responses

All response shapes should follow the layered status model.

## 9.1 `POST /v1/automations/run`

Response:

```json
{
  "run": {
    "run_id": "00000000-0000-0000-0000-000000000000",
    "automation_id": "auto_env_ci_deploy",
    "version": 1,
    "lifecycle_state": "paused",
    "pause_reason": "repair_required",
    "terminal_outcome": null,
    "status_summary": "paused_for_repair",
    "root_cause_code": "guided_repair_pending",
    "root_cause_node_id": "setup_ci",
    "compensation_attempted": false,
    "compensation_status": "not_needed"
  },
  "nodes": [
    {
      "node_id": "install_env",
      "node_kind": "playbook",
      "lifecycle_state": "terminal",
      "terminal_outcome": "succeeded",
      "status_summary": "succeeded",
      "playbook_run_id": "11111111-1111-1111-1111-111111111111"
    },
    {
      "node_id": "setup_ci",
      "node_kind": "playbook",
      "lifecycle_state": "paused",
      "pause_reason": "repair_required",
      "terminal_outcome": null,
      "status_summary": "paused_for_repair",
      "playbook_run_id": "22222222-2222-2222-2222-222222222222"
    }
  ]
}
```

## 9.2 `POST /v1/automations/runs/get`

Return:

1. `run`
2. `nodes` when `include_nodes=true`
3. derived summary counts:
   - `total_nodes`
   - `succeeded_nodes`
   - `failed_nodes`
   - `paused_nodes`
   - `pending_nodes`

## 9.3 `POST /v1/automations/runs/cancel`

Semantics:

1. allowed from `queued`, `running`, or `paused`
2. not allowed from `terminal`
3. no compensation in Phase 1

State changes:

1. run -> terminal `cancelled`
2. pending or ready nodes -> terminal `skipped`
3. paused nodes -> terminal `skipped`
4. running node outcome depends on interruption point; if not safely interruptible, mark run cancelled after current node boundary

## 9.4 `POST /v1/automations/runs/resume`

Semantics:

1. allowed only from paused runs
2. resumes only when blocking reason is resolvable

Phase 1 rules:

1. `approval_required` -> resume succeeds and approval node becomes terminal `succeeded`
2. `repair_required` -> resume succeeds only if the underlying playbook node was externally updated or explicitly approved by future API additions; for initial Phase 1, resume on repair-required may return `409 not_resumable_without_repair_action`

## 10. Graph Validation Rules

Validation must happen on create and run.

Required checks:

1. graph is acyclic
2. node IDs are unique
3. all edge endpoints exist
4. at least one start node exists
5. `playbook` nodes reference `playbook_id`
6. `approval`, `condition`, and `artifact_gate` nodes have required config blocks
7. input bindings reference only declared params or upstream nodes
8. no unsupported node kind is accepted

Validation error model:

1. `400 automation_graph_invalid`
2. response includes `issues: [{code, message, node_id?, edge?}]`

## 11. Error Model

Recommended error codes:

1. `automation_not_found`
2. `automation_version_not_found`
3. `automation_graph_invalid`
4. `automation_run_not_found`
5. `automation_run_terminal`
6. `automation_run_not_paused`
7. `automation_run_not_cancellable`
8. `automation_run_not_resumable`
9. `automation_node_execution_failed`
10. `automation_dependency_blocked`

## 12. SDK Surface

Add to internal and publishable SDKs:

1. `automationCreate(...)`
2. `automationGet(...)`
3. `automationRun(...)`
4. `automationRunGet(...)`
5. `automationRunCancel(...)`
6. `automationRunResume(...)`

Add corresponding types:

1. request DTOs
2. response DTOs
3. shared status enums

## 13. Test Plan

Minimum required tests:

1. migration applies cleanly
2. create + get round-trip
3. graph validation rejects cycle
4. run executes linear `install_env -> setup_ci -> deploy`
5. replay-guided pause maps to automation paused state
6. cancel from paused run produces terminal cancelled state
7. resume on approval pause succeeds
8. resume on repair pause without repair action returns `409`

Suggested test locations:

1. contract tests near `src/dev/contract-smoke.ts`
2. module tests for `src/memory/automation.ts`
3. SDK smoke after endpoint wiring

## 14. Acceptance Criteria

Phase 1 is complete when:

1. a stored automation definition can be created and read back
2. a linear automation can execute by calling existing playbook replay
3. run and node states persist with layered status fields
4. paused-for-repair is distinguishable from failed
5. cancel and resume semantics are explicit and tested
6. API and SDK types are wired end to end

## 15. Recommended Delivery Order

1. add migration
2. add Zod schemas and TypeScript types
3. add storage helpers in `src/memory/automation.ts`
4. add graph validator
5. add create/get endpoints
6. add run/get endpoints
7. add cancel/resume endpoints
8. add SDK methods
9. add contract smoke and module tests

This order keeps the first visible milestone small and aligns with the current replay kernel.
