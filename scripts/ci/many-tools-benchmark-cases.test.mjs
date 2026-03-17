import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { validateManyToolsCases } from "../../src/bench/many-tools.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const CASE_PATHS = [
  path.join(ROOT, "scripts/bench/many-tools-cases/focused-repo-read.json"),
  path.join(ROOT, "scripts/bench/many-tools-cases/focused-test-execution.json"),
];

test("many-tools canonical cases validate and cover the expected buckets", () => {
  const expectedByFamily = {
    focused_repo_read: "read-file-targeted",
    focused_test_execution: "test-file-targeted",
  };

  for (const casePath of CASE_PATHS) {
    const raw = JSON.parse(readFileSync(casePath, "utf8"));
    const cases = validateManyToolsCases(raw);
    assert.equal(cases.length, 5);
    assert.deepEqual(cases.map((item) => item.bucket), [4, 8, 12, 16, 24]);
    for (const item of cases) {
      const expectedTool = expectedByFamily[item.family];
      assert.ok(expectedTool, `unexpected family: ${item.family}`);
      assert.equal(item.task.expected_correct_tool, expectedTool);
      assert.equal(item.acceptance.correct_first_tool, expectedTool);
    }
  }
});
