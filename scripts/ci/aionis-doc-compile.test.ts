import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { compileAionisDoc } from "../../packages/aionis-doc/src/index.js";

const fixturesDir = path.resolve("packages/aionis-doc/fixtures");

async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(fixturesDir, name), "utf8");
}

test("valid minimal fixture compiles without error diagnostics", async () => {
  const result = compileAionisDoc(await loadFixture("valid-minimal.aionis.md"));
  assert.equal(result.ir.doc?.id, "demo-001");
  assert.equal(result.ir.executions.length, 1);
  assert.equal(result.graph?.nodes.length, 1);
  assert.equal(result.diagnostics.filter((item) => item.severity === "error").length, 0);
});

test("valid workflow fixture builds a graph edge from matching refs", async () => {
  const result = compileAionisDoc(await loadFixture("valid-workflow.aionis.md"));
  assert.equal(result.ir.executions.length, 2);
  assert.equal(result.graph?.nodes.length, 2);
  assert.equal(result.graph?.edges.length, 2);
  assert.deepEqual(
    result.graph?.edges.map((edge) => edge.type),
    ["data_dependency", "sequence_dependency"],
  );
});

test("malformed payload fixture emits an invalid payload diagnostic", async () => {
  const result = compileAionisDoc(await loadFixture("malformed-payload.aionis.md"));
  assert.ok(result.diagnostics.some((item) => item.code === "INVALID_PAYLOAD"));
});

test("directives inside code fences are ignored", async () => {
  const result = compileAionisDoc(await loadFixture("fenced-example.aionis.md"));
  assert.equal(result.ir.doc?.id, "real-doc");
  assert.equal(result.ir.executions.length, 1);
});

test("unresolved context refs produce a diagnostic", async () => {
  const result = compileAionisDoc(await loadFixture("unresolved-ref.aionis.md"));
  assert.ok(result.diagnostics.some((item) => item.code === "UNRESOLVED_REF"));
});

test("duplicate @doc directives preserve the first document and emit a diagnostic", async () => {
  const result = compileAionisDoc(await loadFixture("duplicate-doc.aionis.md"));
  assert.equal(result.ir.doc?.id, "primary-doc");
  assert.ok(result.diagnostics.some((item) => item.code === "DUPLICATE_DOC"));
});
