import test from "node:test";
import assert from "node:assert/strict";
import type { AionisMcpEnv } from "../../src/mcp/client.js";
import { AionisMcpSessionState } from "../../src/mcp/session-state.js";
import { classifyFeedbackSignal, createAionisMcpTools } from "../../src/mcp/tools.js";

const ENV: AionisMcpEnv = {
  AIONIS_BASE_URL: "http://127.0.0.1:3001",
  AIONIS_SCOPE: "default",
  AIONIS_TIMEOUT_MS: 10_000,
  AIONIS_MAX_TOOL_TEXT_CHARS: 8_000,
};

test("feedback protocol abstains on unknown signals", () => {
  const classification = classifyFeedbackSignal(
    {
      decision_id: "d1",
      signal_kind: "unknown",
    },
    {
      decision_id: "d1",
      run_id: "run-1",
      selected_tool: "bash",
      candidates: ["bash", "edit"],
      context: {},
      created_at: new Date().toISOString(),
    },
  );
  assert.deepEqual(classification, {
    classification: "abstain",
    reason: "signal is ambiguous; thin MCP abstains",
    shouldRecord: false,
    retainPendingDecision: false,
  });
});

test("feedback protocol defers edit success until validated", async () => {
  const state = new AionisMcpSessionState();
  state.setPendingDecision({
    decision_id: "11111111-1111-1111-1111-111111111111",
    run_id: "run-1",
    selected_tool: "edit",
    candidates: ["edit", "bash"],
    context: { task_kind: "repair_export" },
    created_at: new Date().toISOString(),
  });

  const calls: Array<{ path: string; body: any }> = [];
  const tools = createAionisMcpTools({
    env: ENV,
    state,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return {
        pattern_anchor: { credibility_state: "candidate" },
      };
    },
  });

  const result = await tools.callTool("aionis_record_feedback", {
    decision_id: "11111111-1111-1111-1111-111111111111",
    signal_kind: "step_succeeded",
  });
  assert.equal(result.isError, undefined);
  assert.equal((result.structuredContent as any).feedback_recorded, false);
  assert.equal((result.structuredContent as any).classification, "abstain");
  assert.equal((result.structuredContent as any).pending_retained, true);
  assert.equal(calls.length, 0);
  assert.ok(state.getPendingDecisionByDecisionId("11111111-1111-1111-1111-111111111111"));
});

test("feedback protocol records validated edit success as positive", async () => {
  const state = new AionisMcpSessionState();
  state.setPendingDecision({
    decision_id: "11111111-1111-1111-1111-111111111111",
    run_id: "run-1",
    selected_tool: "edit",
    candidates: ["edit", "bash"],
    context: { task_kind: "repair_export" },
    created_at: new Date().toISOString(),
  });

  const calls: Array<{ path: string; body: any }> = [];
  const tools = createAionisMcpTools({
    env: ENV,
    state,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return {
        pattern_anchor: { credibility_state: "candidate" },
      };
    },
  });

  const result = await tools.callTool("aionis_record_feedback", {
    decision_id: "11111111-1111-1111-1111-111111111111",
    signal_kind: "step_succeeded",
    validated: true,
  });
  assert.equal((result.structuredContent as any).feedback_recorded, true);
  assert.equal((result.structuredContent as any).classification, "positive");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/v1/memory/tools/feedback");
  assert.equal(calls[0]?.body.outcome, "positive");
  assert.equal(state.getPendingDecisionByDecisionId("11111111-1111-1111-1111-111111111111"), null);
});

test("feedback protocol records reverted edit as negative", async () => {
  const state = new AionisMcpSessionState();
  state.setPendingDecision({
    decision_id: "11111111-1111-1111-1111-111111111111",
    run_id: "run-1",
    selected_tool: "edit",
    candidates: ["edit", "bash"],
    context: { task_kind: "repair_export" },
    created_at: new Date().toISOString(),
  });

  const calls: Array<{ path: string; body: any }> = [];
  const tools = createAionisMcpTools({
    env: ENV,
    state,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return {
        pattern_anchor: { credibility_state: "contested" },
      };
    },
  });

  const result = await tools.callTool("aionis_record_feedback", {
    decision_id: "11111111-1111-1111-1111-111111111111",
    signal_kind: "tool_reverted",
  });
  assert.equal((result.structuredContent as any).feedback_recorded, true);
  assert.equal((result.structuredContent as any).classification, "negative");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.body.outcome, "negative");
});

test("feedback protocol does not turn non-zero exit alone into negative", async () => {
  const state = new AionisMcpSessionState();
  state.setPendingDecision({
    decision_id: "11111111-1111-1111-1111-111111111111",
    run_id: "run-1",
    selected_tool: "bash",
    candidates: ["bash", "edit"],
    context: { task_kind: "repair_export" },
    created_at: new Date().toISOString(),
  });

  const calls: Array<{ path: string; body: any }> = [];
  const tools = createAionisMcpTools({
    env: ENV,
    state,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return {};
    },
  });

  const result = await tools.callTool("aionis_record_feedback", {
    decision_id: "11111111-1111-1111-1111-111111111111",
    signal_kind: "step_succeeded",
    command_exit_code: 2,
  });
  assert.equal((result.structuredContent as any).feedback_recorded, false);
  assert.equal((result.structuredContent as any).classification, "abstain");
  assert.equal(calls.length, 0);
});

