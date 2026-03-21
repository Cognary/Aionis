import test from "node:test";
import assert from "node:assert/strict";
import {
  assessWorkflowProjectionSourceNode,
  countDistinctWorkflowObservations,
} from "../../src/memory/workflow-write-projection.ts";

test("workflow write projection rejects nodes without execution continuity", () => {
  const nonEvent = assessWorkflowProjectionSourceNode({
    id: "n1",
    scope: "default",
    type: "topic",
    memory_lane: "private",
    slots: {},
  });
  assert.deepEqual(nonEvent, { eligible: false, reason: "non_event" });

  const missingContinuity = assessWorkflowProjectionSourceNode({
    id: "n2",
    scope: "default",
    type: "event",
    memory_lane: "private",
    slots: {},
  });
  assert.deepEqual(missingContinuity, { eligible: false, reason: "missing_execution_continuity" });
});

test("workflow write projection rejects nodes that already carry workflow memory or invalid continuity", () => {
  const existingWorkflow = assessWorkflowProjectionSourceNode({
    id: "n3",
    scope: "default",
    type: "event",
    memory_lane: "private",
    slots: {
      execution_native_v1: {
        schema_version: "execution_native_v1",
        execution_kind: "workflow_candidate",
      },
    },
  });
  assert.deepEqual(existingWorkflow, { eligible: false, reason: "existing_workflow_memory" });

  const invalidState = assessWorkflowProjectionSourceNode({
    id: "n4",
    scope: "default",
    type: "event",
    memory_lane: "private",
    slots: {
      execution_state_v1: {
        version: 1,
      },
    },
  });
  assert.deepEqual(invalidState, { eligible: false, reason: "invalid_execution_state" });
});

test("workflow write projection accepts packet-only continuity and derives deterministic signature state", () => {
  const assessed = assessWorkflowProjectionSourceNode({
    id: "source-node",
    scope: "default",
    type: "event",
    memory_lane: "private",
    owner_agent_id: "local-user",
    slots: {
      execution_packet_v1: {
        version: 1,
        state_id: "state-1",
        current_stage: "patch",
        active_role: "patch",
        task_brief: "Fix export failure in node tests",
        target_files: ["src/routes/export.ts"],
        next_action: "Patch src/routes/export.ts and rerun export tests",
        hard_constraints: [],
        accepted_facts: [],
        rejected_paths: [],
        pending_validations: ["npm run -s test:lite -- export"],
        unresolved_blockers: [],
        rollback_notes: [],
        review_contract: null,
        resume_anchor: {
          anchor: "resume:src/routes/export.ts",
          file_path: "src/routes/export.ts",
          symbol: null,
          repo_root: "/Volumes/ziel/Aionisgo",
        },
        artifact_refs: [],
        evidence_refs: [],
      },
    },
  });

  assert.equal(assessed.eligible, true);
  if (!assessed.eligible) return;
  assert.equal(assessed.packet?.task_brief, "Fix export failure in node tests");
  assert.equal(assessed.state, null);
  assert.match(assessed.workflowSignature, /^execution_workflow:/);
  assert.equal(
    assessed.projectionClientId,
    `workflow_projection:source-node:${assessed.workflowSignature}`,
  );
  assert.equal(assessed.ownerAgentId, "local-user");
});

test("workflow write projection counts distinct observations by client id with id fallback", () => {
  const count = countDistinctWorkflowObservations([
    { id: "node-1", client_id: "client-a" },
    { id: "node-2", client_id: "client-a" },
    { id: "node-3", client_id: "client-b" },
    { id: "node-4" },
    { id: "node-4" },
  ]);
  assert.equal(count, 3);
});
