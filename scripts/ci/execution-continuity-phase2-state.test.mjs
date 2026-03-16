import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryExecutionStateStore,
  applyExecutionStateTransition,
  buildStoredExecutionState,
} from "../../src/execution/index.js";

function baseState() {
  return {
    state_id: "state-1",
    scope: "openclaw:test",
    task_brief: "stabilize reviewer-ready auth workflow",
    current_stage: "triage",
    active_role: "triage",
    owned_files: ["ui/src/ui/gateway.ts"],
    modified_files: [],
    pending_validations: ["confirm auth token drift boundary"],
    completed_validations: [],
    last_accepted_hypothesis: null,
    rejected_paths: [],
    unresolved_blockers: [],
    rollback_notes: [],
    reviewer_contract: null,
    resume_anchor: null,
    updated_at: "2026-03-16T00:00:00.000Z",
    version: 1,
  };
}

test("execution continuity phase 2 scaffold stores state records and applies deterministic transitions", () => {
  const store = new InMemoryExecutionStateStore();
  const initial = store.put(baseState());

  assert.equal(initial.revision, 1);
  assert.equal(store.has("openclaw:test", "state-1"), true);
  assert.equal(store.listByScope("openclaw:test").length, 1);

  const afterStageStart = store.applyTransition({
    transition_id: "tr-1",
    state_id: "state-1",
    scope: "openclaw:test",
    actor_role: "orchestrator",
    at: "2026-03-16T00:01:00.000Z",
    expected_revision: 1,
    type: "stage_started",
    next_stage: "patch",
    next_role: "patch",
  });

  assert.equal(afterStageStart.revision, 2);
  assert.equal(afterStageStart.state.current_stage, "patch");
  assert.equal(afterStageStart.state.active_role, "patch");
  assert.equal(afterStageStart.last_transition_type, "stage_started");

  const afterValidation = store.applyTransition({
    transition_id: "tr-2",
    state_id: "state-1",
    scope: "openclaw:test",
    actor_role: "patch",
    at: "2026-03-16T00:02:00.000Z",
    expected_revision: 2,
    type: "validation_completed",
    validations: ["confirm auth token drift boundary"],
  });

  assert.equal(afterValidation.revision, 3);
  assert.deepEqual(afterValidation.state.pending_validations, []);
  assert.deepEqual(afterValidation.state.completed_validations, ["confirm auth token drift boundary"]);
});

test("execution continuity transitions fail on scope mismatch and revision mismatch", () => {
  const state = baseState();

  assert.throws(() =>
    applyExecutionStateTransition(state, {
      transition_id: "tr-bad-scope",
      state_id: "state-1",
      scope: "openclaw:other",
      actor_role: "triage",
      at: "2026-03-16T00:01:00.000Z",
      type: "blocker_recorded",
      blockers: ["scope mismatch"],
    }),
  );

  const store = new InMemoryExecutionStateStore();
  store.put(state);

  assert.throws(() =>
    store.applyTransition({
      transition_id: "tr-bad-revision",
      state_id: "state-1",
      scope: "openclaw:test",
      actor_role: "triage",
      at: "2026-03-16T00:01:00.000Z",
      expected_revision: 99,
      type: "blocker_recorded",
      blockers: ["wrong revision"],
    }),
  );
});

test("execution continuity phase 2 stored state builder preserves metadata", () => {
  const record = buildStoredExecutionState(baseState(), {
    revision: 4,
    lastTransitionType: "resume_anchor_updated",
    lastTransitionAt: "2026-03-16T00:03:00.000Z",
  });

  assert.equal(record.revision, 4);
  assert.equal(record.last_transition_type, "resume_anchor_updated");
  assert.equal(record.last_transition_at, "2026-03-16T00:03:00.000Z");
});
