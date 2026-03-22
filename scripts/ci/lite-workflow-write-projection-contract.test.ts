import test from "node:test";
import assert from "node:assert/strict";
import {
  assessWorkflowProjectionSourceNode,
  countDistinctWorkflowObservations,
  explainWorkflowProjectionForSourceNode,
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

test("workflow write projection accepts lightweight handoff-style continuity when resumable fields are present", () => {
  const assessed = assessWorkflowProjectionSourceNode({
    id: "handoff-source",
    scope: "default",
    type: "event",
    memory_lane: "private",
    owner_agent_id: "local-user",
    title: "Export repair handoff",
    text_summary: "Fix export failure in node tests",
    slots: {
      summary_kind: "handoff",
      handoff_kind: "patch_handoff",
      anchor: "resume:src/routes/export.ts",
      file_path: "src/routes/export.ts",
      repo_root: "/Volumes/ziel/Aionisgo",
      target_files: ["src/routes/export.ts"],
      next_action: "Patch src/routes/export.ts and rerun export tests",
      acceptance_checks: ["npm run -s test:lite -- export"],
    },
  });

  assert.equal(assessed.eligible, true);
  if (!assessed.eligible) return;
  assert.equal(assessed.state, null);
  assert.equal(assessed.packet?.task_brief, "Fix export failure in node tests");
  assert.deepEqual(assessed.packet?.target_files, ["src/routes/export.ts"]);
  assert.match(assessed.workflowSignature, /^execution_workflow:/);
  assert.equal(
    assessed.projectionClientId,
    `workflow_projection:handoff-source:${assessed.workflowSignature}`,
  );
});

test("workflow write projection keeps equivalent packet and lightweight handoff continuity in the same workflow family", () => {
  const packetAssessed = assessWorkflowProjectionSourceNode({
    id: "packet-source",
    scope: "default",
    type: "event",
    memory_lane: "private",
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
  const handoffAssessed = assessWorkflowProjectionSourceNode({
    id: "handoff-source",
    scope: "default",
    type: "event",
    memory_lane: "private",
    title: "Export repair handoff",
    text_summary: "Fix export failure in node tests",
    slots: {
      summary_kind: "handoff",
      handoff_kind: "patch_handoff",
      anchor: "resume:src/routes/export.ts",
      file_path: "src/routes/export.ts",
      repo_root: "/Volumes/ziel/Aionisgo",
      target_files: ["src/routes/export.ts"],
      next_action: "Patch src/routes/export.ts and rerun export tests",
      acceptance_checks: ["npm run -s test:lite -- export"],
    },
  });

  assert.equal(packetAssessed.eligible, true);
  assert.equal(handoffAssessed.eligible, true);
  if (!packetAssessed.eligible || !handoffAssessed.eligible) return;
  assert.equal(packetAssessed.workflowSignature, handoffAssessed.workflowSignature);
});

test("workflow write projection rejects lightweight handoff-style continuity when resumable target detail is missing", () => {
  const assessed = assessWorkflowProjectionSourceNode({
    id: "bad-handoff-source",
    scope: "default",
    type: "event",
    memory_lane: "private",
    title: "Task-only handoff",
    text_summary: "Fix export failure in node tests",
    slots: {
      summary_kind: "handoff",
      handoff_kind: "patch_handoff",
      anchor: "",
      target_files: [],
    },
  });

  assert.deepEqual(assessed, { eligible: false, reason: "missing_execution_continuity" });
});

test("workflow write projection counts distinct observations by source provenance before projection client id fallback", () => {
  const count = countDistinctWorkflowObservations([
    {
      id: "node-1",
      client_id: "projection-a",
      slots: {
        workflow_write_projection: {
          source_client_id: "source-a",
          source_node_id: "source-node-a",
        },
      },
    },
    {
      id: "node-2",
      client_id: "projection-b",
      slots: {
        workflow_write_projection: {
          source_client_id: "source-a",
          source_node_id: "source-node-b",
        },
      },
    },
    {
      id: "node-3",
      client_id: "projection-c",
      slots: {
        workflow_write_projection: {
          source_node_id: "source-node-c",
        },
      },
    },
    { id: "node-3", client_id: "client-b" },
    { id: "node-4" },
    { id: "node-4" },
  ]);
  assert.equal(count, 4);
});

test("workflow write projection explain treats linked source provenance as already projected", async () => {
  const result = await explainWorkflowProjectionForSourceNode({
    scope: "default",
    source: {
      id: "source-node-b",
      client_id: "source-client-a",
      scope: "default",
      type: "event",
      memory_lane: "private",
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
    },
    liteWriteStore: {
      findExecutionNativeNodes: async () => ({ rows: [], has_more: false }),
      findLatestNodeByClientId: async () => null,
      findNodes: async ({ slotsContains }) => {
        const projection = (slotsContains ?? {}).workflow_write_projection as Record<string, unknown> | undefined;
        if (projection?.source_client_id === "source-client-a") {
          return { rows: [{ id: "existing-projection" }], has_more: false };
        }
        return { rows: [], has_more: false };
      },
    },
  });

  assert.equal(result.decision, "projected");
});
