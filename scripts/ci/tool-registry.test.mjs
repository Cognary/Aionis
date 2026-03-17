import test from "node:test";
import assert from "node:assert/strict";

import {
  applyFamilyAwareOrdering,
  buildToolRegistryIndex,
  getToolRegistryRecord,
  mapCandidatesToFamilies,
} from "../../src/memory/tool-registry.ts";

test("tool registry returns configured family and tier for known tool", () => {
  const index = buildToolRegistryIndex([
    {
      tool_name: "read-source-focused-v2",
      capability_family: "focused_repo_read",
      capability_tags: ["repo_read", "file_targeted"],
      quality_tier: "preferred",
      status: "active",
      replacement_for: ["read-markdown-impl"],
      replaced_by: [],
    },
  ]);

  const record = getToolRegistryRecord(index, "read-source-focused-v2");
  assert.equal(record?.capability_family, "focused_repo_read");
  assert.equal(record?.quality_tier, "preferred");
});

test("tool registry maps unknown tools to null metadata without throwing", () => {
  const index = buildToolRegistryIndex([]);
  const mapped = mapCandidatesToFamilies(index, ["unknown-tool"]);
  assert.deepEqual(mapped, [
    {
      tool_name: "unknown-tool",
      capability_family: null,
      quality_tier: null,
      status: null,
      replacement_for: [],
      replaced_by: [],
    },
  ]);
});

test("family-aware ordering promotes preferred tool within the same family", () => {
  const index = buildToolRegistryIndex([
    {
      tool_name: "read-source-focused-v2",
      capability_family: "focused_repo_read",
      capability_tags: ["repo_read", "file_targeted"],
      quality_tier: "preferred",
      status: "active",
      replacement_for: ["read-markdown-impl"],
      replaced_by: [],
    },
    {
      tool_name: "read-markdown-impl",
      capability_family: "focused_repo_read",
      capability_tags: ["repo_read", "markdown"],
      quality_tier: "supported",
      status: "active",
      replacement_for: [],
      replaced_by: ["read-source-focused-v2"],
    },
  ]);

  const candidates = ["read-markdown-impl", "read-source-focused-v2"];
  const metadata = mapCandidatesToFamilies(index, candidates);
  const ordered = applyFamilyAwareOrdering(candidates, metadata);
  assert.deepEqual(ordered, ["read-source-focused-v2", "read-markdown-impl"]);
});

test("family-aware ordering does not override explicit preferred tool", () => {
  const index = buildToolRegistryIndex([
    {
      tool_name: "read-source-focused-v2",
      capability_family: "focused_repo_read",
      capability_tags: ["repo_read", "file_targeted"],
      quality_tier: "preferred",
      status: "active",
      replacement_for: ["read-markdown-impl"],
      replaced_by: [],
    },
    {
      tool_name: "read-markdown-impl",
      capability_family: "focused_repo_read",
      capability_tags: ["repo_read", "markdown"],
      quality_tier: "supported",
      status: "active",
      replacement_for: [],
      replaced_by: ["read-source-focused-v2"],
    },
  ]);

  const candidates = ["read-markdown-impl", "read-source-focused-v2"];
  const metadata = mapCandidatesToFamilies(index, candidates);
  const ordered = applyFamilyAwareOrdering(candidates, metadata, ["read-markdown-impl"]);
  assert.deepEqual(ordered, ["read-markdown-impl", "read-source-focused-v2"]);
});

test("family-aware ordering does not move unrelated families around each other", () => {
  const index = buildToolRegistryIndex([
    {
      tool_name: "read-source-focused-v2",
      capability_family: "focused_repo_read",
      capability_tags: ["repo_read", "file_targeted"],
      quality_tier: "preferred",
      status: "active",
      replacement_for: ["read-markdown-impl"],
      replaced_by: [],
    },
    {
      tool_name: "read-markdown-impl",
      capability_family: "focused_repo_read",
      capability_tags: ["repo_read", "markdown"],
      quality_tier: "supported",
      status: "active",
      replacement_for: [],
      replaced_by: ["read-source-focused-v2"],
    },
  ]);

  const candidates = ["terraform", "read-markdown-impl", "read-source-focused-v2"];
  const metadata = mapCandidatesToFamilies(index, candidates);
  const ordered = applyFamilyAwareOrdering(candidates, metadata);
  assert.deepEqual(ordered, ["terraform", "read-source-focused-v2", "read-markdown-impl"]);
});
