import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function runSnippet(source) {
  return execFileSync("npx", ["tsx", "-e", source], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
}

test("associative link trigger payload accepts write origin", () => {
  const output = runSnippet(`
    import { AssociativeLinkTriggerPayloadSchema } from "./src/memory/associative-linking-types.ts";

    const parsed = AssociativeLinkTriggerPayloadSchema.parse({
      origin: "memory_write",
      scope: "default",
      source_node_ids: ["11111111-1111-1111-1111-111111111111"],
      source_commit_id: "22222222-2222-2222-2222-222222222222",
    });

    process.stdout.write(JSON.stringify(parsed));
  `);
  const parsed = JSON.parse(output);
  assert.equal(parsed.origin, "memory_write");
});

test("relation and status enums stay narrow", () => {
  const output = runSnippet(`
    import {
      AssociativeRelationKindSchema,
      AssociativeCandidateStatusSchema,
    } from "./src/memory/associative-linking-types.ts";

    process.stdout.write(JSON.stringify({
      relation: AssociativeRelationKindSchema.parse("same_task"),
      status: AssociativeCandidateStatusSchema.parse("shadow"),
    }));
  `);
  const parsed = JSON.parse(output);
  assert.equal(parsed.relation, "same_task");
  assert.equal(parsed.status, "shadow");
});
