import test from "node:test";
import assert from "node:assert/strict";
import {
  AdapterTaskStartedSchema,
  AdapterTaskTerminalOutcomeSchema,
  AdapterToolExecutedSchema,
  AdapterToolSelectionRequestedSchema,
} from "../../src/adapter/contracts.js";
import { createAionisExecutionAdapter } from "../../src/adapter/aionis-adapter.js";
import type { AionisMcpEnv } from "../../src/mcp/client.js";

const ENV: AionisMcpEnv = {
  AIONIS_BASE_URL: "http://127.0.0.1:3011",
  AIONIS_SCOPE: "default",
  AIONIS_TIMEOUT_MS: 10_000,
  AIONIS_MAX_TOOL_TEXT_CHARS: 8_000,
};

test("adapter contracts accept normalized execution events", () => {
  const taskStarted = AdapterTaskStartedSchema.parse({
    event_type: "task_started",
    task_id: "task-1",
    query_text: "repair export failure",
    context: { task_kind: "repair_export" },
    tool_candidates: ["bash", "edit", "test"],
  });
  assert.equal(taskStarted.task_id, "task-1");

  const selectionRequested = AdapterToolSelectionRequestedSchema.parse({
    event_type: "tool_selection_requested",
    task_id: "task-1",
    candidates: ["bash", "edit", "test"],
  });
  assert.equal(selectionRequested.candidates.length, 3);

  const toolExecuted = AdapterToolExecutedSchema.parse({
    event_type: "tool_executed",
    task_id: "task-1",
    step_id: "step-1",
    selected_tool: "bash",
    candidates: ["bash", "edit", "test"],
    context: { task_kind: "repair_export" },
  });
  assert.equal(toolExecuted.selected_tool, "bash");

  const taskCompleted = AdapterTaskTerminalOutcomeSchema.parse({
    event_type: "task_completed",
    task_id: "task-1",
  });
  assert.equal(taskCompleted.event_type, "task_completed");
});

test("adapter contracts reject malformed normalized execution events", () => {
  assert.throws(
    () => AdapterTaskStartedSchema.parse({
      event_type: "task_started",
      query_text: "repair export failure",
    }),
    /task_id/i,
  );
  assert.throws(
    () => AdapterToolSelectionRequestedSchema.parse({
      event_type: "tool_selection_requested",
      task_id: "task-1",
      candidates: [],
    }),
    /at least 1/i,
  );
  assert.throws(
    () => AdapterTaskTerminalOutcomeSchema.parse({
      event_type: "task_unknown",
      task_id: "task-1",
    }),
    /invalid/i,
  );
});

test("adapter beginTask calls planning once and stores task planning state", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const adapter = createAionisExecutionAdapter({
    env: ENV,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      if (path !== "/v1/memory/planning/context") throw new Error(`unexpected path ${path}`);
      return {
        tenant_id: "default",
        scope: "default",
        planner_packet: {
          sections: {
            recommended_workflows: [{ title: "Fix export failure" }],
            candidate_workflows: [],
          },
        },
        workflow_signals: [{ workflow_signature: "repair-export" }],
        pattern_signals: [],
        planning_summary: {
          planner_explanation: "workflow guidance: Fix export failure",
          trusted_pattern_count: 1,
          contested_pattern_count: 0,
        },
        execution_kernel: { has_guidance: true },
      };
    },
  });

  const result = await adapter.beginTask({
    event_type: "task_started",
    task_id: "task-1",
    query_text: "repair export failure in node tests",
    context: { task_kind: "repair_export" },
    tool_candidates: ["bash", "edit", "test"],
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/v1/memory/planning/context");
  assert.equal(calls[0]?.body.run_id, "task-1");
  assert.equal(result.planning.recommended_workflow_count, 1);
  assert.equal(result.session.planning?.recommended_workflow_count, 1);
  assert.equal(adapter.state.getTask("task-1")?.planning?.recommended_workflow_count, 1);
});

test("adapter beforeToolUse calls select once and stores selection state", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const adapter = createAionisExecutionAdapter({
    env: ENV,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      if (path === "/v1/memory/planning/context") {
        return {
          tenant_id: "default",
          scope: "default",
          planner_packet: { sections: { recommended_workflows: [], candidate_workflows: [] } },
          workflow_signals: [],
          pattern_signals: [],
          planning_summary: {
            planner_explanation: null,
            trusted_pattern_count: 0,
            contested_pattern_count: 0,
          },
          execution_kernel: {},
        };
      }
      if (path === "/v1/memory/tools/select") {
        return {
          tenant_id: "default",
          scope: "default",
          selection: {
            selected: "edit",
            ordered: ["edit", "bash", "test"],
            preferred: ["edit"],
          },
          decision: {
            decision_id: "decision-1",
            decision_uri: "aionis://memory/execution-decision/decision-1",
            run_id: "task-1",
          },
          selection_summary: {
            provenance_explanation: "trusted pattern support: edit [exact_task_signature]",
            used_trusted_pattern_tools: ["edit"],
            used_trusted_pattern_affinity_levels: ["exact_task_signature"],
          },
        };
      }
      throw new Error(`unexpected path ${path}`);
    },
  });

  await adapter.beginTask({
    event_type: "task_started",
    task_id: "task-1",
    query_text: "repair export failure in node tests",
    context: { task_kind: "repair_export" },
    tool_candidates: ["bash", "edit", "test"],
  });

  const result = await adapter.beforeToolUse({
    event_type: "tool_selection_requested",
    task_id: "task-1",
    candidates: ["bash", "edit", "test"],
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.path, "/v1/memory/tools/select");
  assert.equal(calls[1]?.body.run_id, "task-1");
  assert.equal(result.selection.selected_tool, "edit");
  assert.deepEqual(result.selection.preferred, ["edit"]);
  assert.equal(result.selection.decision_id, "decision-1");
  assert.equal(adapter.state.getTask("task-1")?.last_selection?.selected_tool, "edit");
});
