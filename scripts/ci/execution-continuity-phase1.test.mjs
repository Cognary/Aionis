import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

test("execution continuity phase 1 scaffold exists", async () => {
  const plan = await readFile(path.join(ROOT, "docs/internal/plans/AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE1_PLAN_2026-03-15.md"), "utf8");
  const types = await readFile(path.join(ROOT, "src/execution/types.ts"), "utf8");
  const packet = await readFile(path.join(ROOT, "src/execution/packet.ts"), "utf8");
  const profiles = await readFile(path.join(ROOT, "src/execution/profiles.ts"), "utf8");

  assert.match(plan, /ExecutionState v1/);
  assert.match(plan, /ExecutionPacket v1/);
  assert.match(plan, /ControlProfile v1/);

  assert.match(types, /ExecutionStateV1Schema/);
  assert.match(types, /ExecutionPacketV1Schema/);
  assert.match(types, /ControlProfileV1Schema/);
  assert.match(packet, /buildExecutionPacketV1/);
  assert.match(profiles, /controlProfileDefaults/);
});
