import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

async function listFiles(dir, predicate, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await listFiles(full, predicate, out);
      continue;
    }
    if (predicate(full)) out.push(full);
  }
  return out;
}

function normalizePath(p) {
  return p.split(path.sep).join("/");
}

function findRelativeImports(source) {
  const matches = [];
  const importRegex = /^\s*import(?:.+?\sfrom\s+)?["']([^"']+)["'];?/gm;
  const exportRegex = /^\s*export\s+.+?\sfrom\s+["']([^"']+)["'];?/gm;

  let match;
  while ((match = importRegex.exec(source)) !== null) matches.push(match[1]);
  while ((match = exportRegex.exec(source)) !== null) matches.push(match[1]);
  return matches.filter((spec) => spec.startsWith("."));
}

function resolveImportTarget(filePath, specifier) {
  const base = path.resolve(path.dirname(filePath), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.js`,
    path.join(base, "index.ts"),
    path.join(base, "index.js"),
  ];
  for (const candidate of candidates) {
    const normalized = normalizePath(path.relative(ROOT, candidate));
    if (
      normalized.startsWith("src/") ||
      normalized.startsWith("apps/") ||
      normalized.startsWith("packages/") ||
      normalized.startsWith("scripts/")
    ) {
      return normalized;
    }
  }
  return normalizePath(path.relative(ROOT, base));
}

async function collectViolations(files, predicate) {
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const imports = findRelativeImports(source);
    for (const specifier of imports) {
      const target = resolveImportTarget(file, specifier);
      if (predicate(target, file)) {
        violations.push(`${normalizePath(path.relative(ROOT, file))} -> ${target}`);
      }
    }
  }
  return violations;
}

test("kernel modules do not import routes, runtime app helpers, control-plane, or apps surfaces", async () => {
  const memoryFiles = await listFiles(
    path.join(ROOT, "src/memory"),
    (file) => file.endsWith(".ts"),
  );

  const violations = await collectViolations(
    memoryFiles,
    (target) =>
      target.startsWith("src/routes/")
      || target.startsWith("src/app/")
      || target === "src/control-plane.ts"
      || target.startsWith("apps/"),
  );

  assert.deepEqual(
    violations,
    [],
    [
      "Kernel dependency direction violated.",
      "Forbidden imports from src/memory/*:",
      ...violations,
    ].join("\n"),
  );
});

test("runtime service modules do not import route registrars", async () => {
  const appFiles = await listFiles(
    path.join(ROOT, "src/app"),
    (file) => file.endsWith(".ts"),
  );

  const violations = await collectViolations(
    appFiles,
    (target) => target.startsWith("src/routes/") || target.startsWith("src/host/"),
  );

  assert.deepEqual(
    violations,
    [],
    [
      "Runtime Services dependency direction violated.",
      "Forbidden imports from src/app/*:",
      ...violations,
    ].join("\n"),
  );
});

test("route registrars do not import host modules or other route registrars", async () => {
  const routeFiles = await listFiles(
    path.join(ROOT, "src/routes"),
    (file) => file.endsWith(".ts"),
  );

  const violations = await collectViolations(
    routeFiles,
    (target, file) =>
      target.startsWith("src/host/")
      || (target.startsWith("src/routes/") && target !== normalizePath(path.relative(ROOT, file))),
  );

  assert.deepEqual(
    violations,
    [],
    [
      "Route registrar dependency direction violated.",
      "Forbidden imports from src/routes/*:",
      ...violations,
    ].join("\n"),
  );
});

test("host modules do not import kernel memory modules directly", async () => {
  const hostFiles = await listFiles(
    path.join(ROOT, "src/host"),
    (file) => file.endsWith(".ts"),
  );

  const violations = await collectViolations(
    hostFiles,
    (target) => target.startsWith("src/memory/") || target.startsWith("apps/"),
  );

  assert.deepEqual(
    violations,
    [],
    [
      "Host dependency direction violated.",
      "Forbidden imports from src/host/*:",
      ...violations,
    ].join("\n"),
  );
});

test("control-plane module does not depend on host, runtime app, route, or apps packaging surfaces", async () => {
  const controlPlaneFile = path.join(ROOT, "src/control-plane.ts");
  const violations = await collectViolations(
    [controlPlaneFile],
    (target) =>
      target.startsWith("src/app/")
      || target.startsWith("src/routes/")
      || target.startsWith("src/host/")
      || target.startsWith("apps/"),
  );

  assert.deepEqual(
    violations,
    [],
    [
      "Control-plane dependency direction violated.",
      "Forbidden imports from src/control-plane.ts:",
      ...violations,
    ].join("\n"),
  );
});
