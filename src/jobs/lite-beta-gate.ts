import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PackageJson = {
  scripts?: Record<string, string>;
};

type DogfoodSummary = {
  ok?: boolean;
  health?: {
    aionis_edition?: string;
    memory_store_backend?: string;
  };
  write?: {
    inline_backfill_completed?: boolean;
  };
  replay?: {
    status?: string;
  };
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function mdTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const [header, ...rest] = rows;
  const separator = header.map(() => "---");
  return [header, separator, ...rest].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function boolStatus(ok: boolean): string {
  return ok ? "pass" : "fail";
}

async function collectDogfoodSummaries(dir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const summaries: Array<{
    run: string;
    file: string;
    summary: DogfoodSummary;
    ok: boolean;
    replay_ok: boolean;
    inline_backfill_ok: boolean;
    backend_ok: boolean;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("dogfood_")) continue;
    const file = path.join(dir, entry.name, "summary.json");
    if (!(await fileExists(file))) continue;
    const summary = await readJson<DogfoodSummary>(file);
    summaries.push({
      run: entry.name,
      file,
      summary,
      ok: summary.ok === true,
      replay_ok: summary.replay?.status === "success",
      inline_backfill_ok: summary.write?.inline_backfill_completed === true,
      backend_ok:
        summary.health?.aionis_edition === "lite"
        && summary.health?.memory_store_backend === "lite_sqlite",
    });
  }

  summaries.sort((a, b) => a.run.localeCompare(b.run));
  return summaries;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const dateTag = generatedAt.slice(0, 10).replace(/-/g, "");
  const minSuccessfulDogfoodRuns = Number(argValue("--min-successful-dogfood-runs") ?? "3");
  const rootDir = path.resolve(argValue("--root-dir") ?? ROOT);
  if (!Number.isFinite(minSuccessfulDogfoodRuns) || minSuccessfulDogfoodRuns < 1) {
    throw new Error("--min-successful-dogfood-runs must be a positive integer");
  }

  const artifactsDir = path.resolve(rootDir, "artifacts", "lite");
  await fs.mkdir(artifactsDir, { recursive: true });

  const output = path.resolve(argValue("--output") ?? path.join(artifactsDir, `LITE_BETA_GATE_V1_${dateTag}.md`));
  const outputJson = path.resolve(argValue("--output-json") ?? path.join(artifactsDir, `LITE_BETA_GATE_V1_${dateTag}.json`));
  const packageJsonPath = path.resolve(argValue("--package-json") ?? path.join(rootDir, "package.json"));
  const publicOperatorDocs = [
    path.join(rootDir, "docs/public/en/getting-started/04-lite-operator-notes.md"),
    path.join(rootDir, "docs/public/zh/getting-started/04-lite-operator-notes.md"),
  ];
  const publicOnboardingDocs = [
    path.join(rootDir, "docs/public/en/getting-started/01-get-started.md"),
    path.join(rootDir, "docs/public/en/getting-started/02-onboarding-5min.md"),
    path.join(rootDir, "docs/public/zh/getting-started/01-get-started.md"),
    path.join(rootDir, "docs/public/zh/getting-started/02-onboarding-5min.md"),
  ];

  const pkg = await readJson<PackageJson>(packageJsonPath);
  const scripts = pkg.scripts ?? {};
  const dogfoodSummaries = await collectDogfoodSummaries(artifactsDir);
  const successfulDogfood = dogfoodSummaries.filter((row) => row.ok);
  const stableDogfood = successfulDogfood.filter((row) => row.replay_ok && row.inline_backfill_ok && row.backend_ok);
  const operatorDocsPresent = await Promise.all(publicOperatorDocs.map((file) => fileExists(file)));
  const onboardingDocMentions = await Promise.all(
    publicOnboardingDocs.map(async (file) => {
      try {
        const raw = await fs.readFile(file, "utf8");
        return raw.includes("04-lite-operator-notes");
      } catch {
        return false;
      }
    }),
  );

  const gates = {
    startup_packaging_present: Boolean(scripts["start:lite"]),
    dogfood_script_present: Boolean(scripts["lite:dogfood"]),
    alpha_gate_present: Boolean(scripts["job:lite-alpha-gate"]),
    operator_docs_present: operatorDocsPresent.every(Boolean),
    onboarding_links_operator_docs: onboardingDocMentions.every(Boolean),
    repeated_successful_dogfood_present: successfulDogfood.length >= minSuccessfulDogfoodRuns,
    repeated_stable_dogfood_present: stableDogfood.length >= minSuccessfulDogfoodRuns,
  };

  const verdict = Object.values(gates).every(Boolean);
  const failingGates = Object.entries(gates).filter(([, ok]) => !ok).map(([name]) => name);

  const gateRows = [
    ["Gate", "Status"],
    ...Object.entries(gates).map(([name, ok]) => [name, boolStatus(ok)]),
  ];

  const docRows = [
    ["Document", "Status"],
    ...publicOperatorDocs.map((file, i) => [path.relative(rootDir, file), boolStatus(operatorDocsPresent[i] ?? false)]),
    ...publicOnboardingDocs.map((file, i) => [path.relative(rootDir, file), boolStatus(onboardingDocMentions[i] ?? false)]),
  ];

  const dogfoodRows = [
    ["Dogfood Run", "ok", "backend", "inline_backfill", "replay"],
    ...dogfoodSummaries.map((row) => [
      row.run,
      boolStatus(row.ok),
      boolStatus(row.backend_ok),
      boolStatus(row.inline_backfill_ok),
      boolStatus(row.replay_ok),
    ]),
  ];

  const recommendations: string[] = [];
  if (!gates.repeated_successful_dogfood_present || !gates.repeated_stable_dogfood_present) {
    recommendations.push(
      `Run more real-process Lite dogfood passes until at least ${minSuccessfulDogfoodRuns} successful and stable summaries exist under artifacts/lite/dogfood_*/summary.json.`,
    );
  }
  if (!gates.operator_docs_present || !gates.onboarding_links_operator_docs) {
    recommendations.push("Keep EN/ZH Lite operator notes present and linked from both get-started and onboarding entrypoints.");
  }
  if (!gates.startup_packaging_present || !gates.dogfood_script_present) {
    recommendations.push("Do not widen Lite rollout unless both `start:lite` and `lite:dogfood` remain available.");
  }
  if (!gates.alpha_gate_present) {
    recommendations.push("Beta gating depends on alpha gating; restore `job:lite-alpha-gate` before advancing Lite release posture.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Lite beta gate v1 is satisfied for the current repository snapshot.");
  }

  const report = `# Lite Beta Gate v1

Generated at: \`${generatedAt}\`

## Inputs

- package.json: \`${packageJsonPath}\`
- min successful/stable dogfood runs: \`${minSuccessfulDogfoodRuns}\`

## Gate Summary

${mdTable(gateRows)}

## Public Operator Docs

${mdTable(docRows)}

## Real-Process Dogfood Evidence

${mdTable(dogfoodRows)}

## Verdict

- successful dogfood runs: ${successfulDogfood.length}
- stable dogfood runs: ${stableDogfood.length}
- failing gates: ${failingGates.length === 0 ? "none" : failingGates.join(", ")}
- final verdict: ${verdict ? "pass" : "fail"}

## Recommendations

${recommendations.map((line) => `- ${line}`).join("\n")}
`;

  const out = {
    ok: verdict,
    generated_at: generatedAt,
    package_json: packageJsonPath,
    output,
    output_json: outputJson,
    min_successful_dogfood_runs: minSuccessfulDogfoodRuns,
    gates,
    failing_gates: failingGates,
    public_operator_docs: publicOperatorDocs,
    public_onboarding_docs: publicOnboardingDocs,
    dogfood_runs: dogfoodSummaries.map((row) => ({
      run: row.run,
      file: row.file,
      ok: row.ok,
      backend_ok: row.backend_ok,
      inline_backfill_ok: row.inline_backfill_ok,
      replay_ok: row.replay_ok,
    })),
    successful_dogfood_runs: successfulDogfood.length,
    stable_dogfood_runs: stableDogfood.length,
    recommendations,
  };

  await fs.writeFile(output, report, "utf8");
  await fs.writeFile(outputJson, JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify({ ok: verdict, output, output_json: outputJson, failing_gates: failingGates }, null, 2));
  process.exit(verdict ? 0 : 2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
