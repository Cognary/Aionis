import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const KEEP_MANIFEST_SCRIPT = path.join(ROOT, "scripts", "public-repo-keep-manifest.ts");

function loadKeepManifest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-public-keep-manifest-"));
  const outJson = path.join(tmpDir, "manifest.json");
  execFileSync(process.execPath, [TSX_CLI, KEEP_MANIFEST_SCRIPT, "--out-json", outJson], {
    cwd: ROOT,
    stdio: "pipe",
    env: process.env,
  });
  return JSON.parse(fs.readFileSync(outJson, "utf8"));
}

test("public keep-manifest stays fully converged on the sdk_demo entry root", () => {
  const manifest = loadKeepManifest();
  assert.deepEqual(manifest.summary.public_entry_roots, ["src/index-sdk-demo.ts"]);
  assert.equal(manifest.summary.src_file_count, manifest.summary.keep_file_count);
  assert.equal(manifest.summary.move_candidate_count, 0);
  assert.deepEqual(manifest.move_candidates, []);
});

