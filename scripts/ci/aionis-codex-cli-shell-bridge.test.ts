import test from "node:test";
import assert from "node:assert/strict";
import { AionisCodexCliShellBridge } from "../../src/adapter/codex-cli-shell-bridge.js";

const env = {
  AIONIS_BASE_URL: "http://127.0.0.1:9999",
  AIONIS_SCOPE: "codex-shell-test",
  AIONIS_TIMEOUT_MS: 10_000,
  AIONIS_MAX_TOOL_TEXT_CHARS: 8_000,
} as const;

test("codex shell bridge runs select -> execute -> feedback -> finalize", async () => {
  const calls: Array<{ path: string; body: unknown }> = [];
  const bridge = new AionisCodexCliShellBridge({
    env,
    postJson: async (_env, path, body) => {
      calls.push({ path, body });
      if (path === "/v1/memory/tools/select") {
        return {
          selection: {
            selected: "bash",
            ordered: ["bash", "edit", "test"],
            preferred: ["bash"],
          },
          selection_summary: {
            provenance_explanation: "trusted pattern prefers bash",
            used_trusted_pattern_tools: ["bash"],
            used_trusted_pattern_affinity_levels: ["same_task_family"],
          },
        };
      }
      if (path === "/v1/memory/tools/feedback") {
        return { feedback_recorded: true };
      }
      if (path === "/v1/memory/execution/introspect") {
        return {
          pattern_signal_summary: {
            candidate_pattern_count: 1,
            trusted_pattern_count: 0,
          },
        };
      }
      throw new Error(`unexpected path ${path}`);
    },
    commandRunner: async () => ({
      exit_code: 0,
      stdout: "ok\n",
      stderr: "",
    }),
  });

  const result = await bridge.run({
    session_id: "session-1",
    turn_id: "turn-1",
    transcript_path: null,
    cwd: "/tmp/project",
    model: "gpt-5",
    permission_mode: "default",
    prompt: "verify widget format tests",
    task_kind: "verify_widget_format",
    goal: "run widget tests",
    candidates: ["bash", "test"],
    command: "npm",
    args: ["test"],
    note: "run widget tests through codex shell bridge",
    finalization: {
      outcome: "completed",
      note: "command-backed task completed",
    },
    introspect: {
      limit: 5,
    },
  });

  assert.deepEqual(result.selection, [{
    channel: "tool_ordering",
    selected_tool: "bash",
    ordered: ["bash", "edit", "test"],
    preferred: ["bash"],
    provenance_explanation: "trusted pattern prefers bash",
    used_trusted_pattern_tools: ["bash"],
    used_trusted_pattern_affinity_levels: ["same_task_family"],
  }]);
  assert.equal(result.execution.exit_code, 0);
  assert.deepEqual(result.feedback, [{
    channel: "task_feedback_recorded",
    classification: "positive",
    recorded: true,
    reason: "command-like step completed successfully",
  }]);
  assert.deepEqual(result.finalization, [{
    channel: "task_finalized",
    classification: "positive",
    recorded: true,
    reason: "task reached a successful terminal boundary",
  }]);
  assert.deepEqual(result.introspection, {
    pattern_signal_summary: {
      candidate_pattern_count: 1,
      trusted_pattern_count: 0,
    },
  });
  assert.deepEqual(calls.map((entry) => entry.path), [
    "/v1/memory/tools/select",
    "/v1/memory/tools/feedback",
    "/v1/memory/tools/feedback",
    "/v1/memory/execution/introspect",
  ]);
});
