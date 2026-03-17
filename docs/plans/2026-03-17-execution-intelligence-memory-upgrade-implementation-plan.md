# Execution Intelligence Memory Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an internal execution-intelligence object model to Aionis so decisions, precedents, compiled workflows, and eval artifacts become queryable first-class internal assets without redefining `L0-L5`, expanding public `NodeType`/`EdgeType`, or changing public route contracts.

**Architecture:** Keep the existing memory compression ladder (`L0-L5`) intact and introduce a second internal axis via `slots.object_family` / `slots.object_kind` plus dedicated ledgers where append-only lineage matters. Reuse existing graph nodes (`event`, `concept`, `procedure`, `rule`) and replay/playbook primitives, then add internal projection/selection paths incrementally behind shadow-first defaults.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, SQLite lite stores, Zod schemas, existing CI probes under `scripts/ci`, offline jobs/benchmarks under `src/jobs`.

---

## Constraints

The implementation must preserve these rules throughout:

1. do not expand public `NodeType`
2. do not expand public `EdgeType`
3. do not change public route request/response contracts in the first rollout
4. keep the new model internal-first
5. keep projection and selection shadow-first where ambiguity exists
6. keep `L0-L5` reserved for compression/serving semantics only

## Current Baseline

Relevant current files:

1. [src/memory/layer-policy.ts](/Users/lucio/Desktop/Aionis/src/memory/layer-policy.ts)
2. [src/memory/recall.ts](/Users/lucio/Desktop/Aionis/src/memory/recall.ts)
3. [src/memory/context.ts](/Users/lucio/Desktop/Aionis/src/memory/context.ts)
4. [src/memory/tools-select.ts](/Users/lucio/Desktop/Aionis/src/memory/tools-select.ts)
5. [src/memory/tools-feedback.ts](/Users/lucio/Desktop/Aionis/src/memory/tools-feedback.ts)
6. [src/memory/replay.ts](/Users/lucio/Desktop/Aionis/src/memory/replay.ts)
7. [src/memory/replay-write.ts](/Users/lucio/Desktop/Aionis/src/memory/replay-write.ts)
8. [src/memory/replay-learning.ts](/Users/lucio/Desktop/Aionis/src/memory/replay-learning.ts)
9. [src/store/write-access.ts](/Users/lucio/Desktop/Aionis/src/store/write-access.ts)
10. [src/store/lite-write-store.ts](/Users/lucio/Desktop/Aionis/src/store/lite-write-store.ts)
11. [src/store/replay-access.ts](/Users/lucio/Desktop/Aionis/src/store/replay-access.ts)
12. [src/jobs/quality-eval.ts](/Users/lucio/Desktop/Aionis/src/jobs/quality-eval.ts)
13. [src/jobs/README.md](/Users/lucio/Desktop/Aionis/src/jobs/README.md)
14. [src/memory/schemas.ts](/Users/lucio/Desktop/Aionis/src/memory/schemas.ts)
15. [src/sdk/types.ts](/Users/lucio/Desktop/Aionis/src/sdk/types.ts)

Latest migration number at time of writing:

1. `0038_associative_linking_candidates.sql`

The next migrations in this plan should therefore start at `0039`.

## Rollout Strategy

Implement in four internal phases:

1. internal schema convergence
2. decision graph-native projection
3. precedent + compiled-workflow unification
4. eval ledger + selective runtime integration

Do not try to land all four phases in one commit train. Each task below should be implemented as a standalone task sequence with failing test first, minimal implementation, regression, then commit.

---

### Task 1: Add internal execution object envelope primitives

**Files:**
- Create: `src/memory/execution-object-types.ts`
- Modify: `src/memory/recall.ts`
- Modify: `src/memory/context.ts`
- Test: `scripts/ci/execution-object-types.test.mjs`

**Step 1: Write the failing test**

Create `scripts/ci/execution-object-types.test.mjs` with assertions for:

1. accepted `object_family` values:
   - `decision`
   - `precedent`
   - `compiled_workflow`
   - `eval_artifact`
2. accepted `object_kind` examples:
   - `decision_event`
   - `decision_summary`
   - `task_precedent`
   - `playbook`
   - `eval_run`
3. helper extracts `object_family`/`object_kind` from `slots`
4. helper does not reinterpret `compression_layer`
5. helper resolves `memory_layer` and `execution_object` independently

**Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/ci/execution-object-types.test.mjs
```

Expected: FAIL because `src/memory/execution-object-types.ts` does not exist.

**Step 3: Write minimal implementation**

Create `src/memory/execution-object-types.ts`:

```ts
import { z } from "zod";

