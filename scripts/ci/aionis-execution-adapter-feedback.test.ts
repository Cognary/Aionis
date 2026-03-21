import test from "node:test";
import assert from "node:assert/strict";
import { createAionisExecutionAdapter } from "../../src/adapter/aionis-adapter.js";
import type { AionisMcpEnv } from "../../src/mcp/client.js";

const ENV: AionisMcpEnv = {
  AIONIS_BASE_URL: "http://127.0.0.1:3011",
  AIONIS_SCOPE: "default",
  AIONIS_TIMEOUT_MS: 10_000,
  AIONIS_MAX_TOOL_TEXT_CHARS: 8_000,
};

test("adapter records validated step success as positive evidence", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const adapter = createAionisExecutionAdapter({
    env: ENV,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return path === "/v1/memory/planning/context"
        ? {
            tenant_id: "default",
            scope: "default",
            planner_packet: { sections: { recommended_workflows: [], candidate_workflows: [] } },
            workflow_signals: [],
            pattern_signals: [],
            planning_summary: { planner_explanation: null, trusted_pattern_count: 0, contested_pattern_count: 0 },
            execution_kernel: {},
          }
        : {
            pattern_anchor: { credibility_state: "candidate" },
          };
    },
  });
  await adapter.beginTask({
    event_type: "task_started",
    task_id: "task-1",
    query_text: "repair export failure",
    context: { task_kind: "repair_export" },
    tool_candidates: ["bash", "edit", "test"],
  });
  const result = await adapter.recordToolOutcome({
    event_type: "tool_executed",
    task_id: "task-1",
    step_id: "step-1",
    selected_tool: "edit",
    candidates: ["edit", "bash"],
    context: { task_kind: "repair_export" },
    validated: true,
  });
  assert.equal(result.classification, "positive");
  assert.equal(result.recorded, true);
  assert.equal(calls.at(-1)?.path, "/v1/memory/tools/feedback");
  assert.equal(calls.at(-1)?.body.outcome, "positive");
});

test("adapter records reverted step as negative evidence", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const adapter = createAionisExecutionAdapter({
    env: ENV,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return path === "/v1/memory/planning/context"
        ? {
            tenant_id: "default",
            scope: "default",
            planner_packet: { sections: { recommended_workflows: [], candidate_workflows: [] } },
            workflow_signals: [],
            pattern_signals: [],
            planning_summary: { planner_explanation: null, trusted_pattern_count: 0, contested_pattern_count: 0 },
            execution_kernel: {},
          }
        : {
            pattern_anchor: { credibility_state: "contested" },
          };
    },
  });
  await adapter.beginTask({
    event_type: "task_started",
    task_id: "task-1",
    query_text: "repair export failure",
    context: { task_kind: "repair_export" },
    tool_candidates: ["bash", "edit", "test"],
  });
  const result = await adapter.recordToolOutcome({
    event_type: "tool_executed",
    task_id: "task-1",
    step_id: "step-1",
    selected_tool: "edit",
    candidates: ["edit", "bash"],
    context: { task_kind: "repair_export" },
    reverted: true,
  });
  assert.equal(result.classification, "negative");
  assert.equal(result.recorded, true);
  assert.equal(calls.at(-1)?.body.outcome, "negative");
});

test("adapter abstains on ambiguous step outcomes", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const adapter = createAionisExecutionAdapter({
    env: ENV,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return {
        tenant_id: "default",
        scope: "default",
        planner_packet: { sections: { recommended_workflows: [], candidate_workflows: [] } },
        workflow_signals: [],
        pattern_signals: [],
        planning_summary: { planner_explanation: null, trusted_pattern_count: 0, contested_pattern_count: 0 },
        execution_kernel: {},
      };
    },
  });
  await adapter.beginTask({
    event_type: "task_started",
    task_id: "task-1",
    query_text: "repair export failure",
    context: { task_kind: "repair_export" },
    tool_candidates: ["bash", "edit", "test"],
  });
  const result = await adapter.recordToolOutcome({
    event_type: "tool_executed",
    task_id: "task-1",
    step_id: "step-1",
    selected_tool: "edit",
    candidates: ["edit", "bash"],
    context: { task_kind: "repair_export" },
  });
  assert.equal(result.classification, "abstain");
  assert.equal(result.recorded, false);
  assert.equal(calls.length, 1);
});

test("adapter finalizes completed tasks once", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const adapter = createAionisExecutionAdapter({
    env: ENV,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return path === "/v1/memory/planning/context"
        ? {
            tenant_id: "default",
            scope: "default",
            planner_packet: { sections: { recommended_workflows: [], candidate_workflows: [] } },
            workflow_signals: [],
            pattern_signals: [],
            planning_summary: { planner_explanation: null, trusted_pattern_count: 0, contested_pattern_count: 0 },
            execution_kernel: {},
          }
        : {
            pattern_anchor: { credibility_state: "candidate" },
          };
    },
  });
  await adapter.beginTask({
    event_type: "task_started",
    task_id: "task-1",
    query_text: "repair export failure",
    context: { task_kind: "repair_export" },
    tool_candidates: ["bash", "edit", "test"],
  });
  await adapter.beforeToolUse({
    event_type: "tool_selection_requested",
    task_id: "task-1",
    candidates: ["bash", "edit", "test"],
    context: { task_kind: "repair_export" },
  });
  const first = await adapter.finalizeTask({
    event_type: "task_completed",
    task_id: "task-1",
    selected_tool: "edit",
    candidates: ["bash", "edit", "test"],
    context: { task_kind: "repair_export" },
  });
  const second = await adapter.finalizeTask({
    event_type: "task_completed",
    task_id: "task-1",
    selected_tool: "edit",
    candidates: ["bash", "edit", "test"],
    context: { task_kind: "repair_export" },
  });
  assert.equal(first.recorded, true);
  assert.equal(first.classification, "positive");
  assert.equal(second.recorded, false);
  assert.equal(second.skipped_duplicate_finalization, true);
});

test("adapter finalizes blocked tasks as negative", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const adapter = createAionisExecutionAdapter({
    env: ENV,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return path === "/v1/memory/planning/context"
        ? {
            tenant_id: "default",
            scope: "default",
            planner_packet: { sections: { recommended_workflows: [], candidate_workflows: [] } },
            workflow_signals: [],
            pattern_signals: [],
            planning_summary: { planner_explanation: null, trusted_pattern_count: 0, contested_pattern_count: 0 },
            execution_kernel: {},
          }
        : {
            pattern_anchor: { credibility_state: "contested" },
          };
    },
  });
  await adapter.beginTask({
    event_type: "task_started",
    task_id: "task-2",
    query_text: "repair export failure",
    context: { task_kind: "repair_export" },
    tool_candidates: ["bash", "edit", "test"],
  });
  const result = await adapter.finalizeTask({
    event_type: "task_blocked",
    task_id: "task-2",
    selected_tool: "bash",
    candidates: ["bash", "edit", "test"],
    context: { task_kind: "repair_export" },
  });
  assert.equal(result.classification, "negative");
  assert.equal(result.recorded, true);
  assert.equal(calls.at(-1)?.body.outcome, "negative");
});
