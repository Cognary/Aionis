import test from "node:test";
import assert from "node:assert/strict";
import { AionisClaudeCodeBridge } from "../../src/adapter/claude-code-bridge.js";

test("bridge forwards normalized task start, tool use, and terminal events to the adapter", async () => {
  const seen: string[] = [];
  const bridge = new AionisClaudeCodeBridge({
    beginTask: async (event: any) => {
      seen.push(`begin:${event.task_id}`);
      return { session: { task_id: event.task_id }, planning: { recommended_workflow_count: 0 } };
    },
    beforeToolUse: async (event: any) => {
      seen.push(`before:${event.task_id}:${event.candidates[0]}`);
      return { session: { task_id: event.task_id }, selection: { selected_tool: "edit" } };
    },
    recordToolOutcome: async (event: any) => {
      seen.push(`tool:${event.task_id}:${event.selected_tool}`);
      return { session: { task_id: event.task_id }, classification: "positive", recorded: true, reason: "ok", pattern_anchor: null };
    },
    finalizeTask: async (event: any) => {
      seen.push(`final:${event.task_id}:${event.event_type}`);
      return {
        session: { task_id: event.task_id },
        classification: "positive",
        recorded: true,
        reason: "done",
        pattern_anchor: null,
        skipped_duplicate_finalization: false,
      };
    },
  } as any);

  await bridge.onTaskStart({
    event_type: "task_started",
    task_id: "task-1",
    query_text: "repair export failure",
    context: {},
  });
  await bridge.beforeToolUse({
    event_type: "tool_selection_requested",
    task_id: "task-1",
    candidates: ["bash", "edit"],
  });
  await bridge.onToolExecuted({
    event_type: "tool_executed",
    task_id: "task-1",
    step_id: "step-1",
    selected_tool: "edit",
    candidates: ["edit", "bash"],
    context: {},
    validated: true,
  });
  await bridge.onTaskTerminal({
    event_type: "task_completed",
    task_id: "task-1",
    selected_tool: "edit",
    candidates: ["edit", "bash"],
    context: {},
  });

  assert.deepEqual(seen, [
    "begin:task-1",
    "before:task-1:bash",
    "tool:task-1:edit",
    "final:task-1:task_completed",
  ]);
});
