import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const srcRoot = path.join(workspaceRoot, "src");
const publicEntryRoots = [
  "src/index-sdk-demo.ts",
];

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      out.push(...walkFiles(fullPath));
      continue;
    }
    if (!/\.(ts|js)$/.test(entry)) continue;
    out.push(path.relative(workspaceRoot, fullPath));
  }
  return out.sort();
}

function resolveLocalImport(importer: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const importerDir = path.dirname(path.join(workspaceRoot, importer));
  const base = path.resolve(importerDir, specifier);
  const baseTs = base.replace(/\.js$/, ".ts").replace(/\.mjs$/, ".ts");
  const candidates = [
    base,
    baseTs,
    `${base}.ts`,
    `${base}.js`,
    path.join(base, "index.ts"),
    path.join(base, "index.js"),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) {
        return path.relative(workspaceRoot, candidate);
      }
    } catch {
      continue;
    }
  }
  return null;
}

function collectLocalImports(file: string): string[] {
  const contents = readFileSync(path.join(workspaceRoot, file), "utf8");
  const imports = new Set<string>();
  const matches = contents.matchAll(/from\s+"([^"]+)"|import\s+"([^"]+)"/g);
  for (const match of matches) {
    const specifier = match[1] ?? match[2];
    if (!specifier) continue;
    const resolved = resolveLocalImport(file, specifier);
    if (resolved) imports.add(resolved);
  }
  return Array.from(imports).sort();
}

function buildTransitiveKeepSet(roots: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    for (const imported of collectLocalImports(next)) {
      if (!seen.has(imported)) queue.push(imported);
    }
  }
  return seen;
}

function parseOutJsonArg(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out-json") return argv[i + 1] ?? null;
  }
  return null;
}

const allSrcFiles = walkFiles(srcRoot);
const keepSet = buildTransitiveKeepSet(publicEntryRoots);
const keepFiles = allSrcFiles.filter((file) => keepSet.has(file));
const moveCandidates = allSrcFiles.filter((file) => !keepSet.has(file));

const summary = {
  public_entry_roots: publicEntryRoots,
  src_file_count: allSrcFiles.length,
  keep_file_count: keepFiles.length,
  move_candidate_count: moveCandidates.length,
};

const outJson = parseOutJsonArg(process.argv.slice(2));
if (outJson) {
  writeFileSync(
    path.resolve(workspaceRoot, outJson),
    `${JSON.stringify({ summary, keep_files: keepFiles, move_candidates: moveCandidates }, null, 2)}\n`,
    "utf8",
  );
}

console.log("# Public Repo Keep Manifest");
console.log(`- src files: ${summary.src_file_count}`);
console.log(`- keep files: ${summary.keep_file_count}`);
console.log(`- move candidates: ${summary.move_candidate_count}`);
console.log(`- roots: ${summary.public_entry_roots.join(", ")}`);

console.log("\n## Keep Files");
for (const file of keepFiles) {
  console.log(`- ${file}`);
}

console.log("\n## Move Candidates");
for (const file of moveCandidates) {
  console.log(`- ${file}`);
}
