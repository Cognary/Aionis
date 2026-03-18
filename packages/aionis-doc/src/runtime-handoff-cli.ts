#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

import { compileAionisDoc } from "./compile.js";
import {
  buildRuntimeHandoffV1,
  buildRuntimeHandoffV1FromEnvelope,
  type AionisDocRuntimeHandoffV1,
} from "./runtime-handoff.js";

type InputKind = "source" | "compile-envelope";
type Stage = "triage" | "patch" | "review" | "resume";
type Role = "orchestrator" | "triage" | "patch" | "review" | "resume";

class CliUsageError extends Error {}

type CliFlags = {
  inputKind: InputKind;
  scope: string | null;
  out: string | null;
  compact: boolean;
  help: boolean;
  allowCompileErrors: boolean;
  repoRoot: string | null;
  filePath: string | null;
  symbol: string | null;
  currentStage: Stage | null;
  activeRole: Role | null;
};

function printHelp(): void {
  process.stdout.write(
    [
      "build-aionis-doc-runtime-handoff",
      "",
      "Usage:",
      "  build-aionis-doc-runtime-handoff <input-file> [--input-kind source|compile-envelope] [--scope <scope>] [--out <path>]",
      "                                   [--repo-root <path>] [--file-path <path>] [--symbol <name>]",
      "                                   [--current-stage triage|patch|review|resume] [--active-role orchestrator|triage|patch|review|resume]",
      "                                   [--allow-compile-errors] [--compact]",
      "",
      "Notes:",
      "  source mode compiles an Aionis Doc source file before building the runtime handoff.",
      "  compile-envelope mode reads JSON produced by compile-aionis-doc and derives the runtime handoff from it.",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): { inputPath: string | null; flags: CliFlags } {
  let inputPath: string | null = null;
  const flags: CliFlags = {
    inputKind: "source",
    scope: null,
    out: null,
    compact: false,
    help: false,
    allowCompileErrors: false,
    repoRoot: null,
    filePath: null,
    symbol: null,
    currentStage: null,
    activeRole: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      flags.help = true;
      continue;
    }
    if (token === "--compact") {
      flags.compact = true;
      continue;
    }
    if (token === "--allow-compile-errors") {
      flags.allowCompileErrors = true;
      continue;
    }
    if (
      token === "--input-kind" ||
      token === "--scope" ||
      token === "--out" ||
      token === "--repo-root" ||
      token === "--file-path" ||
      token === "--symbol" ||
      token === "--current-stage" ||
      token === "--active-role"
    ) {
      const value = argv[i + 1];
      if (!value) throw new CliUsageError(`Missing value for ${token}.`);
      switch (token) {
        case "--input-kind":
          if (value !== "source" && value !== "compile-envelope") {
            throw new CliUsageError(`Unsupported input kind '${value}'.`);
          }
          flags.inputKind = value;
          break;
        case "--scope":
          flags.scope = value;
          break;
        case "--out":
          flags.out = value;
          break;
        case "--repo-root":
          flags.repoRoot = value;
          break;
        case "--file-path":
          flags.filePath = value;
          break;
        case "--symbol":
          flags.symbol = value;
          break;
        case "--current-stage":
          if (!["triage", "patch", "review", "resume"].includes(value)) {
            throw new CliUsageError(`Unsupported current stage '${value}'.`);
          }
          flags.currentStage = value as Stage;
          break;
        case "--active-role":
          if (!["orchestrator", "triage", "patch", "review", "resume"].includes(value)) {
            throw new CliUsageError(`Unsupported active role '${value}'.`);
          }
          flags.activeRole = value as Role;
          break;
        default:
          break;
      }
      i += 1;
      continue;
    }
    if (token.startsWith("--")) {
      throw new CliUsageError(`Unknown flag '${token}'.`);
    }
    if (inputPath) {
      throw new CliUsageError("Only one input file may be provided.");
    }
    inputPath = token;
  }

  return { inputPath, flags };
}

async function writeOutput(pathname: string, contents: string): Promise<void> {
  await mkdir(dirname(pathname), { recursive: true });
  await writeFile(pathname, contents, "utf8");
}

async function loadJson(pathname: string): Promise<unknown> {
  return JSON.parse(await readFile(pathname, "utf8"));
}

async function buildFromInput(inputPath: string, flags: CliFlags): Promise<AionisDocRuntimeHandoffV1> {
  if (flags.inputKind === "compile-envelope") {
    const envelope = await loadJson(inputPath);
    return buildRuntimeHandoffV1FromEnvelope({
      envelope,
      scope: flags.scope ?? undefined,
      repoRoot: flags.repoRoot,
      filePath: flags.filePath,
      symbol: flags.symbol,
      currentStage: flags.currentStage ?? undefined,
      activeRole: flags.activeRole ?? undefined,
      requireErrorFree: !flags.allowCompileErrors,
    });
  }

  const source = await readFile(inputPath, "utf8");
  const result = compileAionisDoc(source);
  return buildRuntimeHandoffV1({
    inputPath,
    result,
    scope: flags.scope ?? undefined,
    repoRoot: flags.repoRoot,
    filePath: flags.filePath,
    symbol: flags.symbol,
    currentStage: flags.currentStage ?? undefined,
    activeRole: flags.activeRole ?? undefined,
    requireErrorFree: !flags.allowCompileErrors,
  });
}

async function main(): Promise<void> {
  const { inputPath, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    return;
  }
  if (!inputPath) {
    throw new CliUsageError("An input file path is required.");
  }

  const resolvedInput = resolve(process.cwd(), inputPath);
  const handoff = await buildFromInput(resolvedInput, flags);
  const rendered = flags.compact ? JSON.stringify(handoff) : `${JSON.stringify(handoff, null, 2)}\n`;

  if (flags.out) {
    await writeOutput(resolve(process.cwd(), flags.out), rendered);
  } else {
    process.stdout.write(rendered);
  }
}

main().catch((error: unknown) => {
  if (error instanceof CliUsageError) {
    process.stderr.write(`${error.message}\n`);
    printHelp();
    process.exitCode = 2;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
