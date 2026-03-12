import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const TSX_BIN = path.join(ROOT, "node_modules", ".bin", "tsx");
const SCRIPT = path.join(ROOT, "src", "jobs", "lite-beta-gate-v2.ts");

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aionis-lite-beta-gate-v2-"));
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
      "start:lite": "bash scripts/start-lite.sh",
      "lite:dogfood": "bash scripts/lite-dogfood.sh",
      "job:lite-alpha-gate": "tsx src/jobs/lite-alpha-gate.ts",
      "job:lite-beta-gate": "tsx src/jobs/lite-beta-gate.ts",
    },
  };
}

function operatorDocFixture(title) {
  return `# ${title}

Use Node 22+ with node:sqlite support.
Set memory_lane carefully.
Pass X-Admin-Token for pack routes.
Expect lite_embedding_backfill_completed_inline after local writes.
Run npm run -s lite:dogfood.
Health should report lite_sqlite.
`;
}

function summaryFixture() {
  return {
    ok: true,
    health: {
      aionis_edition: "lite",
      memory_store_backend: "lite_sqlite",
    },
    http_status: {
      write: 200,
      find: 200,
      recall_text: 200,
      planning_context: 200,
      context_assemble: 200,
      pack_export: 200,
      pack_import: 200,
      replay_start: 200,
      replay_before: 200,
      replay_after: 200,
      replay_end: 200,
      replay_get: 200,
    },
    write: {
      warnings: ["lite_embedding_backfill_completed_inline"],
      inline_backfill_completed: true,
    },
    find: {
      returned_nodes: 1,
    },
    recall_text: {
      seed_count: 1,
    },
    planning_context: {
      context_est_tokens: 12,
    },
    context_assemble: {
      context_est_tokens: 12,
    },
    packs: {
      exported_nodes: 1,
      imported: true,
      imported_nodes: 1,
    },
    replay: {
      status: "success",
      step_count: 1,
    },
  };
}

function startupScriptFixture() {
  return `#!/usr/bin/env bash
if [[ "\${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: scripts/start-lite.sh [--print-env] [node args...]
Starts Aionis in Lite edition without requiring DATABASE_URL.
Flags:
  --print-env   Print the effective Lite startup env as JSON and exit.
EOF
  exit 0
fi
cat <<'EOF'
start:lite requires Node.js with node:sqlite support.
Use Node 22+ for Lite alpha.
EOF
`;
}

test("lite beta gate v2 passes when startup UX, operator notes, and strict dogfood evidence are present", async () => {
  await withTempDir(async (dir) => {
    const packageJson = path.join(dir, "package.json");
    const outputJson = path.join(dir, "gate.json");
    const startLiteScript = path.join(dir, "scripts/start-lite.sh");
    const artifactsLite = path.join(dir, "artifacts", "lite");
    const operatorEn = path.join(dir, "docs/public/en/getting-started/04-lite-operator-notes.md");
    const operatorZh = path.join(dir, "docs/public/zh/getting-started/04-lite-operator-notes.md");
    const onboardingDocs = [
      path.join(dir, "docs/public/en/getting-started/01-get-started.md"),
      path.join(dir, "docs/public/en/getting-started/02-onboarding-5min.md"),
      path.join(dir, "docs/public/zh/getting-started/01-get-started.md"),
      path.join(dir, "docs/public/zh/getting-started/02-onboarding-5min.md"),
    ];

    await mkdir(path.dirname(operatorEn), { recursive: true });
    await mkdir(path.dirname(operatorZh), { recursive: true });
    await mkdir(path.dirname(startLiteScript), { recursive: true });
    await writeFile(packageJson, JSON.stringify(packageFixture(), null, 2), "utf8");
    await writeFile(startLiteScript, startupScriptFixture(), "utf8");
    await writeFile(operatorEn, operatorDocFixture("Lite Operator Notes"), "utf8");
    await writeFile(operatorZh, operatorDocFixture("Lite 运维说明"), "utf8");
    for (const file of onboardingDocs) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "04-lite-operator-notes\n", "utf8");
    }
    for (const stamp of ["dogfood_1", "dogfood_2", "dogfood_3"]) {
      const dirPath = path.join(artifactsLite, stamp);
      await mkdir(dirPath, { recursive: true });
      await writeFile(path.join(dirPath, "summary.json"), JSON.stringify(summaryFixture(), null, 2), "utf8");
    }

    const run = runGate([
      "--root-dir",
      dir,
      "--package-json",
      packageJson,
      "--start-lite-script",
      startLiteScript,
      "--output-json",
      outputJson,
      "--min-successful-dogfood-runs",
      "3",
    ]);

    assert.equal(run.status, 0, run.stderr || run.stdout);
    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.ok, true);
    assert.equal(out.successful_dogfood_runs, 3);
    assert.equal(out.strict_stable_dogfood_runs, 3);
  });
});

test("lite beta gate v2 fails when operator docs miss troubleshooting markers", async () => {
  await withTempDir(async (dir) => {
    const packageJson = path.join(dir, "package.json");
    const outputJson = path.join(dir, "gate.json");
    const startLiteScript = path.join(dir, "scripts/start-lite.sh");
    const artifactsLite = path.join(dir, "artifacts", "lite");
    const operatorEn = path.join(dir, "docs/public/en/getting-started/04-lite-operator-notes.md");
    const operatorZh = path.join(dir, "docs/public/zh/getting-started/04-lite-operator-notes.md");
    const onboardingDocs = [
      path.join(dir, "docs/public/en/getting-started/01-get-started.md"),
      path.join(dir, "docs/public/en/getting-started/02-onboarding-5min.md"),
      path.join(dir, "docs/public/zh/getting-started/01-get-started.md"),
      path.join(dir, "docs/public/zh/getting-started/02-onboarding-5min.md"),
    ];

    await mkdir(path.dirname(operatorEn), { recursive: true });
    await mkdir(path.dirname(operatorZh), { recursive: true });
    await mkdir(path.dirname(startLiteScript), { recursive: true });
    await writeFile(packageJson, JSON.stringify(packageFixture(), null, 2), "utf8");
    await writeFile(startLiteScript, startupScriptFixture(), "utf8");
    await writeFile(operatorEn, "# Lite Operator Notes\n", "utf8");
    await writeFile(operatorZh, "# Lite 运维说明\n", "utf8");
    for (const file of onboardingDocs) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "04-lite-operator-notes\n", "utf8");
    }
    for (const stamp of ["dogfood_1", "dogfood_2", "dogfood_3"]) {
      const dirPath = path.join(artifactsLite, stamp);
      await mkdir(dirPath, { recursive: true });
      await writeFile(path.join(dirPath, "summary.json"), JSON.stringify(summaryFixture(), null, 2), "utf8");
    }

    const run = runGate([
      "--root-dir",
      dir,
      "--package-json",
      packageJson,
      "--start-lite-script",
      startLiteScript,
      "--output-json",
      outputJson,
      "--min-successful-dogfood-runs",
      "3",
    ]);

    assert.equal(run.status, 2, run.stderr || run.stdout);
    const out = JSON.parse(await readFile(outputJson, "utf8"));
    assert.equal(out.ok, false);
    assert.ok(out.failing_gates.includes("operator_troubleshooting_markers_present"));
  });
});
