import assert from "node:assert/strict";
import test from "node:test";

import { parseSelectedLayers, validatePrArchitectureMetadata } from "./pr-architecture-metadata-check.mjs";

const BASE_BODY = `## Summary

Change summary.

## Architecture Layer

- [ ] \`Kernel\`
- [ ] \`Runtime Services\`
- [ ] \`Control & Extensions\`
`;

test("parseSelectedLayers returns the checked architecture layer", () => {
  const body = BASE_BODY.replace("- [ ] `Runtime Services`", "- [x] `Runtime Services`");
  assert.deepEqual(parseSelectedLayers(body), ["Runtime Services"]);
});

test("validatePrArchitectureMetadata accepts exactly one selected layer", () => {
  const body = BASE_BODY.replace("- [ ] `Kernel`", "- [x] `Kernel`");
  const out = validatePrArchitectureMetadata({ title: "Refactor routes", body });
  assert.equal(out.ok, true);
  assert.equal(out.selectedLayer, "Kernel");
});

test("validatePrArchitectureMetadata rejects missing architecture section", () => {
  const out = validatePrArchitectureMetadata({ title: "Refactor routes", body: "No template here" });
  assert.equal(out.ok, false);
  assert.match(String(out.message), /Architecture Layer/i);
});

test("validatePrArchitectureMetadata rejects zero selected layers", () => {
  const out = validatePrArchitectureMetadata({ title: "Refactor routes", body: BASE_BODY });
  assert.equal(out.ok, false);
  assert.match(String(out.message), /exactly one/i);
});

test("validatePrArchitectureMetadata rejects multiple selected layers", () => {
  const body = BASE_BODY
    .replace("- [ ] `Kernel`", "- [x] `Kernel`")
    .replace("- [ ] `Runtime Services`", "- [x] `Runtime Services`");
  const out = validatePrArchitectureMetadata({ title: "Refactor routes", body });
  assert.equal(out.ok, false);
  assert.match(String(out.message), /exactly one/i);
});
