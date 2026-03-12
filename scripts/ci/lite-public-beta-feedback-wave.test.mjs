import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const TSX_BIN = path.join(ROOT, "node_modules", ".bin", "tsx");
const SCRIPT = path.join(ROOT, "src", "jobs", "lite-public-beta-feedback-wave.ts");

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aionis-lite-feedback-wave-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runWave(args, cwd = ROOT) {
  return spawnSync(TSX_BIN, [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
  });
}

test("feedback wave job summarizes lite beta issues by area", async () => {
  await withTempDir(async (dir) => {
    const input = path.join(dir, "issues.json");
    const output = path.join(dir, "wave.md");
    const outputJson = path.join(dir, "wave.json");
    const repoRoot = path.join(dir, "repo");
    const progressDir = path.join(repoRoot, "docs/internal/progress");

    await mkdir(progressDir, { recursive: true });
    await writeFile(input, JSON.stringify([
      {
        number: 101,
        title: "[Lite beta] replay issue",
        state: "OPEN",
        createdAt: "2026-03-12T10:00:00Z",
        url: "https://example.com/101",
        body: "### Problem area\nreplay\n\n### lite:dogfood result\nfailed\n",
        labels: [{ name: "lite" }, { name: "beta-feedback" }],
      },
      {
        number: 102,
        title: "[Lite beta] startup issue",
        state: "CLOSED",
        createdAt: "2026-03-12T11:00:00Z",
        closedAt: "2026-03-12T12:00:00Z",
        url: "https://example.com/102",
        body: "### Problem area\nstartup\n\n### lite:dogfood result\nnot run\n",
        labels: [{ name: "lite" }, { name: "beta-feedback" }],
      },
    ], null, 2), "utf8");

    const run = runWave([
      "--root-dir",
      repoRoot,
      "--input-json",
      input,
      "--output",
      output,
      "--output-json",
      outputJson,
    ], repoRoot);

    assert.equal(run.status, 0, run.stderr || run.stdout);
    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.total_issues, 2);
    assert.equal(out.by_area[0].area, "replay");
    assert.equal(out.state_counts.open, 1);
    assert.equal(out.state_counts.closed, 1);
    const progress = await readFile(path.join(progressDir, "AIONIS_LITE_PUBLIC_BETA_FEEDBACK_WAVE_1_2026-03-12.md"), "utf8");
    assert.match(progress, /total feedback issues: `2`/);
  });
});

test("feedback wave job records empty baseline when no issues exist", async () => {
  await withTempDir(async (dir) => {
    const input = path.join(dir, "issues.json");
    const outputJson = path.join(dir, "wave.json");
    const repoRoot = path.join(dir, "repo");
    const progressDir = path.join(repoRoot, "docs/internal/progress");

    await mkdir(progressDir, { recursive: true });
    await writeFile(input, "[]\n", "utf8");

    const run = runWave([
      "--root-dir",
      repoRoot,
      "--input-json",
      input,
      "--output-json",
      outputJson,
    ], repoRoot);

    assert.equal(run.status, 0, run.stderr || run.stdout);
    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.total_issues, 0);
    const progress = await readFile(path.join(progressDir, "AIONIS_LITE_PUBLIC_BETA_FEEDBACK_WAVE_1_2026-03-12.md"), "utf8");
    assert.match(progress, /awaiting_external_feedback/);
  });
});
