import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLiteRouteMatrix } from "../host/lite-edition.js";

type LiteRouteMatrix = {
  kernel_required_routes?: string[];
  optional_routes?: string[];
  server_only_route_groups?: Array<{
    group?: string;
    prefixes?: readonly string[];
    reason?: string;
  }>;
};

type PackageJson = {
  scripts?: Record<string, string>;
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const REQUIRED_RUNTIME_HOST_TESTS = [
  "scripts/ci/lite-startup-packaging.test.mjs",
  "scripts/ci/lite-edition-routes.test.mjs",
  "scripts/ci/lite-write-routes.test.mjs",
  "scripts/ci/lite-recall-routes.test.mjs",
  "scripts/ci/lite-context-runtime-routes.test.mjs",
  "scripts/ci/lite-replay-routes.test.mjs",
  "scripts/ci/lite-session-routes.test.mjs",
  "scripts/ci/lite-pack-routes.test.mjs",
  "scripts/ci/lite-find-resolve-routes.test.mjs",
  "scripts/ci/lite-rules-routes.test.mjs",
  "scripts/ci/lite-tools-routes.test.mjs",
  "scripts/ci/lite-tools-run-routes.test.mjs",
  "scripts/ci/lite-tools-feedback-routes.test.mjs",
] as const;

const REQUIRED_KERNEL_ROUTE_GROUPS = [
  "memory-write",
  "memory-recall",
  "memory-context-runtime",
  "memory-access-partial",
  "memory-replay-core",
  "memory-feedback-tools",
] as const;

const REQUIRED_OPTIONAL_ROUTE_GROUPS = [
  "memory-sandbox",
  "memory-replay-governed-partial",
] as const;

const REQUIRED_SERVER_ONLY_GROUPS = [
  "admin_control",
  "automations",
] as const;

const PACK_COMPATIBILITY_EVIDENCE = [
  "scripts/ci/lite-pack-compatibility.test.mjs",
  "scripts/ci/lite-pack-roundtrip-compat.test.mjs",
  "scripts/ci/lite-server-pack-compat.test.mjs",
] as const;

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

function mdTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const [header, ...rest] = rows;
  const separator = header.map(() => "---");
  return [header, separator, ...rest].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function extractScriptTestFiles(command: string | undefined): Set<string> {
  if (!command) return new Set();
  const matches = command.match(/scripts\/ci\/[A-Za-z0-9._-]+\.test\.mjs/g) ?? [];
  return new Set(matches);
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function resolveRouteMatrix(): Promise<LiteRouteMatrix> {
  const routeMatrixJson = argValue("--route-matrix-json");
  if (routeMatrixJson) {
    return readJson<LiteRouteMatrix>(path.resolve(routeMatrixJson));
  }
  return buildLiteRouteMatrix();
}

async function main() {
  const generatedAt = new Date().toISOString();
  const dateTag = generatedAt.slice(0, 10).replace(/-/g, "");
  const artifactsDir = path.resolve(ROOT, "artifacts", "lite");
  await fs.mkdir(artifactsDir, { recursive: true });

  const output = path.resolve(argValue("--output") ?? path.join(artifactsDir, `LITE_ALPHA_GATE_V1_${dateTag}.md`));
  const outputJson = path.resolve(argValue("--output-json") ?? path.join(artifactsDir, `LITE_ALPHA_GATE_V1_${dateTag}.json`));
  const packageJsonPath = path.resolve(argValue("--package-json") ?? path.join(ROOT, "package.json"));

  const pkg = await readJson<PackageJson>(packageJsonPath);
  const scripts = pkg.scripts ?? {};
  const runtimeHostTests = extractScriptTestFiles(scripts["test:layer:runtime-host"]);
  const routeMatrix = await resolveRouteMatrix();

  const requiredKernelRouteResults = REQUIRED_KERNEL_ROUTE_GROUPS.map((route) => ({
    route,
    present: (routeMatrix.kernel_required_routes ?? []).includes(route),
  }));
  const requiredOptionalRouteResults = REQUIRED_OPTIONAL_ROUTE_GROUPS.map((route) => ({
    route,
    present: (routeMatrix.optional_routes ?? []).includes(route),
  }));
  const requiredServerOnlyResults = REQUIRED_SERVER_ONLY_GROUPS.map((group) => ({
    group,
    present: (routeMatrix.server_only_route_groups ?? []).some((entry) => entry.group === group),
  }));
  const requiredRuntimeHostResults = REQUIRED_RUNTIME_HOST_TESTS.map((file) => ({
    file,
    present: runtimeHostTests.has(file),
  }));
  const packCompatibilityResults = [];
  for (const relPath of PACK_COMPATIBILITY_EVIDENCE) {
    packCompatibilityResults.push({
      file: relPath,
      present: await fileExists(path.resolve(path.dirname(packageJsonPath), relPath)),
    });
  }

  const scriptsPresent = {
    test_contract: Boolean(scripts["test:contract"]),
    test_layer_runtime_host: Boolean(scripts["test:layer:runtime-host"]),
    start_lite: Boolean(scripts["start:lite"]),
  };

  const gates = {
    kernel_contract_suite_present: scriptsPresent.test_contract,
    lite_runtime_host_suite_present: scriptsPresent.test_layer_runtime_host,
    route_matrix_declares_kernel_required: requiredKernelRouteResults.every((row) => row.present),
    route_matrix_declares_optional: requiredOptionalRouteResults.every((row) => row.present),
    route_matrix_declares_server_only: requiredServerOnlyResults.every((row) => row.present),
    server_only_501_test_present: runtimeHostTests.has("scripts/ci/lite-edition-routes.test.mjs"),
    kernel_required_runtime_host_smokes_present: requiredRuntimeHostResults.every((row) => row.present),
    deterministic_replay_dispatch_evidence_present: runtimeHostTests.has("scripts/ci/lite-replay-routes.test.mjs"),
    pack_local_bridge_evidence_present: runtimeHostTests.has("scripts/ci/lite-pack-routes.test.mjs"),
    pack_cross_edition_compatibility_present: packCompatibilityResults.some((row) => row.present),
    lite_startup_packaging_present: scriptsPresent.start_lite && runtimeHostTests.has("scripts/ci/lite-startup-packaging.test.mjs"),
  };

  const verdict = Object.values(gates).every(Boolean);
  const failingGates = Object.entries(gates).filter(([, ok]) => !ok).map(([name]) => name);

  const recommendations: string[] = [];
  if (!gates.pack_cross_edition_compatibility_present) {
    recommendations.push("Add explicit Lite<->Server pack compatibility tests before calling Lite alpha-ready.");
  }
  if (!gates.lite_startup_packaging_present) {
    recommendations.push("Add a stable `start:lite` packaging path so Lite basic startup does not depend on ad hoc host wiring.");
  }
  if (!gates.kernel_required_runtime_host_smokes_present) {
    const missing = requiredRuntimeHostResults.filter((row) => !row.present).map((row) => row.file);
    recommendations.push(`Restore missing Lite runtime-host smoke tests: ${missing.join(", ")}.`);
  }
  if (!gates.route_matrix_declares_kernel_required || !gates.route_matrix_declares_optional || !gates.route_matrix_declares_server_only) {
    recommendations.push("Keep Lite route matrix aligned with the implementation spec before widening rollout.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Lite alpha gate is satisfied for the configured repository snapshot.");
  }

  const sectionRows = [
    ["Gate", "Status"],
    ...Object.entries(gates).map(([name, ok]) => [name, ok ? "pass" : "fail"]),
  ];
  const runtimeHostRows = [
    ["Required Runtime-Host Smoke", "Status"],
    ...requiredRuntimeHostResults.map((row) => [row.file, row.present ? "present" : "missing"]),
  ];
  const routeRows = [
    ["Route Matrix Section", "Expected", "Status"],
    ...requiredKernelRouteResults.map((row) => [row.route, "kernel_required", row.present ? "present" : "missing"]),
    ...requiredOptionalRouteResults.map((row) => [row.route, "optional", row.present ? "present" : "missing"]),
    ...requiredServerOnlyResults.map((row) => [row.group, "server_only", row.present ? "present" : "missing"]),
  ];
  const packCompatRows = [
    ["Pack Compatibility Evidence", "Status"],
    ...packCompatibilityResults.map((row) => [row.file, row.present ? "present" : "missing"]),
  ];

  const routeMatrixSource = argValue("--route-matrix-json")
    ? path.resolve(argValue("--route-matrix-json") as string)
    : "buildLiteRouteMatrix()";

  const report = `# Lite Alpha Gate

Generated at: \`${generatedAt}\`

## Inputs

- package.json: \`${packageJsonPath}\`
- route matrix source: \`${routeMatrixSource}\`

## Gate Summary

${mdTable(sectionRows)}

## Runtime-Host Smoke Evidence

${mdTable(runtimeHostRows)}

## Route Matrix Coverage

${mdTable(routeRows)}

## Pack Compatibility Evidence

${mdTable(packCompatRows)}

## Verdict

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
    gates,
    failing_gates: failingGates,
    required_runtime_host_tests: requiredRuntimeHostResults,
    route_matrix: {
      kernel_required: requiredKernelRouteResults,
      optional: requiredOptionalRouteResults,
      server_only: requiredServerOnlyResults,
    },
    pack_compatibility_evidence: packCompatibilityResults,
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
