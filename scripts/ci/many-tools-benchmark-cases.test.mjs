import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { validateManyToolsCases } from "../../src/bench/many-tools.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const CASE_PATH = path.join(ROOT, "scripts/bench/many-tools-cases/focused-repo-read.json");

test("many-tools canonical cases validate and cover the expected buckets", () => {
  const raw = JSON.parse(readFileSync(CASE_PATH, "utf8"));
  const cases = validateManyToolsCases(raw);
  assert.equal(cases.length, 4);
  assert.deepEqual(cases.map((item) => item.bucket), [4, 8, 12, 16]);
  for (const item of cases) {
    assert.equal(item.family, "focused_repo_read");
    assert.equal(item.task.expected_correct_tool, "read-source-focused-v2");
    assert.equal(item.acceptance.correct_first_tool, "read-source-focused-v2");
  }
});