export const ExecutionObjectFamilySchema = z.enum([
  "decision",
  "precedent",
  "compiled_workflow",
  "eval_artifact",
]);

export const ExecutionObjectKindSchema = z.string().min(1).max(64);

export const ExecutionObjectEnvelopeSchema = z.object({
  object_family: ExecutionObjectFamilySchema,
  object_kind: ExecutionObjectKindSchema,
  object_version: z.number().int().positive(),
  source_run_id: z.string().uuid().nullable().optional(),
  source_playbook_id: z.string().uuid().nullable().optional(),
  source_commit_id: z.string().uuid().nullable().optional(),
  task_fingerprint: z.string().min(1).nullable().optional(),
  constraint_fingerprint: z.string().min(1).nullable().optional(),
  workflow_fingerprint: z.string().min(1).nullable().optional(),
}).strict();

export function resolveExecutionObjectEnvelope(slots: unknown) {
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) return null;
  const parsed = ExecutionObjectEnvelopeSchema.safeParse(slots);
  return parsed.success ? parsed.data : null;
}
```

Add read-only helpers in `src/memory/recall.ts` and `src/memory/context.ts` to extract execution-object metadata without changing public response contracts yet.

**Step 4: Run test to verify it passes**

Run:

```bash
node --test scripts/ci/execution-object-types.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/ci/execution-object-types.test.mjs src/memory/execution-object-types.ts src/memory/recall.ts src/memory/context.ts
git commit -m "feat(memory): add internal execution object envelope"
```

---

### Task 2: Expand decision persistence from narrow ledger rows to richer internal decision objects

**Files:**
- Create: `src/memory/decision-object-lib.ts`
- Modify: `src/memory/tools-select.ts`
- Modify: `src/memory/tools-feedback.ts`
- Modify: `src/store/write-access.ts`
- Modify: `src/store/lite-write-store.ts`
- Modify: `src/dev/contract-smoke.ts`
- Test: `scripts/ci/decision-object-persistence.test.mjs`

**Step 1: Write the failing test**

Create `scripts/ci/decision-object-persistence.test.mjs` covering:

1. `tools_select` metadata now includes:
   - `object_family=decision`
   - `object_kind=decision_event`
   - `tool_path_signature`
   - `decision_subject`
2. `tools_feedback` can derive/update decision outcome summary fields
3. no public route shape changes
4. existing `decision_kind=tools_select` stays intact

**Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/ci/decision-object-persistence.test.mjs
```

Expected: FAIL because richer decision metadata is absent.

**Step 3: Write minimal implementation**

Create `src/memory/decision-object-lib.ts` with helpers:

1. `buildDecisionObjectEnvelope`
2. `buildToolPathSignature`
3. `mergeDecisionOutcomeSummary`

Modify `src/memory/tools-select.ts` so inserted decision metadata includes:

```ts
{
  object_family: "decision",
  object_kind: "decision_event",
  object_version: 1,
  decision_subject: "tool_selection",
  tool_path_signature: "<sha256>",
}
```

Modify `src/memory/tools-feedback.ts` so feedback-derived decision writes can attach:

1. `decision_outcome`
2. `decision_quality_hint`
3. linked feedback identifiers

Do not add new public API fields.

**Step 4: Run targeted regression**

Run:

```bash
node --test scripts/ci/decision-object-persistence.test.mjs
node --test scripts/ci/control-profile-tools-select.test.mjs
npm run -s test:contract
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/ci/decision-object-persistence.test.mjs src/memory/decision-object-lib.ts src/memory/tools-select.ts src/memory/tools-feedback.ts src/store/write-access.ts src/store/lite-write-store.ts src/dev/contract-smoke.ts
git commit -m "feat(memory): enrich execution decisions with internal object metadata"
```

---

### Task 3: Add shadow graph projection for reusable decision summaries

**Files:**
- Create: `src/memory/decision-projection.ts`
- Modify: `src/memory/tools-feedback.ts`
- Modify: `src/memory/write.ts`
- Modify: `src/store/write-access.ts`
- Modify: `src/store/lite-write-store.ts`
- Test: `scripts/ci/decision-projection.test.mjs`

**Step 1: Write the failing test**

Create `scripts/ci/decision-projection.test.mjs` for:

1. repeated decision patterns can produce an internal graph node
2. projected node uses existing `NodeType` only:
   - `event` for raw decision event
   - `concept` for summary projection
3. projection stores:
   - `slots.object_family=decision`
   - `slots.object_kind=decision_summary`
   - `slots.shadow_mode=true`
4. projection does not change public write routes

**Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/ci/decision-projection.test.mjs
```

Expected: FAIL because no decision projection path exists.

**Step 3: Write minimal implementation**

Create `src/memory/decision-projection.ts` with:

1. threshold helper for projection eligibility
2. deterministic summary node client-id builder
3. projection writer that emits `concept` nodes plus `derived_from` links

Hook projection only from internal decision feedback/replay-adjacent paths, behind shadow-first defaults.

Do not:

1. add new route
2. add new public node type
3. add new public edge type

**Step 4: Run targeted regression**

Run:

```bash
node --test scripts/ci/decision-projection.test.mjs
node --test scripts/ci/decision-object-persistence.test.mjs
npm run -s build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/ci/decision-projection.test.mjs src/memory/decision-projection.ts src/memory/tools-feedback.ts src/memory/write.ts src/store/write-access.ts src/store/lite-write-store.ts
git commit -m "feat(memory): project reusable decision summaries into graph shadow nodes"
```

---

### Task 4: Add precedent ledger and compiler inputs

**Files:**
- Create: `src/memory/precedent-types.ts`
- Create: `src/memory/precedent-store.ts`
- Modify: `src/store/write-access.ts`
- Modify: `src/store/lite-write-store.ts`
- Create: `migrations/0039_execution_precedents.sql`
- Test: `scripts/ci/precedent-store.test.mjs`

**Step 1: Write the failing test**

Create `scripts/ci/precedent-store.test.mjs` covering:

1. precedent upsert/list works in Postgres access layer
2. precedent upsert/list works in lite store
3. stored fields include:
   - `task_fingerprint`
   - `constraint_fingerprint`
   - `tool_path_signature`
   - `outcome`
   - `replayability_score`
   - `generalization_hints_json`
   - `linked_raw_evidence_ids_json`
   - `linked_compiled_workflow_ids_json`

**Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/ci/precedent-store.test.mjs
```

Expected: FAIL because precedent store does not exist.

**Step 3: Write minimal implementation**

Create:

1. `src/memory/precedent-types.ts`
2. `src/memory/precedent-store.ts`
3. migration `0039_execution_precedents.sql`

Add internal store methods:

1. `upsertExecutionPrecedent`
2. `listExecutionPrecedents`

Use dedicated ledger tables rather than graph nodes first.

**Step 4: Run targeted regression**

Run:

```bash
node --test scripts/ci/precedent-store.test.mjs
node --test scripts/ci/associative-linking-store.test.mjs
npm run -s build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/ci/precedent-store.test.mjs src/memory/precedent-types.ts src/memory/precedent-store.ts src/store/write-access.ts src/store/lite-write-store.ts migrations/0039_execution_precedents.sql
git commit -m "feat(memory): add execution precedent persistence"
```

---

### Task 5: Compile precedents from replay and decision outcomes

**Files:**
- Create: `src/memory/precedent-compiler.ts`
- Modify: `src/memory/replay-learning.ts`
- Modify: `src/memory/tools-feedback.ts`
- Modify: `src/memory/replay.ts`
- Test: `scripts/ci/precedent-compiler.test.mjs`

**Step 1: Write the failing test**

Create `scripts/ci/precedent-compiler.test.mjs` covering:

1. successful replay/playbook path emits a precedent candidate
2. repeated failed guided repair emits a failure precedent candidate
3. compiler dedupes by:
   - task fingerprint
   - constraint fingerprint
   - tool path signature
4. compiler links raw evidence and workflow ids

**Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/ci/precedent-compiler.test.mjs
```

Expected: FAIL because precedent compiler is absent.

**Step 3: Write minimal implementation**

Create `src/memory/precedent-compiler.ts` with:

1. fingerprint builders
2. outcome normalizer
3. compiler entry points for:
   - replay success
   - replay failure
   - repeated decision outcomes

Wire compiler into replay-learning and feedback paths with conservative thresholds.

Shadow-first rule:

1. only persist precedent ledger rows first
2. do not yet inject precedents into planning/context

**Step 4: Run targeted regression**

Run:

```bash
node --test scripts/ci/precedent-compiler.test.mjs
node --test scripts/ci/decision-object-persistence.test.mjs
node --test scripts/ci/decision-projection.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/ci/precedent-compiler.test.mjs src/memory/precedent-compiler.ts src/memory/replay-learning.ts src/memory/tools-feedback.ts src/memory/replay.ts
git commit -m "feat(memory): compile execution precedents from replay and feedback outcomes"
```

---

### Task 6: Formalize compiled workflow family on top of existing playbooks

**Files:**
- Create: `src/memory/compiled-workflow-types.ts`
- Modify: `src/memory/replay.ts`
- Modify: `src/memory/replay-write.ts`
- Modify: `src/store/replay-access.ts`
- Modify: `src/store/lite-replay-store.ts`
- Test: `scripts/ci/compiled-workflow-family.test.mjs`

**Step 1: Write the failing test**

Create `scripts/ci/compiled-workflow-family.test.mjs` asserting:

1. replay playbook nodes resolve as `object_family=compiled_workflow`
2. object kinds distinguish:
   - `playbook`
   - `replay_recipe` (placeholder internal kind only)
3. no public replay route contract changes
4. current playbook get/list/read paths still work

**Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/ci/compiled-workflow-family.test.mjs
```

