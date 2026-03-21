import test from "node:test";
import assert from "node:assert/strict";
import { AionisHostCapabilityRegistry } from "../../src/adapter/host-capability-registry.js";
import type { HostCapabilityHandler, HostIntegrationEvent } from "../../src/adapter/host-integration-contracts.js";

const runtime = {
  env: {
    AIONIS_BASE_URL: "http://127.0.0.1:9999",
    AIONIS_SCOPE: "registry-test",
    AIONIS_TIMEOUT_MS: 10_000,
    AIONIS_MAX_TOOL_TEXT_CHARS: 8_000,
  },
  postJson: async () => ({}),
} as const;

function promptEvent(): HostIntegrationEvent {
  return {
    event_type: "prompt_submitted",
    context: {
      host_name: "codex_cli",
      host_version: null,
      session_id: "session-1",
      task_id: "task-1",
      turn_id: "turn-1",
      cwd: "/tmp/project",
      scope: "registry-test",
      prompt: "repair export mismatch",
      host_metadata: {},
    },
    prompt: "repair export mismatch",
  };
}

test("host capability registry only runs subscribed handlers and preserves output order", async () => {
  const seen: string[] = [];
  const handlers: HostCapabilityHandler[] = [
    {
      id: "planning",
      subscribed_events: ["prompt_submitted"],
      async handle() {
        seen.push("planning");
        return [{ channel: "context_injection", text: "planning" }];
      },
    },
    {
      id: "inspection",
      subscribed_events: ["memory_inspection_requested"],
      async handle() {
        seen.push("inspection");
        return [{ channel: "warning", text: "inspection" }];
      },
    },
    {
      id: "warning",
      subscribed_events: ["prompt_submitted"],
      async handle() {
        seen.push("warning");
        return [{ channel: "warning", text: "warning" }];
      },
    },
  ];

  const registry = new AionisHostCapabilityRegistry(runtime, handlers);
  const outputs = await registry.dispatch(promptEvent());

  assert.deepEqual(seen, ["planning", "warning"]);
  assert.deepEqual(outputs, [
    { channel: "context_injection", text: "planning" },
    { channel: "warning", text: "warning" },
  ]);
});

test("codex capability handlers return tool ordering on tool_selection_requested", async () => {
  const { createCodexCliCapabilityHandlers } = await import("../../src/adapter/codex-cli-capabilities.js");
  const registry = new AionisHostCapabilityRegistry(
    {
      env: runtime.env,
      postJson: async (_env, path) => {
        assert.equal(path, "/v1/memory/tools/select");
        return {
          selection: {
            selected: "bash",
            ordered: ["bash", "edit", "test"],
            preferred: ["bash"],
          },
          selection_summary: {
            provenance_explanation: "trusted pattern prefers bash first",
            used_trusted_pattern_tools: ["bash"],
            used_trusted_pattern_affinity_levels: ["exact_task_signature"],
          },
        };
      },
    },
    createCodexCliCapabilityHandlers(),
  );

  const outputs = await registry.dispatch({
    event_type: "tool_selection_requested",
    context: {
      host_name: "codex_cli",
      host_version: null,
      session_id: "session-1",
      task_id: "task-1",
      turn_id: "turn-1",
      cwd: "/tmp/project",
      scope: "registry-test",
      prompt: "repair export mismatch",
      task_kind: "repair_export",
      goal: "repair export mismatch",
      tool_candidates: ["bash", "edit", "test"],
      host_metadata: {},
    },
    candidates: ["bash", "edit", "test"],
    selection_context: {
      task_kind: "repair_export",
      goal: "repair export mismatch",
    },
    strict: true,
  });

  assert.deepEqual(outputs, [{
    channel: "tool_ordering",
    selected_tool: "bash",
    ordered: ["bash", "edit", "test"],
    preferred: ["bash"],
    provenance_explanation: "trusted pattern prefers bash first",
    used_trusted_pattern_tools: ["bash"],
    used_trusted_pattern_affinity_levels: ["exact_task_signature"],
  }]);
});

test("codex capability handlers record step feedback on tool_executed", async () => {
  const calls: Array<{ path: string; body: unknown }> = [];
  const { createCodexCliCapabilityHandlers } = await import("../../src/adapter/codex-cli-capabilities.js");
  const registry = new AionisHostCapabilityRegistry(
    {
      env: runtime.env,
      postJson: async (_env, path, body) => {
        calls.push({ path, body });
        assert.equal(path, "/v1/memory/tools/feedback");
        return { feedback_recorded: true };
      },
    },
    createCodexCliCapabilityHandlers(),
  );

  const outputs = await registry.dispatch({
    event_type: "tool_executed",
    context: {
      host_name: "codex_cli",
      host_version: null,
      session_id: "session-1",
      task_id: "task-1",
      turn_id: "turn-1",
      cwd: "/tmp/project",
      scope: "registry-test",
      prompt: "verify widget format",
      task_kind: "verify_widget_format",
      goal: "run tests",
      tool_candidates: ["bash", "test"],
      selected_tool: "bash",
      host_metadata: {},
    },
    selected_tool: "bash",
    candidates: ["bash", "test"],
    execution_context: {
      task_kind: "verify_widget_format",
      goal: "run tests",
    },
    command_exit_code: 0,
    note: "command succeeded",
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(outputs, [{
    channel: "task_feedback_recorded",
    classification: "positive",
    recorded: true,
    reason: "command-like step completed successfully",
  }]);
});

test("codex capability handlers finalize completed tasks when explicit evidence is present", async () => {
  const calls: Array<{ path: string; body: unknown }> = [];
  const { createCodexCliCapabilityHandlers } = await import("../../src/adapter/codex-cli-capabilities.js");
  const registry = new AionisHostCapabilityRegistry(
    {
      env: runtime.env,
      postJson: async (_env, path, body) => {
        calls.push({ path, body });
        assert.equal(path, "/v1/memory/tools/feedback");
        return { feedback_recorded: true };
      },
    },
    createCodexCliCapabilityHandlers(),
  );

  const outputs = await registry.dispatch({
    event_type: "task_terminal",
    context: {
      host_name: "codex_cli",
      host_version: null,
      session_id: "session-1",
      task_id: "task-1",
      turn_id: "turn-1",
      cwd: "/tmp/project",
      scope: "registry-test",
      prompt: "verify widget format",
      task_kind: "verify_widget_format",
      goal: "run tests",
      tool_candidates: ["bash", "test"],
      selected_tool: "bash",
      host_metadata: {},
    },
    outcome: "completed",
    last_assistant_message: null,
    selected_tool: "bash",
    candidates: ["bash", "test"],
    terminal_context: {
      task_kind: "verify_widget_format",
      goal: "run tests",
    },
    note: "task completed",
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(outputs, [{
    channel: "task_finalized",
    classification: "positive",
    recorded: true,
    reason: "task reached a successful terminal boundary",
  }]);
});
