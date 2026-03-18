import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function makeArtifactDir({ baselineReady, treatmentReady, scenarioId = "dashboard_auth_drift" }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aionis-sdk-cli-eval-"));
  const summary = {
    benchmark: "openclaw_real_workflow_scenario_v1",
    continuity_mode: "packet",
    provider: "gemini",
    model: "gemini-2.5-flash",
    repetitions: 1,
    cases: 1,
    baseline: {
      reviewer_ready_rate: baselineReady ? 1 : 0,
      workflow_completed_rate: baselineReady ? 1 : 0,
      avg_total_tokens: 1000,
      avg_wall_clock_ms: 1000,
      avg_tool_call_count: 4,
      avg_broad_tool_call_count: 0,
      avg_rediscovery_reads: 0,
      avg_handoff_store_count: 0,
      avg_context_assemble_count: 0,
      avg_tools_select_count: 0,
    },
    treatment: {
      reviewer_ready_rate: treatmentReady ? 1 : 0,
      workflow_completed_rate: treatmentReady ? 1 : 0,
      avg_total_tokens: 900,
      avg_wall_clock_ms: 900,
      avg_tool_call_count: 4,
      avg_broad_tool_call_count: 0,
      avg_rediscovery_reads: 0,
      avg_handoff_store_count: 1,
      avg_context_assemble_count: 1,
      avg_tools_select_count: 1,
    },
  };
  const cases = [
    {
      scenario_id: scenarioId,
      repetition: 1,
      baseline: {
        workflow_completed: baselineReady,
        reviewer_ready: baselineReady,
        tool_call_count: 4,
        broad_tool_call_count: 0,
        rediscovery_reads: 0,
        handoff_store_count: 0,
        context_assemble_count: 0,
        tools_select_count: 0,
        wall_clock_ms: 1000,
      },
      treatment: {
        workflow_completed: treatmentReady,
        reviewer_ready: treatmentReady,
        tool_call_count: 4,
        broad_tool_call_count: 0,
        rediscovery_reads: 0,
        handoff_store_count: 1,
        context_assemble_count: 1,
        tools_select_count: 1,
        wall_clock_ms: 900,
      },
    },
  ];
  writeFileSync(path.join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(path.join(dir, "cases.jsonl"), `${cases.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  return dir;
}

function runCli(args) {
  return spawnSync(process.execPath, ["--import", "tsx", "packages/sdk/src/cli.ts", ...args], {
    cwd: "/Users/lucio/Desktop/Aionis",
    encoding: "utf8",
  });
}

test("sdk cli eval inspect emits stable json envelope", () => {
  const dir = makeArtifactDir({ baselineReady: false, treatmentReady: true });
  try {
    const result = runCli(["eval", "inspect", "--artifact-dir", dir, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis eval inspect");
    assert.equal(parsed.data.summary.summary_version, "execution_eval_summary_v1");
    assert.equal(parsed.data.summary.delta.completion_gain, 1);
    assert.equal(parsed.data.summary.variants.treatment.result, "pass");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sdk cli eval gate exits 5 on gate failure", () => {
  const dir = makeArtifactDir({ baselineReady: true, treatmentReady: false });
  try {
    const result = runCli(["eval", "gate", "--artifact-dir", dir, "--json"]);
    assert.equal(result.status, 5, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.error.code, "gate_failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sdk cli eval compare compares two eval sources", () => {
  const baselineDir = makeArtifactDir({ baselineReady: false, treatmentReady: true, scenarioId: "scenario_a" });
  const treatmentDir = makeArtifactDir({ baselineReady: true, treatmentReady: true, scenarioId: "scenario_b" });
  try {
    const result = runCli([
      "eval",
      "compare",
      "--baseline",
      baselineDir,
      "--treatment",
      treatmentDir,
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.command, "aionis eval compare");
    assert.equal(parsed.data.changes.completion_gain, -1);
  } finally {
    rmSync(baselineDir, { recursive: true, force: true });
    rmSync(treatmentDir, { recursive: true, force: true });
  }
});
