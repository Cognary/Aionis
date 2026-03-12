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
  http_status?: Record<string, number>;
  write?: {
    warnings?: string[];
    inline_backfill_completed?: boolean;
  };
  find?: {
    returned_nodes?: number;
  };
  recall_text?: {
    seed_count?: number;
  };
  planning_context?: {
    context_est_tokens?: number;
  };
  context_assemble?: {
    context_est_tokens?: number;
  };
  packs?: {
    exported_nodes?: number;
    imported?: boolean;
    imported_nodes?: number;
  };
  replay?: {
    status?: string;
    step_count?: number;
  };
};

type DocCheck = {
  exists: boolean;
  content: string;
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_HTTP_KEYS = [
  "write",
  "find",
  "recall_text",
  "planning_context",
  "context_assemble",
  "pack_export",
  "pack_import",
  "replay_start",
  "replay_before",
  "replay_after",
  "replay_end",
  "replay_get",
] as const;

const REQUIRED_DOC_MARKERS = [
  "22+",
  "memory_lane",
  "X-Admin-Token",
  "lite_embedding_backfill_completed_inline",
  "lite:dogfood",
  "lite_sqlite",
];

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

async function readDoc(file: string): Promise<DocCheck> {
  try {
    return {
      exists: true,
      content: await fs.readFile(file, "utf8"),
    };
  } catch {
    return {
      exists: false,
      content: "",
    };
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

function helpTextOk(raw: string): boolean {
  return raw.includes("Usage: scripts/start-lite.sh")
    && raw.includes("--print-env")
    && raw.includes("Starts Aionis in Lite edition");
}

function helpErrorTextOk(raw: string): boolean {
  return raw.includes("node:sqlite") && raw.includes("22+");
}

function allHttpStatusesOk(summary: DogfoodSummary): boolean {
  const statuses = summary.http_status ?? {};
  return REQUIRED_HTTP_KEYS.every((key) => statuses[key] === 200);
}

async function collectDogfoodSummaries(dir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const summaries: Array<{
    run: string;
    file: string;
    summary: DogfoodSummary;
    ok: boolean;
    backend_ok: boolean;
    inline_backfill_ok: boolean;
    replay_ok: boolean;
    route_matrix_ok: boolean;
    find_ok: boolean;
    recall_ok: boolean;
    context_ok: boolean;
    pack_ok: boolean;
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
      backend_ok:
        summary.health?.aionis_edition === "lite"
        && summary.health?.memory_store_backend === "lite_sqlite",
      inline_backfill_ok: summary.write?.inline_backfill_completed === true,
      replay_ok: summary.replay?.status === "success" && (summary.replay?.step_count ?? 0) > 0,
      route_matrix_ok: allHttpStatusesOk(summary),
      find_ok: (summary.find?.returned_nodes ?? 0) > 0,
      recall_ok: (summary.recall_text?.seed_count ?? 0) > 0,
      context_ok:
        (summary.planning_context?.context_est_tokens ?? 0) > 0
        && (summary.context_assemble?.context_est_tokens ?? 0) > 0,
      pack_ok:
        (summary.packs?.exported_nodes ?? 0) > 0
        && summary.packs?.imported === true
        && (summary.packs?.imported_nodes ?? 0) > 0,
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

  const output = path.resolve(argValue("--output") ?? path.join(artifactsDir, `LITE_BETA_GATE_V2_${dateTag}.md`));
  const outputJson = path.resolve(argValue("--output-json") ?? path.join(artifactsDir, `LITE_BETA_GATE_V2_${dateTag}.json`));
  const packageJsonPath = path.resolve(argValue("--package-json") ?? path.join(rootDir, "package.json"));
  const startLiteScriptPath = path.resolve(argValue("--start-lite-script") ?? path.join(rootDir, "scripts", "start-lite.sh"));
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
  const startLiteScriptExists = await fileExists(startLiteScriptPath);
  const startLiteScriptRaw = startLiteScriptExists ? await fs.readFile(startLiteScriptPath, "utf8") : "";
  const operatorDocs = await Promise.all(publicOperatorDocs.map((file) => readDoc(file)));
  const dogfoodSummaries = await collectDogfoodSummaries(artifactsDir);
  const successfulDogfood = dogfoodSummaries.filter((row) => row.ok);
  const stableDogfood = successfulDogfood.filter(
    (row) =>
      row.backend_ok
      && row.inline_backfill_ok
      && row.replay_ok
      && row.route_matrix_ok
      && row.find_ok
      && row.recall_ok
      && row.context_ok
      && row.pack_ok,
  );
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

  const operatorDocsPresent = operatorDocs.every((doc) => doc.exists);
  const operatorTroubleshootingMarkersPresent = operatorDocs.every((doc) =>
    REQUIRED_DOC_MARKERS.every((marker) => doc.content.includes(marker)),
  );

  const gates = {
    startup_packaging_present: Boolean(scripts["start:lite"]) && startLiteScriptExists,
    dogfood_script_present: Boolean(scripts["lite:dogfood"]),
    alpha_gate_present: Boolean(scripts["job:lite-alpha-gate"]),
    beta_gate_v1_present: Boolean(scripts["job:lite-beta-gate"]),
    operator_docs_present: operatorDocsPresent,
    operator_troubleshooting_markers_present: operatorTroubleshootingMarkersPresent,
    onboarding_links_operator_docs: onboardingDocMentions.every(Boolean),
    start_lite_help_contract_present: helpTextOk(startLiteScriptRaw),
    start_lite_node_requirement_present: helpErrorTextOk(startLiteScriptRaw),
    repeated_successful_dogfood_present: successfulDogfood.length >= minSuccessfulDogfoodRuns,
    repeated_strict_stable_dogfood_present: stableDogfood.length >= minSuccessfulDogfoodRuns,
  };

  const verdict = Object.values(gates).every(Boolean);
  const failingGates = Object.entries(gates).filter(([, ok]) => !ok).map(([name]) => name);

  const gateRows = [
    ["Gate", "Status"],
    ...Object.entries(gates).map(([name, ok]) => [name, boolStatus(ok)]),
  ];

  const docRows = [
    ["Document", "exists", "markers"],
    ...publicOperatorDocs.map((file, i) => [
      path.relative(rootDir, file),
      boolStatus(operatorDocs[i]?.exists ?? false),
      boolStatus(REQUIRED_DOC_MARKERS.every((marker) => operatorDocs[i]?.content.includes(marker) ?? false)),
    ]),
    ...publicOnboardingDocs.map((file, i) => [path.relative(rootDir, file), boolStatus(onboardingDocMentions[i] ?? false), "-"]),
  ];

  const dogfoodRows = [
    ["Dogfood Run", "ok", "backend", "routes", "find", "recall", "context", "pack", "replay", "inline_backfill"],
    ...dogfoodSummaries.map((row) => [
      row.run,
      boolStatus(row.ok),
      boolStatus(row.backend_ok),
      boolStatus(row.route_matrix_ok),
      boolStatus(row.find_ok),
      boolStatus(row.recall_ok),
      boolStatus(row.context_ok),
      boolStatus(row.pack_ok),
      boolStatus(row.replay_ok),
      boolStatus(row.inline_backfill_ok),
    ]),
  ];

  const recommendations: string[] = [];
  if (!gates.repeated_successful_dogfood_present || !gates.repeated_strict_stable_dogfood_present) {
    recommendations.push(
      `Run more real-process Lite dogfood passes until at least ${minSuccessfulDogfoodRuns} strict-stable summaries exist under artifacts/lite/dogfood_*/summary.json.`,
    );
  }
  if (!gates.operator_docs_present || !gates.operator_troubleshooting_markers_present) {
    recommendations.push("Keep EN/ZH Lite operator notes present and retain explicit troubleshooting guidance for Node 22+, memory_lane, X-Admin-Token, inline backfill, lite:dogfood, and lite_sqlite health checks.");
  }
  if (!gates.start_lite_help_contract_present || !gates.start_lite_node_requirement_present) {
    recommendations.push("Preserve `scripts/start-lite.sh` as a stable operator entrypoint with explicit help output and Node/node:sqlite requirement messaging.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Lite beta gate v2 is satisfied for the current repository snapshot.");
  }

  const report = `# Lite Beta Gate v2

Generated at: \`${generatedAt}\`

## Inputs

- package.json: \`${packageJsonPath}\`
- start-lite script: \`${startLiteScriptPath}\`
- min successful/strict-stable dogfood runs: \`${minSuccessfulDogfoodRuns}\`

## Gate Summary

${mdTable(gateRows)}

## Operator Docs And Startup UX

${mdTable(docRows)}

## Real-Process Dogfood Evidence

${mdTable(dogfoodRows)}

## Verdict

- successful dogfood runs: ${successfulDogfood.length}
- strict-stable dogfood runs: ${stableDogfood.length}
- failing gates: ${failingGates.length === 0 ? "none" : failingGates.join(", ")}
- final verdict: ${verdict ? "pass" : "fail"}

## Recommendations

${recommendations.map((line) => `- ${line}`).join("\n")}
`;

  const out = {
    ok: verdict,
    generated_at: generatedAt,
    package_json: packageJsonPath,
    start_lite_script: startLiteScriptPath,
    output,
    output_json: outputJson,
    min_successful_dogfood_runs: minSuccessfulDogfoodRuns,
    required_doc_markers: REQUIRED_DOC_MARKERS,
    required_http_keys: REQUIRED_HTTP_KEYS,
    gates,
    failing_gates: failingGates,
    public_operator_docs: publicOperatorDocs,
    public_onboarding_docs: publicOnboardingDocs,
    dogfood_runs: dogfoodSummaries.map((row) => ({
      run: row.run,
      file: row.file,
      ok: row.ok,
      backend_ok: row.backend_ok,
      route_matrix_ok: row.route_matrix_ok,
      find_ok: row.find_ok,
      recall_ok: row.recall_ok,
      context_ok: row.context_ok,
      pack_ok: row.pack_ok,
      replay_ok: row.replay_ok,
      inline_backfill_ok: row.inline_backfill_ok,
    })),
    successful_dogfood_runs: successfulDogfood.length,
    strict_stable_dogfood_runs: stableDogfood.length,
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
