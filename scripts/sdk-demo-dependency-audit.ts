import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type ImportRecord = {
  importer: string;
  specifier: string;
  resolved: string;
  category: "demo_owned" | "shared_boundary" | "residual_runtime";
};

const workspaceRoot = process.cwd();

const auditedFiles = [
  "src/runtime-entry-sdk-demo.ts",
  "src/host/http-host-sdk-demo.ts",
  "src/host/http-host-sdk-demo-args.ts",
  "src/app/runtime-services-sdk-demo.ts",
  "src/routes/sdk-demo-memory-routes.ts",
  "src/routes/sdk-demo-memory-route-registrars.ts",
  "src/routes/sdk-demo-memory-route-implementations.ts",
  "src/routes/sdk-demo-memory-route-services.ts",
  "src/routes/sdk-demo-memory-runtime-adapters.ts",
  "src/routes/sdk-demo-memory-route-deps.ts",
];

const sharedBoundarySuffixes = new Set([
  "src/runtime-entry-shared.ts",
  "src/host/http-host.ts",
  "src/host/lite-edition.ts",
  "src/app/runtime-services.ts",
  "src/execution/state-store.ts",
]);

function normalizeResolved(importer: string, specifier: string): string {
  const importerDir = path.dirname(path.join(workspaceRoot, importer));
  const resolvedPath = path.resolve(importerDir, specifier);
  const withoutExtension = resolvedPath.replace(/\.js$/, ".ts");
  return path.relative(workspaceRoot, withoutExtension);
}

function classifyResolved(resolved: string): ImportRecord["category"] {
  if (resolved.includes("sdk-demo")) return "demo_owned";
  if (sharedBoundarySuffixes.has(resolved)) return "shared_boundary";
  return "residual_runtime";
}

function collectImports(file: string): ImportRecord[] {
  const contents = readFileSync(path.join(workspaceRoot, file), "utf8");
  const matches = contents.matchAll(/from\s+"([^"]+)"/g);
  const records: ImportRecord[] = [];
  for (const match of matches) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) continue;
    const resolved = normalizeResolved(file, specifier);
    records.push({
      importer: file,
      specifier,
      resolved,
      category: classifyResolved(resolved),
    });
  }
  return records;
}

function parseOutJsonArg(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out-json") {
      return argv[i + 1] ?? null;
    }
  }
  return null;
}

const importRecords = auditedFiles.flatMap(collectImports);
const summary = {
  audited_files: auditedFiles.length,
  import_edges: importRecords.length,
  demo_owned_edges: importRecords.filter((record) => record.category === "demo_owned").length,
  shared_boundary_edges: importRecords.filter((record) => record.category === "shared_boundary").length,
  residual_runtime_edges: importRecords.filter((record) => record.category === "residual_runtime").length,
  residual_runtime_targets: Array.from(
    new Set(
      importRecords
        .filter((record) => record.category === "residual_runtime")
        .map((record) => record.resolved),
    ),
  ).sort(),
};

const outJsonPath = parseOutJsonArg(process.argv.slice(2));
if (outJsonPath) {
  writeFileSync(
    path.resolve(workspaceRoot, outJsonPath),
    `${JSON.stringify({ summary, imports: importRecords }, null, 2)}\n`,
    "utf8",
  );
}

console.log("# SDK Demo Dependency Audit");
console.log(`- audited files: ${summary.audited_files}`);
console.log(`- import edges: ${summary.import_edges}`);
console.log(`- demo-owned edges: ${summary.demo_owned_edges}`);
console.log(`- shared-boundary edges: ${summary.shared_boundary_edges}`);
console.log(`- residual runtime edges: ${summary.residual_runtime_edges}`);

if (summary.residual_runtime_targets.length > 0) {
  console.log("\n## Residual Runtime Targets");
  for (const target of summary.residual_runtime_targets) {
    console.log(`- ${target}`);
  }
}
