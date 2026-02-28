import assert from "node:assert/strict";
import test from "node:test";

import { toProbeFailure, writeJson } from "./probe-common.mjs";

test("toProbeFailure formats standard Error", () => {
  const out = toProbeFailure(new Error("boom"));
  assert.deepEqual(out, {
    ok: false,
    error: "Error",
    message: "boom",
  });
});

test("toProbeFailure formats custom error-like object", () => {
  const out = toProbeFailure({ name: "ProbeError", message: "contract mismatch" });
  assert.deepEqual(out, {
    ok: false,
    error: "ProbeError",
    message: "contract mismatch",
  });
});

test("toProbeFailure formats string throwable", () => {
  const out = toProbeFailure("plain failure");
  assert.deepEqual(out, {
    ok: false,
    error: "Error",
    message: "plain failure",
  });
});

test("writeJson emits stable pretty JSON snapshot", () => {
  let buf = "";
  const stream = {
    write(chunk) {
      buf += String(chunk);
    },
  };
  writeJson(stream, { ok: true, name: "probe", count: 2 });
  assert.equal(
    buf,
    `{
  "ok": true,
  "name": "probe",
  "count": 2
}
`,
  );
});
