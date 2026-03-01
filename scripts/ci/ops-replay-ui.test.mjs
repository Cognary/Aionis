import assert from "node:assert/strict";
import test from "node:test";

import {
  canReplayNext,
  canReplayPrev,
  importMetaLabel,
  normalizeReplayIndex,
  replayPositionLabel,
} from "../../apps/ops/app/lib/replay-ui.mjs";

test("normalizeReplayIndex clamps to valid boundaries", () => {
  assert.equal(normalizeReplayIndex(-1, 5), 0);
  assert.equal(normalizeReplayIndex(2, 5), 2);
  assert.equal(normalizeReplayIndex(99, 5), 4);
  assert.equal(normalizeReplayIndex(1, 0), 0);
});

test("canReplayPrev/Next derive button enablement", () => {
  assert.equal(canReplayPrev(0, 0), false);
  assert.equal(canReplayNext(0, 0), false);

  assert.equal(canReplayPrev(0, 3), false);
  assert.equal(canReplayNext(0, 3), true);

  assert.equal(canReplayPrev(1, 3), true);
  assert.equal(canReplayNext(1, 3), true);

  assert.equal(canReplayPrev(2, 3), true);
  assert.equal(canReplayNext(2, 3), false);
});

test("replayPositionLabel returns stable display text", () => {
  assert.equal(replayPositionLabel(0, 0), "0 / 0");
  assert.equal(replayPositionLabel(0, 3), "1 / 3");
  assert.equal(replayPositionLabel(2, 3), "3 / 3");
  assert.equal(replayPositionLabel(99, 3), "3 / 3");
});

test("importMetaLabel formats schema metadata for UI", () => {
  assert.equal(importMetaLabel(null), "");
  assert.equal(importMetaLabel({ source_format: "array", schema_version: null }), "Import format: array, schema_version=legacy");
  assert.equal(importMetaLabel({ source_format: "versioned_object", schema_version: 1 }), "Import format: versioned_object, schema_version=v1");
});
