import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildExecutionEvalSummaryFromArtifact } from "../../src/eval/summarize.ts";

function makeArtifactDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aionis-execution-eval-"));
  const summary = {
    benchmark: "openclaw_real_workflow_scenario_v1",
    continuity_mode: "packet",
    provider: "gemini",
    model: "gemini-2.5-flash",
    repetitions: 2,
    cases: 2,
    baseline: {
      reviewer_ready_rate: 0,
      workflow_completed_rate: 0,
      avg_total_tokens: 1200,
      avg_wall_clock_ms: 2000,
      avg_tool_call_count: 6,
      avg_broad_tool_call_count: 1,
      avg_rediscovery_reads: 1,
    },
    treatment: {
      reviewer_ready_rate: 1,
      workflow_completed_rate: 1,
      avg_total_tokens: 1100,
      avg_wall_clock_ms: 1500,
      avg_tool_call_count: 4,
      avg_broad_tool_call_count: 0,
      avg_rediscovery_reads: 0,
      avg_handoff_store_count: 2,
      avg_context_assemble_count: 2,
      avg_tools_select_count: 2,
    },
  };
  const cases = [
    {
      scenario_id: "dashboard_auth_drift",
      repetition: 1,
      baseline: {
        workflow_completed: false,
        reviewer_ready: false,
        tool_call_count: 6,
        broad_tool_call_count: 1,
        rediscovery_reads: 1,
        handoff_store_count: 0,
        context_assemble_count: 0,
        tools_select_count: 0,
        wall_clock_ms: 2100,
      },
      treatment: {
        workflow_completed: true,
        reviewer_ready: true,
        tool_call_count: 4,
        broad_tool_call_count: 0,
        rediscovery_reads: 0,
        handoff_store_count: 2,
        context_assemble_count: 2,
        tools_select_count: 1,
        wall_clock_ms: 1400,
      },
    },
    {
      scenario_id: "dashboard_auth_drift",
      repetition: 2,
      baseline: {
        workflow_completed: false,
        reviewer_ready: false,
        tool_call_count: 6,
        broad_tool_call_count: 1,
        rediscovery_reads: 1,
        handoff_store_count: 0,
        context_assemble_count: 0,
        tools_select_count: 0,
        wall_clock_ms: 1900,
      },
      treatment: {
        workflow_completed: true,
        reviewer_ready: true,
        tool_call_count: 4,
        broad_tool_call_count: 0,
        rediscovery_reads: 0,
        handoff_store_count: 2,
        context_assemble_count: 2,
        tools_select_count: 1,
        wall_clock_ms: 1600,
      },
    },
  ];
  writeFileSync(path.join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(path.join(dir, "cases.jsonl"), `${cases.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return dir;
}

test("buildExecutionEvalSummaryFromArtifact derives phase-1 workflow scores", () => {
  const dir = makeArtifactDir();
  try {
    const { summary, markdown } = buildExecutionEvalSummaryFromArtifact({ artifactDir: dir });
    assert.equal(summary.summary_version, "execution_eval_summary_v1");
    assert.equal(summary.suite_id, "openclaw_real_workflow_core_v1");
    assert.equal(summary.case_group_id, "dashboard_auth_drift");
    assert.equal(summary.variants.baseline.dimension_scores.completion, 0);
    assert.equal(summary.variants.treatment.dimension_scores.completion, 1);
    assert.equal(summary.variants.treatment.dimension_scores.reviewer_readiness, 1);
    assert.equal(summary.variants.baseline.dimension_scores.continuity, 0);
    assert.equal(summary.variants.treatment.dimension_scores.continuity, 1);
    assert.equal(summary.delta.completion_gain, 1);
    assert.match(markdown, /Execution Eval Summary/);
    assert.match(markdown, /Completion gain: `1`/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("execution eval report writes summary files", async () => {
  const dir = makeArtifactDir();
  try {
    const outDir = path.join(dir, "eval");
    execFileSync(
      "node",
      ["--import=tsx", "./scripts/eval/execution-eval.ts", "--artifact-dir", dir, "--out-dir", outDir],
      {
        cwd: "/Users/lucio/Desktop/Aionis",
        env: { ...process.env, TSX_TSCONFIG_PATH: "/Users/lucio/Desktop/Aionis/tsconfig.json" },
        stdio: "pipe",
      },
    );
    const summaryJson = JSON.parse(readFileSync(path.join(outDir, "execution_eval_summary.json"), "utf8"));
    const summaryMd = readFileSync(path.join(outDir, "execution_eval_summary.md"), "utf8");
    assert.equal(summaryJson.summary_version, "execution_eval_summary_v1");
    assert.match(summaryMd, /baseline/);
    assert.match(summaryMd, /treatment/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