Expected: FAIL because compiled-workflow metadata is absent.

**Step 3: Write minimal implementation**

Create `src/memory/compiled-workflow-types.ts` and annotate current playbook nodes via slots metadata during compile/promote paths:

```json
{
  "object_family": "compiled_workflow",
  "object_kind": "playbook",
  "object_version": 1
}
```

Do not rename existing `replay_kind=playbook`.

This task is a model-unification step, not a behavior rewrite.

**Step 4: Run targeted regression**

Run:

```bash
node --test scripts/ci/compiled-workflow-family.test.mjs
npm run -s test:contract
npm run -s build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/ci/compiled-workflow-family.test.mjs src/memory/compiled-workflow-types.ts src/memory/replay.ts src/memory/replay-write.ts src/store/replay-access.ts src/store/lite-replay-store.ts
git commit -m "feat(memory): formalize playbooks as compiled workflow objects"
```

---

### Task 7: Add eval artifact ledger for runtime-intelligence subjects

**Files:**
- Create: `src/memory/eval-artifact-types.ts`
- Create: `src/memory/eval-artifact-store.ts`
- Modify: `src/jobs/quality-eval.ts`
- Modify: `src/store/write-access.ts`
- Modify: `src/store/lite-write-store.ts`
- Create: `migrations/0040_execution_eval_artifacts.sql`
- Test: `scripts/ci/eval-artifact-store.test.mjs`

**Step 1: Write the failing test**

Create `scripts/ci/eval-artifact-store.test.mjs` covering:

1. eval artifact rows can be written/read
2. subjects can point to:
   - decision objects
   - precedents
   - compiled workflows
3. metric names include:
   - `decision_quality_score`
   - `replay_stability_score`
   - `context_efficiency_score`

**Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/ci/eval-artifact-store.test.mjs
```

Expected: FAIL because eval artifact ledger is absent.

**Step 3: Write minimal implementation**

Create dedicated eval artifact types/store and migration `0040_execution_eval_artifacts.sql`.

Modify `src/jobs/quality-eval.ts` so it can optionally emit internal eval artifacts for stable metrics, but keep current JSON output unchanged.

Do not project eval nodes into the main graph in this task.

**Step 4: Run targeted regression**

Run:

```bash
node --test scripts/ci/eval-artifact-store.test.mjs
npm run -s build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/ci/eval-artifact-store.test.mjs src/memory/eval-artifact-types.ts src/memory/eval-artifact-store.ts src/jobs/quality-eval.ts src/store/write-access.ts src/store/lite-write-store.ts migrations/0040_execution_eval_artifacts.sql
git commit -m "feat(memory): add execution eval artifact ledger"
```

---

### Task 8: Expose internal selection hooks for planning/context without changing public contracts

**Files:**
- Create: `src/memory/execution-object-selection.ts`
- Modify: `src/memory/context.ts`
- Modify: `src/memory/recall.ts`
- Modify: `src/app/planning-summary.ts`
- Test: `scripts/ci/execution-object-selection.test.mjs`

**Step 1: Write the failing test**

Create `scripts/ci/execution-object-selection.test.mjs` covering:

1. planning/context can internally prefer:
   - decision summaries
   - precedent summaries
   - compiled workflow summaries
2. trust anchors remain `L3/L0` by default
3. selection hooks do not alter current public response schema
4. execution-object selection can be disabled entirely

**Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/ci/execution-object-selection.test.mjs
```

Expected: FAIL because execution-object selection hooks are absent.

**Step 3: Write minimal implementation**

Create `src/memory/execution-object-selection.ts`:

1. object-family ranking helpers
2. conservative planning-context preference ordering
3. optional inclusion in selection stats / internal observability

Modify `src/memory/context.ts` and `src/memory/recall.ts` only internally.

Do not add new route inputs yet.

**Step 4: Run targeted regression**

Run:

