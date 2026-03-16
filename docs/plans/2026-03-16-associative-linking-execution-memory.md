# Associative Linking for Execution Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a shadow-first associative linking engine inside Aionis `Execution Memory` so coding-task-relevant memory points can gain automatic links without changing public route contracts or turning Aionis into a generic knowledge graph product.

**Architecture:** The implementation stays additive. `/v1/memory/write` and other existing routes keep their current public shapes, but selected writes enqueue an internal `associative_link` outbox event. A new worker path retrieves bounded same-scope candidates, extracts coding-task-specific features, scores relation candidates, stores them in an internal candidate table, and later promotes only high-confidence candidates into ordinary `related_to` edges. Recall benefits only from promoted edges, so the current graph contract remains stable.

**Tech Stack:** TypeScript, Fastify runtime, Postgres + SQLite Lite store adapters, Zod schemas, `node:test` CI scripts, existing outbox worker pipeline.

---

## Implementation Notes

This plan assumes implementation happens in a dedicated worktree and follows the existing additive-rollout rule:

1. no public route-family breakage
2. no `EdgeType` expansion in phase 1
3. no write-path latency regression from synchronous linking
4. no drift beyond coding-agent continuity

The governing architecture docs are:

- [AIONIS_ASSOCIATIVE_LINKING_FOR_EXECUTION_MEMORY_ADR_2026-03-16.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_ASSOCIATIVE_LINKING_FOR_EXECUTION_MEMORY_ADR_2026-03-16.md)
- [AIONIS_EXECUTION_CONTINUITY_KERNEL_ADR_2026-03-15.md](/Users/lucio/Desktop/Aionis/docs/internal/architecture/AIONIS_EXECUTION_CONTINUITY_KERNEL_ADR_2026-03-15.md)
- [AIONIS_KERNEL_ARCHITECTURE_SPEC.md](/Users/lucio/Desktop/Aionis/docs/AIONIS_KERNEL_ARCHITECTURE_SPEC.md)

## Phase Breakdown

This plan is split into:

1. `Phase 0`: internal schema and persistence scaffold
2. `Phase 1`: shadow candidate generation
3. `Phase 2`: high-confidence promotion into ordinary graph edges

No public SDK or API documentation updates are required until a public surface changes. Internal architecture and jobs docs should be updated as part of the implementation.

### Task 1: Add the Internal Associative Linking Contract

**Files:**
- Create: `/Users/lucio/Desktop/Aionis/src/memory/associative-linking-types.ts`
- Create: `/Users/lucio/Desktop/Aionis/src/memory/associative-linking-config.ts`
- Modify: `/Users/lucio/Desktop/Aionis/src/store/write-access.ts`
- Modify: `/Users/lucio/Desktop/Aionis/src/store/embedded-memory-runtime.ts`
- Test: `/Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-types.test.mjs`

**Step 1: Write the failing test**

Create a contract test that imports the new Zod schemas and asserts:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  AssociativeRelationKindSchema,
  AssociativeCandidateStatusSchema,
  AssociativeLinkTriggerPayloadSchema,
} from "../../src/memory/associative-linking-types.js";

test("associative link trigger payload accepts write origin", () => {
  const parsed = AssociativeLinkTriggerPayloadSchema.parse({
    origin: "memory_write",
    scope: "default",
    source_node_ids: ["11111111-1111-1111-1111-111111111111"],
    source_commit_id: "22222222-2222-2222-2222-222222222222",
  });
  assert.equal(parsed.origin, "memory_write");
});

