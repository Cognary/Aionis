import assert from "node:assert/strict";
import test from "node:test";

import { parseModelSelection, summarizeBenchmarkRecords } from "../bench/many-tools-benchmark.ts";

test("parseModelSelection extracts selected tool from JSON response", () => {
  const parsed = parseModelSelection('{"selected_tool":"read-source-focused-v2"}');
  assert.equal(parsed.selectedTool, "read-source-focused-v2");
  assert.equal(parsed.reason, null);
});

test("summarizeBenchmarkRecords computes per-variant rates", () => {
  const summary = summarizeBenchmarkRecords([
    {
      run_id: "run-1",
      variant: "baseline",
      case_id: "c1",
      family: "focused_repo_read",
      bucket: 4,
      difficulty: "easy",
      correct_first_tool: "read-source-focused-v2",
      selected_tool: "read-source-focused-v2",
      correct: true,
      omitted: false,
      wrong_tool: false,
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      wall_clock_ms: 1000,
      ordered_candidates: ["read-source-focused-v2"],
      aionis_selected_tool: null,
      tool_registry_present: null,
      family_aware_ordering_applied: null,
      raw_output: "{}",
    },
    {
      run_id: "run-1",
      variant: "baseline",
      case_id: "c2",
      family: "focused_repo_read",
      bucket: 8,
      difficulty: "medium",
      correct_first_tool: "read-source-focused-v2",
      selected_tool: "repo-scan-basic",
      correct: false,
      omitted: false,
      wrong_tool: true,
      prompt_tokens: 110,
      completion_tokens: 22,
      total_tokens: 132,
      wall_clock_ms: 900,
      ordered_candidates: ["repo-scan-basic"],
      aionis_selected_tool: null,
      tool_registry_present: null,
      family_aware_ordering_applied: null,
      raw_output: "{}",
    },
    {
      run_id: "run-1",
      variant: "aionis_selection",
      case_id: "c1",
      family: "focused_repo_read",
      bucket: 4,
      difficulty: "easy",
      correct_first_tool: "read-source-focused-v2",
      selected_tool: "read-source-focused-v2",
      correct: true,
      omitted: false,
      wrong_tool: false,
      prompt_tokens: 90,
      completion_tokens: 18,
      total_tokens: 108,
      wall_clock_ms: 700,
      ordered_candidates: ["read-source-focused-v2"],
      aionis_selected_tool: "read-source-focused-v2",
      tool_registry_present: true,
      family_aware_ordering_applied: true,
      raw_output: "{}",
    },
  ]);

  assert.equal(summary.variants.baseline.cases, 2);
  assert.equal(summary.variants.baseline.first_correct_tool_rate, 0.5);
  assert.equal(summary.variants.baseline.wrong_tool_rate, 0.5);
  assert.equal(summary.variants.aionis_selection.first_correct_tool_rate, 1);
  assert.equal(summary.variants.aionis_selection.by_bucket["4"].first_correct_tool_rate, 1);
});