```bash
node --test scripts/ci/execution-object-selection.test.mjs
npm run -s test:contract
npm run -s build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/ci/execution-object-selection.test.mjs src/memory/execution-object-selection.ts src/memory/context.ts src/memory/recall.ts src/app/planning-summary.ts
git commit -m "feat(memory): add internal execution object selection hooks"
```

---

### Task 9: Add graph projection for stable precedents and eval-backed workflow summaries

**Files:**
- Create: `src/memory/execution-object-projection.ts`
- Modify: `src/memory/precedent-compiler.ts`
- Modify: `src/memory/replay-learning.ts`
- Modify: `src/jobs/quality-eval.ts`
- Test: `scripts/ci/execution-object-projection.test.mjs`

**Step 1: Write the failing test**

Create `scripts/ci/execution-object-projection.test.mjs` asserting:

1. stable precedent rows can project to graph summaries
2. projected nodes use existing graph node types only
3. projected nodes are marked:
   - `object_family=precedent`
   - or `object_family=eval_artifact`
4. projection requires explicit thresholds and remains shadow-first

**Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/ci/execution-object-projection.test.mjs
```

Expected: FAIL because projection logic is absent.

**Step 3: Write minimal implementation**

Create `src/memory/execution-object-projection.ts` and add:

1. precedent summary projection
2. workflow stability summary projection
3. optional eval-backed projection path

All projections should:

1. remain internal
2. use existing node families
3. add provenance links with existing edge types

**Step 4: Run targeted regression**

Run:

```bash
node --test scripts/ci/execution-object-projection.test.mjs
node --test scripts/ci/precedent-compiler.test.mjs
npm run -s build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/ci/execution-object-projection.test.mjs src/memory/execution-object-projection.ts src/memory/precedent-compiler.ts src/memory/replay-learning.ts src/jobs/quality-eval.ts
git commit -m "feat(memory): project stable execution intelligence summaries into graph"
```

---

### Task 10: Document the model and guardrails

**Files:**
- Modify: `docs/plans/2026-03-17-execution-intelligence-memory-upgrade.md`
- Modify: `src/jobs/README.md`
- Create: `docs/internal/EXECUTION_OBJECT_MODEL.md`
- Test: documentation only

**Step 1: Write the documentation diff**

Add:

1. object-family taxonomy
2. distinction between compression layer and execution-object family
3. shadow-first projection rules
4. no-public-contract-change guarantee
5. rollout notes for decision / precedent / compiled_workflow / eval_artifact

**Step 2: Run docs check**

Run:

```bash
npm run -s docs:check
```

Expected: PASS.

**Step 3: Commit**

```bash
git add docs/plans/2026-03-17-execution-intelligence-memory-upgrade.md src/jobs/README.md docs/internal/EXECUTION_OBJECT_MODEL.md
git commit -m "docs(memory): document execution intelligence object model"
```

---

## Full Regression Checklist

After the final task, run:

```bash
node --test scripts/ci/execution-object-types.test.mjs
node --test scripts/ci/decision-object-persistence.test.mjs
node --test scripts/ci/decision-projection.test.mjs
node --test scripts/ci/precedent-store.test.mjs
node --test scripts/ci/precedent-compiler.test.mjs
node --test scripts/ci/compiled-workflow-family.test.mjs
node --test scripts/ci/eval-artifact-store.test.mjs
node --test scripts/ci/execution-object-selection.test.mjs
node --test scripts/ci/execution-object-projection.test.mjs
npm run -s test:contract
npm run -s build
npm run -s docs:check
```

Expected:

1. all targeted tests PASS
2. contract smoke PASS
3. build PASS
4. docs check PASS

## Planned Migration Sequence

Reserve these migration names:

1. `0039_execution_precedents.sql`
2. `0040_execution_eval_artifacts.sql`

Do not add a migration for new public node types in this plan.

## Explicit Non-Goals

This implementation plan intentionally does not include:

1. public `NodeType` expansion
2. public `EdgeType` expansion
3. public route contract changes
4. renaming existing replay playbooks away from `slots.replay_kind=playbook`
5. turning every benchmark metric into a graph node

## Success Criteria

The implementation should be considered complete when:

1. decisions can exist as richer internal memory objects
2. precedents are persisted and compiled from replay/feedback outcomes
3. playbooks are formalized as compiled workflow objects
4. eval artifacts are durable internal objects rather than only offline reports
5. planning/context can internally reason about these object families without breaking current public contracts
6. `L0-L5` remains clean and reserved for compression/serving semantics

## Suggested Execution Order

Recommended implementation batches:

1. Tasks 1-3
2. Tasks 4-6
3. Tasks 7-10

Each batch should be landed only after its own regression pass.
