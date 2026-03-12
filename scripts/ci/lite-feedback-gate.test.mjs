import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const TSX_BIN = path.join(ROOT, "node_modules", ".bin", "tsx");
const SCRIPT = path.join(ROOT, "src", "jobs", "lite-feedback-gate.ts");

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aionis-lite-feedback-gate-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runGate(args) {
  return spawnSync(TSX_BIN, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

function packageFixture() {
  return {
    scripts: {
      "lite:dogfood": "bash scripts/lite-dogfood.sh",
    },
  };
}

function issueTemplateFixture() {
  return `name: Lite Beta Feedback
description: Report startup, operator UX, replay, recall, or pack issues while evaluating Aionis Lite beta.
title: "[Lite beta] "
labels:
  - lite
  - beta-feedback
body:
  - type: input
    id: environment
  - type: input
    id: startup
  - type: textarea
    id: health
  - type: dropdown
    id: area
  - type: dropdown
    id: dogfood
  - type: textarea
    id: reproduce
  - type: textarea
    id: expected
  - type: textarea
    id: actual
`;
}

function issueConfigFixture() {
  return `blank_issues_enabled: false
contact_links:
  - name: Lite Public Beta Boundary
    url: https://doc.aionisos.com/public/en/getting-started/05-lite-public-beta-boundary
    about: boundary
  - name: Lite Troubleshooting and Feedback
    url: https://doc.aionisos.com/public/en/getting-started/06-lite-troubleshooting-and-feedback
    about: troubleshooting
  - name: Lite 运维与排障
    url: https://doc.aionisos.com/public/zh/getting-started/06-lite-troubleshooting-and-feedback
    about: zh
`;
}

function troubleshootingFixture(title) {
  return `# ${title}

Use Lite Beta Feedback when reporting issues.
Run lite:dogfood first.
Check /health.
Check memory_lane.
Check X-Admin-Token.
`;
}

test("lite feedback gate passes when feedback entrypoints are present", async () => {
  await withTempDir(async (dir) => {
    const packageJson = path.join(dir, "package.json");
    const outputJson = path.join(dir, "gate.json");
    const template = path.join(dir, ".github/ISSUE_TEMPLATE/lite-beta-feedback.yml");
    const config = path.join(dir, ".github/ISSUE_TEMPLATE/config.yml");
    const troubleshootingEn = path.join(dir, "docs/public/en/getting-started/06-lite-troubleshooting-and-feedback.md");
    const troubleshootingZh = path.join(dir, "docs/public/zh/getting-started/06-lite-troubleshooting-and-feedback.md");

    await mkdir(path.dirname(template), { recursive: true });
    await mkdir(path.dirname(troubleshootingEn), { recursive: true });
    await mkdir(path.dirname(troubleshootingZh), { recursive: true });
    await writeFile(packageJson, JSON.stringify(packageFixture(), null, 2), "utf8");
    await writeFile(template, issueTemplateFixture(), "utf8");
    await writeFile(config, issueConfigFixture(), "utf8");
    await writeFile(troubleshootingEn, troubleshootingFixture("Lite Troubleshooting and Feedback"), "utf8");
    await writeFile(troubleshootingZh, troubleshootingFixture("Lite 排障与反馈"), "utf8");

    const run = runGate(["--root-dir", dir, "--output-json", outputJson]);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.ok, true);
  });
});

test("lite feedback gate fails when issue config is missing", async () => {
  await withTempDir(async (dir) => {
    const packageJson = path.join(dir, "package.json");
    const outputJson = path.join(dir, "gate.json");
    const template = path.join(dir, ".github/ISSUE_TEMPLATE/lite-beta-feedback.yml");
    const troubleshootingEn = path.join(dir, "docs/public/en/getting-started/06-lite-troubleshooting-and-feedback.md");
    const troubleshootingZh = path.join(dir, "docs/public/zh/getting-started/06-lite-troubleshooting-and-feedback.md");

    await mkdir(path.dirname(template), { recursive: true });
    await mkdir(path.dirname(troubleshootingEn), { recursive: true });
    await mkdir(path.dirname(troubleshootingZh), { recursive: true });
    await writeFile(packageJson, JSON.stringify(packageFixture(), null, 2), "utf8");
    await writeFile(template, issueTemplateFixture(), "utf8");
    await writeFile(troubleshootingEn, troubleshootingFixture("Lite Troubleshooting and Feedback"), "utf8");
    await writeFile(troubleshootingZh, troubleshootingFixture("Lite 排障与反馈"), "utf8");

    const run = runGate(["--root-dir", dir, "--output-json", outputJson]);
    assert.equal(run.status, 2, run.stderr || run.stdout);
    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.ok, false);
    assert.ok(out.failing_gates.includes("lite_feedback_issue_config_present"));
  });
});
