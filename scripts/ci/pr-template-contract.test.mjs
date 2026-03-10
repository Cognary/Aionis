import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { parseSelectedLayers, validatePrArchitectureMetadata } from "./pr-architecture-metadata-check.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const TEMPLATE_PATH = path.join(ROOT, ".github/PULL_REQUEST_TEMPLATE.md");

test("pull request template keeps the required architecture sections", async () => {
  const template = await readFile(TEMPLATE_PATH, "utf8");

  assert.match(template, /^## Summary$/m);
  assert.match(template, /^## Architecture Layer$/m);
  assert.match(template, /^## Boundary Impact$/m);
  assert.match(template, /^## Spec References$/m);
  assert.match(template, /^## Verification$/m);
  assert.match(template, /^## Rollback Surface$/m);
  assert.match(template, /^## Review Notes$/m);
});

test("pull request template declares the three supported architecture layers", async () => {
  const template = await readFile(TEMPLATE_PATH, "utf8");

  assert.match(template, /^- \[ \] `Kernel`$/m);
  assert.match(template, /^- \[ \] `Runtime Services`$/m);
  assert.match(template, /^- \[ \] `Control & Extensions`$/m);
  assert.deepEqual(parseSelectedLayers(template), []);
});

test("pull request template becomes valid metadata after selecting one layer", async () => {
  const template = await readFile(TEMPLATE_PATH, "utf8");
  const filled = template.replace("- [ ] `Runtime Services`", "- [x] `Runtime Services`");
  const out = validatePrArchitectureMetadata({
    title: "Refactor runtime host",
    body: filled,
  });

  assert.equal(out.ok, true);
  assert.equal(out.selectedLayer, "Runtime Services");
});
