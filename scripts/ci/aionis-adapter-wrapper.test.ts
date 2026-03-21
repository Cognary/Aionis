import test from "node:test";
import assert from "node:assert/strict";
import { createAionisAdapterWrapper } from "../../src/adapter/wrapper.js";
import type { AionisMcpEnv } from "../../src/mcp/client.js";

const ENV: AionisMcpEnv = {
  AIONIS_BASE_URL: "http://127.0.0.1:3011",
  AIONIS_SCOPE: "default",
  AIONIS_TIMEOUT_MS: 10_000,
  AIONIS_MAX_TOOL_TEXT_CHARS: 8_000,
};

test("adapter wrapper can drive one command-backed task loop through the sidecar", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const commandRuns: Array<{ command: string; args?: string[]; cwd?: string }> = [];

  const wrapper = createAionisAdapterWrapper({
    env: ENV,
    commandRunner: async (args) => {
      commandRuns.push({ command: args.command, args: args.args, cwd: args.cwd });
      return {
        exit_code: 0,
        stdout: "ok\n",
        stderr: "",
      };
    },
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      if (path === "/v1/memory/planning/context") {
        return {
          tenant_id: "default",
          scope: "default",
          planner_packet: { sections: { recommended_workflows: [], candidate_workflows: [] } },
          workflow_signals: [],
          pattern_signals: [],
          planning_summary: { planner_explanation: null, trusted_pattern_count: 0, contested_pattern_count: 0 },
          execution_kernel: {},
        };
      }
      if (path === "/v1/memory/tools/select") {
        return {
          tenant_id: "default",
          scope: "default",
          selection: { selected: "bash", ordered: ["bash", "test"], preferred: ["bash"] },
          decision: { decision_id: "decision-1", decision_uri: "aionis://decision-1", run_id: "task-1" },
          selection_summary: {
            provenance_explanation: "candidate workflows visible but not yet promoted",
            used_trusted_pattern_tools: [],
            used_trusted_pattern_affinity_levels: [],
          },
        };
      }
      if (path === "/v1/memory/tools/feedback") {
        return { classification: "positive", feedback_recorded: true, pattern_anchor: { credibility_state: "candidate" } };
      }
      if (path === "/v1/memory/execution/introspect") {
        return {
          tenant_id: "default",
          scope: "default",
          pattern_signal_summary: { candidate_pattern_count: 1, trusted_pattern_count: 0, contested_pattern_count: 0 },
          workflow_signal_summary: { stable_workflow_count: 0, promotion_ready_workflow_count: 0, observing_workflow_count: 0 },
          recommended_workflows: [],
          trusted_patterns: [],
          contested_patterns: [],
        };
      }
      throw new Error(`unexpected path ${path}`);
    },
  });

  const started = await wrapper.startTask({
    event_type: "task_started",
    task_id: "task-1",
    query_text: "run a quick node test fix loop",
    context: { task_kind: "repair_export" },
    tool_candidates: ["bash", "test"],
  });
  assert.equal(started.ok, true);

  const selected = await wrapper.selectTool({
    event_type: "tool_selection_requested",
    task_id: "task-1",
    candidates: ["bash", "test"],
    context: { task_kind: "repair_export" },
  });
  assert.equal(selected.ok, true);
  assert.equal((selected as any).result.selection.selected_tool, "bash");

  const step = await wrapper.executeCommandStep({
    task_id: "task-1",
    step_id: "step-1",
    selected_tool: "bash",
    candidates: ["bash", "test"],
    context: { task_kind: "repair_export" },
    command: "npm",
    args: ["test"],
    cwd: "/tmp/demo",
    note: "command completed and final learning is deferred to task boundary",
  });
  assert.equal(step.execution.exit_code, 0);
  assert.equal(step.feedback.ok, true);
  assert.equal((step.feedback as any).result.classification, "positive");
  assert.equal((step.feedback as any).result.recorded, true);

  const finalized = await wrapper.finalizeTask({
    event_type: "task_completed",
    task_id: "task-1",
    selected_tool: "bash",
    candidates: ["bash", "test"],
    context: { task_kind: "repair_export" },
    note: "task completed after command-backed repair loop",
  });
  assert.equal(finalized.ok, true);
  assert.equal((finalized as any).result.classification, "positive");
  assert.equal((finalized as any).result.recorded, true);

  const introspected = await wrapper.introspect({ limit: 5 });
  assert.equal(introspected.ok, true);
  assert.equal((introspected as any).result.pattern_signal_summary.candidate_pattern_count, 1);

  assert.deepEqual(commandRuns, [
    {
      command: "npm",
      args: ["test"],
      cwd: "/tmp/demo",
    },
  ]);

  assert.deepEqual(
    calls.map((entry) => entry.path),
    [
      "/v1/memory/planning/context",
      "/v1/memory/tools/select",
      "/v1/memory/tools/feedback",
      "/v1/memory/tools/feedback",
      "/v1/memory/execution/introspect",
    ],
  );
  assert.equal(calls[2]?.body?.selected_tool, "bash");
  assert.equal(calls[2]?.body?.outcome, "positive");
});