test("feedback protocol treats user_confirmed as a highest-confidence positive signal", async () => {
  const state = new AionisMcpSessionState();
  state.setPendingDecision({
    decision_id: "11111111-1111-1111-1111-111111111111",
    run_id: "run-1",
    selected_tool: "bash",
    candidates: ["bash", "edit"],
    context: { task_kind: "repair_export" },
    created_at: new Date().toISOString(),
  });

  const calls: Array<{ path: string; body: any }> = [];
  const tools = createAionisMcpTools({
    env: ENV,
    state,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return {
        pattern_anchor: { credibility_state: "candidate" },
      };
    },
  });

  const result = await tools.callTool("aionis_record_feedback", {
    decision_id: "11111111-1111-1111-1111-111111111111",
    signal_kind: "user_confirmed",
    note: "user said this worked",
  });
  assert.equal((result.structuredContent as any).feedback_recorded, true);
  assert.equal((result.structuredContent as any).classification, "positive");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.body.outcome, "positive");
});

test("feedback protocol treats user_rejected as a highest-confidence negative signal", async () => {
  const state = new AionisMcpSessionState();
  state.setPendingDecision({
    decision_id: "11111111-1111-1111-1111-111111111111",
    run_id: "run-1",
    selected_tool: "bash",
    candidates: ["bash", "edit"],
    context: { task_kind: "repair_export" },
    created_at: new Date().toISOString(),
  });

  const calls: Array<{ path: string; body: any }> = [];
  const tools = createAionisMcpTools({
    env: ENV,
    state,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return {
        pattern_anchor: { credibility_state: "contested" },
      };
    },
  });

  const result = await tools.callTool("aionis_record_feedback", {
    decision_id: "11111111-1111-1111-1111-111111111111",
    signal_kind: "user_rejected",
    note: "user said this was wrong",
  });
  assert.equal((result.structuredContent as any).feedback_recorded, true);
  assert.equal((result.structuredContent as any).classification, "negative");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.body.outcome, "negative");
});

test("feedback protocol can derive feedback without a prior pending decision when explicit execution evidence is present", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const tools = createAionisMcpTools({
    env: ENV,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return {
        pattern_anchor: { credibility_state: "candidate" },
      };
    },
  });

  const result = await tools.callTool("aionis_record_feedback", {
    signal_kind: "user_confirmed",
    selected_tool: "edit",
    candidates: ["bash", "edit", "test"],
    context: { task_kind: "repair_export", goal: "fix export failure" },
    note: "user confirmed the fix worked",
  });
  assert.equal(result.isError, undefined);
  assert.equal((result.structuredContent as any).feedback_recorded, true);
  assert.equal((result.structuredContent as any).classification, "positive");
  assert.equal((result.structuredContent as any).feedback_mode, "feedback_derived");
  assert.equal((result.structuredContent as any).decision_id, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/v1/memory/tools/feedback");
  assert.equal(calls[0]?.body.decision_id, undefined);
  assert.equal(calls[0]?.body.selected_tool, "edit");
  assert.deepEqual(calls[0]?.body.candidates, ["bash", "edit", "test"]);
  assert.deepEqual(calls[0]?.body.context, { task_kind: "repair_export", goal: "fix export failure" });
});

test("feedback protocol returns an actionable error when neither pending decision nor explicit execution evidence exists", async () => {
  const tools = createAionisMcpTools({
    env: ENV,
  });

  const result = await tools.callTool("aionis_record_feedback", {
    signal_kind: "user_confirmed",
    note: "this worked",
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /requires a prior aionis_select_tool decision or explicit selected_tool\+candidates\+context/i);
  assert.equal((result.structuredContent as any).feedback_recorded, false);
  assert.equal((result.structuredContent as any).error, "missing_feedback_context");
});

test("finalize_task records a positive task-boundary outcome without a prior pending decision", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const tools = createAionisMcpTools({
    env: ENV,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return {
        pattern_anchor: { credibility_state: "candidate" },
      };
    },
  });

  const result = await tools.callTool("aionis_finalize_task", {
    outcome: "success",
    selected_tool: "edit",
    candidates: ["bash", "edit", "test"],
    context: { task_kind: "repair_export", goal: "fix export failure" },
    note: "task completed successfully",
  });

  assert.equal(result.isError, undefined);
  assert.equal((result.structuredContent as any).feedback_recorded, true);
  assert.equal((result.structuredContent as any).classification, "positive");
  assert.equal((result.structuredContent as any).feedback_mode, "feedback_derived");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/v1/memory/tools/feedback");
  assert.equal(calls[0]?.body.outcome, "positive");
});

test("finalize_task records a negative task-boundary outcome for blocked tasks", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const tools = createAionisMcpTools({
    env: ENV,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      return {
        pattern_anchor: { credibility_state: "contested" },
      };
    },
  });

  const result = await tools.callTool("aionis_finalize_task", {
    outcome: "blocked",
    selected_tool: "bash",
    candidates: ["bash", "edit", "test"],
    context: { task_kind: "repair_export", goal: "fix export failure" },
    note: "task blocked after failed command path",
  });

  assert.equal(result.isError, undefined);
  assert.equal((result.structuredContent as any).feedback_recorded, true);
  assert.equal((result.structuredContent as any).classification, "negative");
  assert.equal((result.structuredContent as any).feedback_mode, "feedback_derived");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/v1/memory/tools/feedback");
  assert.equal(calls[0]?.body.outcome, "negative");
});