test("relation and status enums stay narrow", () => {
  assert.equal(AssociativeRelationKindSchema.parse("same_task"), "same_task");
  assert.equal(AssociativeCandidateStatusSchema.parse("shadow"), "shadow");
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
node --test /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-types.test.mjs
```

Expected: FAIL because the new types module does not exist yet.

**Step 3: Write minimal implementation**

Add narrow internal contracts:

```ts
export const AssociativeRelationKindSchema = z.enum([
  "same_task",
  "supports",
  "extends",
  "repeats",
  "supersedes",
]);

export const AssociativeCandidateStatusSchema = z.enum([
  "shadow",
  "promoted",
  "rejected",
  "expired",
]);

export const AssociativeLinkTriggerPayloadSchema = z.object({
  origin: z.enum(["memory_write", "handoff_store", "replay_write", "session_event"]),
  scope: z.string().min(1),
  source_node_ids: z.array(UUID).min(1).max(64),
  source_commit_id: UUID,
});
```

Extend internal outbox event typing in the write-access layer so `associative_link` becomes a first-class internal event alongside `embed_nodes`, `topic_cluster`, and `replay_learning_projection`.

**Step 4: Run test to verify it passes**

Run:

```bash
node --test /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-types.test.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add /Users/lucio/Desktop/Aionis/src/memory/associative-linking-types.ts \
  /Users/lucio/Desktop/Aionis/src/memory/associative-linking-config.ts \
  /Users/lucio/Desktop/Aionis/src/store/write-access.ts \
  /Users/lucio/Desktop/Aionis/src/store/embedded-memory-runtime.ts \
  /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-types.test.mjs
git commit -m "feat(memory): add associative linking internal contract"
```

### Task 2: Add Candidate Persistence for Postgres and Lite

**Files:**
- Create: `/Users/lucio/Desktop/Aionis/migrations/0021_associative_linking_candidates.sql`
- Modify: `/Users/lucio/Desktop/Aionis/src/store/write-access.ts`
- Modify: `/Users/lucio/Desktop/Aionis/src/store/lite-write-store.ts`
- Create: `/Users/lucio/Desktop/Aionis/src/memory/associative-candidate-store.ts`
- Test: `/Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-store.test.mjs`

**Step 1: Write the failing test**

Create a test that verifies both store adapters can persist and list candidate rows.

Use a minimal shape:

```ts
{
  scope: "default",
  src_id: "...",
  dst_id: "...",
  relation_kind: "same_task",
  status: "shadow",
  score: 0.91,
  confidence: 0.88,
}
```

Assert:

1. duplicate `(scope, src_id, dst_id, relation_kind)` upserts instead of exploding
2. status transitions from `shadow` to `promoted` persist cleanly
3. `feature_summary_json` survives round-trip

**Step 2: Run test to verify it fails**

Run:

```bash
node --test /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-store.test.mjs
```

Expected: FAIL because no schema or store helpers exist.

**Step 3: Write minimal implementation**

Create a new Postgres table:

```sql
CREATE TABLE IF NOT EXISTS memory_association_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  src_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  dst_id UUID NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  relation_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  score REAL NOT NULL,
  confidence REAL NOT NULL,
  feature_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_commit_id UUID NULL REFERENCES memory_commits(id) ON DELETE SET NULL,
  worker_run_id TEXT NULL,
  promoted_edge_id UUID NULL REFERENCES memory_edges(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, src_id, dst_id, relation_kind)
);
```

Mirror it in Lite as `lite_memory_association_candidates` with equivalent columns and unique key.

Expose only internal helper methods such as:

1. `upsertAssociationCandidates`
2. `listAssociationCandidatesForSource`
3. `markAssociationCandidatePromoted`

Do not add public routes yet.

**Step 4: Run test to verify it passes**

Run:

```bash
node --test /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-store.test.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add /Users/lucio/Desktop/Aionis/migrations/0021_associative_linking_candidates.sql \
  /Users/lucio/Desktop/Aionis/src/store/write-access.ts \
  /Users/lucio/Desktop/Aionis/src/store/lite-write-store.ts \
  /Users/lucio/Desktop/Aionis/src/memory/associative-candidate-store.ts \
  /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-store.test.mjs
git commit -m "feat(memory): add associative candidate persistence"
```

### Task 3: Enqueue Associative Linking from Existing Write Paths

**Files:**
- Modify: `/Users/lucio/Desktop/Aionis/src/memory/write.ts`
- Modify: `/Users/lucio/Desktop/Aionis/src/memory/handoff.ts`
- Modify: `/Users/lucio/Desktop/Aionis/src/memory/replay.ts`
- Modify: `/Users/lucio/Desktop/Aionis/src/store/write-access.ts`
- Modify: `/Users/lucio/Desktop/Aionis/src/store/lite-write-store.ts`
- Test: `/Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-outbox.test.mjs`

**Step 1: Write the failing test**

Create a test that writes a small memory batch and asserts:

1. `embed_nodes` behavior remains intact
2. a second outbox row with `event_type = "associative_link"` is enqueued when the batch contains distillable or recall-relevant nodes
3. empty or irrelevant writes do not enqueue the event

Use assertions like:

```ts
assert.equal(outboxRows.some((row) => row.event_type === "associative_link"), true);
assert.deepEqual(payload.origin, "memory_write");
assert.ok(payload.source_node_ids.length >= 1);
```

**Step 2: Run test to verify it fails**

Run:

```bash
node --test /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-outbox.test.mjs
```

Expected: FAIL because the outbox event is not emitted yet.

**Step 3: Write minimal implementation**

Add a bounded enqueue rule:

1. only enqueue for source node types `event`, `evidence`, `concept`, `procedure`
2. cap `source_node_ids` payload size
3. same scope only
4. never block `/write` if enqueue fails in non-strict mode

Suggested write-side payload:

```json
{
  "origin": "memory_write",
  "scope": "default",
  "source_node_ids": ["..."],
  "source_commit_id": "..."
}
```

Mirror the same pattern for handoff and replay writes only when they create new state-bearing memory objects.

**Step 4: Run test to verify it passes**

Run:

```bash
node --test /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-outbox.test.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add /Users/lucio/Desktop/Aionis/src/memory/write.ts \
  /Users/lucio/Desktop/Aionis/src/memory/handoff.ts \
  /Users/lucio/Desktop/Aionis/src/memory/replay.ts \
  /Users/lucio/Desktop/Aionis/src/store/write-access.ts \
  /Users/lucio/Desktop/Aionis/src/store/lite-write-store.ts \
  /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-outbox.test.mjs
git commit -m "feat(memory): enqueue associative linking outbox events"
```

### Task 4: Implement Shadow Candidate Generation Worker Logic

**Files:**
- Create: `/Users/lucio/Desktop/Aionis/src/jobs/associative-linking-lib.ts`
- Modify: `/Users/lucio/Desktop/Aionis/src/jobs/outbox-worker.ts`
- Modify: `/Users/lucio/Desktop/Aionis/src/store/recall-access.ts`
- Create: `/Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-worker.test.mjs`

**Step 1: Write the failing test**

Create a worker-focused test that:

1. seeds source nodes and likely candidates inside one scope
2. runs the worker on a claimed `associative_link` payload
3. asserts that `memory_association_candidates` rows are written
4. asserts the candidate rows include `relation_kind`, `status=shadow`, `score`, and feature metadata

Expected pair examples:

1. same repo root + same file path + high embedding similarity -> `same_task`
2. same validation target + overlapping rollback notes -> `extends` or `supports`

**Step 2: Run test to verify it fails**

Run:

```bash
node --test /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-worker.test.mjs
```

Expected: FAIL because no worker path exists for `associative_link`.

**Step 3: Write minimal implementation**

Add a library with these minimal functions:

1. `fetchAssociativeCandidatesForSources`
2. `extractAssociativeFeatures`
3. `scoreAssociativeCandidate`
4. `materializeShadowAssociationCandidates`

Use a deterministic scoring strategy first. Example sketch:

```ts
const score =
  0.35 * embeddingSimilarity +
  0.2 * fileOverlap +
  0.15 * symbolOverlap +
  0.15 * validationOverlap +
  0.1 * handoffAnchorMatch +
  0.05 * recencyBoost;
```

Map score bands to relation kinds conservatively:

1. `same_task` for strongest same-work continuity signals
2. `supports` for overlapping evidence and validation support
3. `extends` for same task but broader subsequent work
4. `repeats` for near-duplicate execution attempts
5. `supersedes` only when the new node clearly replaces an older path

The worker must:

1. process bounded candidate counts
2. never cross scope
3. publish the outbox item when successful
4. keep failed items retryable like other worker paths

**Step 4: Run test to verify it passes**

Run:

```bash
node --test /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-worker.test.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add /Users/lucio/Desktop/Aionis/src/jobs/associative-linking-lib.ts \
  /Users/lucio/Desktop/Aionis/src/jobs/outbox-worker.ts \
  /Users/lucio/Desktop/Aionis/src/store/recall-access.ts \
  /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-worker.test.mjs
git commit -m "feat(memory): generate shadow associative candidates"
```

### Task 5: Add High-Confidence Promotion into Ordinary `related_to` Edges

**Files:**
- Modify: `/Users/lucio/Desktop/Aionis/src/jobs/associative-linking-lib.ts`
- Modify: `/Users/lucio/Desktop/Aionis/src/store/write-access.ts`
- Modify: `/Users/lucio/Desktop/Aionis/src/store/lite-write-store.ts`
- Create: `/Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-promotion.test.mjs`

**Step 1: Write the failing test**

Create a test that seeds candidate rows and asserts:

1. only candidates above the promotion threshold are promoted
2. promoted rows write exactly one canonical `related_to` edge
3. the candidate row updates to `status = promoted`
4. `promoted_edge_id` is backfilled
5. low-confidence candidates remain `shadow`

**Step 2: Run test to verify it fails**

Run:

```bash
node --test /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-promotion.test.mjs
```

Expected: FAIL because promotion does not exist yet.

**Step 3: Write minimal implementation**

Add promotion logic inside the associative linking library or a sibling helper:

```ts
if (candidate.confidence >= 0.9 && candidate.score >= 0.92) {
  insertRelatedToEdge(...);
  markCandidatePromoted(...);
}
```

Rules:

1. phase 2 promotes only to public `related_to`
2. internal `relation_kind` remains in candidate metadata
3. canonical ordering avoids duplicate symmetric edges
4. directional relation semantics stay internal

Do not change `EdgeType` or public route outputs yet.

**Step 4: Run test to verify it passes**

Run:

```bash
node --test /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-promotion.test.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add /Users/lucio/Desktop/Aionis/src/jobs/associative-linking-lib.ts \
  /Users/lucio/Desktop/Aionis/src/store/write-access.ts \
  /Users/lucio/Desktop/Aionis/src/store/lite-write-store.ts \
  /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-promotion.test.mjs
git commit -m "feat(memory): promote high-confidence associative links"
```

### Task 6: Add Observability and Guardrails

**Files:**
- Modify: `/Users/lucio/Desktop/Aionis/src/jobs/outbox-worker.ts`
- Modify: `/Users/lucio/Desktop/Aionis/src/jobs/README.md`
- Modify: `/Users/lucio/Desktop/Aionis/src/jobs/quality-eval.ts`
- Create: `/Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-guardrails.test.mjs`

**Step 1: Write the failing test**

Create a small guardrail test that asserts:

1. cross-scope candidate creation is rejected
2. promotion never creates self-loops
3. candidate status transitions are limited to valid values
4. worker metrics include counts for `shadow_created`, `promoted`, and `rejected`

**Step 2: Run test to verify it fails**

Run:

```bash
node --test /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-guardrails.test.mjs
```

Expected: FAIL because the guardrail counters and status checks are incomplete.

**Step 3: Write minimal implementation**

Update worker payload reporting and quality metrics so operators can see:

1. candidate rows created
2. candidate rows promoted
3. candidate rows rejected or expired
4. association precision sample hooks

Add a short jobs doc section documenting:

1. the new `associative_link` outbox event
2. shadow-first rollout
3. the promotion rule
4. what is intentionally still internal

**Step 4: Run test to verify it passes**

Run:

```bash
node --test /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-guardrails.test.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add /Users/lucio/Desktop/Aionis/src/jobs/outbox-worker.ts \
  /Users/lucio/Desktop/Aionis/src/jobs/README.md \
  /Users/lucio/Desktop/Aionis/src/jobs/quality-eval.ts \
  /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-guardrails.test.mjs
git commit -m "chore(memory): add associative linking guardrails"
```

### Task 7: Run End-to-End Verification

**Files:**
- Verify only; no new source files required unless a failure forces a fix

**Step 1: Run targeted CI tests**

Run:

```bash
node --test \
  /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-types.test.mjs \
  /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-store.test.mjs \
  /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-outbox.test.mjs \
  /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-worker.test.mjs \
  /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-promotion.test.mjs \
  /Users/lucio/Desktop/Aionis/scripts/ci/associative-linking-guardrails.test.mjs
```

Expected: PASS

**Step 2: Run build and contract checks**

Run:

```bash
npm run build
npm run docs:check
```

Expected: PASS

**Step 3: Run one continuity-sensitive smoke path**

Use an existing replay/handoff/context smoke path or add a one-off manual script to confirm:

1. a write can enqueue `associative_link`
2. the worker can produce a promoted `related_to` edge
3. a subsequent recall returns a denser subgraph without route breakage

Expected: the route contract remains unchanged while subgraph connectivity increases.

**Step 4: Commit final integration**

```bash
git add -A
git commit -m "feat(memory): add associative linking for execution memory"
```

## Files Most Likely to Need Careful Reading Before Implementation

- `/Users/lucio/Desktop/Aionis/src/memory/write.ts`
- `/Users/lucio/Desktop/Aionis/src/memory/recall.ts`
- `/Users/lucio/Desktop/Aionis/src/memory/handoff.ts`
- `/Users/lucio/Desktop/Aionis/src/memory/replay.ts`
- `/Users/lucio/Desktop/Aionis/src/store/write-access.ts`
- `/Users/lucio/Desktop/Aionis/src/store/recall-access.ts`
- `/Users/lucio/Desktop/Aionis/src/store/lite-write-store.ts`
- `/Users/lucio/Desktop/Aionis/src/jobs/outbox-worker.ts`
- `/Users/lucio/Desktop/Aionis/src/jobs/topicClusterLib.ts`
- `/Users/lucio/Desktop/Aionis/src/jobs/quality-eval.ts`

## Review Checklist

Before merging, confirm:

1. no public route request/response shape changed
2. `EdgeType` remains `part_of | related_to | derived_from`
3. cross-tenant and cross-scope linking is impossible
4. `/write` latency did not gain a synchronous quadratic path
5. low-confidence associations remain internal and non-disruptive
6. recall quality improves on at least one continuity-sensitive benchmark slice
7. the feature still reads as `Execution Memory enhancement`, not a new generic graph product

## Deferred Work

Do not do these in the first implementation pass:

1. public associative relation APIs
2. public `EdgeType` expansion
3. contradiction links as a promoted default
4. fully learned link-scoring models
5. arbitrary ontology tooling

These can be revisited only after benchmark evidence proves that the shadow-first pipeline materially improves coding-agent continuity.
