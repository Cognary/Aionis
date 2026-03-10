import assert from "node:assert/strict";
import test from "node:test";

import { safeEqualText } from "../../apps/ops/app/lib/secret-compare.mjs";

test("safeEqualText accepts identical secrets", () => {
  assert.equal(safeEqualText("ops-secret", "ops-secret"), true);
});

test("safeEqualText rejects mismatched and empty secrets", () => {
  assert.equal(safeEqualText("ops-secret", "ops-secreu"), false);
  assert.equal(safeEqualText("short", "much-longer"), false);
  assert.equal(safeEqualText("", "ops-secret"), false);
  assert.equal(safeEqualText("ops-secret", ""), false);
});
